// A PocketBase that never came up throws here, or every spec would skip itself and the run read green.
import { execFileSync, spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const IMAGE = 'kanvana-pb-live:latest';
const START_TIMEOUT_MS = 60_000;
const EXPLICIT_TARGET_TIMEOUT_MS = 5_000;

function findDocker() {
  const found = ['docker', 'docker.exe'].find((bin) => spawnSync(bin, ['--version'], { stdio: 'ignore' }).status === 0);
  if (!found) throw new Error('test:e2e:live needs Docker for its throwaway PocketBase. Set PB_PROXY_TARGET to use a PocketBase you run yourself.');
  return found;
}

async function isHealthy(target) {
  try {
    return (await fetch(`${target}/api/health`, { signal: AbortSignal.timeout(2000) })).ok;
  } catch {
    return false;
  }
}

async function waitUntilHealthy(target, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isHealthy(target)) return true;
    await new Promise((res) => setTimeout(res, 500));
  }
  return false;
}

export default async function globalSetup() {
  const target = process.env.PB_PROXY_TARGET;
  if (!process.env.LIVE_PB_THROWAWAY_PORT) {
    if (!await waitUntilHealthy(target, EXPLICIT_TARGET_TIMEOUT_MS)) throw new Error(`PocketBase not reachable at PB_PROXY_TARGET=${target}.`);
    return undefined;
  }

  const docker = findDocker();
  const name = `kanvana-pb-live-${process.env.LIVE_PB_THROWAWAY_PORT}`;
  const run = (...args) => execFileSync(docker, args, { cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const remove = () => spawnSync(docker, ['rm', '-f', '-v', name], { stdio: 'ignore' });

  run('build', '-f', 'backend/Dockerfile', '-t', IMAGE, '.');
  run(
    'run', '-d', '--name', name,
    '-p', `127.0.0.1:${process.env.LIVE_PB_THROWAWAY_PORT}:8090`,
    '-e', 'POCKETBASE_ADMIN_EMAIL=admin@kanvana.local',
    '-e', 'POCKETBASE_ADMIN_PASSWORD=changeme123',
    IMAGE,
  );
  if (!await waitUntilHealthy(target, START_TIMEOUT_MS)) {
    const logs = spawnSync(docker, ['logs', '--tail', '40', name], { encoding: 'utf8' });
    remove();
    throw new Error(`The throwaway PocketBase did not become healthy at ${target}.\n${logs.stdout}${logs.stderr}`);
  }
  return remove;
}
