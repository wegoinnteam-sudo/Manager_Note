PRAGMA foreign_keys = ON;

-- "All" category handover notices need every one of a fixed set of staff
-- to individually confirm they've seen it (unlike the single completed_by
-- flow the other categories use), so this tracks a per-person ack instead
-- of reusing handover_notices.is_done/completed_by for that category. A
-- row's presence means that person acked; there's no "unacked" row.
CREATE TABLE handover_notice_acks (
  notice_id TEXT NOT NULL REFERENCES handover_notices(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  acked_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (notice_id, name)
);
