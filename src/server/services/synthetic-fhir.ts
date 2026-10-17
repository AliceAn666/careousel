import { SYNTHETIC_SOURCE } from "../../lib/record-import";
// Only server-owned fixtures are imported. There is deliberately no arbitrary URL,
// upload or free-text medical-record ingestion endpoint.
export function syntheticFHIR(patientId: string, now = new Date()) {
  const date = (days: number) => new Date(+now + days * 86400000).toISOString();
  const meta = {
    tag: [{ system: "urn:careousel:synthetic", code: SYNTHETIC_SOURCE }],
  };
  const subject = { reference: `Patient/${patientId}` };
  const requests = [
    {
      id: "skin-follow-up",
      service: "Dermatology",
      from: 14,
      to: 28,
      referral: true,
      authorization: false,
    },
    {
      id: "laboratory-follow-up",
      service: "Blood test",
      from: 7,
      to: 14,
      referral: false,
      authorization: false,
    },
    {
      id: "specialist-follow-up",
      service: "Cardiology",
      from: 30,
      to: 60,
      referral: true,
      authorization: true,
    },
  ];
  const records = [
    {
      resourceType: "Condition",
      id: "historical-condition",
      meta,
      subject,
      clinicalStatus: {
        coding: [
          {
            system: "http://terminology.hl7.org/CodeSystem/condition-clinical",
            code: "active",
          },
        ],
      },
      code: { text: "Synthetic historical eczema diagnosis" },
      text: {
        status: "generated",
        div: '<div xmlns="http://www.w3.org/1999/xhtml">Synthetic historical eczema diagnosis. This sample is not a diagnosis for this patient.</div>',
      },
    },
    ...requests.map((r) => ({
      resourceType: "ServiceRequest",
      id: r.id,
      meta,
      subject,
      status: "active",
      intent: "order",
      code: { text: r.service },
      authoredOn: now.toISOString(),
      occurrencePeriod: { start: date(r.from), end: date(r.to) },
      note: [
        {
          text: `Synthetic follow-up recommendation: ${r.service}. Schedule follow-up in ${r.from}–${r.to} days. ${r.referral ? "Referral required." : "No referral required."} ${r.authorization ? "Prior authorization required." : "No prior authorization required."} These are synthetic scheduling instructions, not verified coverage or a clinical urgency assessment.`,
        },
      ],
    })),
  ];
  return {
    resourceType: "Bundle",
    type: "collection",
    timestamp: now.toISOString(),
    meta,
    entry: records.map((resource) => ({
      fullUrl: `https://synthetic.careousel.invalid/fhir/${resource.resourceType}/${resource.id}`,
      resource,
    })),
  };
}
export type SyntheticResource = ReturnType<
  typeof syntheticFHIR
>["entry"][number]["resource"];
export function resourceText(resource: SyntheticResource) {
  return "note" in resource
    ? `${resource.code.text}. ${resource.note.map((n) => n.text).join(" ")}`
    : `${resource.code.text}. This sample is not a diagnosis for this patient.`;
}
