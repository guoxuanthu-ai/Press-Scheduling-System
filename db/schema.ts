import { bigint, int, json, mysqlTable, timestamp } from 'drizzle-orm/mysql-core';
import type { StoreData } from '../contracts/entities';

export const appState = mysqlTable('app_state', {
  id: int('id').primaryKey(),
  revision: bigint('revision', { mode: 'number' }).notNull(),
  data: json('data').$type<StoreData>().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
