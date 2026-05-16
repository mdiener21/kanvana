// Adds the deleted (bool) soft-delete flag to the labels collection.
migrate((app) => {
    const collection = app.findCollectionByNameOrId("labels");

    collection.fields.add(new BoolField({
        id: "lbl_deleted",
        name: "deleted",
        required: false,
    }));

    return app.save(collection);
}, (app) => {
    const collection = app.findCollectionByNameOrId("labels");

    const deletedField = collection.fields.getByName("deleted");
    if (deletedField) collection.fields.remove(deletedField);

    return app.save(collection);
});
