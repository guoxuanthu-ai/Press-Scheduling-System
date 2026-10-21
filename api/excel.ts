import * as XLSX from 'xlsx';
import type { Mold, Press, PostStep, PressingStep, RouteTemplate, SampleTask, StoreData } from '../contracts/entities';
import {
  moldStatusLabels,
  pressStatusLabels,
  priorityLabels,
  PROCESS_NAMES,
  stepStatusLabels,
  taskStatusLabels,
  techRouteLabels,
  type MoldStatus,
  type PressStatus,
  type Priority,
  type ProcessName,
  type StepStatus,
  type TaskStatus,
  type TechRoute,
} from '../contracts/enums';
import { dateToMs, todayLocal } from '../contracts/date';

export type ExcelEntity = 'tasks' | 'presses' | 'molds' | 'templates';
export interface ExcelSummary { created: number; updated: number; rows: number }

type Row = Record<string, unknown>;

function cell(row: Row, key: string): unknown {
  return row[key] ?? '';
}

function textCell(row: Row, key: string, rowIndex: number, required = true): string {
  const value = cell(row, key);
  const text = typeof value === 'string' ? value.trim() : value instanceof Date ? value.toISOString().slice(0, 10) : String(value ?? '').trim();
  if (required && !text) throw new Error(`第 ${rowIndex + 2} 行：${key} 不能为空`);
  return text;
}

function numberCell(row: Row, key: string, rowIndex: number, required = true): number | null {
  const value = cell(row, key);
  if ((value === '' || value === null || value === undefined) && !required) return null;
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`第 ${rowIndex + 2} 行：${key} 必须是数字`);
  return number;
}

function idCell(row: Row, key: string, rowIndex: number): number | undefined {
  const value = cell(row, key);
  if (value === '' || value === null || value === undefined) return undefined;
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new Error(`第 ${rowIndex + 2} 行：${key} 必须是正整数`);
  return id;
}

function parseLabeled<T extends string>(value: string, labels: Record<T, string>, field: string, rowIndex: number): T {
  if (value in labels) return value as T;
  const entry = (Object.entries(labels) as Array<[T, string]>).find(([, label]) => label === value || label.startsWith(`${value} `));
  if (entry) return entry[0] as T;
  throw new Error(`第 ${rowIndex + 2} 行：${field}“${value}”无效`);
}

function hasChanges<T extends object>(existing: T, payload: Partial<T>): boolean {
  return JSON.stringify(existing) !== JSON.stringify({ ...existing, ...payload });
}

function parseDate(value: unknown, field: string, rowIndex: number): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
  }
  const text = String(value ?? '').trim().replaceAll('/', '-');
  try { dateToMs(text); return text; } catch { throw new Error(`第 ${rowIndex + 2} 行：${field} 必须是 YYYY-MM-DD 日期`); }
}

function sheetRows(workbook: XLSX.WorkBook, name: string, required = false): Row[] {
  const sheet = workbook.Sheets[name];
  if (!sheet) {
    if (required) throw new Error(`缺少工作表“${name}”`);
    return [];
  }
  return XLSX.utils.sheet_to_json<Row>(sheet, { defval: '' });
}

function createWorkbook(sheets: Record<string, Row[]>): Buffer {
  const workbook = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), name);
  }
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

function statusText<T extends string>(value: T, labels: Record<T, string>): string {
  return labels[value];
}

