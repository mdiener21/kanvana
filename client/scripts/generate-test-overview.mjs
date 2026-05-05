import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const rootDir = process.cwd();
const testsDir = path.join(rootDir, 'tests');
const modulesDir = path.join(rootDir, 'src', 'modules');
const specDir = path.join(rootDir, '..', 'docs', 'system', 'spec');
const outputPath = path.join(testsDir, 'TEST-OVERVIEW.md');

const TEST_FILE_RE = /\.(test|spec)\.(js|ts)$/;
const SUITE_RE = /(?:^|[\s({;])(?:test\.)?describe(?:\.(?:only|skip))?\s*\(\s*(['"`])((?:\\.|(?!\1).)*)\1/;
const TEST_RE = /(?:^|[\s({;])(?:test|it)(?:\.(?:only|skip|fixme))?\s*\(\s*(['"`])((?:\\.|(?!\1).)*)\1/;
const SPEC_COMMENT_RE = /^\s*\/\/\s*spec:\s*(.+?)\s*$/;

const TEST_TYPE_LABELS = {
  unit: 'Unit',
  dom: 'DOM Integration',
  e2e: 'End-to-End'
};

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function listFiles(dir) {
  if (!(await pathExists(dir))) {
    return [];
  }

  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return listFiles(entryPath);
    }
    return entryPath;
  }));

  return files.flat().sort();
}

function toPosix(relativePath) {
  return relativePath.split(path.sep).join('/');
}

function escapeMarkdown(text) {
  return text.replaceAll('|', '\\|').replaceAll('\n', ' ');
}

function normalizeToken(value) {
  return value
    .toLowerCase()
    .replace(/\.spec|\.test/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

function titleFromName(name) {
  return name
    .replace(/\.(test|spec)\.(js|ts)$/, '')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function countBraces(line) {
  const withoutStrings = line
    .replace(/(['"`])(?:\\.|(?!\1).)*\1/g, '')
    .replace(/\/\/.*$/, '');
  const opens = (withoutStrings.match(/{/g) || []).length;
  const closes = (withoutStrings.match(/}/g) || []).length;
  return opens - closes;
}

function parseTestFile(filePath, source) {
  const relativePath = toPosix(path.relative(rootDir, filePath));
  const type = relativePath.includes('/unit/')
    ? 'unit'
    : relativePath.includes('/dom/')
      ? 'dom'
      : relativePath.includes('/e2e/')
        ? 'e2e'
        : 'other';
  const lines = source.split(/\r?\n/);
  const suites = [];
  const tests = [];
  const specLinks = [];
  let currentDepth = 0;

  lines.forEach((line, index) => {
    while (suites.length > 0 && currentDepth < suites[suites.length - 1].depth) {
      suites.pop();
    }

    const specMatch = line.match(SPEC_COMMENT_RE);
    if (specMatch) {
      specLinks.push(specMatch[1]);
    }

    const suiteMatch = line.match(SUITE_RE);
    if (suiteMatch) {
      suites.push({
        title: suiteMatch[2],
        depth: currentDepth + 1
      });
    }

    const testMatch = line.match(TEST_RE);
    if (testMatch && !line.includes('test.describe')) {
      tests.push({
        title: testMatch[2],
        suitePath: suites.map((suite) => suite.title),
        line: index + 1
      });
    }

    currentDepth += countBraces(line);
  });

  return {
    path: relativePath,
    fileName: path.basename(filePath),
    type,
    title: titleFromName(path.basename(filePath)),
    specLinks,
    tests
  };
}

async function collectTestFiles() {
  const files = await listFiles(testsDir);
  const testFiles = files.filter((filePath) => TEST_FILE_RE.test(filePath));
  const parsed = await Promise.all(testFiles.map(async (filePath) => {
    const source = await fs.readFile(filePath, 'utf8');
    return parseTestFile(filePath, source);
  }));

  return parsed.sort((a, b) => a.path.localeCompare(b.path));
}

async function collectSourceModules() {
  const files = await listFiles(modulesDir);
  return files
    .filter((filePath) => filePath.endsWith('.js'))
    .map((filePath) => toPosix(path.relative(rootDir, filePath)))
    .sort();
}

async function collectSpecFiles() {
  if (!(await pathExists(specDir))) {
    return [];
  }

  const entries = await fs.readdir(specDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => toPosix(path.relative(rootDir, path.join(specDir, entry.name))))
    .sort();
}

function buildCoverageIndex(testFiles) {
  const indexText = testFiles
    .map((file) => [
      file.path,
      file.title,
      file.specLinks.join(' '),
      ...file.tests.map((test) => [...test.suitePath, test.title].join(' '))
    ].join(' '))
    .join(' ');

  return normalizeToken(indexText);
}

function hasCoverage(coverageIndex, relativePath) {
  const basename = path.basename(relativePath, path.extname(relativePath));
  const token = normalizeToken(basename);
  if (coverageIndex.includes(token)) {
    return true;
  }

  const compactToken = normalizeToken(basename.replace(/s$/, ''));
  return compactToken.length > 3 && coverageIndex.includes(compactToken);
}

function renderFileSection(file) {
  const lines = [];
  lines.push(`### ${file.title}`);
  lines.push('');
  lines.push(`- Path: \`${file.path}\``);
  lines.push(`- Type: ${TEST_TYPE_LABELS[file.type] || 'Other'}`);
  lines.push(`- Test count: ${file.tests.length}`);
  if (file.specLinks.length > 0) {
    lines.push(`- Source plan/spec: ${file.specLinks.map((entry) => `\`${entry}\``).join(', ')}`);
  }
  lines.push('');

  if (file.tests.length === 0) {
    lines.push('_No executable test cases detected._');
  } else {
    file.tests.forEach((test) => {
      const prefix = test.suitePath.length > 0 ? `${test.suitePath.join(' > ')} > ` : '';
      lines.push(`- \`${file.path}:${test.line}\` ${escapeMarkdown(prefix + test.title)}`);
    });
  }
  lines.push('');
  return lines.join('\n');
}

function renderOverview(testFiles, sourceModules, specFiles) {
  const byType = new Map();
  testFiles.forEach((file) => {
    const group = byType.get(file.type) || [];
    group.push(file);
    byType.set(file.type, group);
  });

  const testCount = testFiles.reduce((total, file) => total + file.tests.length, 0);
  const coverageIndex = buildCoverageIndex(testFiles);
  const modulesWithoutNamedCoverage = sourceModules.filter((filePath) => !hasCoverage(coverageIndex, filePath));
  const specsWithoutNamedCoverage = specFiles.filter((filePath) => !hasCoverage(coverageIndex, filePath));
  const lines = [];

  lines.push('# Test Overview');
  lines.push('');
  lines.push('Generated from test source. Do not edit by hand; run `npm run test:overview` from `client/`.');
  lines.push('');
  lines.push('## Fast Scan');
  lines.push('');
  lines.push(`- Test files: ${testFiles.length}`);
  lines.push(`- Test cases: ${testCount}`);
  lines.push(`- Unit files: ${(byType.get('unit') || []).length}`);
  lines.push(`- DOM integration files: ${(byType.get('dom') || []).length}`);
  lines.push(`- E2E files: ${(byType.get('e2e') || []).length}`);
  lines.push('');
  lines.push('## How To Use This');
  lines.push('');
  lines.push('- For a requested feature change, search this file for the feature, module, UI label, and spec name.');
  lines.push('- If matching tests exist, update the closest unit/DOM/E2E case first.');
  lines.push('- If no matching tests exist, add coverage in the layer recommended by `docs/system/spec/testing-strategy.md`.');
  lines.push('- Treat the gap lists below as heuristics, not proof that behavior is untested.');
  lines.push('');
  lines.push('## Coverage Gaps By Name');
  lines.push('');
  lines.push('These lists compare source/spec filenames against test file names and test titles.');
  lines.push('');
  lines.push('### Source Modules Without Obvious Named Coverage');
  lines.push('');
  if (modulesWithoutNamedCoverage.length === 0) {
    lines.push('- None detected');
  } else {
    modulesWithoutNamedCoverage.forEach((filePath) => lines.push(`- \`${filePath}\``));
  }
  lines.push('');
  lines.push('### Specs Without Obvious Named Coverage');
  lines.push('');
  if (specsWithoutNamedCoverage.length === 0) {
    lines.push('- None detected');
  } else {
    specsWithoutNamedCoverage.forEach((filePath) => lines.push(`- \`${filePath}\``));
  }
  lines.push('');
  lines.push('## Test Files');
  lines.push('');

  ['unit', 'dom', 'e2e', 'other'].forEach((type) => {
    const files = byType.get(type) || [];
    if (files.length === 0) {
      return;
    }

    lines.push(`## ${TEST_TYPE_LABELS[type] || 'Other'} Tests`);
    lines.push('');
    files.forEach((file) => lines.push(renderFileSection(file)));
  });

  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`;
}

const testFiles = await collectTestFiles();
const sourceModules = await collectSourceModules();
const specFiles = await collectSpecFiles();
const markdown = renderOverview(testFiles, sourceModules, specFiles);

await fs.writeFile(outputPath, markdown, 'utf8');
console.log(`Wrote ${toPosix(path.relative(rootDir, outputPath))}`);
