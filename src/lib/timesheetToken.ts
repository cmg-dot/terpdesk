import { createHash } from 'crypto';

export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

export const hashToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');
