import crypto from 'crypto';
import { env } from './env';

/**
 * Cifrado AES-256-GCM para OAuth tokens en reposo.
 * La clave se deriva de env.TOKEN_ENC_KEY (32 bytes hex).
 * Salida: `<iv_hex>:<authTag_hex>:<ciphertext_hex>`.
 */

const KEY = Buffer.from(env.TOKEN_ENC_KEY, 'hex');

function checkKey() {
  if (KEY.length !== 32) {
    throw new Error('TOKEN_ENC_KEY must decode to 32 bytes');
  }
}

export function encryptToken(plaintext: string): string {
  checkKey();
  const iv = crypto.randomBytes(12); // 96-bit nonce for GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('hex'), tag.toString('hex'), ct.toString('hex')].join(':');
}

export function decryptToken(packed: string): string {
  checkKey();
  const [ivHex, tagHex, ctHex] = packed.split(':');
  if (!ivHex || !tagHex || !ctHex) {
    throw new Error('Invalid encrypted token format');
  }
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const ct = Buffer.from(ctHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString('utf8');
}

/** Hash de password con bcrypt. Mantenemos el coste en 10 para dev. */
export async function hashPassword(plain: string): Promise<string> {
  const bcrypt = await import('bcryptjs');
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  const bcrypt = await import('bcryptjs');
  return bcrypt.compare(plain, hash);
}
