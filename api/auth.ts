import type { SessionUser } from './trpc';
import type { DataStore } from '../db/store';
import { createSessionToken, hashSessionToken, verifyPassword } from '../db/authUtils';

export const SESSION_COOKIE = 'inductor_session';
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7;

function cookies(req: Request): Record<string, string> {
  const values: Record<string, string> = {};
  for (const part of (req.headers.get('cookie') ?? '').split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key) values[key] = rest.join('=');
  }
  return values;
}

function toSessionUser(user: { id: number; username: string; name: string; role: SessionUser['role'] }): SessionUser {
  return { id: user.id, username: user.username, name: user.name, role: user.role };
}

export async function getSessionUser(req: Request, store: DataStore): Promise<SessionUser | null> {
  const token = cookies(req)[SESSION_COOKIE];
  if (!token) return null;
  const tokenHash = hashSessionToken(token);
  const data = await store.read();
  const session = data.sessions.find((item) => item.tokenHash === tokenHash && item.expiresAt > new Date().toISOString());
  if (!session) return null;
  const user = data.users.find((item) => item.id === session.userId && item.active);
  return user ? toSessionUser(user) : null;
}

export async function login(store: DataStore, username: string, password: string) {
  const data = await store.read();
  const account = data.users.find((item) => item.username === username.trim().toLowerCase() && item.active);
  if (!account || !verifyPassword(password, account.passwordHash)) return null;
  const token = createSessionToken();
  const timestamp = new Date();
  await store.mutate((draft) => {
    draft.sessions = draft.sessions.filter((item) => item.expiresAt > timestamp.toISOString());
    draft.sessions.push({
      id: draft.nextId++,
      tokenHash: hashSessionToken(token),
      userId: account.id,
      createdAt: timestamp.toISOString(),
      expiresAt: new Date(timestamp.getTime() + SESSION_MAX_AGE * 1000).toISOString(),
    });
  });
  return { token, user: toSessionUser(account) };
}

export async function logout(req: Request, store: DataStore): Promise<void> {
  const token = cookies(req)[SESSION_COOKIE];
  if (!token) return;
  const tokenHash = hashSessionToken(token);
  await store.mutate((draft) => {
    draft.sessions = draft.sessions.filter((item) => item.tokenHash !== tokenHash);
  });
}
