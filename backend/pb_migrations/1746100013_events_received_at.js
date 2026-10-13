// The server's receipt time decides whether a late event is dropped, the same way on every device (#179).
migrate((app) => {
    const events = app.findCollectionByNameOrId("events");
    events.fields.add(new AutodateField({
        id: "evt_created",
        name: "created",
        onCreate: true,
        onUpdate: false,
    }));
    app.save(events);
}, (app) => {
    const events = app.findCollectionByNameOrId("events");
    events.fields.removeByName("created");
    app.save(events);
});
