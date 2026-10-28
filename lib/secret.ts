// Encrypts secrets stored in the DB (LLM tokens) with a key derived from AUTH_SECRET.
// Format: v1:<iv>:<tag>:<ciphertext>, base64url parts, AES-256-GCM.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

function keyFor(secret: string): Buffer {
  return createHash("sha256").update("llm-token:" + secret).digest();
}

function authSecret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET не задан");
  return s;
}

export function encryptSecret(plain: string, secret = authSecret()): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", keyFor(secret), iv);
  const data = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv, c.getAuthTag(), data].map((p) => (typeof p === "string" ? p : p.toString("base64url"))).join(":");
}

/** Plain text, or null when it cannot be decrypted (other key, damaged data, unknown format). */
export function decryptSecret(enc: string, secret = authSecret()): string | null {
  const [v, iv, tag, data] = enc.split(":");
  if (v !== "v1" || !iv || !tag || data === undefined) return null;
  try {
    const d = createDecipheriv("aes-256-gcm", keyFor(secret), Buffer.from(iv, "base64url"));
    d.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([d.update(Buffer.from(data, "base64url")), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}
