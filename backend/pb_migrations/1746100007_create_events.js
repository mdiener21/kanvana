// Unified event log for task-level activityLog and board-level boardEvents.
// task is optional: present for task-scoped events, absent for board events.
// local_id is the entry's UUID (set by createActivityLogEntry / createActivityEvent).
// Entries without a local_id (created before the id field was introduced) are
// not synced and remain local-only.
migrate((app) => {
    const collection = new Collection({
        id: "kanvana_events",
        name: "events",
        type: "base",
        listRule: "owner = @request.auth.id",
        viewRule: "owner = @request.auth.id",
        createRule: "owner = @request.auth.id",
        updateRule: "owner = @request.auth.id",
        deleteRule: "owner = @request.auth.id",
        fields: [
            {
                id: "evt_owner",
                name: "owner",
                type: "relation",
                required: true,
                collectionId: "_pb_users_auth_",
                cascadeDelete: false,
                minSelect: 0,
                maxSelect: 1,
            },
            {
                id: "evt_board",
                name: "board",
                type: "relation",
                required: true,
                collectionId: "kanvana_boards",
                cascadeDelete: true,
                minSelect: 0,
                maxSelect: 1,
            },
            {
                id: "evt_task",
                name: "task",
                type: "relation",
                required: false,
                collectionId: "kanvana_tasks",
                // No cascade: event history is preserved even when the task is deleted.
                cascadeDelete: false,
                minSelect: 0,
                maxSelect: 1,
            },
            {
                id: "evt_event_type",
                name: "event_type",
                type: "text",
                required: true,
            },
            {
                id: "evt_at",
                name: "at",
                type: "text",
                required: true,
            },
            {
                id: "evt_actor_type",
                name: "actor_type",
                type: "text",
                required: true,
            },
            {
                id: "evt_actor_id",
                name: "actor_id",
                type: "text",
                required: false,
            },
            {
                id: "evt_details",
                name: "details",
                type: "json",
                required: false,
            },
            {
                id: "evt_local_id",
                name: "local_id",
                type: "text",
                required: false,
            },
        ],
    });

    return app.save(collection);
}, (app) => {
    const collection = app.findCollectionByNameOrId("events");
    return app.delete(collection);
});
