-- Adds date-range + time-of-day fields so calendar-view pages can act as
-- multi-day schedules (start = existing due_date, end = new end_date)
-- instead of only ever a single-day marker.
ALTER TABLE pages ADD COLUMN end_date TEXT;
ALTER TABLE pages ADD COLUMN start_time TEXT;
ALTER TABLE pages ADD COLUMN end_time TEXT;
ALTER TABLE pages ADD COLUMN all_day INTEGER NOT NULL DEFAULT 1;
