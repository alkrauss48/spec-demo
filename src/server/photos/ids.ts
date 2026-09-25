import 'server-only';
import { randomBytes } from 'node:crypto';

export const PHOTO_ID_RE = /^[A-Za-z0-9_-]{22}$/;

/** A 128-bit random, URL-safe photo ID (22 base64url chars). Never derived from user input. */
export function newPhotoId(): string {
  return randomBytes(16).toString('base64url');
}
