#!/usr/bin/env node
/**
 * Toolchain invariants, enforced as a runnable script instead of duplicated
 * test suites (the v2-0-typescript suites asserted these same facts inside
 * BOTH the server and client test runs — test-guard Rules 4+7: toolchain
 * guarantees belong in config checks, not in two copies of a unit test).
 *
 * Checks (identical to the retired suites):
 *  1. No .js/.jsx sources under server/src, server/tests, client/src.
 *  2. strict + noImplicitAny enabled in both tsconfig files.
 *  3. Root typecheck script covers server + client; each package's
 *     typecheck script runs `tsc --noEmit`.
 *  4. The server test script runs through tsx (`node --import tsx --test`)
 *     and the client entry HTML boots from /src/main.tsx (the client suite's
 *     fourth assertion, which the server twin never had).
 *
 * Run: npm run check:toolchain (root, server, or client package).
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCANNED_DIRECTORIES = ['server/src', 'server/tests', 'client/src'];

const failures = [];

async function collectFiles(root) {
  const entries = await fs.readdir(root, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(root, entry.name);
      return entry.isDirectory() ? collectFiles(entryPath) : [entryPath];
    })
  );
  return nested.flat();
}

async function readJsonFile(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

const files = (
  await Promise.all(
    SCANNED_DIRECTORIES.map((directory) => collectFiles(path.join(REPO_ROOT, directory)))
  )
).flat();
const forbidden = files
  .filter((filePath) => /\.(js|jsx)$/.test(filePath))
  .map((filePath) => path.relative(REPO_ROOT, filePath));
if (forbidden.length > 0) {
  failures.push(`JavaScript sources found in TypeScript trees: ${forbidden.join(', ')}`);
}

for (const packageName of ['server', 'client']) {
  const tsConfig = await readJsonFile(path.join(REPO_ROOT, packageName, 'tsconfig.json'));
  if (tsConfig.compilerOptions?.strict !== true) {
    failures.push(`${packageName} tsconfig: strict is not enabled`);
  }
  if (tsConfig.compilerOptions?.noImplicitAny !== true) {
    failures.push(`${packageName} tsconfig: noImplicitAny is not enabled`);
  }
}

const rootPackage = await readJsonFile(path.join(REPO_ROOT, 'package.json'));
if (!/server run typecheck/.test(rootPackage.scripts?.typecheck ?? '')) {
  failures.push('root typecheck script does not cover the server package');
}
if (!/client run typecheck/.test(rootPackage.scripts?.typecheck ?? '')) {
  failures.push('root typecheck script does not cover the client package');
}
for (const packageName of ['server', 'client']) {
  const packageJson = await readJsonFile(path.join(REPO_ROOT, packageName, 'package.json'));
  if (!/tsc --noEmit/.test(packageJson.scripts?.typecheck ?? '')) {
    failures.push(`${packageName} typecheck script does not run tsc --noEmit`);
  }
}

const serverPackage = await readJsonFile(path.join(REPO_ROOT, 'server', 'package.json'));
if (!/node --import tsx --test/.test(serverPackage.scripts?.test ?? '')) {
  failures.push('server test script does not run through tsx');
}
const indexHtml = await fs.readFile(path.join(REPO_ROOT, 'client', 'index.html'), 'utf8');
if (!indexHtml.includes('/src/main.tsx')) {
  failures.push('client index.html does not boot from /src/main.tsx');
}

if (failures.length > 0) {
  console.error('check-toolchain FAILED:');
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  process.exit(1);
}
console.log('check-toolchain: all toolchain invariants hold');
