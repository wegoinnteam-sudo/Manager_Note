-- Lets each person pick their own color, used to color-code calendar
-- schedules by author instead of by category.
ALTER TABLE users ADD COLUMN color TEXT;
