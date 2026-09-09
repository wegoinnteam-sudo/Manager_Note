-- AI budget is global, never keyed by user/team. Integer micro-KRW avoids rounding drift.
CREATE TABLE ai_prices (
 id TEXT PRIMARY KEY, model TEXT NOT NULL, input_usd REAL NOT NULL, output_usd REAL NOT NULL,
 krw_per_usd REAL NOT NULL, safety_factor REAL NOT NULL, valid_until TEXT NOT NULL,
 enabled INTEGER NOT NULL DEFAULT 1
);
-- Official Standard pricing checked 2026-09-09. FX is a conservative policy, not a live quote.
INSERT INTO ai_prices VALUES ('2026-09-09','gemini-2.5-flash',0.30,2.50,1600,1.30,'2026-10-09T00:00:00.000Z',1);
CREATE TABLE ai_calls (
 id TEXT PRIMARY KEY, month TEXT NOT NULL, purpose TEXT NOT NULL, price_id TEXT NOT NULL,
 reserved INTEGER NOT NULL CHECK(reserved >= 0), charged INTEGER NOT NULL CHECK(charged >= 0),
 state TEXT NOT NULL CHECK(state IN ('reserved','settled','uncertain')),
 input_tokens INTEGER, output_tokens INTEGER, created_at TEXT NOT NULL, settled_at TEXT
);
CREATE INDEX ai_calls_month ON ai_calls(month);
-- The SELECT and INSERT are one SQLite write statement. Concurrent requests cannot oversubscribe.
CREATE TRIGGER ai_budget_guard BEFORE INSERT ON ai_calls BEGIN
 SELECT CASE WHEN NEW.charged + COALESCE((SELECT SUM(charged) FROM ai_calls WHERE month=NEW.month),0) > 30000000000
 THEN RAISE(ABORT,'ai_budget_exhausted') END;
END;
CREATE TABLE ai_sources (
 id TEXT PRIMARY KEY, revision TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'pending'
 CHECK(state IN ('pending','processing','ready','failed','budget_wait')),
 cursor INTEGER NOT NULL DEFAULT 0, total INTEGER, lease TEXT, lease_until TEXT,
 attempts INTEGER NOT NULL DEFAULT 0, reason TEXT, updated_at TEXT NOT NULL
);
CREATE TABLE ai_chunks (
 id TEXT PRIMARY KEY, source_id TEXT NOT NULL REFERENCES ai_sources(id) ON DELETE CASCADE,
 revision TEXT NOT NULL, unit INTEGER NOT NULL, location TEXT NOT NULL, text TEXT NOT NULL,
 warnings TEXT NOT NULL DEFAULT '[]', numbers TEXT NOT NULL DEFAULT '[]'
);
CREATE INDEX ai_chunks_source ON ai_chunks(source_id,revision,unit);
CREATE VIEW ai_inventory AS
 SELECT 'p:'||p.id AS id,'note' AS kind,p.id AS page_id,NULL AS attachment_id,p.title AS title,
 p.title||':'||p.version||':'||COALESCE(c.version,0)||':'||COALESCE(c.updated_at,'') AS revision,
 p.updated_at AS updated_at,0 AS size_bytes,NULL AS mime_type,NULL AS drive_file_id
 FROM pages p LEFT JOIN page_contents c ON c.page_id=p.id WHERE p.is_deleted=0
 UNION ALL
 SELECT 'a:'||a.id,'file',a.page_id,a.id,a.file_name,
 a.file_name||':'||a.mime_type||':'||a.size_bytes||':'||COALESCE(a.checksum,a.updated_at)||':'||a.status,
 a.updated_at,a.size_bytes,a.mime_type,a.drive_file_id
 FROM attachments a JOIN pages p ON p.id=a.page_id WHERE a.is_deleted=0 AND p.is_deleted=0;
-- Revisions also checked on every read, so changed data can never be served before reindexing.
CREATE TRIGGER ai_source_revision AFTER UPDATE OF revision ON ai_sources WHEN OLD.revision<>NEW.revision BEGIN
 DELETE FROM ai_chunks WHERE source_id=NEW.id;
END;
CREATE TRIGGER ai_page_deleted AFTER UPDATE OF is_deleted ON pages WHEN NEW.is_deleted=1 BEGIN
 DELETE FROM ai_sources WHERE id='p:'||NEW.id OR id IN (SELECT 'a:'||id FROM attachments WHERE page_id=NEW.id);
END;
CREATE TRIGGER ai_page_removed BEFORE DELETE ON pages BEGIN
 DELETE FROM ai_sources WHERE id='p:'||OLD.id OR id IN (SELECT 'a:'||id FROM attachments WHERE page_id=OLD.id);
END;
CREATE TRIGGER ai_file_deleted AFTER UPDATE OF is_deleted ON attachments WHEN NEW.is_deleted=1 BEGIN
 DELETE FROM ai_sources WHERE id='a:'||NEW.id;
END;
CREATE TRIGGER ai_file_removed BEFORE DELETE ON attachments BEGIN
 DELETE FROM ai_sources WHERE id='a:'||OLD.id;
END;

-- Bound incremental persistent storage. Capacity failure is visible, never silently truncated.
CREATE TRIGGER ai_chunk_capacity BEFORE INSERT ON ai_chunks
 WHEN NOT EXISTS (SELECT 1 FROM ai_chunks WHERE id=NEW.id) BEGIN
 SELECT CASE WHEN (SELECT COUNT(*) FROM ai_chunks)>=5000 THEN RAISE(ABORT,'ai_index_capacity') END;
 SELECT CASE WHEN length(NEW.text)>24000 THEN RAISE(ABORT,'ai_chunk_capacity') END;
END;
