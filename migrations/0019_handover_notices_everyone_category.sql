PRAGMA foreign_keys = OFF;

-- Adds the "everyone" category (displayed as "All" — see HANDOVER_CATEGORY_LABELS
-- in shared/types.ts) to handover_notices.category's CHECK constraint.
-- SQLite has no ALTER TABLE ... DROP/MODIFY CONSTRAINT, so this recreates
-- the table with the widened constraint and copies the existing rows over,
-- per SQLite's documented procedure for schema changes on a table that
-- other tables reference by foreign key (handover_notice_photos,
-- handover_notice_acks both reference handover_notices(id) by name, which
-- still resolves correctly once this table is renamed back into place).
CREATE TABLE handover_notices_new (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  notice_date TEXT NOT NULL,
  notice_time TEXT NOT NULL,
  from_name TEXT NOT NULL,
  reference TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('hostel', 'reception', 'repair', 'others', 'everyone')),
  body TEXT NOT NULL,
  is_done INTEGER NOT NULL DEFAULT 0,
  completed_by TEXT,
  completed_at TEXT,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT INTO handover_notices_new
  (id, team_id, notice_date, notice_time, from_name, reference, category, body, is_done, completed_by, completed_at, is_deleted, created_by, created_at, updated_at)
SELECT
  id, team_id, notice_date, notice_time, from_name, reference, category, body, is_done, completed_by, completed_at, is_deleted, created_by, created_at, updated_at
FROM handover_notices;

DROP TABLE handover_notices;
ALTER TABLE handover_notices_new RENAME TO handover_notices;

CREATE INDEX idx_handover_notices_team ON handover_notices(team_id, is_deleted, notice_date, notice_time);
CREATE INDEX idx_handover_notices_category ON handover_notices(team_id, category);

PRAGMA foreign_keys = ON;