export function exportEntity(entity: ExcelEntity, data: StoreData): { filename: string; buffer: Buffer } {
  const suffix = todayLocal();
  if (entity === 'presses') {
    const rows = data.presses.map((press) => ({ ID: press.id, 名称: press.name, 型号: press.model, 状态: statusText(press.status, pressStatusLabels), 每日工时: press.dailyHours, 备注: press.remark }));
    return { filename: `压机资源-${suffix}.xlsx`, buffer: createWorkbook({ 压机: rows }) };
  }
  if (entity === 'molds') {
    const pressNames = new Map(data.presses.map((press) => [press.id, press.name]));
    const rows = data.molds.map((mold) => ({ ID: mold.id, 模具编号: mold.code, 模具名称: mold.name, 状态: statusText(mold.status, moldStatusLabels), 开模周期天: mold.leadTimeDays, 适配压机: mold.pressIds.map((id) => pressNames.get(id)).filter(Boolean).join('、'), 下单日期: mold.orderDate ?? '', 备注: mold.remark }));
    return { filename: `模具台账-${suffix}.xlsx`, buffer: createWorkbook({ 模具: rows }) };
  }
  if (entity === 'templates') {
    const rows = data.templates.flatMap((template) => template.steps.map((step) => ({ 技术路线: techRouteLabels[template.techRoute], 顺序: step.seq, 工序名称: step.processName, 耗时小时: step.durationHours })));
    return { filename: `工艺模板-${suffix}.xlsx`, buffer: createWorkbook({ 工艺模板: rows }) };
  }
  const moldCodes = new Map(data.molds.map((mold) => [mold.id, mold.code]));
  const tasks = data.tasks.map((task) => ({ 任务ID: task.id, 产品名称: task.productName, 技术路线: techRouteLabels[task.techRoute], 交期: task.deadline, 优先级: priorityLabels[task.priority], 数量: task.quantity ?? '', 状态: statusText(task.status, taskStatusLabels), 备注: task.remark }));
  const pressing = data.tasks.flatMap((task) => task.pressingSteps.map((step) => ({ 任务ID: task.id, 工序ID: step.id, 工序类型: step.stepType === 'core' ? '预压Core' : '合压', 工序名称: step.name, 模具编号: moldCodes.get(step.moldId) ?? '', 所需工时: step.requiredHours, 已完成工时: step.completedHours, 工序状态: statusText(step.status, stepStatusLabels), 顺序: step.seq })));
  const post = data.tasks.flatMap((task) => task.postSteps.map((step) => ({ 任务ID: task.id, 工序ID: step.id, 顺序: step.seq, 工序名称: step.processName, 耗时小时: step.durationHours, 工序状态: statusText(step.status, stepStatusLabels) })));
  return { filename: `打样任务-${suffix}.xlsx`, buffer: createWorkbook({ 任务: tasks, 压制工序: pressing, 后工序: post }) };
}

function importPresses(rows: Row[], data: StoreData): ExcelSummary {
  let created = 0;
  let updated = 0;
  rows.forEach((row, index) => {
    const id = idCell(row, 'ID', index);
    const name = textCell(row, '名称', index);
    const model = textCell(row, '型号', index);
    const status = parseLabeled<PressStatus>(textCell(row, '状态', index, false) || '可用', pressStatusLabels, '状态', index);
    const dailyHours = numberCell(row, '每日工时', index)!;
    if (dailyHours <= 0 || dailyHours > 24) throw new Error(`第 ${index + 2} 行：每日工时必须在 0-24 小时之间`);
    const existing = id ? data.presses.find((press) => press.id === id) : data.presses.find((press) => press.name === name);
    if (id && !existing) throw new Error(`第 ${index + 2} 行：压机 ID ${id} 不存在`);
    if (existing) {
      const payload = { name, model, status, dailyHours, remark: textCell(row, '备注', index, false) };
      if (hasChanges(existing, payload)) {
        Object.assign(existing, payload);
        updated += 1;
      }
    } else {
      data.presses.push({ id: data.nextId++, name, model, status, dailyHours, remark: textCell(row, '备注', index, false), createdAt: new Date().toISOString() });
      created += 1;
    }
  });
  return { created, updated, rows: rows.length };
}

