import { z } from "zod";
import { SERVICES } from "../../lib/config";
import {
  importedTagFields,
  SYNTHETIC_SOURCE,
  type ImportedTagFields,
} from "../../lib/record-import";
const resourceSchema = z
  .object({
    resourceType: z.string(),
    meta: z.object({ tag: z.array(z.object({ code: z.string() })) }),
    code: z.object({ text: z.string() }),
    occurrencePeriod: z
      .object({ start: z.string().datetime(), end: z.string().datetime() })
      .optional(),
  })
  .passthrough();
export type ExtractionRecord = { id: string; text: string; resource: unknown };
const candidateSchema = z
  .object({
    recordId: z.string(),
    excerpt: z.string().min(10).max(2000),
    fields: importedTagFields,
  })
  .strict();
export type ExtractedCandidate = z.infer<typeof candidateSchema>;
export function extractLocal(
  records: ExtractionRecord[],
): ExtractedCandidate[] {
  return records.flatMap((record) => {
    const parsed = resourceSchema.safeParse(record.resource);
    if (
      !parsed.success ||
      !parsed.data.meta.tag.some((t) => t.code === SYNTHETIC_SOURCE) ||
      parsed.data.resourceType !== "ServiceRequest" ||
      !/follow[- ]?up/i.test(record.text) ||
      /no follow[- ]?up|follow[- ]?up not (?:needed|required)/i.test(
        record.text,
      )
    )
      return [];
    const resource = parsed.data,
      service = SERVICES.find(
        (s) => s.toLowerCase() === resource.code.text.toLowerCase(),
      );
    if (!service) return [];
    const fields: ImportedTagFields = {
      service,
      kind: "FOLLOW_UP",
      label: `${service} follow-up recommendation`,
      clinicalNotes:
        "Synthetic historical source; clinician review required. This is not a new diagnosis.",
      followUpRecommendation: record.text,
      recommendedFrom: resource.occurrencePeriod?.start ?? null,
      recommendedBy: resource.occurrencePeriod?.end ?? null,
      requiresReferral:
        /\bReferral required\b/i.test(record.text) &&
        !/\bNo referral required\b/i.test(record.text),
      requiresAuthorization:
        /\bPrior authorization required\b/i.test(record.text) &&
        !/\bNo prior authorization required\b/i.test(record.text),
    };
    return [
      {
        recordId: record.id,
        excerpt: record.text.slice(0, 2000),
        fields: importedTagFields.parse(fields),
      },
    ];
  });
}
export type LocalAIAdapter = (records: ExtractionRecord[]) => Promise<unknown>;
// Explicit opt-in loopback-only Ollama adapter. Never reuse external provider keys
// or recommendation endpoints, and never follow HTTP redirects.
export async function localOllama(
  records: ExtractionRecord[],
  fetcher: typeof fetch = fetch,
): Promise<unknown> {
  const origin = process.env.CAREOUSEL_LOCAL_AI_ORIGIN,
    model = process.env.CAREOUSEL_LOCAL_AI_MODEL;
  if (!origin || !model) throw new Error("Local AI not configured");
  const url = new URL(origin);
  if (
    url.protocol !== "http:" ||
    !["127.0.0.1", "[::1]"].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw new Error("Only explicit loopback AI is supported");
  const response = await fetcher(new URL("/api/generate", url), {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(1500),
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      stream: false,
      format: "json",
      options: { temperature: 0 },
      prompt: `Extract scheduling suggestions only from these SYNTHETIC records. Do not diagnose, infer urgency, assign priority or invent evidence. Return {suggestions:[{recordId,excerpt,fields}]} using the exact shape of these deterministic candidates, exact source excerpts and original service/timeframes. Keep kind, label, clinicalNotes, service, timeframes and requirement flags unchanged. Only shorten excerpt and followUpRecommendation by selecting exact source substrings; never generate new clinical statements. Every suggestion needs human review. Candidates: ${JSON.stringify(extractLocal(records))}`,
    }),
  });
  if (!response.ok) throw new Error("Local AI unavailable");
  const data = await response.json();
  return JSON.parse(
    z.object({ response: z.string().max(50000) }).parse(data).response,
  );
}
export async function extractAssisted(
  records: ExtractionRecord[],
  preferAI: boolean,
  adapter: LocalAIAdapter = localOllama,
) {
  const fallback = extractLocal(records);
  if (!preferAI)
    return {
      suggestions: fallback,
      method: "LOCAL_RULES" as const,
      explanation:
        "Deterministic extraction of explicit follow-up/service instructions and FHIR timeframes; no urgency inference.",
    };
  try {
    // Reject non-synthetic inputs before any adapter is invoked.
    if (
      records.some(
        (r) =>
          !resourceSchema.safeParse(r.resource).success ||
          !resourceSchema
            .parse(r.resource)
            .meta.tag.some((t) => t.code === SYNTHETIC_SOURCE),
      )
    )
      throw new Error("Synthetic records only");
    let timer: ReturnType<typeof setTimeout> | undefined;
    const output = await Promise.race([
      adapter(records),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Local AI timeout")), 1800);
      }),
    ]).finally(() => clearTimeout(timer));
    const result = z
      .object({ suggestions: z.array(candidateSchema).max(20) })
      .strict()
      .parse(output);
    if (
      !result.suggestions.length ||
      new Set(result.suggestions.map((s) => s.recordId)).size !==
        result.suggestions.length
    )
      throw new Error("Incomplete local AI result");
    for (const suggestion of result.suggestions) {
      const record = records.find((r) => r.id === suggestion.recordId),
        expected = fallback.find((f) => f.recordId === suggestion.recordId);
      if (
        !record ||
        !expected ||
        !record.text.includes(suggestion.excerpt) ||
        suggestion.fields.service !== expected.fields.service ||
        suggestion.fields.recommendedFrom !== expected.fields.recommendedFrom ||
        suggestion.fields.recommendedBy !== expected.fields.recommendedBy ||
        suggestion.fields.kind !== expected.fields.kind ||
        suggestion.fields.label !== expected.fields.label ||
        suggestion.fields.clinicalNotes !== expected.fields.clinicalNotes ||
        suggestion.fields.requiresReferral !==
          expected.fields.requiresReferral ||
        suggestion.fields.requiresAuthorization !==
          expected.fields.requiresAuthorization ||
        suggestion.fields.followUpRecommendation.length < 10 ||
        !record.text.includes(suggestion.fields.followUpRecommendation)
      )
        throw new Error("Unsupported source attribution");
    }
    if (result.suggestions.length !== fallback.length)
      throw new Error("Missing source coverage");
    return {
      suggestions: result.suggestions,
      method: "LOCAL_AI" as const,
      explanation:
        "Optional loopback AI suggestions, source-validated and still awaiting clinician review; no priority assigned.",
    };
  } catch {
    return {
      suggestions: fallback,
      method: "LOCAL_RULES" as const,
      explanation:
        "Local AI unavailable, timed out or returned unsupported evidence. Deterministic local fallback used; no external AI API is required.",
    };
  }
}
