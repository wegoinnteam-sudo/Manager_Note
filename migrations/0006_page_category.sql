PRAGMA foreign_keys = ON;

-- "Wegoinn DB" board: a fixed single-select category property, plus a
-- short card-summary description shown on board/list cards.
ALTER TABLE pages ADD COLUMN category TEXT;
ALTER TABLE pages ADD COLUMN description TEXT;
