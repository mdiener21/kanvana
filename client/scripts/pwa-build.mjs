import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const publicDir = fileURLToPath(new URL('../src/public/', import.meta.url));
const workerFile = new URL('../src/service-worker.js', import.meta.url);

export function pwaBuild() {
  return {
    name: 'kanvana-pwa',
    apply: 'build',
    generateBundle: {
      order: 'post',
      handler(_, bundle) {
        const hash = createHash('sha256');
        const files = Object.keys(bundle).filter(name => !name.endsWith('.map')).sort();
        for (const name of files) {
          const output = bundle[name];
          hash.update(name).update(output.type === 'chunk' ? output.code : output.source);
        }
        for (const name of readdirSync(publicDir, { recursive: true }).sort()) {
          if (!name.endsWith('.png') && !name.endsWith('.webmanifest')) continue;
          files.push(name);
          hash.update(name).update(readFileSync(`${publicDir}/${name}`));
        }
        const template = readFileSync(workerFile, 'utf8');
        hash.update(template);
        this.emitFile({
          type: 'asset',
          fileName: 'sw.js',
          source: template
            .replace('__CACHE_VERSION__', JSON.stringify(hash.digest('hex').slice(0, 16)))
            .replace('__PRECACHE_URLS__', JSON.stringify(files))
        });
      }
    }
  };
}
