export const ROLES = ['general_manager', 'admin', 'market', 'production'] as const;
export type Role = (typeof ROLES)[number];

export const roleLabels: Record<Role, string> = {
  general_manager: '总经理',
  admin: '管理员',
  market: '市场',
  production: '生产',
};

export type Permission = 'task:write' | 'resource:write' | 'schedule:write' | 'template:write' | 'user:write' | 'user:delete';

const rolePermissions: Record<Role, Permission[]> = {
  general_manager: ['task:write', 'resource:write', 'schedule:write', 'template:write', 'user:write', 'user:delete'],
  admin: ['task:write', 'resource:write', 'schedule:write', 'template:write', 'user:write'],
  market: ['task:write'],
  production: ['resource:write', 'schedule:write'],
};

export function can(role: Role, permission: Permission): boolean {
  return rolePermissions[role].includes(permission);
}

export interface UserAccount {
  id: number;
  username: string;
  name: string;
  role: Role;
  active: boolean;
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
}

export interface SessionRecord {
  id: number;
  tokenHash: string;
  userId: number;
  expiresAt: string;
  createdAt: string;
}
