# Tracepad v2 — design notes

This is a living document. It records the architecture decisions from our discussions so far, in plain language, for someone learning how an offline-first notes app is put together. It will be updated as the discussion continues.

It is not a copy of the original product PDF. The PDF asks a lot of open questions. This file writes down the answers we have actually chosen.

A note in Tracepad is a thing that changes over time. The phone must be able to save that change with no network. Later, the server and the other devices have to catch up without throwing away either side of a disagreement.

---

## 1. Versioning strategies

A version is one saved state of a note. Three ways to store it:

### Snapshots

Every save stores a complete copy of the note's words: the whole title and the whole body, again.

Reading version 12 means opening version 12. Nothing else is required. Comparing two versions means putting those two copies side by side. Restoring one means pointing the note at that copy.

The cost is repeated storage. A long note that changes by one sentence still stores the whole note again. Storage grows in a straight line with the number of versions.

### Diffs

The first save stores the full note. Later saves store only what changed.

Storage is smaller, and a comparison falls out of the stored change. Reading an old version means starting at the beginning and applying every change up to that point. One damaged change in the middle makes every version after it unreadable. That is the corruption risk.

### Hybrid

Store a full snapshot, then a run of diffs, then another full snapshot, and repeat.

Storage stays smaller than pure snapshots, and you never walk a chain longer than the gap between two snapshots. The app has to know which records are snapshots, which are diffs, and how to stitch them. That is the most expensive of the three to build and to test.

### Speed and storage, two scales

At personal scale — on the order of a hundred notes, with about 20 to 50 versions each — all three are fine on speed. Opening a version is cheap either way. The difference you feel is in the code you have to write, not in the wait.

Snapshots grow linearly in storage: every version is another full copy. Diffs stay smaller, and they add read complexity and the corruption risk above. Hybrid costs the most to build, because you implement both mechanisms and the rules that switch between them.

At a larger scale — 100,000 users, 100 notes each, about 30 versions on average — snapshots mean about 300 million version records (100,000 × 100 × 30). That is the point where compression, tiered storage, or keeping diffs only for older versions starts to matter. It is not the problem the first version has to solve.

---

## 2. Versioning storage decision

Use snapshots for v1.

A personal notebook does not have a storage problem yet, and a snapshot is the version you can show, compare, and restore without reconstructing anything. Diffs and hybrid stay on the shelf until the number of records makes the linear copies expensive.

Revisit this at scale. The levers then are compression, tiered storage (keep recent versions hot, move old ones to cheaper storage), or diffs for older versions while recent ones stay as snapshots.

This decision is a v2 consideration. Update this section as the discussion continues.

---

## 3. Conflict resolution

Two devices can edit the same note while they cannot see each other. Each one saves a snapshot whose parent is the version they both started from. You now have two children of one parent. That is a branch. Git works the same way: a commit is a snapshot, and two commits from one parent are a branch.

Tracepad stores like Git and asks like Google Keep.

**Store like Git.** Both snapshots are kept forever. Sync accepts both children. The server does not pick a winner and it does not overwrite one body with the other.

**Ask like Keep.** Keep shows "Conflicting edits found" and lets the person choose. Tracepad shows the two snapshots side by side (incoming changes on a green background, outgoing changes on a red background, the comparison style already in the product notes). The person picks which snapshot is current.

Picking moves the note's current pointer. It does not delete the other snapshot. The one that was not chosen stays in the history and can be opened later.

Until the person picks, each device keeps showing the version it wrote, and a notification says the other device also wrote one.

Auto-merge is not part of v1. A merge invents a third text that neither device typed. Snapshots do not merge themselves. If a merge is added later, it should be a new snapshot with two parents, created only because the person asked for it.

Google Keep is the cautionary example. Keep has the right prompt and no version history, so "keep this one" can throw the other text away. People have lost writing by dismissing that dialog. Tracepad keeps the snapshot either way.

---

## 4. Identity

An id is the note's permanent name. The title can change. The id does not.

The device generates a UUID when the note is created, before any network call. A UUID is a random 128-bit value. Two phones creating notes at the same moment get different ids. A clock reading is a bad id, because two devices can share a millisecond. A local counter (1, 2, 3) is a bad id, because each device has its own count and both will invent "note 41."

Three ids, each a UUID born on the device:

