// Event-sourced sync schema (PRD docs/temp/prd/PRD-event-sourced-sync.md §7, §5.4).
//
// events: gains hlc (json), scope (board|global), entity_id (string);
//   board relation becomes optional (global-scoped events carry no board);
//   details -> payload; the task relation is dropped (entity_id generalises it);
//   updates are forbidden (events are immutable).
// snapshots: new collection holding gzipped projected state as a file.
// Legacy collections (tasks/columns/labels/task_relationships) become read-only:
//   list/view stay owner-scoped, writes are locked ahead of their later removal.
migrate((app) => {
    // ── events: extend + lock updates ───────────────────────────────────────
    const events = app.findCollectionByNameOrId("events");

    events.fields.add(new JSONField({
        id: "evt_hlc",
        name: "hlc",
        required: false,
    }));
    events.fields.add(new TextField({
        id: "evt_scope",
        name: "scope",
        required: false,
    }));
    events.fields.add(new TextField({
        id: "evt_entity_id",
        name: "entity_id",
        required: false,
    }));

    const boardField = events.fields.getByName("board");
    if (boardField) boardField.required = false;

    const detailsField = events.fields.getByName("details");
    if (detailsField) detailsField.name = "payload";

    const taskField = events.fields.getByName("task");
    if (taskField) events.fields.remove(taskField);

    events.updateRule = null; // immutable
    app.save(events);

    // ── snapshots: new collection ───────────────────────────────────────────
    const snapshots = new Collection({
        id: "kanvana_snapshots",
        name: "snapshots",
        type: "base",
        listRule: "owner = @request.auth.id",
        viewRule: "owner = @request.auth.id",
        createRule: "owner = @request.auth.id",
        updateRule: null, // immutable; new snapshots are inserts
        deleteRule: "owner = @request.auth.id", // GC + arbitration sweep
        fields: [
            {
                id: "snp_owner",
                name: "owner",
                type: "relation",
                required: true,
                collectionId: "_pb_users_auth_",
                cascadeDelete: false,
                minSelect: 0,
                maxSelect: 1,
            },
            {
                id: "snp_board_id",
                name: "board_id",
                type: "text",
                required: false, // null for global-scope snapshots
            },
            {
                id: "snp_hlc",
                name: "hlc",
                type: "json",
                required: false,
            },
            {
                id: "snp_payload",
                name: "payload",
                type: "file",
                required: false,
                maxSelect: 1,
                maxSize: 52428800, // 50 MB gzipped projection
            },
            {
                id: "snp_local_id",
                name: "local_id",
                type: "text",
                required: false,
            },
        ],
    });
    app.save(snapshots);

    // ── legacy collections: lock writes, keep reads ─────────────────────────
    for (const name of ["tasks", "columns", "labels", "task_relationships"]) {
        const legacy = app.findCollectionByNameOrId(name);
        legacy.createRule = null;
        legacy.updateRule = null;
        legacy.deleteRule = null;
        app.save(legacy);
    }
}, (app) => {
    // ── revert legacy collection rules ──────────────────────────────────────
    for (const name of ["tasks", "columns", "labels", "task_relationships"]) {
        const legacy = app.findCollectionByNameOrId(name);
        legacy.createRule = "owner = @request.auth.id";
        legacy.updateRule = "owner = @request.auth.id";
        legacy.deleteRule = "owner = @request.auth.id";
        app.save(legacy);
    }

    // ── drop snapshots ──────────────────────────────────────────────────────
    const snapshots = app.findCollectionByNameOrId("snapshots");
    app.delete(snapshots);

    // ── revert events ───────────────────────────────────────────────────────
    const events = app.findCollectionByNameOrId("events");

    for (const fname of ["hlc", "scope", "entity_id"]) {
        const f = events.fields.getByName(fname);
        if (f) events.fields.remove(f);
    }

    const payloadField = events.fields.getByName("payload");
    if (payloadField) payloadField.name = "details";

    const boardField = events.fields.getByName("board");
    if (boardField) boardField.required = true;

    events.fields.add(new RelationField({
        id: "evt_task",
        name: "task",
        required: false,
        collectionId: "kanvana_tasks",
        cascadeDelete: false,
        minSelect: 0,
        maxSelect: 1,
    }));

    events.updateRule = "owner = @request.auth.id";
    app.save(events);
});
