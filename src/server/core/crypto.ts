import { createHash, randomBytes, randomInt, scrypt, timingSafeEqual } from "node:crypto";

const SCRYPT = { N: 16384, r: 8, p: 1, keyLength: 64 } as const;

function scryptAsync(
  password: string,
  salt: Buffer,
  N: number,
  r: number,
  p: number,
  keyLength: number,
) {
  return new Promise<Buffer>((resolve, reject) =>
    scrypt(
      password.normalize("NFKC"),
      salt,
      keyLength,
      { N, r, p, maxmem: 64 * 1024 * 1024 },
      (error, key) => (error ? reject(error) : resolve(key)),
    ),
  );
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, SCRYPT.N, SCRYPT.r, SCRYPT.p, SCRYPT.keyLength);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [algorithm, n, r, p, saltB64, keyB64] = stored.split("$");
  if (algorithm !== "scrypt" || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, "base64");
  const actual = await scryptAsync(
    password,
    Buffer.from(saltB64, "base64"),
    Number(n),
    Number(r),
    Number(p),
    expected.length,
  );
  return timingSafeEqual(actual, expected);
}

/** Hash compared against when the email is unknown, so response time doesn't reveal which emails exist. */
let dummyHash: Promise<string> | undefined;
export function getDummyHash() {
  dummyHash ??= hashPassword(randomBytes(16).toString("hex"));
  return dummyHash;
}

export function newSessionToken() {
  return randomBytes(32).toString("base64url");
}

export function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

// Crockford-style alphabet without look-alike characters (0/O, 1/I/L).
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/** 12 random characters ≈ 59 bits: unguessable, and still short enough to type from paper. */
export function newVerificationCode() {
  const chars = Array.from({ length: 12 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]);
  return `BTU-${chars.slice(0, 4).join("")}-${chars.slice(4, 8).join("")}-${chars.slice(8).join("")}`;
}

export const VERIFICATION_CODE_PATTERN =
  /^BTU-[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/;

export function normalizeVerificationCode(raw: string) {
  const compact = raw.toUpperCase().replace(/[^0-9A-Z]/g, "");
  const body = compact.startsWith("BTU") ? compact.slice(3) : compact;
  if (body.length !== 12) return null;
  const code = `BTU-${body.slice(0, 4)}-${body.slice(4, 8)}-${body.slice(8)}`;
  return VERIFICATION_CODE_PATTERN.test(code) ? code : null;
}

export function maskCode(code: string) {
  return code.length > 8 ? `${code.slice(0, 8)}••••` : "••••";
}

export function sha256Bytes(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Passport IDs (BTU-AI-000125) are permanent and are not public lookup keys. */
export const PASSPORT_ID_PATTERN = /^BTU-AI-\d{6}$/i;
