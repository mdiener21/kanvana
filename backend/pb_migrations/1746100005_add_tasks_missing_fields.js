// Adds fields present in the JS task model that were absent from the initial
// tasks schema: sub_tasks (json), swimlane_label_id (text), deleted (bool).
// relationships and activityLog are handled by separate collections.
migrate((app) => {
    const collection = app.findCollectionByNameOrId("tasks");

    collection.fields.add(new JSONField({
        id: "tsk_sub_tasks",
        name: "sub_tasks",
        required: false,
    }));

    collection.fields.add(new TextField({
        id: "tsk_swimlane_label_id",
        name: "swimlane_label_id",
        required: false,
    }));

    collection.fields.add(new BoolField({
        id: "tsk_deleted",
        name: "deleted",
        required: false,
    }));

    return app.save(collection);
}, (app) => {
    const collection = app.findCollectionByNameOrId("tasks");

    const subTasksField = collection.fields.getByName("sub_tasks");
    if (subTasksField) collection.fields.remove(subTasksField);

    const swimlaneField = collection.fields.getByName("swimlane_label_id");
    if (swimlaneField) collection.fields.remove(swimlaneField);

    const deletedField = collection.fields.getByName("deleted");
    if (deletedField) collection.fields.remove(deletedField);

    return app.save(collection);
});
