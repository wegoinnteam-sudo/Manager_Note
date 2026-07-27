import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// node:sqlite is an experimental Node builtin not yet listed in
// module.builtinModules, so Vite's static import analysis (used by
// vitest's transform pipeline) tries to resolve it as a regular npm
// package and fails. process.getBuiltinModule() fetches it at runtime
// instead of via a statically analyzed import specifier, sidestepping that.
const sqlite = (process as any).getBuiltinModule("node:sqlite") as typeof import("node:sqlite");
const { DatabaseSync } = sqlite;

/**
 * A real SQLite-backed stand-in for D1Database, used so worker/db/*.ts logic
 * can be tested against the actual migration SQL without needing the
 * Workers runtime (workerd cannot run in every CI/dev environment glibc,
 * whereas SQLite itself is universally available). Implements only the
 * subset of the D1 API this codebase actually calls.
 *
 * D1 (and our SQL) uses SQLite's numbered parameters (?1, ?2, ...), which
 * may repeat the same number more than once in a statement (e.g. created_at
 * and updated_at both bound from ?7). node:sqlite's StatementSync only
 * understands plain anonymous `?` placeholders, so each numbered `?N` is
 * rewritten to `?` here and the bound args are re-projected into the
 * matching order — including repeats — before executing.
 */
class FakeD1Statement {
  private args: unknown[] = [];
  private readonly paramIndices: number[];
  private readonly stmt: import("node:sqlite").StatementSync;

  constructor(db: import("node:sqlite").DatabaseSync, sql: string) {
    const indices: number[] = [];
    const rewritten = sql.replace(/\?(\d+)/g, (_match, n: string) => {
      indices.push(Number(n));
      return "?";
    });
    this.paramIndices = indices;
    this.stmt = db.prepare(rewritten);
  }

  bind(...args: unknown[]) {
    this.args = args;
    return this;
  }

  private orderedArgs(): unknown[] {
    if (this.paramIndices.length === 0) return this.args;
    return this.paramIndices.map((n) => this.args[n - 1]);
  }

  async first<T>(): Promise<T | null> {
    const row = this.stmt.get(...(this.orderedArgs() as any[]));
    return (row as T) ?? null;
  }

  async all<T>(): Promise<{ results: T[]; success: true }> {
    const rows = this.stmt.all(...(this.orderedArgs() as any[]));
    return { results: rows as T[], success: true };
  }

  async run(): Promise<{ success: true; meta: { changes: number; last_row_id: number } }> {
    const info = this.stmt.run(...(this.orderedArgs() as any[]));
    return { success: true, meta: { changes: Number(info.changes), last_row_id: Number(info.lastInsertRowid) } };
  }
}

export class FakeD1 {
  constructor(private db: import("node:sqlite").DatabaseSync) {}

  prepare(sql: string) {
    return new FakeD1Statement(this.db, sql);
  }
}

export function createTestDb(): any {
  const db = new DatabaseSync(":memory:");
  const here = path.dirname(fileURLToPath(import.meta.url));
  const migrationPath = path.resolve(here, "../../../migrations/0001_init.sql");
  const sql = readFileSync(migrationPath, "utf8");
  db.exec(sql);
  return new FakeD1(db);
}
