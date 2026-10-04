import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export default async function setup() {
  const dir = await mkdtemp(join(tmpdir(), 'kanvana-pwa-test-'));
  process.env.KANVANA_PWA_TEST_DIR = dir;
  execFileSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--outDir', dir], {
    env: { ...process.env, VITE_PB_URL: '/', npm_package_version: 'pwa-test' },
    stdio: 'pipe'
  });
  return () => rm(dir, { recursive: true, force: true });
}
