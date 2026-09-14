-- One-time September allowance; other months retain the 30,000 KRW default.
-- Values are integer micro-KRW. Existing usage and uncertain charges are preserved.
CREATE TABLE ai_monthly_budgets (
 month TEXT PRIMARY KEY,
 limit_micro_krw INTEGER NOT NULL CHECK(limit_micro_krw > 0)
);
INSERT INTO ai_monthly_budgets(month, limit_micro_krw) VALUES ('2026-09', 40000000000);

DROP TRIGGER ai_budget_guard;
CREATE TRIGGER ai_budget_guard BEFORE INSERT ON ai_calls BEGIN
 SELECT RAISE(ABORT,'ai_budget_exhausted')
 WHERE NEW.charged + COALESCE((SELECT SUM(charged) FROM ai_calls WHERE month=NEW.month),0)
 > COALESCE((SELECT limit_micro_krw FROM ai_monthly_budgets WHERE month=NEW.month),30000000000);
END;
