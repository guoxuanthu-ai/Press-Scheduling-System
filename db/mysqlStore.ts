import { and, eq } from 'drizzle-orm';
import { drizzle, type MySql2Database } from 'drizzle-orm/mysql2';
import { migrate } from 'drizzle-orm/mysql2/migrator';
import { createPool, type Pool } from 'mysql2/promise';
import path from 'node:path';
import type { StoreData } from '../contracts/entities';
import { appState } from './schema';
import { createSeed } from './seed';
import type { DataStore, StoreChangeListener } from './store';

type Database = MySql2Database<Record<string, never>>;
interface StateRow { revision: number; data: StoreData }

export class MySqlStore implements DataStore {
  private queue: Promise<void> = Promise.resolve();
  private readonly listeners = new Set<StoreChangeListener>();

  private constructor(private readonly db: Database, private readonly pool: Pool) {}

  static async create(databaseUrl: string): Promise<MySqlStore> {
    const pool = createPool({ uri: databaseUrl, connectionLimit: 10, waitForConnections: true });
    const db = drizzle(pool) as Database;
    await migrate(db, { migrationsFolder: path.resolve('db/migrations') });
    const store = new MySqlStore(db, pool);
    await store.readRow();
    const initialized = await store.read();
    if (!initialized.users.some((user) => user.username === 'guoxuan' && user.role === 'general_manager')) {
      await store.mutate((data) => {
        const existing = data.users.find((user) => user.username === 'guoxuan');
        if (existing) {
          existing.role = 'general_manager';
          existing.updatedAt = new Date().toISOString();
        } else {
          const generalManager = createSeed().users.find((user) => user.username === 'guoxuan')!;
          data.users.push({ ...generalManager, id: data.nextId++ });
        }
      });
    }
    return store;
  }

  async read(): Promise<StoreData> {
    await this.queue;
    return structuredClone((await this.readRow()).data);
  }

  async mutate<T>(operation: (draft: StoreData) => T | Promise<T>): Promise<T> {
    let result!: T;
    const pending = this.queue.then(async () => {
      for (let attempt = 0; attempt < 20; attempt += 1) {
        const current = await this.readRow();
        const draft = structuredClone(current.data);
        result = await operation(draft);
        draft.revision = current.revision + 1;
        const updateResult = await this.db.update(appState).set({ data: draft, revision: draft.revision, updatedAt: new Date() })
          .where(and(eq(appState.id, 1), eq(appState.revision, current.revision)));
        const header = Array.isArray(updateResult) ? updateResult[0] : updateResult;
        if ((header as { affectedRows?: number }).affectedRows === 1) {
          for (const listener of this.listeners) listener(draft.revision);
          return;
        }
      }
      throw new Error('数据并发变更频繁，请稍后重试');
    });
    this.queue = pending.then(() => undefined, () => undefined);
    await pending;
    return result;
  }

  onDidChange(listener: StoreChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  private async readRow(): Promise<StateRow> {
    const rows = await this.db.select({ revision: appState.revision, data: appState.data }).from(appState).where(eq(appState.id, 1)).limit(1);
    if (rows[0]) {
      const data = typeof rows[0].data === 'string' ? JSON.parse(rows[0].data) as StoreData : rows[0].data;
      return { revision: rows[0].revision, data: { ...data, revision: rows[0].revision } };
    }
    const seed = createSeed();
    try {
      await this.db.insert(appState).values({ id: 1, revision: 0, data: seed });
      return { revision: 0, data: seed };
    } catch {
      const existing = await this.db.select({ revision: appState.revision, data: appState.data }).from(appState).where(eq(appState.id, 1)).limit(1);
      if (!existing[0]) throw new Error('无法初始化生产数据');
      return { revision: existing[0].revision, data: existing[0].data };
    }
  }
}
