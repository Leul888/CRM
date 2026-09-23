// Runs the API (with reload) and the Vite dev server together.
import { spawn } from 'node:child_process';

const env = { ...process.env, SEED_DEMO: process.env.SEED_DEMO ?? 'true' };
const procs = [
  spawn('npx', ['tsx', 'watch', 'server/index.ts'], { stdio: 'inherit', env, shell: process.platform === 'win32' }),
  spawn('npx', ['vite'], { stdio: 'inherit', env, shell: process.platform === 'win32' }),
];
const stop = () => procs.forEach((p) => p.kill('SIGTERM'));
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
procs.forEach((p) => p.on('exit', (code) => { if (code) { stop(); process.exit(code); } }));
