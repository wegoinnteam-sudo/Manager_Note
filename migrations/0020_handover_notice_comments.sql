PRAGMA foreign_keys = ON;

-- Comments on a handover notice — same shape/soft-delete convention as the
-- page-level `comments` table, but kept as its own table since
-- comments.page_id is NOT NULL (see handover_notice_photos for the same
-- reasoning re: not touching that table's schema).
CREATE TABLE handover_notice_comments (
  id TEXT PRIMARY KEY,
  notice_id TEXT NOT NULL REFERENCES handover_notices(id) ON DELETE CASCADE,
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES users(id),
  author_name TEXT,
  body TEXT NOT NULL,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_handover_notice_comments_notice ON handover_notice_comments(notice_id, created_at);
