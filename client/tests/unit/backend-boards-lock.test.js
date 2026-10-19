import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { expect, test } from 'vitest';

// #216: the legacy `boards` collection is locked read-only like tasks/columns/
// labels/task_relationships were in 1746100010. The migration runs inside
// PocketBase's JSVM; here it runs against a minimal fake app exposing the same
// calls (findCollectionByNameOrId / save).

const migrationsDir = resolve(import.meta.dirname, '../../../backend/pb_migrations');
const OWNER_RULE = 'owner = @request.auth.id';

function loadBoardsLockMigration() {
  const name = readdirSync(migrationsDir)
    .filter((file) => /^\d+_.*\.js$/.test(file))
    .sort()
    .find((file) => /lock_boards/.test(file));
  if (!name) return null;
  let up;
  let down;
  const source = readFileSync(join(migrationsDir, name), 'utf8');
  new Function('migrate', source)((u, d) => { up = u; down = d; });
  return { up, down };
}

function fakeAppWithOwnerBoards() {
  const boards = {
    name: 'boards',
    listRule: OWNER_RULE,
    viewRule: OWNER_RULE,
    createRule: OWNER_RULE,
    updateRule: OWNER_RULE,
    deleteRule: OWNER_RULE,
  };
  const saved = [];
  return {
    boards,
    saved,
    findCollectionByNameOrId: (id) => {
      if (id !== 'boards') throw new Error(`unexpected collection ${id}`);
      return boards;
    },
    save: (collection) => saved.push({ ...collection }),
  };
}

test('boards lock migration exists', () => {
  expect(loadBoardsLockMigration()).not.toBeNull();
});

test('after the migration, boards create/update/delete are admin-only (AC-001)', () => {
  const app = fakeAppWithOwnerBoards();
  loadBoardsLockMigration().up(app);

  expect(app.saved.at(-1)).toMatchObject({ createRule: null, updateRule: null, deleteRule: null });
});

test('after the migration, boards list/view stay owner-only (AC-002)', () => {
  const app = fakeAppWithOwnerBoards();
  loadBoardsLockMigration().up(app);

  expect(app.saved.at(-1)).toMatchObject({ listRule: OWNER_RULE, viewRule: OWNER_RULE });
});

test('rolling the migration back restores the owner rules (AC-003)', () => {
  const app = fakeAppWithOwnerBoards();
  const { up, down } = loadBoardsLockMigration();
  up(app);
  down(app);

  expect(app.saved.at(-1)).toMatchObject({
    listRule: OWNER_RULE,
    viewRule: OWNER_RULE,
    createRule: OWNER_RULE,
    updateRule: OWNER_RULE,
    deleteRule: OWNER_RULE,
  });
});
