import crypto from 'crypto';
import { env } from './env';

/**
 * Worker-side AES-256-GCM decryption. Used to decrypt QBO OAuth tokens
 * that the API persisted at OAuth callback time. The same TOKEN_ENC_KEY
 * must be set in both API and worker env.
 */

const KEY = Buffer.from(env.TOKEN_ENC_KEY, 'hex');

export function decryptToken(packed: string): string {
  if (KEY.length !== 32) {
    throw new Error('TOKEN_ENC_KEY must decode to 32 bytes');
  }
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
