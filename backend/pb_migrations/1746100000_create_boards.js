migrate((app) => {
    const collection = new Collection({
        id: "kanvana_boards",
        name: "boards",
        type: "base",
        listRule: "owner = @request.auth.id",
        viewRule: "owner = @request.auth.id",
        createRule: "owner = @request.auth.id",
        updateRule: "owner = @request.auth.id",
        deleteRule: "owner = @request.auth.id",
        fields: [
            {
                id: "brd_owner",
                name: "owner",
                type: "relation",
                required: true,
                collectionId: "_pb_users_auth_",
                cascadeDelete: false,
                minSelect: 0,
                maxSelect: 1,
            },
            {
                id: "brd_local_id",
                name: "local_id",
                type: "text",
                required: false,
            },
            {
                id: "brd_name",
                name: "name",
                type: "text",
                required: true,
            },
            {
                id: "brd_settings",
                name: "settings",
                type: "json",
                required: false,
            },
            {
                id: "brd_created_at",
                name: "created_at",
                type: "text",
                required: false,
            },
        ],
    });

    return app.save(collection);
}, (app) => {
    const collection = app.findCollectionByNameOrId("boards");
    return app.delete(collection);
});
