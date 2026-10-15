// Defensive production repair for event-sourced sync.
//
// ADR-0004 requires events.board to be text containing the local board UUID.
// Some deployed databases can still have the original relation field from
// 1746100007, which rejects event pushes with validation_missing_rel_records.
migrate((app) => {
    const events = app.findCollectionByNameOrId("events");
    const boardField = events.fields.getByName("board");
    const boardFieldType = boardField
        ? (boardField.type || (typeof boardField.getType === "function" ? boardField.getType() : ""))
        : "";
    const looksLikeRelation = boardField && (boardFieldType === "relation" || !!boardField.collectionId);

    if (boardField && !looksLikeRelation) {
        return;
    }

    if (boardField) {
        events.fields.removeByName("board");
    }

    events.fields.add(new TextField({
        id: "evt_board_txt_repair",
        name: "board",
        required: false,
    }));

    app.save(events);
}, () => {
    // Intentionally no-op: ADR-0004 makes text the canonical field type.
});
