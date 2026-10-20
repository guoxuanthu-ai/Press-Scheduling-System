import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { StoreData } from '../contracts/entities';
import { createSeed } from './seed';
import type { DataStore, StoreChangeListener } from './store';

export class FileStore implements DataStore {
  private data: StoreData | null = null;
  private queue: Promise<void> = Promise.resolve();
  private readonly listeners = new Set<StoreChangeListener>();

  constructor(readonly filePath = process.env.DATA_FILE ?? path.resolve('data/store.json')) {}

  async read(): Promise<StoreData> {
    await this.queue;
    return structuredClone(await this.load());
  }

  async mutate<T>(operation: (draft: StoreData) => T | Promise<T>): Promise<T> {
    let result!: T;
    const pending = this.queue.then(async () => {
      const current = await this.load();
      const draft = structuredClone(current);
      result = await operation(draft);
      draft.revision = current.revision + 1;
      await this.persist(draft);
      this.data = draft;
      for (const listener of this.listeners) listener(draft.revision);
    });
    this.queue = pending.then(() => undefined, () => undefined);
    await pending;
    return result;
  }

  onDidChange(listener: StoreChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private async load(): Promise<StoreData> {
    if (this.data) return this.data;
    try {
      const parsed = JSON.parse(await readFile(this.filePath, 'utf8')) as Partial<StoreData>;
      const seed = createSeed();
      const requiresMigration = parsed.revision === undefined || !parsed.users || !parsed.sessions || !parsed.workCalendar || !parsed.users.some((user) => user.username === 'guoxuan' && user.role === 'general_manager');
      this.data = {
        ...seed,
        ...parsed,
        revision: parsed.revision ?? 0,
        users: parsed.users ?? seed.users,
        sessions: parsed.sessions ?? [],
        workCalendar: parsed.workCalendar ?? {},
      } as StoreData;
      const existingGeneralManager = this.data.users.find((user) => user.username === 'guoxuan');
      if (!existingGeneralManager) {
        const generalManager = seed.users.find((user) => user.username === 'guoxuan')!;
        this.data.users.push({ ...generalManager, id: this.data.nextId++ });
      } else if (existingGeneralManager.role !== 'general_manager') {
        existingGeneralManager.role = 'general_manager';
        existingGeneralManager.updatedAt = new Date().toISOString();
      }
      if (requiresMigration) await this.persist(this.data);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      this.data = createSeed();
      await this.persist(this.data);
    }
    return this.data;
  }

  private async persist(data: StoreData): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temporary, JSON.stringify(data, null, 2), 'utf8');
    await rename(temporary, this.filePath);
  }
}
