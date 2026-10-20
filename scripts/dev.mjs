import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const children = [];
function start(command, args, env = {}) {
  const child = spawn(process.execPath, [command, ...args], {
    cwd: root,
    env: { ...process.env, ...env },
    stdio: 'inherit',
  });
  children.push(child);
  child.on('exit', (code) => {
    if (code && !shuttingDown) {
      console.error(`子进程退出，代码 ${code}`);
      shutdown(code);
    }
  });
  return child;
}

let shuttingDown = false;
function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) child.kill();
  setTimeout(() => process.exit(code), 100).unref();
}

start(path.join(root, 'node_modules/tsx/dist/cli.mjs'), ['watch', 'api/boot.ts'], { API_ONLY: '1', PORT: '3001' });
start(path.join(root, 'node_modules/vite/bin/vite.js'), ['--host', '0.0.0.0']);
console.log('开发环境：Web http://localhost:3000 ，API http://localhost:3001');
process.on('SIGINT', () => shutdown());
process.on('SIGTERM', () => shutdown());
