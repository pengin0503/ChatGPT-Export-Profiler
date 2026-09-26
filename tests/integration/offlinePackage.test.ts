// @vitest-environment node
import { spawn } from 'node:child_process';
import { copyFile, mkdtemp, mkdir, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function runNode(script: string, cwd: string, env: NodeJS.ProcessEnv): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [script], { cwd, env, stdio: 'ignore' });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`Offline package generator exited with code ${String(code)}.`));
    });
  });
}

describe('offline package release version', () => {
  it('names the ZIP using the release tag version', async () => {
    const root = await mkdtemp(join(tmpdir(), 'chatgpt-export-profiler-offline-'));
    try {
      await mkdir(join(root, 'scripts'));
      await mkdir(join(root, 'dist'));
      await writeFile(join(root, 'package.json'), JSON.stringify({ version: '0.1.0' }));
      await writeFile(join(root, 'dist', 'index.html'), '<html>synthetic</html>');
      await copyFile(join(repositoryRoot, 'scripts/make-offline-package.mjs'), join(root, 'scripts/make-offline-package.mjs'));
      await copyFile(join(repositoryRoot, 'scripts/offline-package-version.mjs'), join(root, 'scripts/offline-package-version.mjs'));
      await copyFile(join(repositoryRoot, 'scripts/serve-offline.mjs'), join(root, 'scripts/serve-offline.mjs'));
      await symlink(join(repositoryRoot, 'node_modules'), join(root, 'node_modules'), 'junction');

      await runNode('scripts/make-offline-package.mjs', root, { ...process.env, GITHUB_REF_NAME: 'v1.2.3' });

      expect(await readdir(join(root, 'artifacts'))).toContain('ChatGPT-Export-Profiler-1.2.3-offline.zip');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
