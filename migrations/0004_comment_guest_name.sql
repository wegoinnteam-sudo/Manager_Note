PRAGMA foreign_keys = ON;

-- Lets a comment record the display name the visitor picked locally
-- (see useGuestIdentity on the frontend) instead of always attributing to
-- the shared "공용 편집자" account every unauthenticated visitor is signed
-- in as.
ALTER TABLE comments ADD COLUMN author_name TEXT;
