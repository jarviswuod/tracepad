# How a Tracepad note moves

Plain map of the lifecycle. Each device shows what is in its own database. The server keeps a log of changes and passes them on. It does not decide which version you are looking at.

## The whole path

```mermaid
flowchart TD
  write["You write"] --> kind{"Words, or just filing?"}

  kind -->|"Title or body"| id["Device makes an ID"]
  id --> snap["Save a full snapshot in the local database"]
  snap --> parent["Point it at the previous snapshot"]
  parent --> outbox["Add a row to the outbox"]
  outbox --> upload["Upload the outbox"]
  upload --> server["Server log: referee, not the source of truth"]
  server --> download["Download changes after your bookmark"]
  download --> branch{"Two snapshots, same parent?"}
  branch -->|"No"| local["Local database stays what you see"]
  branch -->|"Yes"| both["Keep both. Never overwrite"]
  both --> compare["Green and red, side by side"]
  compare --> pick["You pick which one is current"]
  pick --> local

  kind -->|"Pin, label, or color"| meta["Update the note only. No new snapshot"]
  meta --> local
  kind -->|"Archive"| arch["Flag only. Hide from the main list"]
  arch --> local
  kind -->|"Delete"| trash["Trash flag. Kept for 7 days"]
  trash --> local

  kind -->|"Remind me"| rem["Store the time and the note ID locally"]
  rem --> where{"Phone or website?"}
  where -->|"Phone"| alarm["Hand the time to AlarmManager"]
  where -->|"Website"| clock["Server clock sends the ping"]
```

Creating a note is the words path with no previous snapshot. Editing is the same path, and the new snapshot names its parent. Search never leaves the device: it looks through title and body with a `LIKE` query. Those two columns are indexed.

## One device, close up

```mermaid
flowchart LR
  screen["Screen"] -->|"reads"| db[("Local database")]
  screen -->|"search title and body"| db
  screen -->|"save"| db
  screen -->|"queue unsent change"| outbox["Outbox"]
  clock["Scheduler"] -->|"online, or the app opens"| sync["Sync"]
  outbox --> sync
  sync -->|"upload"| log["Server log"]
  log -->|"download after bookmark"| sync
  sync -->|"write new rows"| db
```

The screen never waits on the server. A save lands in the local database and in the outbox together. Sync runs later, sends the outbox, and brings back other devices' rows.
