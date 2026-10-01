import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

const KEY_LENGTH = 64;
const COST = 32_768;
const BLOCK_SIZE = 8;
const PARALLELIZATION = 1;
const MAX_MEMORY = 64 * 1024 * 1024;

/** Asynchronous scrypt so that password hashing never blocks the event loop. */
function deriveKey(password: string, salt: Buffer, keyLength: number, options: ScryptOptions) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, keyLength, options, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}

export async function hashPassword(password: string) {
  if (password.length < 12) throw new Error("Password must contain at least 12 characters.");
  const salt = randomBytes(16);
  const derivedKey = await deriveKey(password, salt, KEY_LENGTH, {
    N: COST,
    r: BLOCK_SIZE,
    p: PARALLELIZATION,
    maxmem: MAX_MEMORY,
  });

  return [
    "scrypt",
    COST,
    BLOCK_SIZE,
    PARALLELIZATION,
    salt.toString("base64url"),
    derivedKey.toString("base64url"),
  ].join(":");
}

export async function verifyPassword(password: string, encodedHash: string) {
  const [algorithm, cost, blockSize, parallelization, salt, expectedHash] = encodedHash.split(":");
  if (!algorithm || algorithm !== "scrypt" || !salt || !expectedHash) return false;

  const expected = Buffer.from(expectedHash, "base64url");
  const actual = await deriveKey(password, Buffer.from(salt, "base64url"), expected.length, {
    N: Number(cost),
    r: Number(blockSize),
    p: Number(parallelization),
    maxmem: MAX_MEMORY,
  });

  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
