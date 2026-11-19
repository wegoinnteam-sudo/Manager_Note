-- Free-cancellation approvals shown on /취소확인.
CREATE TABLE cancellations (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id),
  cancel_date TEXT NOT NULL,
  reservation_number TEXT NOT NULL,
  guest_name TEXT NOT NULL,
  check_in_date TEXT NOT NULL,
  cancellation_rate INTEGER NOT NULL,
  manager TEXT NOT NULL DEFAULT '',
  reason TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX cancellations_team ON cancellations(team_id, deleted_at, cancel_date);
