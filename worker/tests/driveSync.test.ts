import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "./helpers/fakeD1";
import { getSyncState, listSyncLogs } from "../db/driveSync";
import { findByDriveFileId } from "../db/attachments";

const getStartPageToken = vi.fn();
const listChanges = vi.fn();
const listFilesModifiedAfter = vi.fn();

vi.mock("../drive/client", () => ({
  getStartPageToken: (...a: unknown[]) => getStartPageToken(...a),
  listChanges: (...a: unknown[]) => listChanges(...a),
  listFilesModifiedAfter: (...a: unknown[]) => listFilesModifiedAfter(...a),
}));
vi.mock("../drive/folders", () => ({
  getTeamFolderIds: async () => ({ Pages: "f_pages", Attachments: "f_attachments", Archive: "f_archive", Deleted: "f_deleted", Backup: "f_backup" }),
}));

const { runDriveSync } = await import("../drive/sync");

let db: any;
const TEAM = "team_test";

beforeEach(async () => {
  vi.clearAllMocks();
  db = createTestDb();
  await db.prepare("INSERT INTO teams (id, name) VALUES (?1, ?2)").bind(TEAM, "Test Team").run();
});

const file = (overrides: Record<string, unknown> = {}) => ({
  id: "drive_a",
  name: "spec.pdf",
  mimeType: "application/pdf",
  size: "1024",
  modifiedTime: "2026-01-01T00:00:00Z",
  parents: ["f_attachments"],
  ...overrides,
});

describe("drive sync", () => {
  it("does a baseline import on the first run and stores a start token", async () => {
    getStartPageToken.mockResolvedValue("token_1");
    listFilesModifiedAfter.mockResolvedValue({ files: [file()] });

    const result = await runDriveSync({ DB: db } as any, TEAM, "manual");

    expect(result.status).toBe("success");
    expect(result.filesAdded).toBe(1);
    const state = await getSyncState(db, TEAM);
    expect(state?.last_page_token).toBe("token_1");
    expect(state?.status).toBe("idle");

    const attachment = await findByDriveFileId(db, "drive_a");
    expect(attachment?.status).toBe("ready");
  });

  it("skips a disallowed file extension found directly in Drive", async () => {
    getStartPageToken.mockResolvedValue("token_1");
    listFilesModifiedAfter.mockResolvedValue({ files: [file({ id: "drive_exe", name: "virus.exe" })] });

    const result = await runDriveSync({ DB: db } as any, TEAM, "manual");
    expect(result.filesSkipped).toBe(1);
    expect(await findByDriveFileId(db, "drive_exe")).toBeNull();
  });

  it("uses incremental changes once a page token exists, and soft-deletes removed files", async () => {
    getStartPageToken.mockResolvedValue("token_1");
    listFilesModifiedAfter.mockResolvedValue({ files: [file()] });
    await runDriveSync({ DB: db } as any, TEAM, "manual");

    listChanges.mockResolvedValue({
      changes: [{ fileId: "drive_a", removed: true }],
      newStartPageToken: "token_2",
    });

    const result = await runDriveSync({ DB: db } as any, TEAM, "cron");
    expect(result.filesUpdated).toBe(1);
    const attachment = await findByDriveFileId(db, "drive_a");
    expect(attachment?.is_deleted).toBe(1);

    const state = await getSyncState(db, TEAM);
    expect(state?.last_page_token).toBe("token_2");
  });

  it("does not advance the sync cursor on failure, so the next run retries from the same point", async () => {
    getStartPageToken.mockResolvedValue("token_1");
    listFilesModifiedAfter.mockResolvedValue({ files: [file()] });
    await runDriveSync({ DB: db } as any, TEAM, "manual");

    listChanges.mockRejectedValue(new Error("Drive API 5xx"));
    const failed = await runDriveSync({ DB: db } as any, TEAM, "cron");
    expect(failed.status).toBe("failed");

    const state = await getSyncState(db, TEAM);
    expect(state?.last_page_token).toBe("token_1"); // unchanged
    expect(state?.status).toBe("failed");

    const logs = await listSyncLogs(db, TEAM);
    expect(logs[0].status).toBe("failed");
  });
});
