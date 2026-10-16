import { it, expect, vi, afterEach } from "vitest";
import { explainCandidates } from "../../src/server/services/recommendations";
import { signSession, verifySession } from "../../src/server/auth/session";
afterEach(() => {
  delete process.env.AI_API_URL;
  delete process.env.AI_API_KEY;
});
it("works without external AI", async () => {
  expect(
    (await explainCandidates([{ name: "Avery", reasons: ["Eligible"] }]))
      .source,
  ).toBe("rules");
});
it("falls back when the provider fails", async () => {
  process.env.AI_API_URL = "https://example.invalid";
  process.env.AI_API_KEY = "test";
  expect(
    (
      await explainCandidates(
        [{ name: "Avery", reasons: ["Eligible"] }],
        vi.fn().mockRejectedValue(new Error("offline")),
      )
    ).source,
  ).toBe("rules");
});
it("uses provider explanation without altering candidate data", async () => {
  process.env.AI_API_URL = "https://example.invalid";
  process.env.AI_API_KEY = "test";
  const mock = vi.fn().mockResolvedValue(
    Response.json({
      choices: [
        { message: { content: "Review candidate 1: compatible plan." } },
      ],
    }),
  );
  expect(
    (await explainCandidates([{ name: "Avery", reasons: ["Eligible"] }], mock))
      .source,
  ).toBe("ai");
  expect(mock.mock.calls[0][1].body).not.toContain("Avery");
});
it("rejects tampered or expired sessions", () => {
  const token = signSession("avery");
  expect(verifySession(token)).toBe("avery");
  expect(verifySession(token + "x")).toBeNull();
  expect(verifySession(token + ".extra")).toBeNull();
  vi.useFakeTimers();
  vi.setSystemTime(Date.now() + 86400001);
  expect(verifySession(token)).toBeNull();
  vi.useRealTimers();
});
