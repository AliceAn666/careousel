import { afterEach, expect, it, vi } from "vitest";
import { assertOrigin } from "../../src/server/auth/session";

afterEach(() => vi.unstubAllEnvs());

function codespaceRequest(origin: string, forwarded = true) {
  return new Request("https://0.0.0.0:3000/api/session", {
    headers: {
      host: "localhost:3000",
      origin,
      ...(forwarded
        ? {
            "x-forwarded-host": "careousel-codespace-3000.app.github.dev",
            "x-forwarded-proto": "https",
          }
        : {}),
    },
  });
}

it("allows this Codespace's forwarded HTTPS origin in development", () => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("CODESPACE_NAME", "careousel-codespace");

  expect(() =>
    assertOrigin(
      codespaceRequest("https://careousel-codespace-3000.app.github.dev"),
    ),
  ).not.toThrow();
});

it("allows the trusted proxy's internal origin in development", () => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("CODESPACE_NAME", "careousel-codespace");

  expect(() =>
    assertOrigin(codespaceRequest("http://localhost:3000")),
  ).not.toThrow();
});

it("rejects unrelated origins in development", () => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("CODESPACE_NAME", "careousel-codespace");

  expect(() =>
    assertOrigin(
      codespaceRequest("https://another-codespace-3000.app.github.dev"),
    ),
  ).toThrow("Cross-origin requests are not allowed.");
});

it("rejects an internal origin without trusted Codespaces proxy headers", () => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("CODESPACE_NAME", "careousel-codespace");

  expect(() =>
    assertOrigin(codespaceRequest("http://localhost:3000", false)),
  ).toThrow("Cross-origin requests are not allowed.");
});

it("does not allow the Codespace proxy origin in production", () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("CODESPACE_NAME", "careousel-codespace");

  expect(() =>
    assertOrigin(
      codespaceRequest("https://careousel-codespace-3000.app.github.dev"),
    ),
  ).toThrow("Cross-origin requests are not allowed.");
  expect(() => assertOrigin(codespaceRequest("http://localhost:3000"))).toThrow(
    "Cross-origin requests are not allowed.",
  );
});

it("allows only origins listed in TRUSTED_ORIGINS", () => {
  vi.stubEnv("TRUSTED_ORIGINS", "https://demo.example.com, https://b.example");
  const tunnel = (origin: string) =>
    new Request("http://localhost:3000/api/session", {
      headers: { host: "localhost:3000", origin },
    });
  expect(() => assertOrigin(tunnel("https://demo.example.com"))).not.toThrow();
  expect(() => assertOrigin(tunnel("https://b.example"))).not.toThrow();
  expect(() => assertOrigin(tunnel("https://evil.example"))).toThrow(
    /Cross-origin/,
  );
});
