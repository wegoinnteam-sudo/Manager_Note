PRAGMA foreign_keys = ON;

-- Every unauthenticated visitor shares one "공용 편집자" login (see
-- useGuestIdentity on the frontend and 0004_comment_guest_name.sql), so a
-- per-account color setting (users.color) can't tell two people apart.
-- This lets each locally-picked display name have its own calendar color,
-- visible to everyone, keyed by name instead of a real user id.
CREATE TABLE guest_colors (
  team_id TEXT NOT NULL,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (team_id, name)
);
