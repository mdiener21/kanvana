// Refuses to delete an event younger than the sync grace window (#179). Clients
// clean up server events after uploading a snapshot; this version keeps every
// event a device may still need to order a late event in, and the hook holds
// older clients, which delete without the window, to the same rule.
// Only API delete requests are guarded, so cascades and admin cleanup still work.
onRecordDeleteRequest((e) => {
  // JSVM callbacks run isolated, so the value lives here. Keep it equal to
  // GRACE_WINDOW_MS in client/src/modules/event-sourcing/snapshot.js.
  const GRACE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

  let wallTime = NaN;
  try {
    wallTime = JSON.parse(e.record.getString("hlc")).wallTime;
  } catch (_) {
    wallTime = NaN;
  }

  if (typeof wallTime === "number" && isFinite(wallTime) && Date.now() - wallTime < GRACE_WINDOW_MS) {
    throw new BadRequestError("This event is inside the sync grace window and cannot be deleted yet.");
  }

  e.next();
}, "events");
