import { argon2id, hash, needsRehash, verify } from 'argon2'

function integerEnvironmentValue(name: string, fallback: number, minimum: number): number {
  const value = Number(process.env[name] ?? fallback)
  return Number.isSafeInteger(value) && value >= minimum ? value : fallback
}

export const ARGON2ID_OPTIONS = Object.freeze({
  hashLength: integerEnvironmentValue('PASSWORD_ARGON2_HASH_LENGTH', 32, 32),
  memoryCost: integerEnvironmentValue('PASSWORD_ARGON2_MEMORY_COST', 19_456, 19_456),
  parallelism: integerEnvironmentValue('PASSWORD_ARGON2_PARALLELISM', 1, 1),
  timeCost: integerEnvironmentValue('PASSWORD_ARGON2_TIME_COST', 2, 2),
  type: argon2id,
})

export async function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2ID_OPTIONS)
}

export async function verifyPasswordHash(hashValue: string, password: string): Promise<boolean> {
  try {
    return await verify(hashValue, password)
  }
  catch {
    return false
  }
}

export function passwordHashNeedsRehash(hashValue: string): boolean {
  try {
    return needsRehash(hashValue, ARGON2ID_OPTIONS)
  }
  catch {
    return true
  }
}
