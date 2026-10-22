import argon2 from 'argon2';
import { env } from '../../config/env';

/** Argon2id with OWASP-recommended baseline parameters (19 MiB, t=2, p=1). */
const options = {
  type: argon2.argon2id,
  memoryCost: env.isTest ? 8192 : env.ARGON2_MEMORY_KIB,
  timeCost: env.isTest ? 1 : 2,
  parallelism: 1,
} as const;

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, options);
}

export async function verifyPassword(hash: string | undefined | null, password: string): Promise<boolean> {
  if (!hash) {
    // Equalize timing for unknown users.
    await argon2.hash(password, options);
    return false;
  }
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}