| Id | What it names |
|---|---|
| Note id | The note, for its whole life |
| Version id | One snapshot |
| Parent version id | The snapshot this one was edited from. Empty on the first version |

Those three exist in the same local save as the words. The version row points at the note, and at its parent, while the phone is still offline. If the server were the one handing out ids, the phone could not write those links until it was back online.

A conflict is not "two devices created notes." Those are two note ids. A conflict is "two versions name the same parent." A version number like 2 cannot say that, because both devices will call their save version 2. The parent id can.

The same UUID is what goes into the local database, the sync payload, and any export. The server stores it. It does not replace it.

Google Keep is more complicated than this on purpose, and it shows the cost. A Keep note carries a client id (a timestamp plus a random tail), a separate server id filled in later, and on the phone a local row number as well. Labels in Keep already use a UUID. Takeout, Keep's export, often leaves the note id out and names the file from a timestamp, so a re-import cannot tell a note from a copy of itself. Tracepad keeps one id from birth through export.

---

## 5. Schema blueprint

Fixed shapes. Types are the kind of value each field holds. Times are UTC timestamps.

### Note

The note row is the current organizational state, plus a pointer to the snapshot that is current.

| Field | Type | Meaning |
|---|---|---|
| id | UUID | Born on the device |
| current_version_id | UUID | Which snapshot is current. This is the pointer a conflict choice moves |
| created_at | timestamp | Set once. Editing never changes it |
| updated_at | timestamp | Moves when the note or its current snapshot changes |
| color | text | One color, or empty for the default |
| is_pinned | boolean | Stays at the top of the board when true |
| is_archived | boolean | Hidden from the main board when true. Still on its labels and in search |
| trashed_at | timestamp or empty | Empty means not in the trash. A time means it is in the trash, since that time |
| device_id | UUID | Device that created the note |

### Version

One row per save of the words. A complete snapshot.

| Field | Type | Meaning |
|---|---|---|
| id | UUID | This snapshot |
| note_id | UUID | The note it belongs to |
| parent_version_id | UUID or empty | The snapshot it was edited from. Empty for the first one |
| title | text | Title as it was at this save |
| body | text | Body as it was at this save |
| created_at | timestamp | When this snapshot was written |
| device_id | UUID | Device that wrote it |

### Label

A label is its own object. Notes point at it. Renaming it updates the name everywhere. Deleting it removes the link. It does not delete the notes.

| Field | Type | Meaning |
|---|---|---|
| id | UUID | Born on the device |
| name | text | The name shown on the chip and in the sidebar |
| created_at | timestamp | When the label was created |

### Note label

The link that lets one note carry many labels.

| Field | Type | Meaning |
|---|---|---|
| note_id | UUID | The note |
| label_id | UUID | The label |

### Sync change

A local queue row for work the server has not acknowledged yet. The note itself is not the queue. Five offline edits are five changes, each pointing at the snapshot it produced.

| Field | Type | Meaning |
|---|---|---|
| id | UUID | This queued change |
| entity_type | text | `note`, `version`, or `label` |
| entity_id | UUID | Which row changed |
| op | text | `create`, `update`, or `trash` |
| created_at | timestamp | When the device queued it |
| status | text | `pending`, `sent`, or `failed` |

---

## 6. Soft delete and hard delete

Delete does not remove the row. It sets `trashed_at` to the current time. The note leaves the main board and appears in Trash. Restore clears `trashed_at`. The versions stay either way.

Hard delete removes the row. It happens in two cases: the person empties the trash, or the trash window runs out. Google Keep's window is seven days, then the note is gone. Tracepad uses a window of the same kind. The exact number of days can change; the shape should not.

The race: device A moves a note to the trash. Device B, offline, edits that same note and writes a new snapshot. If the server has already hard-deleted the note, B's snapshot has nowhere to land, and the edit disappears. So a trash is a flag plus a time, and the row stays until both of these are true:

1. The trash window has passed, or the person emptied the trash.
2. Other devices have synced far enough to learn about the trash (see the cursor below).

Until then the row is a tombstone. It says "this note is dead" without dropping the record out from under an offline edit. When B syncs, the server still has the note, accepts B's snapshot, and the conflict rules in section 3 apply: both the trashed state and the new snapshot survive, and the person is asked.

---

