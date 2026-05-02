migrate((app) => {
    const collection = new Collection({
        id: "kanvana_columns",
        name: "columns",
        type: "base",
        listRule: "owner = @request.auth.id",
        viewRule: "owner = @request.auth.id",
        createRule: "owner = @request.auth.id",
        updateRule: "owner = @request.auth.id",
        deleteRule: "owner = @request.auth.id",
        fields: [
            {
                id: "col_owner",
                name: "owner",
                type: "relation",
                required: true,
                collectionId: "_pb_users_auth_",
                cascadeDelete: false,
                minSelect: 0,
                maxSelect: 1,
            },
            {
                id: "col_board",
                name: "board",
                type: "relation",
                required: true,
                collectionId: "kanvana_boards",
                cascadeDelete: true,
                minSelect: 0,
                maxSelect: 1,
            },
            {
                id: "col_local_id",
                name: "local_id",
                type: "text",
                required: false,
            },
            {
                id: "col_name",
                name: "name",
                type: "text",
                required: true,
            },
            {
                id: "col_color",
                name: "color",
                type: "text",
                required: false,
            },
            {
                id: "col_order",
                name: "order",
                type: "number",
                required: false,
            },
            {
                id: "col_collapsed",
                name: "collapsed",
                type: "bool",
                required: false,
            },
        ],
    });

    return app.save(collection);
}, (app) => {
    const collection = app.findCollectionByNameOrId("columns");
    return app.delete(collection);
});
