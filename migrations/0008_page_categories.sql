-- User-manageable top-level groups for the Wegoinn DB.
CREATE TABLE page_categories (
  key TEXT NOT NULL,
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#6b7280',
  order_key REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (team_id, key),
  UNIQUE (team_id, label)
);

CREATE INDEX idx_page_categories_team_order ON page_categories(team_id, order_key);
