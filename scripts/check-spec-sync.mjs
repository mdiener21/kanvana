import { execFileSync } from 'node:child_process';

function getArg(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function getChangedFiles(base, head) {
  const output = base && head
    ? execFileSync('git', ['diff', '--name-only', '--diff-filter=ACMR', `${base}...${head}`], {
        encoding: 'utf8'
      })
    : execFileSync('git', ['status', '--short', '--untracked-files=all'], {
        encoding: 'utf8'
      });

  return output
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      if (base && head) {
        return line.trim();
      }

      const path = line.slice(3).trim();
      return path.includes(' -> ') ? path.split(' -> ').at(-1) : path;
    });
}

const base = getArg('--base');
const head = getArg('--head');

let changedFiles;

try {
  changedFiles = getChangedFiles(base, head);
} catch (error) {
  console.error('Unable to determine changed files for spec sync check.');
  console.error(error.message);
  process.exit(1);
}

const touchesAppCode = changedFiles.some((file) => file.startsWith('src/'));

if (!touchesAppCode) {
  console.log('No files under src/ changed; spec sync check passes.');
  process.exit(0);
}

const touchesSpec = changedFiles.some(
  (file) => file === 'docs/specification-kanban.md' || file.startsWith('docs/spec/')
);
const touchesChangelog = changedFiles.includes('CHANGELOG.md');

if (touchesSpec && touchesChangelog) {
  console.log('Spec sync check passes: app changes include spec updates and changelog updates.');
  process.exit(0);
}

console.error('Spec sync check failed.');
console.error('Changes under src/ must be accompanied by:');
console.error('- at least one update in docs/spec/ or docs/specification-kanban.md');
console.error('- an update to CHANGELOG.md');
console.error('Changed files:');
for (const file of changedFiles) {
  console.error(`- ${file}`);
}
process.exit(1);
