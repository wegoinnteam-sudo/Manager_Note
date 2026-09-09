PRAGMA foreign_keys = ON;

-- Most visitors share one "공용 편집자" login (see worker/middleware/session.ts
-- — this app intentionally runs without requiring individual Google
-- accounts), so activity_logs.actor_id is often identical for every real
-- person on the team. The activity feed needs to tell them apart the same
-- way comments/pages already do: by the display name each visitor picks
-- locally (see useGuestIdentity on the frontend, 0004_comment_guest_name.sql).
ALTER TABLE activity_logs ADD COLUMN actor_name TEXT;

-- Re-key acks by that same guest name instead of user_id, for the same
-- reason — otherwise one person acking an item would silently ack it for
-- every other visitor sharing the account. This table was added in
-- 0012_activity_acks.sql with no meaningful data yet, so a clean
-- drop/recreate is safe.
DROP TABLE IF EXISTS activity_acks;
CREATE TABLE activity_acks (
  activity_id TEXT NOT NULL REFERENCES activity_logs(id) ON DELETE CASCADE,
  guest_name TEXT NOT NULL,
  acked_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (activity_id, guest_name)
);
CREATE INDEX idx_activity_acks_guest ON activity_acks(guest_name);
