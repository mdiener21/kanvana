// Ensure tasks.labels relation field is truly unlimited (maxSelect: null may be
// misinterpreted in some PocketBase versions; explicit large value is unambiguous).
migrate((app) => {
    const collection = app.findCollectionByNameOrId("tasks");

    const labelsField = collection.fields.getByName("labels");
    if (!labelsField) {
        throw new Error("tasks.labels field not found");
    }

    labelsField.maxSelect = 999;
    return app.save(collection);
}, (app) => {
    const collection = app.findCollectionByNameOrId("tasks");

    const labelsField = collection.fields.getByName("labels");
    if (!labelsField) return;

    labelsField.maxSelect = null;
    return app.save(collection);
});
