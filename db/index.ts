import { FileStore } from './fileStore';
import { MySqlStore } from './mysqlStore';
import type { DataStore } from './store';

export async function createStoreFromEnv(): Promise<DataStore> {
  if (process.env.DATABASE_URL) return MySqlStore.create(process.env.DATABASE_URL);
  if (process.env.NODE_ENV === 'production') {
    throw new Error('生产环境必须配置 DATABASE_URL，禁止回退到本地演示存储');
  }
  return new FileStore();
}
