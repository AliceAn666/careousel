import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
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
export async function currentUser() {
  const value = (await cookies()).get("careousel_session")?.value;
  if (!value) return null;
  const id = verifySession(value);
  return id ? db.user.findUnique({ where: { id } }) : null;
}
export function assertOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (
    !origin ||
    origin !==
      `${new URL(request.url).protocol}//${request.headers.get("host")}`
  )
    throw new DomainError("Cross-origin requests are not allowed.", 403);
}
