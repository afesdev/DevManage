import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

const IV_LEN = 12;
const TAG_LEN = 16;
const PREFIX = 'dmgh1:';

function claveDesdeJwtSecret(jwtSecret: string): Buffer {
  return scryptSync(jwtSecret, 'devmanage-github-token-v1', 32);
}

/** Cifra el access token de GitHub para guardarlo en nucleo.Usuarios.token_github */
export function cifrarTokenGithub(plain: string, jwtSecret: string): string {
  const key = claveDesdeJwtSecret(jwtSecret);
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const cifrado = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const payload = Buffer.concat([iv, tag, cifrado]);
  return PREFIX + payload.toString('base64url');
}

/** Descifra o devuelve texto plano legado si no tiene prefijo. */
export function descifrarTokenGithub(stored: string | null | undefined, jwtSecret: string): string | null {
  if (stored == null || stored === '') return null;
  if (!stored.startsWith(PREFIX)) {
    return stored;
  }
  const raw = Buffer.from(stored.slice(PREFIX.length), 'base64url');
  if (raw.length < IV_LEN + TAG_LEN + 1) return null;
  const iv = raw.subarray(0, IV_LEN);
  const tag = raw.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const data = raw.subarray(IV_LEN + TAG_LEN);
  try {
    const key = claveDesdeJwtSecret(jwtSecret);
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return decipher.update(data, undefined, 'utf8') + decipher.final('utf8');
  } catch {
    return null;
  }
}
