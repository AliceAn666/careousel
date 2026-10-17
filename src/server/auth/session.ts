import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { tokenHash } from "./passwords";
import { isDemoPersonaId } from "../../lib/config";
import { db } from "../db";
import { DomainError } from "../services/scheduling";
const developmentSecret = randomBytes(32).toString("hex");
function secret() {
  const value = process.env.SESSION_SECRET;
  if (process.env.NODE_ENV === "production" && (!value || value.length < 32))
    throw new Error("Set SESSION_SECRET to at least 32 characters.");
  return value ?? developmentSecret;
}
export function signSession(id: string) {
  const payload = Buffer.from(
    JSON.stringify({ id, expires: Date.now() + 86400000 }),
  ).toString("base64url");
  return `${payload}.${createHmac("sha256", secret()).update(payload).digest("hex")}`;
}
export function verifySession(value: string) {
  try {
    const parts = value.split(".");
    if (parts.length !== 2) return null;
    const [payload, signature] = parts;
    const expected = createHmac("sha256", secret())
      .update(payload)
      .digest("hex");
    if (
      signature?.length !== expected.length ||
      !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
    )
      return null;
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    return typeof data.id === "string" && data.expires > Date.now()
      ? data.id
      : null;
  } catch {
    return null;
  }
}
export async function currentIdentity() {
  const value = (await cookies()).get("careousel_session")?.value;
  if (!value) return null;
  if (value.startsWith("a_")) {
    const session = await db.accountSession.findUnique({
      where: { tokenHash: tokenHash(value) },
      include: { account: { include: { user: true, membership: true } } },
    });
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      session.account.status !== "ACTIVE"
    )
      return null;
    const { user, membership } = session.account;
    if (
      user.role === "STAFF" &&
      (membership?.status !== "ACTIVE" || membership.clinicId !== user.clinicId)
    )
      return null;
    return {
      user,
      mode: "account" as const,
      username: session.account.username,
      clinicRole: membership?.role ?? null,
    };
  }
  if (process.env.DEMO_MODE !== "true") return null;
  const id = verifySession(value);
  if (!id || !isDemoPersonaId(id)) return null;
  const user = await db.user.findUnique({
    where: { id },
    include: { account: { select: { id: true } } },
  });
  return user && !user.account
    ? { user, mode: "demo" as const, username: null, clinicRole: null }
    : null;
}
export async function currentUser() {
  return (await currentIdentity())?.user ?? null;
}
export async function logoutSession() {
  const store = await cookies(),
    value = store.get("careousel_session")?.value;
  if (value?.startsWith("a_"))
    await db.accountSession.updateMany({
      where: { tokenHash: tokenHash(value), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  store.delete("careousel_session");
  store.delete("careousel_demo");
}
export async function setSessionCookie(value: string, request: Request) {
  (await cookies()).set("careousel_session", value, {
    httpOnly: true,
    sameSite: "strict",
    secure: new URL(request.url).protocol === "https:",
    path: "/",
    maxAge: 86400,
  });
}
export async function explicitDemoMode() {
  return (
    process.env.DEMO_MODE === "true" &&
    (verifySession((await cookies()).get("careousel_demo")?.value ?? "") ===
      "demo-mode" ||
      (await currentIdentity())?.mode === "demo")
  );
}
export function assertOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  const codespaceHost = process.env.CODESPACE_NAME
    ? `${process.env.CODESPACE_NAME}-3000.app.github.dev`
    : null;
  const trustedCodespaceProxy =
    process.env.NODE_ENV === "development" &&
    codespaceHost !== null &&
    request.headers.get("x-forwarded-host") === codespaceHost &&
    request.headers.get("x-forwarded-proto") === "https";
  const proxyOrigins = trustedCodespaceProxy
    ? [`https://${codespaceHost}`, ...(host ? [`http://${host}`] : [])]
    : [];
  const requestOrigin = `${new URL(request.url).protocol}//${host}`;
  if (!origin || (origin !== requestOrigin && !proxyOrigins.includes(origin)))
    throw new DomainError("Cross-origin requests are not allowed.", 403);
}
