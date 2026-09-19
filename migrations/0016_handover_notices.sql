PRAGMA foreign_keys = ON;

-- Wegoinn Hostel reception handover board: a fixed-column board separate
-- from the "Wegoinn DB" page/category system (see page_categories /
-- 0008_page_categories.sql). Modeled as its own table rather than pages,
-- since its rows aren't documents — they're structured notices with a
-- required "who completed this" field that must persist independently of
-- any page content or block schema.
CREATE TABLE handover_notices (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  notice_date TEXT NOT NULL,   -- 'YYYY-MM-DD'
  notice_time TEXT NOT NULL,   -- 'HH:MM'
  from_name TEXT NOT NULL,
  reference TEXT NOT NULL,     -- 이름 · 객실번호 · 예약번호
  category TEXT NOT NULL CHECK (category IN ('hostel', 'reception', 'repair', 'others')),
  body TEXT NOT NULL,
  is_done INTEGER NOT NULL DEFAULT 0,
  completed_by TEXT,
  completed_at TEXT,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_handover_notices_team ON handover_notices(team_id, is_deleted, notice_date, notice_time);
CREATE INDEX idx_handover_notices_category ON handover_notices(team_id, category);
