PRAGMA foreign_keys = ON;

-- Sensitive-info blocks store their real value here, never inside
-- page_contents.content_json. This keeps the plaintext out of the normal
-- page fetch/search path entirely — it's only ever returned by the
-- dedicated, role-gated /secrets endpoint, and every read is audit-logged
-- via activity_logs (action = "sensitive_block.revealed").
CREATE TABLE sensitive_values (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id),
  page_id TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  block_id TEXT NOT NULL,
  value TEXT NOT NULL,
  created_by TEXT,
  updated_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (page_id, block_id)
);

CREATE INDEX idx_sensitive_values_page ON sensitive_values(page_id);
