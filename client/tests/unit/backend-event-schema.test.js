import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { expect, test } from 'vitest';

const migrationsDir = resolve(import.meta.dirname, '../../../backend/pb_migrations');

test('latest backend migrations defensively keep events.board as text', () => {
  const migrationNames = readdirSync(migrationsDir)
    .filter((name) => /^\d+_.*\.js$/.test(name))
    .sort();

  const defensiveBoardMigration = migrationNames
    .filter((name) => Number(name.slice(0, 10)) > 1746100010)
    .map((name) => readFileSync(join(migrationsDir, name), 'utf8'))
    .find((source) => source.includes('events.fields.removeByName("board")'));

  expect(defensiveBoardMigration).toBeDefined();
  expect(defensiveBoardMigration).toContain('new TextField');
  expect(defensiveBoardMigration).toContain('name: "board"');
  expect(defensiveBoardMigration).not.toContain('new RelationField');
});