function importMolds(rows: Row[], data: StoreData): ExcelSummary {
  let created = 0;
  let updated = 0;
  rows.forEach((row, index) => {
    const id = idCell(row, 'ID', index);
    const code = textCell(row, '模具编号', index);
    const name = textCell(row, '模具名称', index);
    const status = parseLabeled<MoldStatus>(textCell(row, '状态', index, false) || '已有可用', moldStatusLabels, '状态', index);
    const leadTimeDays = numberCell(row, '开模周期天', index)!;
    if (!Number.isInteger(leadTimeDays) || leadTimeDays <= 0) throw new Error(`第 ${index + 2} 行：开模周期天必须是正整数`);
    const pressNames = textCell(row, '适配压机', index).split(/[、,，;；\n]/).map((item) => item.trim()).filter(Boolean);
    const pressIds = pressNames.map((pressName) => {
      const press = data.presses.find((item) => item.name === pressName);
      if (!press) throw new Error(`第 ${index + 2} 行：适配压机“${pressName}”不存在`);
      return press.id;
    });
    const orderText = textCell(row, '下单日期', index, false);
    const orderDate = orderText ? parseDate(cell(row, '下单日期'), '下单日期', index) : null;
    const existing = id ? data.molds.find((mold) => mold.id === id) : data.molds.find((mold) => mold.code === code);
    if (id && !existing) throw new Error(`第 ${index + 2} 行：模具 ID ${id} 不存在`);
    const payload = { code, name, status, leadTimeDays, pressIds, orderDate, remark: textCell(row, '备注', index, false) };
    if (existing) {
      if (hasChanges(existing, payload)) {
        Object.assign(existing, payload);
        updated += 1;
      }
    } else {
      data.molds.push({ ...payload, id: data.nextId++, createdAt: new Date().toISOString() });
      created += 1;
    }
  });
  return { created, updated, rows: rows.length };
}

function importTemplates(rows: Row[], data: StoreData): ExcelSummary {
  const grouped = new Map<TechRoute, Array<{ processName: ProcessName; durationHours: number }>>();
  rows.forEach((row, index) => {
    const route = parseLabeled<TechRoute>(textCell(row, '技术路线', index), techRouteLabels, '技术路线', index);
    const processName = textCell(row, '工序名称', index) as ProcessName;
    if (!PROCESS_NAMES.includes(processName)) throw new Error(`第 ${index + 2} 行：工序名称“${processName}”无效`);
    const durationHours = numberCell(row, '耗时小时', index)!;
    if (durationHours <= 0) throw new Error(`第 ${index + 2} 行：耗时小时必须大于 0`);
    grouped.set(route, [...(grouped.get(route) ?? []), { processName, durationHours }]);
  });
  let updated = 0;
  for (const [route, steps] of grouped) {
    const template = data.templates.find((item) => item.techRoute === route);
    if (!template) throw new Error(`技术路线“${techRouteLabels[route]}”不存在`);
    const oldByName = new Map(template.steps.map((step) => [step.processName, step]));
    const nextSteps = steps.map((step, index) => ({ ...step, id: oldByName.get(step.processName)?.id ?? data.nextId++, seq: index + 1 }));
    const oldComparable = template.steps.map(({ processName, durationHours, seq }) => ({ processName, durationHours, seq }));
    const nextComparable = nextSteps.map(({ processName, durationHours, seq }) => ({ processName, durationHours, seq }));
    if (JSON.stringify(oldComparable) !== JSON.stringify(nextComparable)) {
      template.steps = nextSteps;
      template.updatedAt = new Date().toISOString();
      updated += 1;
    }
  }
  return { created: 0, updated, rows: rows.length };
}

interface TaskImportContext {
  task: SampleTask;
  existing: SampleTask | undefined;
}

function parseStepStatus(value: string, rowIndex: number): StepStatus {
  return parseLabeled<StepStatus>(value || '待排', stepStatusLabels, '工序状态', rowIndex);
}

function parseStepType(value: string, rowIndex: number): 'core' | 'final' {
  const normalized = value.toLowerCase();
  if (['core', '预压core', '预压'].includes(normalized)) return 'core';
  if (['final', '合压'].includes(normalized)) return 'final';
  throw new Error(`第 ${rowIndex + 2} 行：工序类型必须是 预压Core 或 合压`);
}

