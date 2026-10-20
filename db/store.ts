import type { StoreData } from '../contracts/entities';

export type StoreChangeListener = (revision: number) => void;

export interface DataStore {
  read(): Promise<StoreData>;
  mutate<T>(operation: (draft: StoreData) => T | Promise<T>): Promise<T>;
  onDidChange(listener: StoreChangeListener): () => void;
}
