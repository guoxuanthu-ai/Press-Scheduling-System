import { rm } from 'node:fs/promises';
import path from 'node:path';
import { FileStore } from './fileStore';

const filePath = process.env.DATA_FILE ?? path.resolve('data/store.json');
await rm(filePath, { force: true });
await new FileStore(filePath).read();
console.log(`已重置演示数据：${filePath}`);
