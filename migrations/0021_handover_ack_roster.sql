PRAGMA foreign_keys = ON;

-- The 4 names shown as "All" category ack checkboxes (previously hardcoded
-- as HANDOVER_ALL_ACK_NAMES) are now editable from 설정 — this table holds
-- the current label for each of the 4 fixed positions. Rows are created
-- lazily (see getHandoverAckRoster) with the original hardcoded names as
-- the default, rather than seeded here, so this migration doesn't need to
-- assume a specific team id.
CREATE TABLE handover_ack_roster (
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position BETWEEN 1 AND 4),
  name TEXT NOT NULL,
  PRIMARY KEY (team_id, position)
);
