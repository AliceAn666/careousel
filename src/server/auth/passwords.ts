import { randomBytes, scrypt, timingSafeEqual, createHash } from "node:crypto";
export const tokenHash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
function derive(password: string, salt: Buffer) {
  return new Promise<Buffer>((resolve, reject) =>
    scrypt(
      password,
      salt,
      64,
      { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 },
      (error, key) => (error ? reject(error) : resolve(key)),
    ),
  );
}
export async function hashPassword(password: string) {
  const salt = randomBytes(16),
    key = await derive(password, salt);
  return `scrypt-v1$${salt.toString("hex")}$${key.toString("hex")}`;
}
export async function verifyPassword(password: string, stored: string) {
  const [version, salt, key] = stored.split("$");
  if (
    version !== "scrypt-v1" ||
    !salt ||
    !key ||
    !/^[a-f0-9]{32}$/.test(salt) ||
    !/^[a-f0-9]{128}$/.test(key)
  )
    return false;
  return timingSafeEqual(
    await derive(password, Buffer.from(salt, "hex")),
    Buffer.from(key, "hex"),
  );
}
