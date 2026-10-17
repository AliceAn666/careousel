import { createPublicKey, verify } from "node:crypto";
import { processNotificationSequences } from "@/server/services/notification-sequences";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ISSUER = "https://token.actions.githubusercontent.com";
const AUDIENCE = "careousel-notification-cron-v1";
const REPOSITORY = "AliceAn666/careousel";
const REPOSITORY_ID = "1422474927";
const WORKFLOW_REF =
  "AliceAn666/careousel/.github/workflows/notification-cron.yml@refs/heads/main";

type TokenClaims = {
  iss?: string; aud?: string; repository?: string; repository_id?: string;
  ref?: string; sub?: string; workflow_ref?: string; event_name?: string;
  iat?: number; nbf?: number; exp?: number;
};
type TokenHeader = { alg?: string; kid?: string; typ?: string };
function decodePart(part: string): unknown {
  return JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
}

async function verifyGitHubIdentity(request: Request): Promise<boolean> {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ") || header.length > 12000) return false;
  const token = header.slice(7), parts = token.split(".");
  if (parts.length !== 3) return false;
  try {
    const jwtHeader = decodePart(parts[0]) as TokenHeader;
    const claims = decodePart(parts[1]) as TokenClaims;
    const now = Math.floor(Date.now() / 1000);
    if (
      jwtHeader.alg !== "RS256" || !jwtHeader.kid ||
      claims.iss !== ISSUER || claims.aud !== AUDIENCE ||
      claims.repository !== REPOSITORY || claims.repository_id !== REPOSITORY_ID ||
      claims.ref !== "refs/heads/main" ||
      claims.sub !== "repo:AliceAn666@241894385/careousel@1422474927:ref:refs/heads/main" ||
      claims.workflow_ref !== WORKFLOW_REF ||
      !["schedule", "workflow_dispatch", "push"].includes(claims.event_name ?? "") ||
      typeof claims.iat !== "number" || typeof claims.exp !== "number" ||
      claims.iat > now + 60 || claims.exp < now ||
      claims.exp - claims.iat > 600 ||
      (typeof claims.nbf === "number" && claims.nbf > now + 60)
    ) return false;
    const controller = AbortSignal.timeout(5000);
    const discovery = await fetch(ISSUER + "/.well-known/openid-configuration", {
      signal: controller, cache: "no-store",
    });
    if (!discovery.ok) return false;
    const config = await discovery.json() as { jwks_uri?: string };
    if (config.jwks_uri !== ISSUER + "/.well-known/jwks") return false;
    const response = await fetch(config.jwks_uri, {
      signal: AbortSignal.timeout(5000), cache: "no-store",
    });
    if (!response.ok) return false;
    const jwks = await response.json() as {
      keys?: Array<{ kid?: string; kty?: string; alg?: string; use?: string } & Record<string, unknown>>;
    };
    const jwk = jwks.keys?.find(k =>
      k.kid === jwtHeader.kid && k.kty === "RSA" && (!k.alg || k.alg === "RS256") &&
      (!k.use || k.use === "sig"));
    if (!jwk) return false;
    return verify("RSA-SHA256", Buffer.from(parts[0] + "." + parts[1]),
      createPublicKey({ key: jwk, format: "jwk" }),
      Buffer.from(parts[2], "base64url"));
  } catch {
    return false;
  }
}

// The scheduled workflow has no database credentials and no shared secrets.
// All scheduling integrity rules remain in the existing server service.
export async function POST(request: Request) {
  if (!(await verifyGitHubIdentity(request)))
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const result = await processNotificationSequences();
    return Response.json({ ok: true, ...result }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("OIDC notification worker failed",
      error instanceof Error ? error.name : "UnknownError");
    return Response.json({ error: "Notification check unavailable" }, { status: 503 });
  }
}
