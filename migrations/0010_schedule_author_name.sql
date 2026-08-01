PRAGMA foreign_keys = ON;

-- Lets a page/schedule record the display name the visitor picked locally
-- (see useGuestIdentity on the frontend) instead of always attributing to
-- the shared "공용 편집자" account every unauthenticated visitor is signed
-- in as — mirrors comments.author_name (0004_comment_guest_name.sql).
-- Used so the calendar can color-code schedules by the person who actually
-- wrote them, not by the one shared login account.
ALTER TABLE pages ADD COLUMN author_name TEXT;
