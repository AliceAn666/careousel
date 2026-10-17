import { expect, it, vi } from "vitest";
import {
  syntheticFHIR,
  resourceText,
} from "../../src/server/services/synthetic-fhir";
import {
  extractLocal,
  extractAssisted,
  localOllama,
} from "../../src/server/services/record-extraction";
import { recordAction, SYNTHETIC_SOURCE } from "../../src/lib/record-import";
const records = syntheticFHIR(
  "synthetic-only",
  new Date("2030-01-01T00:00:00Z"),
).entry.map(({ resource }) => ({
  id: resource.id,
  text: resourceText(resource),
  resource,
}));
it("generates synthetic FHIR-compatible conditions and requests without using a patient's real history", () => {
  expect(records).toHaveLength(4);
  expect(
    records.every((r) => r.resource.meta.tag[0].code === SYNTHETIC_SOURCE),
  ).toBe(true);
});
it("extracts explicit service/referral/timeframe evidence and never derives scheduling needs from diagnosis alone", () => {
  const result = extractLocal(records);
  expect(result).toHaveLength(3);
  const skin = result.find((r) => r.fields.service === "Dermatology")!;
  expect(skin.fields).toMatchObject({
    requiresReferral: true,
    requiresAuthorization: false,
    recommendedFrom: "2030-01-15T00:00:00.000Z",
    recommendedBy: "2030-01-29T00:00:00.000Z",
  });
  expect(
    result.find((r) => r.fields.service === "Blood test")!.fields
      .requiresReferral,
  ).toBe(false);
  expect(JSON.stringify(result)).not.toContain('"priority"');
});
it("does not extract negated follow-up instructions", () => {
  expect(
    extractLocal(
      records.map((r) => ({ ...r, text: "No follow-up required." })),
    ),
  ).toEqual([]);
});
it("never invokes AI for default local extraction, and reliably falls back for unavailable AI", async () => {
  const adapter = vi.fn().mockRejectedValue(new Error("unavailable"));
  expect((await extractAssisted(records, false, adapter)).method).toBe(
    "LOCAL_RULES",
  );
  expect(adapter).not.toHaveBeenCalled();
  expect((await extractAssisted(records, true, adapter)).suggestions).toEqual(
    extractLocal(records),
  );
});
it("accepts source-grounded local AI output only as unconfirmed suggestions", async () => {
  const result = await extractAssisted(records, true, async () => ({
    suggestions: extractLocal(records),
  }));
  expect(result.method).toBe("LOCAL_AI");
});
it.each(["priority", "clinicalUrgency", "diagnosis"])(
  "rejects AI's unsupported %s field and uses the local fallback",
  async (key) => {
    const candidates = extractLocal(records).map((s) => ({
      ...s,
      fields: { ...s.fields, [key]: "P1" },
    }));
    expect(
      (
        await extractAssisted(records, true, async () => ({
          suggestions: candidates,
        }))
      ).method,
    ).toBe("LOCAL_RULES");
  },
);
it("rejects invented source excerpts and altered dates", async () => {
  const candidates = extractLocal(records);
  candidates[0].excerpt = "Invented appointment instruction";
  expect(
    (
      await extractAssisted(records, true, async () => ({
        suggestions: candidates,
      }))
    ).method,
  ).toBe("LOCAL_RULES");
});
it("rejects non-synthetic inputs before invoking an AI adapter", async () => {
  const adapter = vi.fn();
  await extractAssisted(
    [{ id: "not-synthetic", text: "Do not transmit", resource: {} }],
    true,
    adapter,
  );
  expect(adapter).not.toHaveBeenCalled();
});
it("refuses external AI origins, even when explicitly configured", async () => {
  vi.stubEnv("CAREOUSEL_LOCAL_AI_ORIGIN", "https://external.example.test");
  vi.stubEnv("CAREOUSEL_LOCAL_AI_MODEL", "test");
  const fetcher = vi.fn();
  try {
    await expect(localOllama(records, fetcher)).rejects.toThrow(/loopback/);
    expect(fetcher).not.toHaveBeenCalled();
  } finally {
    vi.unstubAllEnvs();
  }
});
it("executes the optional loopback Ollama adapter and validates returned evidence", async () => {
  vi.stubEnv("CAREOUSEL_LOCAL_AI_ORIGIN", "http://127.0.0.1:11434");
  vi.stubEnv("CAREOUSEL_LOCAL_AI_MODEL", "synthetic-test-model");
  const fetcher = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        response: JSON.stringify({ suggestions: extractLocal(records) }),
      }),
    ),
  );
  try {
    expect(await localOllama(records, fetcher)).toMatchObject({
      suggestions: extractLocal(records),
    });
    expect(String(fetcher.mock.calls[0][0])).toBe(
      "http://127.0.0.1:11434/api/generate",
    );
    expect(fetcher.mock.calls[0][1].redirect).toBe("error");
  } finally {
    vi.unstubAllEnvs();
  }
});
it("requires explicit consent and rejects arbitrary uploads, URLs and patient identity", () => {
  const valid = {
    type: "authorizeImport",
    clinicId: "cedar",
    source: SYNTHETIC_SOURCE,
    consent: true,
    consentVersion: "SYNTHETIC_V1",
    requestId: "4dbdff1d-c5e3-44ef-96bd-743dd775636b",
  };
  expect(recordAction.safeParse(valid).success).toBe(true);
  for (const extra of [
    { consent: false },
    { url: "https://hospital.example" },
    { patientId: "other" },
    { records: [] },
  ])
    expect(recordAction.safeParse({ ...valid, ...extra }).success).toBe(false);
});
it.each(["clinicalNotes", "label", "followUpRecommendation"])(
  "rejects model-generated clinical statements in %s even inside otherwise valid fields",
  async (key) => {
    const candidates = extractLocal(records).map((s) => ({
      ...s,
      fields: {
        ...s.fields,
        [key]: "A new urgent diagnosis invented by a model",
      },
    }));
    expect(
      (
        await extractAssisted(records, true, async () => ({
          suggestions: candidates,
        }))
      ).method,
    ).toBe("LOCAL_RULES");
  },
);
it("rejects model changes to source referral requirements", async () => {
  const candidates = extractLocal(records);
  candidates[0].fields.requiresReferral =
    !candidates[0].fields.requiresReferral;
  expect(
    (
      await extractAssisted(records, true, async () => ({
        suggestions: candidates,
      }))
    ).method,
  ).toBe("LOCAL_RULES");
});
