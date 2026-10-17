import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import {
  recordAction,
  recordSearch,
  SYNTHETIC_SOURCE,
} from "../../lib/record-import";
import { medicalActor, canAuthorMedicalTags } from "./medical-tags";
import { locked, DomainError } from "./scheduling";
import { syntheticFHIR, resourceText } from "./synthetic-fhir";
import { extractAssisted } from "./record-extraction";
const json = (value: unknown) =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
async function audit(
  tx: Prisma.TransactionClient,
  importId: string,
  actorId: string,
  action: string,
  details: unknown,
) {
  await tx.medicalRecordAudit.create({
    data: { importId, actorId, action, details: json(details) },
  });
}
async function access(tx: Prisma.TransactionClient, userId: string) {
  const user = await medicalActor(tx, userId);
  const clinician = await canAuthorMedicalTags(tx, user);
  if (user.role !== "PATIENT" && !clinician)
    throw new DomainError(
      "Clinical author permission required to access imported records.",
      403,
    );
  return {
    user,
    clinician,
    scope:
      user.role === "PATIENT"
        ? { patientId: user.id }
        : { clinicId: user.clinicId!, state: "ACTIVE" },
  };
}
export async function medicalRecordsDashboard(
  userId: string,
  query: unknown = {},
) {
  const search = recordSearch.parse(query);
  return locked(async (tx) => {
    const { user, clinician, scope } = await access(tx, userId);
    const imports = await tx.medicalRecordImport.findMany({
      where: scope,
      orderBy: { consentedAt: "desc" },
    });
    const ids = imports.map((i) => i.id);
    const condition = search.q
      ? search.mode === "keyword"
        ? Prisma.sql`strpos(lower(r.text),lower(${search.q}))>0`
        : Prisma.sql`to_tsvector('english',r.text) @@ websearch_to_tsquery('english',${search.q})`
      : Prisma.sql`TRUE`;
    const hits = ids.length
      ? await tx.$queryRaw<{ id: string }[]>(
          Prisma.sql`SELECT r.id FROM "ImportedMedicalRecord" r WHERE r."importId" IN (${Prisma.join(ids)}) AND ${condition} ORDER BY r.id LIMIT 200`,
        )
      : [];
    const records = await tx.importedMedicalRecord.findMany({
      where: { id: { in: hits.map((h) => h.id) }, importId: { in: ids } },
      orderBy: { resourceId: "asc" },
    });
    const suggestions = await tx.importedTagSuggestion.findMany({
      where: {
        importId: { in: ids },
        ...(search.q ? { recordId: { in: records.map((r) => r.id) } } : {}),
      },
      orderBy: { createdAt: "asc" },
    });
    const audits = await tx.medicalRecordAudit.findMany({
      where: { importId: { in: ids } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    const clinics = await tx.clinic.findMany({
      where: clinician ? { id: user.clinicId! } : {},
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
    const patients = clinician
      ? await tx.user.findMany({
          where: { id: { in: [...new Set(imports.map((i) => i.patientId))] } },
          select: { id: true, name: true },
        })
      : [];
    // Audit access without recording search terms or record text in generic logs.
    for (const recordImport of imports.filter((i) => i.state === "ACTIVE"))
      await audit(tx, recordImport.id, user.id, "SEARCH", {
        mode: search.mode,
        filtered: Boolean(search.q),
      });
    return {
      clinician,
      imports,
      records,
      suggestions,
      audits,
      clinics,
      patients,
      source: SYNTHETIC_SOURCE,
      retention:
        "Revocation immediately stops clinic access and scheduling evidence use. Immutable synthetic source records and audit history are retained for accountability; you can still inspect your own archived copy. No automatic deletion or real hospital connection is provided.",
    };
  });
}
export async function mutateMedicalRecords(userId: string, raw: unknown) {
  const input = recordAction.parse(raw);
  return locked(async (tx) => {
    const { user, clinician, scope } = await access(tx, userId);
    const [{ now }] = await tx.$queryRaw<
      { now: Date }[]
    >`SELECT clock_timestamp() AS now`;
    if (input.type === "authorizeImport") {
      if (user.role !== "PATIENT")
        throw new DomainError("Only the patient can authorize an import.", 403);
      const previous = await tx.medicalRecordImport.findUnique({
        where: {
          patientId_requestId: {
            patientId: user.id,
            requestId: input.requestId,
          },
        },
      });
      if (previous) {
        if (previous.clinicId !== input.clinicId || previous.state !== "ACTIVE")
          throw new DomainError(
            "Import request already used; authorize a new request explicitly.",
          );
        return {
          message: "Authorized import already saved.",
          importId: previous.id,
        };
      }
      if (!(await tx.clinic.findUnique({ where: { id: input.clinicId } })))
        throw new DomainError("Clinic not found.", 404);
      if (
        await tx.medicalRecordImport.findFirst({
          where: {
            patientId: user.id,
            clinicId: input.clinicId,
            state: "ACTIVE",
          },
        })
      )
        throw new DomainError(
          "An active authorized import already exists for this clinic.",
        );
      const recordImport = await tx.medicalRecordImport.create({
        data: {
          patientId: user.id,
          clinicId: input.clinicId,
          requestId: input.requestId,
          source: input.source,
          consentVersion: input.consentVersion,
          consentedAt: now,
        },
      });
      const bundle = syntheticFHIR(user.id, now);
      for (const { resource } of bundle.entry) {
        const text = resourceText(resource);
        await tx.importedMedicalRecord.create({
          data: {
            importId: recordImport.id,
            resourceId: resource.id,
            resourceType: resource.resourceType,
            text,
            resource: json(resource),
            contentHash: createHash("sha256")
              .update(JSON.stringify(resource))
              .digest("hex"),
          },
        });
      }
      await audit(tx, recordImport.id, user.id, "IMPORT", {
        source: input.source,
        consentVersion: input.consentVersion,
        records: bundle.entry.length,
        scope: "THIS_CLINIC_ONLY",
      });
      return {
        message:
          "Synthetic FHIR-compatible records imported with your explicit clinic-specific consent. No real hospital was contacted.",
        importId: recordImport.id,
      };
    }
    if (input.type === "review") {
      if (!clinician) throw new DomainError("Clinician review required.", 403);
      const suggestion = await tx.importedTagSuggestion.findFirst({
        where: {
          id: input.suggestionId,
          recordImport: { clinicId: user.clinicId!, state: "ACTIVE" },
        },
        include: { recordImport: true },
      });
      if (!suggestion)
        throw new DomainError(
          "Suggestion unavailable or consent revoked.",
          404,
        );
      if (suggestion.version !== input.expectedVersion)
        throw new DomainError("Suggestion changed; refresh before reviewing.");
      if (suggestion.state !== "PENDING")
        throw new DomainError(
          "Reviewed suggestions cannot be reviewed again; edit the confirmed tag separately.",
        );
      let tagId: string | null = null;
      if (input.decision === "APPROVE") {
        const need = await tx.medicalNeed.create({
          data: {
            patientId: suggestion.recordImport.patientId,
            clinicId: user.clinicId!,
            sourceImportId: suggestion.importId,
            title: input.fields.label,
            service: input.fields.service,
            createdById: user.id,
          },
        });
        const { service: _service, ...fields } = input.fields;
        void _service;
        const tag = await tx.medicalTag.create({
          data: {
            ...fields,
            recommendedFrom: fields.recommendedFrom
              ? new Date(fields.recommendedFrom)
              : null,
            recommendedBy: fields.recommendedBy
              ? new Date(fields.recommendedBy)
              : null,
            needId: need.id,
            patientId: need.patientId,
            clinicId: need.clinicId,
            sourceImportId: suggestion.importId,
            sourceRecordId: suggestion.recordId,
            sourceExcerpt: suggestion.excerpt,
            sourceType: "SYNTHETIC_RECORD_REVIEW",
            authorId: user.id,
            updatedById: user.id,
            reviewedById: user.id,
            reviewedAt: now,
            state: "APPROVED",
          },
        });
        tagId = tag.id;
        await tx.medicalTagRevision.create({
          data: {
            tagId: tag.id,
            version: 1,
            actorId: user.id,
            action: "CREATE",
            reason: input.reason,
            snapshot: json(tag),
          },
        });
        await tx.audit.create({
          data: {
            clinicId: user.clinicId!,
            actor: user.id,
            action: `Reviewed synthetic record tag: ${tag.id} v1`,
          },
        });
      }
      await tx.importedTagSuggestion.update({
        where: { id: suggestion.id },
        data: {
          fields: json(input.fields),
          state:
            input.decision === "APPROVE"
              ? "APPROVED"
              : input.decision === "REJECT"
                ? "REJECTED"
                : "PENDING",
          version: { increment: 1 },
          reviewedById: user.id,
          reviewedAt: now,
          tagId,
        },
      });
      await audit(tx, suggestion.importId, user.id, input.decision, {
        suggestionId: suggestion.id,
        previousVersion: suggestion.version,
        version: suggestion.version + 1,
        reason: input.reason,
        before: suggestion.fields,
        after: input.fields,
        tagId,
      });
      return {
        message:
          input.decision === "APPROVE"
            ? "Clinician-confirmed tag saved. P1–P4 and referral clearance still require separate staff approval."
            : "Clinical review saved. No scheduling priority was assigned.",
        tagId,
      };
    }
    const recordImport = await tx.medicalRecordImport.findFirst({
      where: { id: input.importId, ...scope },
    });
    if (!recordImport) throw new DomainError("Import not found.", 404);
    if (input.type === "revoke") {
      if (user.role !== "PATIENT" || recordImport.patientId !== user.id)
        throw new DomainError("Only the patient can revoke consent.", 403);
      if (recordImport.version !== input.expectedVersion)
        throw new DomainError("Consent changed; refresh before revoking.");
      if (recordImport.state !== "ACTIVE")
        throw new DomainError("Consent already revoked.");
      const tags = await tx.medicalTag.findMany({
        where: { sourceImportId: recordImport.id, state: { not: "RETIRED" } },
      });
      for (const tag of tags) {
        const retired = await tx.medicalTag.update({
          where: { id: tag.id },
          data: {
            state: "RETIRED",
            reviewedById: null,
            reviewedAt: null,
            version: { increment: 1 },
            updatedById: user.id,
          },
        });
        await tx.medicalTagRevision.create({
          data: {
            tagId: tag.id,
            version: retired.version,
            actorId: user.id,
            action: "RETIRE",
            reason: "Patient revoked synthetic record consent",
            snapshot: json(retired),
          },
        });
      }
      await tx.medicalRecordImport.update({
        where: { id: recordImport.id },
        data: { state: "REVOKED", revokedAt: now, version: { increment: 1 } },
      });
      await audit(tx, recordImport.id, user.id, "REVOKE", {
        previousVersion: recordImport.version,
        version: recordImport.version + 1,
        retiredTags: tags.length,
      });
      return {
        message:
          "Consent revoked. Clinic access and imported-tag evidence use stopped; your source records and audit history are retained privately.",
      };
    }
    if (recordImport.state !== "ACTIVE")
      throw new DomainError("Active consent required.", 403);
    const records = await tx.importedMedicalRecord.findMany({
      where: { importId: recordImport.id },
    });
    const result = await extractAssisted(records, input.mode === "LOCAL_AI");
    let created = 0;
    for (const candidate of result.suggestions) {
      if (
        await tx.importedTagSuggestion.findUnique({
          where: { recordId: candidate.recordId },
        })
      )
        continue;
      await tx.importedTagSuggestion.create({
        data: {
          importId: recordImport.id,
          recordId: candidate.recordId,
          excerpt: candidate.excerpt,
          originalFields: json(candidate.fields),
          fields: json(candidate.fields),
          method: result.method,
          explanation: result.explanation,
        },
      });
      created++;
    }
    await audit(tx, recordImport.id, user.id, "EXTRACT", {
      requestedMode: input.mode,
      method: result.method,
      created,
      explanation: result.explanation,
    });
    return {
      message: `${created} new unconfirmed suggestions. Existing reviews preserved. ${result.explanation}`,
    };
  });
}
