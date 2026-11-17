import { spawn } from 'node:child_process';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const SERVICES = [
  { name: 'server', cwd: path.join(ROOT_DIR, 'server'), args: ['--import', 'tsx', '--watch', 'src/server.ts'] },
  {
    name: 'client',
    cwd: path.join(ROOT_DIR, 'client'),
    args: ['./node_modules/vite/bin/vite.js'],
  },
];

function pipePrefixedLines(stream, label, targetStream) {
  const lineReader = readline.createInterface({ input: stream, crlfDelay: Infinity });
  lineReader.on('line', (line) => {
    targetStream.write(`[${label}] ${line}\n`);
  });
}

function spawnService(service, onShutdown) {
  // Spawn node directly so Ctrl+C stops both processes cleanly on Windows without a cmd wrapper.
  const child = spawn(process.execPath, service.args, {
    cwd: service.cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  pipePrefixedLines(child.stdout, service.name, process.stdout);
  pipePrefixedLines(child.stderr, service.name, process.stderr);

  child.on('error', (err) => {
    process.stderr.write(`[${service.name}] Failed to start: ${err.message}\n`);
    onShutdown(1);
  });

  child.on('exit', (code) => onShutdown(code ?? 0));
  return child;
}

function startServices() {
  let shuttingDown = false;
  const children = [];

  function stopAll(exitCode = 0) {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    for (const child of children) {
      if (!child.killed) {
        child.kill();
      }
    }
    process.exitCode = exitCode;
  }

  for (const service of SERVICES) {
    children.push(spawnService(service, stopAll));
  }

  process.on('SIGINT', () => stopAll(0));
  process.on('SIGTERM', () => stopAll(0));
}

startServices();
