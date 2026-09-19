PRAGMA foreign_keys = ON;

-- Photos attached to a handover notice (e.g. damage/cleaning evidence).
-- Deliberately a separate, lightweight table rather than reusing
-- `attachments` (page_id NOT NULL there, and changing that would require
-- recreating that table in SQLite — too risky for the existing page
-- attachment feature). Files still live in Google Drive, not in D1, same
-- principle as attachments.
CREATE TABLE handover_notice_photos (
  id TEXT PRIMARY KEY,
  notice_id TEXT NOT NULL REFERENCES handover_notices(id) ON DELETE CASCADE,
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  drive_file_id TEXT NOT NULL,
  drive_web_view_link TEXT,
  uploaded_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_handover_notice_photos_notice ON handover_notice_photos(notice_id);
