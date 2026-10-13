// Holds clients from before #179, which clean up without the grace window, to it; cascades and admin deletes are not guarded.
onRecordDeleteRequest((e) => {
  // JSVM callbacks run isolated; keep equal to GRACE_WINDOW_MS in client/src/modules/event-sourcing/snapshot.js.
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
