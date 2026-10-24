// Lock the legacy boards collection read-only (#216), as 1746100010 did for
// tasks/columns/labels/task_relationships. Writes are admin-only, so an owner
// can no longer be reassigned on update; list/view stay owner-scoped until
// the collection is dropped (#116).
migrate((app) => {
    const boards = app.findCollectionByNameOrId("boards");
    boards.createRule = null;
    boards.updateRule = null;
    boards.deleteRule = null;
    app.save(boards);
}, (app) => {
    const boards = app.findCollectionByNameOrId("boards");
    boards.createRule = "owner = @request.auth.id";
    boards.updateRule = "owner = @request.auth.id";
    boards.deleteRule = "owner = @request.auth.id";
    app.save(boards);
});
