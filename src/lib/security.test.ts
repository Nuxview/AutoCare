import { beforeAll, describe, expect, it } from "vitest";
import { decryptField, deterministicHash, encryptField, normalizeKenyanPhone } from "./security";

beforeAll(() => { process.env.FIELD_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64"); });
describe("sensitive-field security", () => {
  it("round-trips AES-256-GCM ciphertext without exposing plaintext", () => { const encrypted = encryptField("+254712345678"); expect(encrypted).not.toContain("254712345678"); expect(decryptField(encrypted)).toBe("+254712345678"); });
  it("creates stable search hashes", () => { expect(deterministicHash(" Test@Email.com ")).toBe(deterministicHash("test@email.com")); });
  it.each([["0712345678", "+254712345678"], ["254712345678", "+254712345678"], ["+254712345678", "+254712345678"]])("normalizes %s", (input, expected) => expect(normalizeKenyanPhone(input)).toBe(expected));
  it("rejects invalid phone numbers", () => expect(() => normalizeKenyanPhone("1234")).toThrow());
});
