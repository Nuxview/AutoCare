import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

function encryptionKey() {
  const raw = process.env.FIELD_ENCRYPTION_KEY;
  if (!raw) throw new Error("FIELD_ENCRYPTION_KEY is required");
  const decoded = Buffer.from(raw, "base64");
  if (decoded.length !== 32) throw new Error("FIELD_ENCRYPTION_KEY must be a base64-encoded 32-byte key");
  return decoded;
}

export function encryptField(plaintext: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptField(payload: string) {
  const [version, iv, tag, ciphertext] = payload.split(".");
  if (version !== "v1" || !iv || !tag || !ciphertext) throw new Error("Invalid encrypted field");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
}

export function deterministicHash(value: string) {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

export function normalizeKenyanPhone(value: string) {
  const compact = value.replace(/[^\d+]/g, "");
  if (/^0[17]\d{8}$/.test(compact)) return `+254${compact.slice(1)}`;
  if (/^254[17]\d{8}$/.test(compact)) return `+${compact}`;
  if (/^\+254[17]\d{8}$/.test(compact)) return compact;
  throw new Error("Enter a valid Kenyan mobile number");
}
