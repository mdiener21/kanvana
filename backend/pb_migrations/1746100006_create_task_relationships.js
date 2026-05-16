// task_relationships stores directed relationship edges between tasks.
// Both directions are stored as separate records (matching the JS model where
// each task stores its own relationships array). local_id is the composite
// key "${taskLocalId}::${targetTaskLocalId}" used for sync deduplication.
migrate((app) => {
    const collection = new Collection({
        id: "kanvana_task_relationships",
        name: "task_relationships",
        type: "base",
        listRule: "owner = @request.auth.id",
        viewRule: "owner = @request.auth.id",
        createRule: "owner = @request.auth.id",
        updateRule: "owner = @request.auth.id",
        deleteRule: "owner = @request.auth.id",
        fields: [
            {
                id: "tr_owner",
                name: "owner",
                type: "relation",
                required: true,
                collectionId: "_pb_users_auth_",
                cascadeDelete: false,
                minSelect: 0,
                maxSelect: 1,
            },
            {
                id: "tr_board",
                name: "board",
                type: "relation",
                required: true,
                collectionId: "kanvana_boards",
                cascadeDelete: true,
                minSelect: 0,
                maxSelect: 1,
            },
            {
                id: "tr_task",
                name: "task",
                type: "relation",
                required: true,
                collectionId: "kanvana_tasks",
                // Deleting a task removes its relationship records.
                cascadeDelete: true,
                minSelect: 0,
                maxSelect: 1,
            },
            {
                id: "tr_target_task",
                name: "target_task",
                type: "relation",
                required: true,
                collectionId: "kanvana_tasks",
                // No cascade: relationship records survive target deletion and
                // are cleaned up during the next sync push.
                cascadeDelete: false,
                minSelect: 0,
                maxSelect: 1,
            },
            {
                id: "tr_relationship_type",
                name: "relationship_type",
                type: "text",
                required: true,
            },
            {
                id: "tr_local_id",
                name: "local_id",
                type: "text",
                required: false,
            },
        ],
    });

    return app.save(collection);
}, (app) => {
    const collection = app.findCollectionByNameOrId("task_relationships");
    return app.delete(collection);
});
