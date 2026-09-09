PRAGMA foreign_keys = ON;

-- Per-user acknowledgement of activity feed entries. The feed itself
-- (activity_logs) is shared by the whole team, but "checking off" an entry
-- only dismisses it for the user who checked it — everyone else keeps
-- seeing it until they ack it too.
CREATE TABLE activity_acks (
  activity_id TEXT NOT NULL REFERENCES activity_logs(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  acked_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (activity_id, user_id)
);
CREATE INDEX idx_activity_acks_user ON activity_acks(user_id);