function importTasks(workbook: XLSX.WorkBook, data: StoreData): ExcelSummary {
  const taskRows = sheetRows(workbook, '任务', true);
  const pressingRows = sheetRows(workbook, '压制工序', true);
  const postRows = sheetRows(workbook, '后工序', false);
  const pressingByTask = new Map<string, Array<{ row: Row; index: number }>>();
  const postByTask = new Map<string, Array<{ row: Row; index: number }>>();
  for (const [index, row] of pressingRows.entries()) {
    const key = textCell(row, '任务ID', index);
    pressingByTask.set(key, [...(pressingByTask.get(key) ?? []), { row, index }]);
  }
  for (const [index, row] of postRows.entries()) {
    const key = textCell(row, '任务ID', index);
    postByTask.set(key, [...(postByTask.get(key) ?? []), { row, index }]);
  }
  let created = 0;
  let updated = 0;
  const seenKeys = new Set<string>();
  for (const [index, row] of taskRows.entries()) {
    const taskKey = textCell(row, '任务ID', index);
    if (seenKeys.has(taskKey)) throw new Error(`第 ${index + 2} 行：任务ID“${taskKey}”重复`);
    seenKeys.add(taskKey);
    const existingId = /^\d+$/.test(taskKey) ? Number(taskKey) : undefined;
    const existing = existingId ? data.tasks.find((task) => task.id === existingId) : undefined;
    const existingSource = existing ? structuredClone(existing) : undefined;
    if (existingId && !existing) data.nextId = Math.max(data.nextId, existingId + 1);
    const techRoute = parseLabeled<TechRoute>(textCell(row, '技术路线', index), techRouteLabels, '技术路线', index);
    const template = data.templates.find((item) => item.techRoute === techRoute);
    if (!template) throw new Error(`第 ${index + 2} 行：技术路线没有模板`);
    const pressingGroup = pressingByTask.get(taskKey) ?? [];
    if (!pressingGroup.length) throw new Error(`第 ${index + 2} 行：任务“${taskKey}”缺少压制工序`);
    const coreCount = pressingGroup.filter(({ row: item, index: itemIndex }) => parseStepType(textCell(item, '工序类型', itemIndex), itemIndex) === 'core').length;
    const finalCount = pressingGroup.length - coreCount;
    if (finalCount !== 1) throw new Error(`第 ${index + 2} 行：任务“${taskKey}”必须包含一个合压工序；预压Core可为 0 个`);
    const timestamp = new Date().toISOString();
    const taskStatus = parseLabeled<TaskStatus>(textCell(row, '状态', index, false) || (existing ? taskStatusLabels[existing.status] : '待排产'), taskStatusLabels, '状态', index);
    const task: SampleTask = existingSource ?? {
      id: existingId ?? data.nextId++,
      productName: '',
      techRoute,
      deadline: '',
      priority: 'P2',
      quantity: null,
      status: 'pending',
      remark: '',
      pressingSteps: [],
      postSteps: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    task.productName = textCell(row, '产品名称', index);
    task.techRoute = techRoute;
    task.deadline = parseDate(cell(row, '交期'), '交期', index);
    task.priority = parseLabeled<Priority>(textCell(row, '优先级', index, false) || 'P2', priorityLabels, '优先级', index);
    task.quantity = numberCell(row, '数量', index, false);
    task.status = taskStatus;
    task.remark = textCell(row, '备注', index, false);
    task.pressingSteps = pressingGroup.map(({ row: stepRow, index: stepIndex }, seqIndex) => {
      const stepId = idCell(stepRow, '工序ID', stepIndex);
      const stepType = parseStepType(textCell(stepRow, '工序类型', stepIndex), stepIndex);
      const stepName = textCell(stepRow, '工序名称', stepIndex);
      const currentSteps = existingSource?.pressingSteps ?? [];
      const existingStep = (stepId ? currentSteps.find((step) => step.id === stepId) : undefined)
        ?? currentSteps.find((step) => step.stepType === stepType && step.name === stepName)
        ?? currentSteps.find((step) => step.stepType === stepType && step.seq === seqIndex + 1);
      const moldCode = textCell(stepRow, '模具编号', stepIndex);
      const mold = data.molds.find((item) => item.code === moldCode);
      if (!mold) throw new Error(`第 ${stepIndex + 2} 行：模具编号“${moldCode}”不存在`);
      const requiredHours = numberCell(stepRow, '所需工时', stepIndex)!;
      const completedHours = existingStep?.completedHours ?? 0;
      if (requiredHours <= 0 || requiredHours < completedHours) throw new Error(`第 ${stepIndex + 2} 行：所需工时必须大于 0 且不小于已完成工时`);
      const status = existingStep ? parseStepStatus(textCell(stepRow, '工序状态', stepIndex, false) || stepStatusLabels[existingStep.status], stepIndex) : 'pending';
      return {
        id: existingStep?.id ?? data.nextId++,
        stepType: parseStepType(textCell(stepRow, '工序类型', stepIndex), stepIndex),
        name: textCell(stepRow, '工序名称', stepIndex),
        moldId: mold.id,
        requiredHours,
        completedHours,
        status,
        seq: seqIndex + 1,
        assignedPressId: existingStep?.assignedPressId ?? null,
      } satisfies PressingStep;
    });
    const postGroup = postByTask.get(taskKey) ?? [];
    const postSource = postGroup.length ? postGroup : template.steps.map((step) => ({ row: { 工序ID: '', 工序名称: step.processName, 耗时小时: step.durationHours, 工序状态: '待排' }, index: -1 }));
    task.postSteps = postSource.map(({ row: stepRow, index: stepIndex }, seqIndex) => {
      const stepId = stepIndex >= 0 ? idCell(stepRow, '工序ID', stepIndex) : undefined;
      const processName = textCell(stepRow, '工序名称', Math.max(stepIndex, index)) as ProcessName;
      const currentSteps = existingSource?.postSteps ?? [];
      const existingStep = (stepId ? currentSteps.find((step) => step.id === stepId) : undefined)
        ?? currentSteps.find((step) => step.processName === processName)
        ?? currentSteps.find((step) => step.seq === seqIndex + 1);
      if (!PROCESS_NAMES.includes(processName)) throw new Error(`第 ${Math.max(stepIndex, index) + 2} 行：后工序“${processName}”无效`);
      const durationHours = numberCell(stepRow, '耗时小时', Math.max(stepIndex, index))!;
      if (durationHours <= 0) throw new Error(`第 ${Math.max(stepIndex, index) + 2} 行：后工序耗时必须大于 0`);
      return {
        id: existingStep?.id ?? data.nextId++,
        seq: seqIndex + 1,
        processName,
        durationHours,
        status: existingStep ? existingStep.status : 'pending',
      } satisfies PostStep;
    });
    if (task.status === 'completed') {
      for (const step of task.pressingSteps) {
        step.completedHours = step.requiredHours;
        step.status = 'completed';
      }
      for (const step of task.postSteps) step.status = 'completed';
    }
    if (existing) {
      const withoutUpdatedAt = ({ updatedAt: _, ...value }: SampleTask) => value;
      if (JSON.stringify(withoutUpdatedAt(existing)) !== JSON.stringify(withoutUpdatedAt(task))) {
        task.updatedAt = timestamp;
        Object.assign(existing, task);
        updated += 1;
      }
    } else {
      data.tasks.push(task);
      created += 1;
    }
  }
  return { created, updated, rows: taskRows.length };
}

export async function importEntity(entity: ExcelEntity, buffer: Buffer, data: StoreData): Promise<ExcelSummary> {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  if (entity === 'presses') return importPresses(sheetRows(workbook, '压机', true), data);
  if (entity === 'molds') return importMolds(sheetRows(workbook, '模具', true), data);
  if (entity === 'templates') return importTemplates(sheetRows(workbook, '工艺模板', true), data);
  return importTasks(workbook, data);
}
