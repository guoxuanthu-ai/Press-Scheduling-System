import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { UserAccount } from '../contracts/auth';

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('base64url');
  const hash = scryptSync(password, salt, 64).toString('base64url');
  return `scrypt-v1$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [algorithm, salt, expected] = stored.split('$');
  if (algorithm !== 'scrypt-v1' || !salt || !expected) return false;
  const actual = scryptSync(password, salt, 64);
  const expectedBuffer = Buffer.from(expected, 'base64url');
  return actual.length === expectedBuffer.length && timingSafeEqual(actual, expectedBuffer);
}

export function createSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('base64url');
}

export function createInitialUsers(): UserAccount[] {
  if (process.env.NODE_ENV === 'production' && (!process.env.BOOTSTRAP_PASSWORD || !process.env.GUOXUAN_BOOTSTRAP_PASSWORD)) {
    throw new Error('生产环境首次初始化必须设置 BOOTSTRAP_PASSWORD 和 GUOXUAN_BOOTSTRAP_PASSWORD');
  }
  const password = process.env.BOOTSTRAP_PASSWORD ?? 'ChangeMe123!';
  const generalManagerPassword = process.env.GUOXUAN_BOOTSTRAP_PASSWORD ?? 'ChangeMe123!';
  const timestamp = new Date().toISOString();
  return [
    { id: 1, username: 'admin', name: '管理员', role: 'admin', active: true, passwordHash: hashPassword(password), createdAt: timestamp, updatedAt: timestamp },
    { id: 2, username: 'market', name: '市场', role: 'market', active: true, passwordHash: hashPassword(password), createdAt: timestamp, updatedAt: timestamp },
    { id: 3, username: 'production', name: '生产', role: 'production', active: true, passwordHash: hashPassword(password), createdAt: timestamp, updatedAt: timestamp },
    { id: 4, username: 'guoxuan', name: '总经理', role: 'general_manager', active: true, passwordHash: hashPassword(generalManagerPassword), createdAt: timestamp, updatedAt: timestamp },
  ];
}