## 7. The sync cursor

A cursor is a bookmark. It means "I have already seen every change up to here."

The device stores one bookmark. On sync it tells the server that bookmark and sends its pending local changes. The server replies with everything after the bookmark, plus a new bookmark. The device saves the new one. Next time it only asks for what is newer.

The changes feed is a pull, not a stream of note bodies. The app asks. The server answers from the bookmark forward. If the bookmark is too old or no longer makes sense, the server says so and the device does a full reread. That is the recovery path, not the normal one.

Google Keep's Android-style sync works this way: the client sends the version it has (`targetVersion`) and reads back the next one (`toVersion`). Tracepad's cursor is that same idea, named as a bookmark so it is obvious it marks a place in a log, not a clock.

---

## 8. Three views of a note

The same note shows up in three different shapes in Google Keep. They are easy to confuse, and only one of them is the product.

**SQLite row, on the Android phone.** The app reads and writes a local database first. A note is a row (title, created time, updated time, user-edited time, pinned, deleted). The body is separate rows. Each body row can hold the local text and a synced copy of the text. When those two differ, the edit has not reached the server yet. The phone's own row number is not the id the rest of the world should use.

**Takeout JSON, the export.** One file per note. It includes the title, the text or the checklist, the color, the labels, and flags for pinned, archived, and trashed, plus created and edited timestamps. It often has no stable note id. The file name is a timestamp.

**Workspace API, the official enterprise interface.** A note there is a name the server assigns, a title, a body, created and updated times, a trash time, a trashed flag, attachments, and permissions. Color, pin, labels, and archive are absent. Its delete method removes the note immediately. That is not the Trash button in the Keep app.

Tracepad's own API exposes color, pin, labels, and archive. Those are real parts of the product. Leaving them off the API, the way Google's enterprise API does, would force every client to invent a side channel for the fields people actually organize with. The API should match the schema in section 5, including the current-version pointer, rather than matching the thin Workspace shape.

---

## 9. Metadata versus content

A snapshot is a copy of the words. Cutting one on every small organizational tweak would fill the history with versions that say the same thing.

These do not create a version. They update the note row:

- Color
- Pin
- Archive

A body edit does create a version. The new snapshot stores the title and the body as they were at that save, with a new version id and a parent pointing at the previous snapshot. The note's `current_version_id` moves to the new snapshot.

Trash is not a content version either. It sets `trashed_at`, as section 6 describes. The history of the words stays attached to the note.

Labels are organizational in the same spirit: they live on the link table, and renaming a label does not cut a snapshot of every note that wears it. If we later decide that adding or removing a label belongs in the history, this section is the one to change.

---

## 10. Search

Search answers a different question from the board. The board shows what is recent or pinned. Search is how you get a note back from a word you remember.

v1 uses ordinary SQL. A search for "taxes" is a `LIKE` query with wildcards on both sides, the same shape as `LIKE '%taxes%'`, run against the title and the body. Those two columns each get a normal database index.

That is the whole mechanism. No full-text search module, and not FTS5. FTS5 keeps a second table that has to stay in step with every edit, and it asks you to write a different kind of query than the rest of the app. At personal scale — on the order of a hundred notes — that extra machinery does not earn its place. The `LIKE` query is the same SQL you already use for everything else.

A pattern that starts with a wildcard cannot use the index to jump to a row. The database reads the rows and checks each one. That is a full scan. It is still the right call here. Around a hundred thousand notes, that scan is seconds on a phone, not minutes. FTS5 starts to earn its place at millions of notes, or when many searches are running at the same time. Until then, leave it out.

Checklist items are not a separate search system. Each item is another text row, and the same `LIKE` includes that text. A list is still a note. Finding a word on a checkbox finds the note.

A date index can be added later, when filtering by created or modified date needs it. It is not required for the word search.

This is a v2 consideration. Update this section if the note count, or the number of searches at once, reaches the scale where FTS5 is the simpler choice.

---

## What is still open

This file will grow. Already expected to be revisited:

- The snapshot decision, when the record count approaches the scale in section 2.
- The length of the trash window.
- Whether label changes ever belong in the history.
- Auto-merge, only as a later, explicit, two-parent snapshot.
- Full-text search, only around millions of notes or heavy concurrent query load (section 10).
- A date index, when filtering by date needs it.
