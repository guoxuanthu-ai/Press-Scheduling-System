import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { Hono } from 'hono';
import { deleteCookie, setCookie } from 'hono/cookie';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createStoreFromEnv } from '../db/index';
import type { DataStore } from '../db/store';
import { getSessionUser, login, logout, SESSION_COOKIE, SESSION_MAX_AGE } from './auth';
import { appRouter } from './router';
import type { Context } from './trpc';

export async function createContext(req: Request, store: DataStore): Promise<Context> {
  return { store, user: await getSessionUser(req, store) };
}

function secureCookie(): boolean {
  return process.env.COOKIE_SECURE
    ? process.env.COOKIE_SECURE === 'true'
    : process.env.NODE_ENV === 'production';
}

export function createApplication(store: DataStore) {
  const app = new Hono();

  app.get('/api/health', (c) => c.json({ ok: true, mode: process.env.DATABASE_URL ? 'mysql-production' : 'local-development' }));
  app.post('/api/client-log', async (c) => {
    const body = await c.req.json<{ message?: string; stack?: string }>().catch((): { message?: string; stack?: string } => ({}));
    console.error('[browser]', body.message ?? '未知前端错误', body.stack ?? '');
    return c.body(null, 204);
  });
  app.post('/api/auth/login', async (c) => {
    const body = await c.req.json<{ username?: string; password?: string }>().catch((): { username?: string; password?: string } => ({}));
    if (!body.username || !body.password) return c.json({ message: '请输入用户名和密码' }, 400);
    const result = await login(store, body.username, body.password);
    if (!result) return c.json({ message: '用户名或密码错误，或账户已停用' }, 401);
    setCookie(c, SESSION_COOKIE, result.token, {
      httpOnly: true,
      secure: secureCookie(),
      sameSite: 'Lax',
      path: '/',
      maxAge: SESSION_MAX_AGE,
    });
    return c.json({ user: result.user });
  });
  app.get('/api/auth/me', async (c) => c.json({ user: await getSessionUser(c.req.raw, store) }));
  app.post('/api/auth/logout', async (c) => {
    await logout(c.req.raw, store);
    deleteCookie(c, SESSION_COOKIE, { path: '/', secure: secureCookie() });
    return c.json({ success: true });
  });

  app.get('/api/events', async (c) => {
    const user = await getSessionUser(c.req.raw, store);
    if (!user) return c.json({ message: '请先登录账户' }, 401);
    const encoder = new TextEncoder();
    let cleanup = () => undefined;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        let active = true;
        let lastRevision = -1;
        const sendRevision = (revision: number) => {
          if (!active || revision === lastRevision) return;
          lastRevision = revision;
          controller.enqueue(encoder.encode(`event: revision\ndata: ${JSON.stringify({ revision })}\n\n`));
        };
        const poll = async () => {
          if (!active) return;
          try {
            const data = await store.read();
            sendRevision(data.revision);
            if (active) controller.enqueue(encoder.encode(': heartbeat\n\n'));
          } catch {
            if (active) controller.enqueue(encoder.encode(': reconnect\n\n'));
          }
        };
        void poll();
        const unsubscribe = store.onDidChange(sendRevision);
        const interval = setInterval(() => void poll(), 5000);
        cleanup = () => {
          active = false;
          clearInterval(interval);
          unsubscribe();
        };
        c.req.raw.signal.addEventListener('abort', cleanup, { once: true });
      },
      cancel() { cleanup(); },
    });
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'X-Accel-Buffering': 'no',
      },
    });
  });

  app.use('/trpc/*', async (c) => fetchRequestHandler({
    endpoint: '/trpc',
    req: c.req.raw,
    router: appRouter,
    createContext: () => createContext(c.req.raw, store),
  }));

  if (!process.env.API_ONLY) {
    app.use('/assets/*', serveStatic({ root: './dist' }));
    app.get('*', serveStatic({ path: './dist/index.html' }));
  }
  return app;
}

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  const port = Number(process.env.PORT ?? 3000);
  const store = await createStoreFromEnv();
  const app = createApplication(store);
  serve({ fetch: app.fetch, port, hostname: '0.0.0.0' }, (info) => {
    console.log(`电感打样排产系统已启动：http://localhost:${info.port}`);
  });
}
