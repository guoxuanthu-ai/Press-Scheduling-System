import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { createApplication } from '../api/boot';
import { FileStore } from '../db/fileStore';

let directory: string;
let store: FileStore;
let app: ReturnType<typeof createApplication>;
let cookie = '';

beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'inductor-excel-'));
  store = new FileStore(path.join(directory, 'store.json'));
  app = createApplication(store);
  const login = await app.request('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'ChangeMe123!' }) });
  cookie = login.headers.get('set-cookie')!.split(';')[0];
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

async function download(entity: string): Promise<XLSX.WorkBook> {
  const response = await app.request(`/api/export/${entity}`, { headers: { Cookie: cookie } });
  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toContain('spreadsheetml');
  return XLSX.read(Buffer.from(await response.arrayBuffer()), { type: 'buffer', cellDates: true });
}

async function upload(entity: string, workbook: XLSX.WorkBook) {
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  const body = new FormData();
  body.append('file', new File([new Uint8Array(buffer)], `${entity}.xlsx`, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  return app.request(`/api/import/${entity}`, { method: 'POST', headers: { Cookie: cookie }, body });
}

describe('Excel 导入导出验收', () => {
  it('压机可导出、编辑后回导并新增', async () => {
    const workbook = await download('presses');
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets['压机']);
    rows[0].每日工时 = 7;
    rows.push({ ID: '', 名称: '导入压机', 型号: 'EXCEL-100T', 状态: '可用', 每日工时: 8, 备注: '导入验证' });
    workbook.Sheets['压机'] = XLSX.utils.json_to_sheet(rows);
    const response = await upload('presses', workbook);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ created: 1, updated: 1, rows: rows.length });
    const data = await store.read();
    expect(data.presses[0].dailyHours).toBe(7);
    expect(data.presses.some((press) => press.name === '导入压机')).toBe(true);
  });

  it('模具和工艺模板可按唯一编号或技术路线更新', async () => {
    const moldWorkbook = await download('molds');
    const molds = XLSX.utils.sheet_to_json<Record<string, unknown>>(moldWorkbook.Sheets['模具']);
    molds[0].模具名称 = 'Core A 导入更新';
    molds.push({ ID: '', 模具编号: 'M-EXCEL-01', 模具名称: 'Excel 模具', 状态: '已有可用', 开模周期天: 9, 适配压机: '1号压机、2号压机', 下单日期: '', 备注: '' });
    moldWorkbook.Sheets['模具'] = XLSX.utils.json_to_sheet(molds);
    expect((await upload('molds', moldWorkbook)).status).toBe(200);

    const templateWorkbook = await download('templates');
    const templates = XLSX.utils.sheet_to_json<Record<string, unknown>>(templateWorkbook.Sheets['工艺模板']);
    const heat = templates.find((row) => row.技术路线 === '180℃ 热压非晶' && row.工序名称 === '热处理')!;
    heat.耗时小时 = 12;
    templateWorkbook.Sheets['工艺模板'] = XLSX.utils.json_to_sheet(templates);
    expect((await upload('templates', templateWorkbook)).status).toBe(200);
    const data = await store.read();
    expect(data.molds.find((mold) => mold.code === 'M-CA-01')?.name).toBe('Core A 导入更新');
    expect(data.molds.some((mold) => mold.code === 'M-EXCEL-01' && mold.pressIds.length === 2)).toBe(true);
    expect(data.templates.find((template) => template.techRoute === 'amorphous_180')?.steps.find((step) => step.processName === '热处理')?.durationHours).toBe(12);
  });

  it('打样任务工作簿通过任务ID关联三张表，支持更新和新增', async () => {
    const workbook = await download('tasks');
    const tasks = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets['任务']);
    const pressing = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets['压制工序']);
    const post = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets['后工序']);
    const existing = tasks[0];
    existing.产品名称 = 'Excel 已更新任务';
    tasks.push({ 任务ID: 'NEW-1', 产品名称: 'Excel 新增任务', 技术路线: '180℃ 热压非晶', 交期: '2026-12-01', 优先级: 'P0 特急', 数量: 2, 状态: '待排产', 备注: '' });
    pressing.push(
      { 任务ID: 'NEW-1', 工序ID: '', 工序类型: '预压Core', 工序名称: 'Core X', 模具编号: 'M-CA-01', 所需工时: 4, 已完成工时: 0, 工序状态: '待排', 顺序: 1 },
      { 任务ID: 'NEW-1', 工序ID: '', 工序类型: '合压', 工序名称: '合压', 模具编号: 'M-FINAL-01', 所需工时: 2, 已完成工时: 0, 工序状态: '待排', 顺序: 2 },
    );
    workbook.Sheets['任务'] = XLSX.utils.json_to_sheet(tasks);
    workbook.Sheets['压制工序'] = XLSX.utils.json_to_sheet(pressing);
    workbook.Sheets['后工序'] = XLSX.utils.json_to_sheet(post);
    const response = await upload('tasks', workbook);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ created: 1, updated: 1 });
    const data = await store.read();
    const updatedTask = data.tasks.find((task) => task.id === existing.任务ID)!;
    const createdTask = data.tasks.find((task) => task.productName === 'Excel 新增任务')!;
    expect(updatedTask.productName).toBe('Excel 已更新任务');
    expect(updatedTask.pressingSteps[0].id).toBeGreaterThan(0);
    expect(createdTask.pressingSteps.map((step) => step.stepType)).toEqual(['core', 'final']);
    expect(createdTask.postSteps.length).toBeGreaterThan(0);
  });

  it('Excel 可导入不含预压 Core 的直接合压任务', async () => {
    const workbook = await download('tasks');
    workbook.Sheets['任务'] = XLSX.utils.json_to_sheet([{ 任务ID: 'DIRECT-1', 产品名称: 'Excel 直接合压', 技术路线: '180℃ 热压非晶', 交期: '2026-12-05', 优先级: 'P1 高', 数量: 1, 状态: '待排产', 备注: '' }]);
    workbook.Sheets['压制工序'] = XLSX.utils.json_to_sheet([{ 任务ID: 'DIRECT-1', 工序ID: '', 工序类型: '合压', 工序名称: '合压', 模具编号: 'M-FINAL-01', 所需工时: 3, 已完成工时: 0, 工序状态: '待排', 顺序: 1 }]);
    workbook.Sheets['后工序'] = XLSX.utils.json_to_sheet([]);
    const response = await upload('tasks', workbook);
    expect(response.status).toBe(200);
    const task = (await store.read()).tasks.find((item) => item.productName === 'Excel 直接合压')!;
    expect(task.pressingSteps.map((step) => step.stepType)).toEqual(['final']);
  });

  it('删除全部任务后可用导出的工作簿恢复', async () => {
    const workbook = await download('tasks');
    await store.mutate((data) => { data.tasks = []; });
    const response = await upload('tasks', workbook);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ created: 3, updated: 0, rows: 3 });
    const data = await store.read();
    expect(data.tasks.map((task) => task.id).sort((a, b) => a - b)).toEqual([301, 302, 303]);
    expect(data.tasks.map((task) => task.productName)).toContain('AI-PSU-4800');
  });

  it('部分删除后旧备份中的工序 ID 可兼容匹配', async () => {
    const workbook = await download('tasks');
    await store.mutate((data) => { data.tasks = data.tasks.filter((task) => task.id !== 302); });
    const restored = await upload('tasks', workbook);
    expect(restored.status).toBe(200);
    const restoredData = await store.read();
    const recreated = restoredData.tasks.find((task) => task.id === 302)!;
    expect(recreated.pressingSteps.some((step) => step.id === 2301)).toBe(false);
    const reimported = await upload('tasks', workbook);
    expect(reimported.status).toBe(200);
    expect((await reimported.json()).created).toBe(0);
    expect((await store.read()).tasks.find((task) => task.id === 302)?.productName).toBe('L-180-062');
  });

  it('无写权限角色可以导出但不能导入，非法 Excel 返回中文行号', async () => {
    const marketLogin = await app.request('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'market', password: 'ChangeMe123!' }) });
    const marketCookie = marketLogin.headers.get('set-cookie')!.split(';')[0];
    expect((await app.request('/api/export/presses', { headers: { Cookie: marketCookie } })).status).toBe(200);
    const body = new FormData();
    body.append('file', new File([new Uint8Array([1, 2, 3])], 'bad.xlsx'));
    expect((await app.request('/api/import/presses', { method: 'POST', headers: { Cookie: marketCookie }, body })).status).toBe(403);
    const workbook = await download('presses');
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets['压机']);
    rows[0].每日工时 = '错误';
    workbook.Sheets['压机'] = XLSX.utils.json_to_sheet(rows);
    const invalid = await upload('presses', workbook);
    expect(invalid.status).toBe(400);
    expect((await invalid.json()).message).toContain('第 2 行');
  });
});
