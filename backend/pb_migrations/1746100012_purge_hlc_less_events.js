// Purge pre-event-sourcing rows from the events collection.
//
// Before 1746100010 the events table was the activity log: rows carried no hlc
// and no scope, and used the old type vocabulary (task.column_moved,
// task.label_added, …). Under event sourcing they are unreachable — catchUp()
// drops events without an hlc, the read-model projector drops events without a
// board_id, and the reducer has no handler for those types (so every one of them
// logs "Unknown event type" on each device that pulls).
//
// The hlc emptiness test is the signature: every event the current pipeline
// pushes carries one, so this can only ever match legacy rows.
migrate((app) => {
    app.db()
        .newQuery("DELETE FROM events WHERE hlc IS NULL OR hlc = '' OR hlc = 'null'")
        .execute();
}, () => {
    // Intentionally no-op: the purged rows were unprojectable, nothing to restore.
});
