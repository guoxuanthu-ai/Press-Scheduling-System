import { addDays, todayLocal } from '../contracts/date';
import type { RouteTemplate, SampleTask, StoreData } from '../contracts/entities';
import { createInitialUsers } from './authUtils';

const createdAt = '2026-10-08T08:00:00.000Z';

export function createSeed(baseDate = todayLocal()): StoreData {
  const presses = Array.from({ length: 10 }, (_, index) => ({
    id: index + 1,
    name: `${index + 1}号压机`,
    model: ['XX-200T', 'HD-160T', 'XX-250T'][index % 3],
    status: 'available' as const,
    dailyHours: 8,
    remark: index < 2 ? '一体电感打样主力设备' : '',
    createdAt,
  }));
  const molds = [
    { id: 101, code: 'M-CA-01', name: 'Core A 预压模', status: 'available' as const, leadTimeDays: 10, pressIds: [1, 3, 5], orderDate: null, remark: 'AI 算力电源系列', createdAt },
    { id: 102, code: 'M-CB-01', name: 'Core B 预压模', status: 'production' as const, leadTimeDays: 12, pressIds: [3, 5], orderDate: null, remark: '待下单开模', createdAt },
    { id: 103, code: 'M-FINAL-01', name: 'A 系列合压模', status: 'available' as const, leadTimeDays: 14, pressIds: [2], orderDate: null, remark: '', createdAt },
    { id: 104, code: 'M-CA-02', name: 'Core A 复制模', status: 'available' as const, leadTimeDays: 10, pressIds: [2, 4], orderDate: null, remark: '', createdAt },
    { id: 105, code: 'M-FINAL-02', name: 'B 系列合压模', status: 'available' as const, leadTimeDays: 14, pressIds: [4, 6], orderDate: null, remark: '', createdAt },
    { id: 106, code: 'M-CC-01', name: 'Core C 预压模', status: 'available' as const, leadTimeDays: 9, pressIds: [5, 7], orderDate: null, remark: '', createdAt },
    { id: 107, code: 'M-FINAL-03', name: 'C 系列合压模', status: 'production' as const, leadTimeDays: 8, pressIds: [7, 8], orderDate: addDays(baseDate, -2), remark: '已下单，等待到厂', createdAt },
    { id: 108, code: 'M-REPAIR-01', name: '维修备用模', status: 'maintenance' as const, leadTimeDays: 7, pressIds: [9], orderDate: null, remark: '型腔维修', createdAt },
  ];
  const templates: RouteTemplate[] = [
    {
      id: 201,
      techRoute: 'copper_iron',
      updatedAt: createdAt,
      steps: [
        { id: 1101, seq: 1, processName: '热处理', durationHours: 24 },
        { id: 1102, seq: 2, processName: '含浸', durationHours: 8 },
        { id: 1103, seq: 3, processName: '磨切', durationHours: 8 },
        { id: 1104, seq: 4, processName: '喷涂', durationHours: 12 },
        { id: 1105, seq: 5, processName: '电镀', durationHours: 24 },
      ],
    },
    {
      id: 202,
      techRoute: 'amorphous_480',
      updatedAt: createdAt,
      steps: [
        { id: 1201, seq: 1, processName: '热处理', durationHours: 24 },
        { id: 1202, seq: 2, processName: '磨切', durationHours: 8 },
        { id: 1203, seq: 3, processName: '喷涂', durationHours: 12 },
        { id: 1204, seq: 4, processName: '电镀', durationHours: 24 },
      ],
    },
    {
      id: 203,
      techRoute: 'amorphous_180',
      updatedAt: createdAt,
      steps: [
        { id: 1301, seq: 1, processName: '热处理', durationHours: 24 },
        { id: 1302, seq: 2, processName: '磨切', durationHours: 8 },
        { id: 1303, seq: 3, processName: '电镀', durationHours: 24 },
      ],
    },
  ];
  const tasks: SampleTask[] = [
    {
      id: 301,
      productName: 'AI-PSU-4800',
      techRoute: 'amorphous_180',
      deadline: addDays(baseDate, 17),
      priority: 'P0',
      quantity: 20,
      status: 'in_progress',
      remark: 'AI 算力中心三次电源供电项目',
      pressingSteps: [
        { id: 2101, stepType: 'core', name: 'Core A', moldId: 101, requiredHours: 10, completedHours: 0, status: 'pending', seq: 1, assignedPressId: null },
        { id: 2102, stepType: 'core', name: 'Core B', moldId: 102, requiredHours: 8, completedHours: 0, status: 'pending', seq: 2, assignedPressId: null },
        { id: 2103, stepType: 'final', name: '合压', moldId: 103, requiredHours: 6, completedHours: 0, status: 'pending', seq: 3, assignedPressId: null },
      ],
      postSteps: [
        { id: 2201, seq: 1, processName: '热处理', durationHours: 24, status: 'pending' },
        { id: 2202, seq: 2, processName: '磨切', durationHours: 8, status: 'pending' },
        { id: 2203, seq: 3, processName: '电镀', durationHours: 24, status: 'pending' },
      ],
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: 302,
      productName: 'L-180-062',
      techRoute: 'amorphous_180',
      deadline: addDays(baseDate, 4),
      priority: 'P1',
      quantity: 12,
      status: 'pending',
      remark: '客户结构验证样',
      pressingSteps: [
        { id: 2301, stepType: 'core', name: 'Core A', moldId: 104, requiredHours: 6, completedHours: 0, status: 'pending', seq: 1, assignedPressId: null },
        { id: 2302, stepType: 'core', name: 'Core C', moldId: 106, requiredHours: 4, completedHours: 0, status: 'pending', seq: 2, assignedPressId: null },
        { id: 2303, stepType: 'final', name: '合压', moldId: 105, requiredHours: 4, completedHours: 0, status: 'pending', seq: 3, assignedPressId: null },
      ],
      postSteps: [
        { id: 2401, seq: 1, processName: '热处理', durationHours: 24, status: 'pending' },
        { id: 2402, seq: 2, processName: '磨切', durationHours: 8, status: 'pending' },
        { id: 2403, seq: 3, processName: '电镀', durationHours: 24, status: 'pending' },
      ],
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: 303,
      productName: 'CIF-220-PRO',
      techRoute: 'copper_iron',
      deadline: addDays(baseDate, 2),
      priority: 'P2',
      quantity: 8,
      status: 'pending',
      remark: '铜铁共烧工艺验证',
      pressingSteps: [
        { id: 2501, stepType: 'core', name: 'Core A', moldId: 101, requiredHours: 12, completedHours: 0, status: 'pending', seq: 1, assignedPressId: null },
        { id: 2502, stepType: 'final', name: '合压', moldId: 105, requiredHours: 6, completedHours: 0, status: 'pending', seq: 2, assignedPressId: null },
      ],
      postSteps: [
        { id: 2601, seq: 1, processName: '热处理', durationHours: 24, status: 'pending' },
        { id: 2602, seq: 2, processName: '含浸', durationHours: 8, status: 'pending' },
        { id: 2603, seq: 3, processName: '磨切', durationHours: 8, status: 'pending' },
      ],
      createdAt,
      updatedAt: createdAt,
    },
  ];
  return { version: 1, revision: 0, nextId: 5000, users: createInitialUsers(), sessions: [], presses, molds, templates, tasks, workCalendar: {}, scheduleRuns: [] };
}
