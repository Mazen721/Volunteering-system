import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(CURRENT_DIR, '../../..');
const SCANNED_DIRECTORIES = ['server/src', 'server/tests', 'client/src'];

interface TsConfig {
  compilerOptions?: {
    strict?: boolean;
    noImplicitAny?: boolean;
  };
}

interface PackageJson {
  scripts?: Record<string, string>;
}

async function collectFiles(root: string): Promise<string[]> {
  const entries = await fs.readdir(root, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(root, entry.name);
      return entry.isDirectory() ? collectFiles(entryPath) : [entryPath];
    })
  );
  return nested.flat();
}

async function readJsonFile<T>(filePath: string): Promise<T> {
  return JSON.parse(await fs.readFile(filePath, 'utf8')) as T;
}

describe('Phase V2-0 TypeScript migration (client)', () => {
  it('leaves_no_javascript_sources_in_server_or_client_source_trees', async () => {
    const files = (
      await Promise.all(
        SCANNED_DIRECTORIES.map((directory) => collectFiles(path.join(REPO_ROOT, directory)))
      )
    ).flat();
    const forbidden = files
      .filter((filePath) => /\.(js|jsx)$/.test(filePath))
      .map((filePath) => path.relative(REPO_ROOT, filePath));

    expect(forbidden).toEqual([]);
  });

  it('enables_strict_and_no_implicit_any_in_both_tsconfig_files', async () => {
    for (const packageName of ['server', 'client']) {
      const tsConfig = await readJsonFile<TsConfig>(
        path.join(REPO_ROOT, packageName, 'tsconfig.json')
      );
      expect(tsConfig.compilerOptions?.strict, `${packageName} strict mode`).toBe(true);
      expect(tsConfig.compilerOptions?.noImplicitAny, `${packageName} noImplicitAny`).toBe(true);
    }
  });

  it('exposes_typecheck_scripts_for_root_server_and_client', async () => {
    const rootPackage = await readJsonFile<PackageJson>(path.join(REPO_ROOT, 'package.json'));
    expect(rootPackage.scripts?.typecheck ?? '').toMatch(/server run typecheck/);
    expect(rootPackage.scripts?.typecheck ?? '').toMatch(/client run typecheck/);

    for (const packageName of ['server', 'client']) {
      const packageJson = await readJsonFile<PackageJson>(
        path.join(REPO_ROOT, packageName, 'package.json')
      );
      expect(packageJson.scripts?.typecheck ?? '', `${packageName} typecheck script`).toMatch(
        /tsc --noEmit/
      );
    }
  });

  it('runs_server_tests_through_tsx_and_boots_client_from_main_tsx', async () => {
    const serverPackage = await readJsonFile<PackageJson>(
      path.join(REPO_ROOT, 'server', 'package.json')
    );
    expect(serverPackage.scripts?.test ?? '').toMatch(/node --import tsx --test/);

    const indexHtml = await fs.readFile(path.join(REPO_ROOT, 'client', 'index.html'), 'utf8');
    expect(indexHtml).toContain('/src/main.tsx');
  });
});
