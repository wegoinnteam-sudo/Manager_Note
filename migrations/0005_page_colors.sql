PRAGMA foreign_keys = ON;

-- Per-page sidebar color: text color and highlighter (background) color,
-- both user-chosen hex strings, shown on the page tree row in the sidebar.
ALTER TABLE pages ADD COLUMN text_color TEXT;
ALTER TABLE pages ADD COLUMN highlight_color TEXT;
