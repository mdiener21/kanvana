// Adds fields present in the JS column model that were absent from the initial
// columns schema: role (text, marks the Done column), deleted (bool).
migrate((app) => {
    const collection = app.findCollectionByNameOrId("columns");

    collection.fields.add(new TextField({
        id: "col_role",
        name: "role",
        required: false,
    }));

    collection.fields.add(new BoolField({
        id: "col_deleted",
        name: "deleted",
        required: false,
    }));

    return app.save(collection);
}, (app) => {
    const collection = app.findCollectionByNameOrId("columns");

    const roleField = collection.fields.getByName("role");
    if (roleField) collection.fields.remove(roleField);

    const deletedField = collection.fields.getByName("deleted");
    if (deletedField) collection.fields.remove(deletedField);

    return app.save(collection);
});
