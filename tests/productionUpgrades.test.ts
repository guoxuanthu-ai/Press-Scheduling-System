import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getSessionUser, login, SESSION_COOKIE } from '../api/auth';
import { createApplication } from '../api/boot';
import { appRouter } from '../api/router';
import type { SessionUser } from '../api/trpc';
import type { Mold } from '../contracts/entities';
import { hashPassword } from '../db/authUtils';
import { FileStore } from '../db/fileStore';

const admin: SessionUser = { id: 1, username: 'admin', name: '管理员', role: 'admin' };
const market: SessionUser = { id: 2, username: 'market', name: '市场', role: 'market' };
const production: SessionUser = { id: 3, username: 'production', name: '生产', role: 'production' };
const generalManager: SessionUser = { id: 4, username: 'guoxuan', name: '总经理', role: 'general_manager' };
type Caller = ReturnType<typeof appRouter.createCaller>;
let directory: string;
let store: FileStore;
let adminClient: Caller;
let marketClient: Caller;
let productionClient: Caller;
let generalManagerClient: Caller;

beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'inductor-upgrade-'));
  store = new FileStore(path.join(directory, 'store.json'));
  adminClient = appRouter.createCaller({ store, user: admin });
  marketClient = appRouter.createCaller({ store, user: market });
  productionClient = appRouter.createCaller({ store, user: production });
  generalManagerClient = appRouter.createCaller({ store, user: generalManager });
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

function taskInput(molds: Mold[]) {
  return {
    productName: 'RBAC-TASK', techRoute: 'amorphous_180' as const, deadline: '2026-11-30', priority: 'P1' as const, quantity: 10, remark: '',
    pressingSteps: [
      { stepType: 'core' as const, name: 'Core A', moldId: molds[0].id, requiredHours: 8 },
      { stepType: 'final' as const, name: '合压', moldId: molds[2].id, requiredHours: 6 },
    ],
    postSteps: [{ processName: '热处理' as const, durationHours: 24 }],
  };
}

