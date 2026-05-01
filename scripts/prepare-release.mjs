import fs from 'node:fs';
import path from 'node:path';

function parseArgs(argv) {
  const args = { bump: 'patch', notesFile: '.release-notes.md', packageDir: null };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === '--bump') {
      args.bump = argv[index + 1] ?? args.bump;
      index += 1;
      continue;
    }

    if (token === '--notes-file') {
      args.notesFile = argv[index + 1] ?? args.notesFile;
      index += 1;
      continue;
    }

    if (token === '--date') {
      args.date = argv[index + 1];
      index += 1;
      continue;
    }

    if (token === '--package-dir') {
      args.packageDir = argv[index + 1];
      index += 1;
      continue;
    }
  }

  return args;
}

function assertSupportedBumpType(bump) {
  if (!['patch', 'minor', 'major'].includes(bump)) {
    throw new Error(`Unsupported bump type "${bump}". Use patch|minor|major.`);
  }
}

function bumpVersion(version, bump) {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) {
    throw new Error(`Invalid semantic version "${version}" in package.json.`);
  }

  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);

  if (bump === 'major') return `${major + 1}.0.0`;
  if (bump === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

// Keep a Changelog standard section order
const SECTION_NAMES = ['Added', 'Changed', 'Deprecated', 'Removed', 'Fixed', 'Security'];

/**
 * Extract populated sections from the text between ## [Unreleased] and the
 * next ## [ release header. Handles plain "### SectionName" headings (no suffix).
 */
function extractSections(unreleasedBlock) {
  // Collect all heading positions so we can slice between them accurately
  const headingPositions = [];

  for (const name of SECTION_NAMES) {
    const heading = `### ${name}`;
    let searchFrom = 0;

    while (true) {
      const index = unreleasedBlock.indexOf(heading, searchFrom);
      if (index === -1) break;

      // Only match at the start of a line
      if (index === 0 || unreleasedBlock[index - 1] === '\n') {
        headingPositions.push({ name, index, headingLength: heading.length });
      }

      searchFrom = index + heading.length;
    }
  }

  headingPositions.sort((a, b) => a.index - b.index);

  const sections = {};

  for (let i = 0; i < headingPositions.length; i++) {
    const { name, index, headingLength } = headingPositions[i];
    const contentStart = index + headingLength;
    const contentEnd =
      i + 1 < headingPositions.length
        ? headingPositions[i + 1].index
        : unreleasedBlock.length;

    const rawBody = unreleasedBlock
      .slice(contentStart, contentEnd)
      .replace(/^\n+/, '')
      .replace(/\s+$/, '');

    // Only include sections that have at least one bullet point
    if (/^\s*-\s+/m.test(rawBody)) {
      sections[name] = rawBody;
    }
  }

  return sections;
}

function buildReleaseBlock(version, dateIso, sections) {
  const parts = [`## [${version}] - ${dateIso}`];

  for (const name of SECTION_NAMES) {
    if (sections[name]) {
      parts.push('', `### ${name}`, '', sections[name]);
    }
  }

  return parts.join('\n');
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function updateChangelog(changelogPath, version, dateIso, notesFilePath) {
  const changelogRaw = fs.readFileSync(changelogPath, 'utf8').replace(/\r\n/g, '\n');

  const unreleasedHeader = '## [Unreleased]';
  const unreleasedStart = changelogRaw.indexOf(unreleasedHeader);

  if (unreleasedStart === -1) {
    throw new Error('CHANGELOG.md is missing the "## [Unreleased]" section.');
  }

  // Find where the next versioned release section starts
  const nextReleaseIndex = changelogRaw.indexOf('\n## [', unreleasedStart + unreleasedHeader.length);
  const unreleasedEnd = nextReleaseIndex === -1 ? changelogRaw.length : nextReleaseIndex + 1;

  const before = changelogRaw.slice(0, unreleasedStart);
  const unreleasedBody = changelogRaw.slice(
    unreleasedStart + unreleasedHeader.length,
    unreleasedEnd
  );
  const after = changelogRaw.slice(unreleasedEnd);

  const sections = extractSections(unreleasedBody);

  if (Object.keys(sections).length === 0) {
    throw new Error('## [Unreleased] has no bullet entries to release. Add changelog entries first.');
  }

  const newReleaseBlock = buildReleaseBlock(version, dateIso, sections);
  const freshUnreleased = '## [Unreleased]\n';

  const updatedChangelog =
    `${before}${freshUnreleased}\n${newReleaseBlock}\n\n${after.replace(/^\n+/, '')}`;

  fs.writeFileSync(changelogPath, updatedChangelog, 'utf8');
  fs.writeFileSync(notesFilePath, `${newReleaseBlock}\n`, 'utf8');
}

function updatePackageVersion(packageJsonPath, nextVersion) {
  const packageRaw = fs.readFileSync(packageJsonPath, 'utf8');
  const packageJson = JSON.parse(packageRaw);
  packageJson.version = nextVersion;
  fs.writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8');
}

function updateReadmeBadge(readmePath, nextVersion) {
  if (!fs.existsSync(readmePath)) return;

  const raw = fs.readFileSync(readmePath, 'utf8');
  const updated = raw.replace(
    /(\[!\[Version\]\(https:\/\/img\.shields\.io\/badge\/version-)[^-]+(brightgreen\)\]\(CHANGELOG\.md\))/,
    `$1${nextVersion}-$2`
  );

  if (updated !== raw) {
    fs.writeFileSync(readmePath, updated, 'utf8');
  }
}

function main() {
  const { bump, notesFile, date, packageDir } = parseArgs(process.argv.slice(2));
  assertSupportedBumpType(bump);

  const cwd = process.cwd();
  const pkgRoot = packageDir ? path.resolve(cwd, packageDir) : cwd;
  const packageJsonPath = path.join(pkgRoot, 'package.json');
  const changelogPath = path.join(cwd, 'CHANGELOG.md');
  const readmePath = path.join(cwd, 'README.md');
  const notesFilePath = path.join(cwd, notesFile);

  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const currentVersion = packageJson.version;
  const nextVersion = bumpVersion(currentVersion, bump);

  updatePackageVersion(packageJsonPath, nextVersion);
  updateChangelog(changelogPath, nextVersion, date || todayIsoDate(), notesFilePath);
  updateReadmeBadge(readmePath, nextVersion);

  process.stdout.write(`${nextVersion}`);
}

main();
