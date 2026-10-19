// Reject duplicate events on the server (#217).
//
// Two tabs, or a retry after a lost response, can push the same event twice.
// Clients dedupe on ingest, but the duplicate rows waste space and slow every
// catch-up. This migration first deletes existing duplicates per
// (owner, local_id), keeping the earliest-received row (lowest `created`, then
// lowest rowid as a tie-break for rows that predate the `created` field), and
// then adds a unique index so PocketBase rejects any later duplicate create.
//
// The index is partial (local_id != ''): local_id is an optional field, and
// rows without one are not identifiable as duplicates of each other.
const INDEX_NAME = "idx_events_owner_local_id";

migrate((app) => {
    app.db()
        .newQuery(`
            DELETE FROM events
            WHERE local_id != ''
              AND rowid NOT IN (
                SELECT rowid FROM (
                  SELECT rowid,
                         ROW_NUMBER() OVER (
                           PARTITION BY owner, local_id
                           ORDER BY created ASC, rowid ASC
                         ) AS rn
                  FROM events
                  WHERE local_id != ''
                )
                WHERE rn = 1
              )
        `)
        .execute();

    const events = app.findCollectionByNameOrId("events");
    events.indexes = (events.indexes || []).filter((idx) => !idx.includes(INDEX_NAME));
    events.indexes.push(
        `CREATE UNIQUE INDEX \`${INDEX_NAME}\` ON \`events\` (\`owner\`, \`local_id\`) WHERE \`local_id\` != ''`
    );
    app.save(events);
}, (app) => {
    const events = app.findCollectionByNameOrId("events");
    events.indexes = (events.indexes || []).filter((idx) => !idx.includes(INDEX_NAME));
    app.save(events);
    // The deleted duplicates are not restored: they were redundant copies.
});
