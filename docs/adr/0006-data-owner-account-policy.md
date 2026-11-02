# Local data belongs to one account, the Data Owner

**Status: accepted** (issue #220, implemented by #221)

Refines [ADR-0004](0004-event-sourced-sync.md), which left local IndexedDB unscoped.

Local IndexedDB and the outbound queue are not tied to a user, and the queue stamps the owner when it
drains. If user A signs out with unsynced events and user B signs in on the same browser, B uploads A's
events under B's account and sees A's boards.

Kanvana is local-first, so data created offline has no account until someone signs in. We keep one local
database and record the account it belongs to: the **Data Owner**. The sync session checks the Data Owner
on every sign-in, before the queue may drain or a catch-up may run.

## Policy

| Case | Behaviour |
|---|---|
| **1. First sign-in, local data has no Data Owner** | The account becomes the Data Owner and the offline data uploads silently. |
| **2. Data Owner signs back in** | Nothing changes. Local data and queue stay as they are, and the queue drains. |
| **3. A different account signs in, no unsynced events** | Local data is wiped without a prompt, because all of it is on the server. The new account becomes the Data Owner and catches up. |
| **3. A different account signs in, unsynced events exist** | A prompt offers two choices. **Discard N unsynced changes and continue** wipes local data and proceeds as above. **Cancel** signs the new account out and leaves the local data and queue untouched. Nothing syncs until the user chooses. |
| **4. Sign-out** | Local data stays visible and usable offline. Edits made while signed out still belong to the Data Owner and push at their next sign-in. The Data Owner is not cleared. |
| **4. Token on logout** | The token is cleared locally only. It is not revoked on the server. |

The queue pushes only when the signed-in account is the Data Owner, and stamps events with the Data
Owner rather than the drain-time user.

## Considered options

**Different account: wipe, with a prompt when events are unsynced (chosen).** The smallest change. It
keeps one database and one code path. Unsynced data is lost only with explicit consent.

**Different account: per-account databases.** Nothing is ever lost and no prompt is needed. Rejected as
the largest change: the IndexedDB singleton and the in-memory caches must be swapped at runtime or the
page reloaded, offline-only data needs a home of its own, and leftover databases need cleanup.

**Different account: block sign-in until the queue is pushed or discarded.** Rejected. Synced data still
has to be wiped to stop B seeing A's boards, so this is the chosen option with more friction.

**First sign-in: ask before uploading.** Rejected. It adds a dialog to the main onboarding path to guard
against signing in to the wrong account first.

**Sign-out: clear local data.** Rejected. It makes sign-out destructive and forces a full pull at the next
sign-in, and it works against local-first.

**Logout: revoke the token.** PocketBase tokens are stateless, so the only revocation is rotating the
user's `tokenKey`, which signs out all of that user's devices. Rejected, since signing out on a laptop
must not sign out a phone.

## Consequences

- On a shared browser, anyone with access can read A's boards after A signs out. This is accepted as the
  cost of keeping local data usable offline.
- A token copied before logout stays valid until it expires. This is accepted for the reason above.
- After a switch, A's data is not available offline on that browser until A signs back in and catches up.
- After a switch the new owner gets a default board with no demo tasks, and its events are published only if
  the first finished pull shows the account has never had that board. Seeding it normally would put events
  newer than the account's own history on the stable default board ids, which loses that account's real board.
- A wipe bumps a data generation that every tab checks inside each write transaction, so a tab that has not
  heard of the wipe yet can not write into the new owner's data. It reloads instead, and an edit made in that
  moment is lost without a prompt.
- Installs that predate this ADR have local data and no Data Owner, so case 1 applies: the next account
  to sign in claims the data. An account already signed in at upgrade claims it at launch. If a different
  person signs in first on an upgraded browser, that person claims the previous user's data. This window
  closes after the first sign-in on each browser and is accepted.
