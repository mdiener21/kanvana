migrate((app) => {
    const collection = new Collection({
        id: "kanvana_tasks",
        name: "tasks",
        type: "base",
        listRule: "owner = @request.auth.id",
        viewRule: "owner = @request.auth.id",
        createRule: "owner = @request.auth.id",
        updateRule: "owner = @request.auth.id",
        deleteRule: "owner = @request.auth.id",
        fields: [
            {
                id: "tsk_owner",
                name: "owner",
                type: "relation",
                required: true,
                collectionId: "_pb_users_auth_",
                cascadeDelete: false,
                minSelect: 0,
                maxSelect: 1,
            },
            {
                id: "tsk_board",
                name: "board",
                type: "relation",
                required: true,
                collectionId: "kanvana_boards",
                cascadeDelete: true,
                minSelect: 0,
                maxSelect: 1,
            },
            {
                id: "tsk_local_id",
                name: "local_id",
                type: "text",
                required: false,
            },
            {
                id: "tsk_title",
                name: "title",
                type: "text",
                required: true,
            },
            {
                id: "tsk_description",
                name: "description",
                type: "text",
                required: false,
            },
            {
                id: "tsk_priority",
                name: "priority",
                type: "text",
                required: false,
            },
            {
                id: "tsk_due_date",
                name: "due_date",
                type: "text",
                required: false,
            },
            {
                id: "tsk_column",
                name: "column",
                type: "relation",
                required: false,
                collectionId: "kanvana_columns",
                cascadeDelete: false,
                minSelect: 0,
                maxSelect: 1,
            },
            {
                id: "tsk_order",
                name: "order",
                type: "number",
                required: false,
            },
            {
                id: "tsk_labels",
                name: "labels",
                type: "relation",
                required: false,
                collectionId: "kanvana_labels",
                cascadeDelete: false,
                minSelect: 0,
                maxSelect: null,
            },
            {
                id: "tsk_creation_date",
                name: "creation_date",
                type: "text",
                required: false,
            },
            {
                id: "tsk_change_date",
                name: "change_date",
                type: "text",
                required: false,
            },
            {
                id: "tsk_done_date",
                name: "done_date",
                type: "text",
                required: false,
            },
            {
                id: "tsk_column_history",
                name: "column_history",
                type: "json",
                required: false,
            },
        ],
    });

    return app.save(collection);
}, (app) => {
    const collection = app.findCollectionByNameOrId("tasks");
    return app.delete(collection);
});