describe('角色权限服务端验收', () => {
  it('市场可新增和编辑任务，但不能维护资源、排产、模板或账户', async () => {
    const molds = await marketClient.mold.list();
    const task = await marketClient.task.create(taskInput(molds));
    const updated = await marketClient.task.update({
      ...taskInput(molds),
      id: task.id,
      productName: '市场已编辑',
      pressingSteps: task.pressingSteps.map((step) => ({ id: step.id, stepType: step.stepType, name: step.name, moldId: step.moldId, requiredHours: step.requiredHours })),
      postSteps: task.postSteps.map((step) => ({ id: step.id, processName: step.processName, durationHours: step.durationHours })),
    });
    expect(updated.productName).toBe('市场已编辑');
    await expect(marketClient.press.create({ name: '越权压机', model: 'X', status: 'available', dailyHours: 8, remark: '' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(marketClient.schedule.run({ baseDate: '2026-10-17' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(marketClient.template.update({ techRoute: 'amorphous_180', steps: [] })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(marketClient.user.list()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect((await marketClient.task.list()).some((item) => item.id === task.id)).toBe(true);
    await marketClient.task.remove({ id: task.id });
    expect((await marketClient.task.list()).some((item) => item.id === task.id)).toBe(false);
    await expect(marketClient.task.get({ id: task.id })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('生产可维护压机/模具并排产，但任务和模板只读', async () => {
    const press = await productionClient.press.create({ name: '生产新增压机', model: 'P-01', status: 'available', dailyHours: 8, remark: '' });
    const mold = await productionClient.mold.create({ code: 'PROD-MOLD', name: '生产模具', status: 'available', leadTimeDays: 5, pressIds: [press.id], orderDate: null, remark: '' });
    expect(mold.pressIds).toEqual([press.id]);
    const result = await productionClient.schedule.run({ baseDate: '2026-10-17' });
    expect(result.taskPlans.length).toBeGreaterThan(0);
    const tasks = await productionClient.task.list();
    expect(tasks.length).toBeGreaterThan(0);
    const molds = await productionClient.mold.list();
    await expect(productionClient.task.create(taskInput(molds))).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(productionClient.task.remove({ id: tasks[0].id })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(productionClient.template.update({ techRoute: 'amorphous_180', steps: [] })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(productionClient.user.list()).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('未登录返回 401，管理员不能管理管理员或总经理，最后管理员受保护', async () => {
    const anonymous = appRouter.createCaller({ store, user: null });
    await expect(anonymous.task.list()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await expect(adminClient.user.update({ id: 1, active: false })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(adminClient.user.update({ id: 4, name: '越权编辑' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(adminClient.user.create({ username: 'admin_two', name: '第二管理员', role: 'admin', password: 'StrongPass123' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(generalManagerClient.user.update({ id: 1, active: false })).rejects.toMatchObject({ code: 'CONFLICT' });
    const marketAccount = await adminClient.user.create({ username: 'market_new', name: '新市场', role: 'market', password: 'StrongPass123' });
    await adminClient.user.update({ id: marketAccount.id, name: '新市场改', role: 'production' });
    expect((await adminClient.user.list()).find((user) => user.id === marketAccount.id)).toMatchObject({ name: '新市场改', role: 'production' });
  });
});

describe('打样任务编辑与版本同步验收', () => {
  it('编辑保留已有进度、添加新 Core，并拒绝所需工时低于已完成工时', async () => {
    const molds = await adminClient.mold.list();
    const task = await adminClient.task.create(taskInput(molds));
    const core = task.pressingSteps.find((step) => step.stepType === 'core')!;
    await adminClient.task.updateProgress({ taskId: task.id, pressingSteps: [{ id: core.id, completedHours: 4 }], postSteps: [] });
    const revisionBefore = (await store.read()).revision;
    const updated = await adminClient.task.update({
      ...taskInput(molds),
      id: task.id,
      productName: 'EDITED-PRODUCT',
      pressingSteps: [
        { id: core.id, stepType: 'core', name: 'Core A 改', moldId: core.moldId, requiredHours: 10 },
        { stepType: 'core', name: 'Core B 新增', moldId: molds[1].id, requiredHours: 2 },
        ...task.pressingSteps.filter((step) => step.stepType === 'final').map((step) => ({ id: step.id, stepType: step.stepType, name: step.name, moldId: step.moldId, requiredHours: step.requiredHours })),
      ],
      postSteps: task.postSteps.map((step) => ({ id: step.id, processName: step.processName, durationHours: 12 })),
    });
    expect(updated.productName).toBe('EDITED-PRODUCT');
    expect(updated.pressingSteps).toHaveLength(3);
    expect(updated.pressingSteps.find((step) => step.id === core.id)).toMatchObject({ completedHours: 4, requiredHours: 10, status: 'in_progress' });
    expect(updated.pressingSteps.find((step) => step.name === 'Core B 新增')).toMatchObject({ completedHours: 0, status: 'pending' });
    expect((await store.read()).revision).toBeGreaterThan(revisionBefore);
    expect((await productionClient.task.get({ id: task.id })).productName).toBe('EDITED-PRODUCT');
    await expect(adminClient.task.update({
      ...taskInput(molds), id: task.id,
      pressingSteps: [
        { id: core.id, stepType: 'core', name: 'Core A 改', moldId: core.moldId, requiredHours: 3 },
        ...updated.pressingSteps.filter((step) => step.stepType === 'final').map((step) => ({ id: step.id, stepType: step.stepType, name: step.name, moldId: step.moldId, requiredHours: step.requiredHours })),
      ],
      postSteps: updated.postSteps.map((step) => ({ id: step.id, processName: step.processName, durationHours: step.durationHours })),
    })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
});

describe('总经理权限与账户删除验收', () => {
  it('总经理拥有账户删除权，非总经理不能删除或授予总经理', async () => {
    await expect(adminClient.user.remove({ id: 2 })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(adminClient.user.create({ username: 'gm_other', name: '其他总经理', role: 'general_manager', password: 'StrongPass123' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(adminClient.user.update({ id: 2, role: 'general_manager' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(generalManagerClient.user.remove({ id: 4 })).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(generalManagerClient.user.update({ id: 4, role: 'admin' })).rejects.toMatchObject({ code: 'CONFLICT' });
    const target = await generalManagerClient.user.create({ username: 'delete_me', name: '待删除账户', role: 'market', password: 'StrongPass123' });
    await generalManagerClient.user.remove({ id: target.id });
    expect((await generalManagerClient.user.list()).some((user) => user.id === target.id)).toBe(false);
    expect((await generalManagerClient.press.list()).length).toBeGreaterThan(0);
    await generalManagerClient.template.update({ techRoute: 'amorphous_180', steps: [{ processName: '热处理', durationHours: 24 }] });
    expect((await generalManagerClient.template.list()).find((template) => template.techRoute === 'amorphous_180')?.steps).toHaveLength(1);
  });

  it('guoxuan 可使用初始化密码登录，删除账户后其会话立即失效', async () => {
    await store.mutate((data) => {
      data.users.find((user) => user.username === 'guoxuan')!.passwordHash = hashPassword('StrongPass123');
    });
    const app = createApplication(store);
    const bad = await app.request('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'guoxuan', password: 'wrong' }) });
    expect(bad.status).toBe(401);
    const good = await app.request('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'guoxuan', password: 'StrongPass123' }) });
    expect(good.status).toBe(200);
    expect((await good.json()).user).toMatchObject({ username: 'guoxuan', role: 'general_manager' });
    const target = await generalManagerClient.user.create({ username: 'session_delete', name: '会话删除验证', role: 'market', password: 'StrongPass123' });
    const session = await login(store, target.username, 'StrongPass123');
    expect(session).not.toBeNull();
    await generalManagerClient.user.remove({ id: target.id });
    const userAfterDelete = await getSessionUser(new Request('http://localhost/api/auth/me', { headers: { Cookie: `${SESSION_COOKIE}=${session!.token}` } }), store);
    expect(userAfterDelete).toBeNull();
  });

  it('已有 guoxuan 旧角色会在重新加载时迁移为总经理', async () => {
    await store.mutate((data) => {
      data.users.find((user) => user.username === 'guoxuan')!.role = 'admin';
    });
    const reloaded = new FileStore(store.filePath);
    const account = (await reloaded.read()).users.find((user) => user.username === 'guoxuan');
    expect(account?.role).toBe('general_manager');
  });
});

describe('周末加班设置持久化验收', () => {
  it('加班设置随排产保存并在下次重排继续生效', async () => {
    const first = await productionClient.schedule.run({ baseDate: '2026-10-10', workCalendar: { '2026-10-10': true, '2026-10-11': false } });
    expect(first.workingDays['2026-10-10']).toBe(true);
    expect(first.workingDays['2026-10-11']).toBe(false);
    expect(await productionClient.schedule.calendar()).toMatchObject({ '2026-10-10': true, '2026-10-11': false });
    const second = await productionClient.schedule.run({ baseDate: '2026-10-10' });
    expect(second.workingDays['2026-10-10']).toBe(true);
    expect(second.workingDays['2026-10-11']).toBe(false);
    await expect(marketClient.schedule.run({ baseDate: '2026-10-10', workCalendar: { '2026-10-10': false } })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('真实登录、密码哈希与 SSE 验收', () => {
  it('登录会话安全保存，SSE 推送初始版本和后续变更', async () => {
    const app = createApplication(store);
    const badLogin = await app.request('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'wrong' }) });
    expect(badLogin.status).toBe(401);
    const response = await app.request('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'ChangeMe123!' }) });
    expect(response.status).toBe(200);
    const cookie = response.headers.get('set-cookie')!.split(';')[0];
    expect(cookie).toContain('inductor_session=');
    const rawToken = cookie.split('=')[1];
    const persisted = await store.read();
    expect(persisted.users[0].passwordHash).not.toContain('ChangeMe123!');
    expect(persisted.sessions.at(-1)?.tokenHash).not.toBe(rawToken);
    const me = await app.request('/api/auth/me', { headers: { Cookie: cookie } });
    expect((await me.json()).user).toMatchObject({ username: 'admin', role: 'admin' });

    const events = await app.request('/api/events', { headers: { Cookie: cookie } });
    expect(events.status).toBe(200);
    expect(events.headers.get('content-type')).toContain('text/event-stream');
    const reader = events.body!.getReader();
    const decoder = new TextDecoder();
    const first = await reader.read();
    expect(decoder.decode(first.value)).toContain('event: revision');
    await store.mutate((data) => { data.presses[0].remark = 'SSE 同步验证'; });
    let changeEvent = '';
    for (let attempt = 0; attempt < 4 && !changeEvent; attempt += 1) {
      const next = await Promise.race([
        reader.read(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('SSE 变更事件超时')), 3000)),
      ]);
      const text = decoder.decode(next.value);
      if (text.includes('event: revision')) changeEvent = text;
    }
    expect(changeEvent).toContain('revision');
    await reader.cancel();
  });

  it('公网 HTTP 部署尊重 COOKIE_SECURE=false', async () => {
    const previousCookieSecure = process.env.COOKIE_SECURE;
    process.env.COOKIE_SECURE = 'false';
    try {
      const response = await createApplication(store).request('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'ChangeMe123!' }) });
      expect(response.status).toBe(200);
      expect(response.headers.get('set-cookie')).not.toContain('Secure');
    } finally {
      if (previousCookieSecure === undefined) delete process.env.COOKIE_SECURE;
      else process.env.COOKIE_SECURE = previousCookieSecure;
    }
  });
});
