migrate((app) => {
    const collection = new Collection({
        id: "kanvana_labels",
        name: "labels",
        type: "base",
        listRule: "owner = @request.auth.id",
        viewRule: "owner = @request.auth.id",
        createRule: "owner = @request.auth.id",
        updateRule: "owner = @request.auth.id",
        deleteRule: "owner = @request.auth.id",
        fields: [
            {
                id: "lbl_owner",
                name: "owner",
                type: "relation",
                required: true,
                collectionId: "_pb_users_auth_",
                cascadeDelete: false,
                minSelect: 0,
                maxSelect: 1,
            },
            {
                id: "lbl_board",
                name: "board",
                type: "relation",
                required: true,
                collectionId: "kanvana_boards",
                cascadeDelete: true,
                minSelect: 0,
                maxSelect: 1,
            },
            {
                id: "lbl_local_id",
                name: "local_id",
                type: "text",
                required: false,
            },
            {
                id: "lbl_name",
                name: "name",
                type: "text",
                required: true,
            },
            {
                id: "lbl_color",
                name: "color",
                type: "text",
                required: false,
            },
            {
                id: "lbl_group",
                name: "group",
                type: "text",
                required: false,
            },
        ],
    });

    return app.save(collection);
}, (app) => {
    const collection = app.findCollectionByNameOrId("labels");
    return app.delete(collection);
});
