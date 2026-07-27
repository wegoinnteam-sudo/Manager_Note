import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "./helpers/fakeD1";
import { getAttachmentById } from "../db/attachments";

const uploadFileStreaming = vi.fn();
const deleteFilePermanently = vi.fn();

vi.mock("../drive/client", () => ({
  uploadFileStreaming: (...args: unknown[]) => uploadFileStreaming(...args),
  deleteFilePermanently: (...args: unknown[]) => deleteFilePermanently(...args),
}));
vi.mock("../drive/folders", () => ({
  getTeamFolderIds: async () => ({ Pages: "f_pages", Attachments: "f_attachments", Archive: "f_archive", Deleted: "f_deleted", Backup: "f_backup" }),
}));

const { runUploadPipeline } = await import("../lib/uploadPipeline");

let db: any;
const TEAM = "team_test";
const USER = "user_test";
const PAGE = "page_test";

function fakeStream(): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array([1, 2, 3]));
      controller.close();
    },
  });
}

beforeEach(async () => {
  vi.clearAllMocks();
  db = createTestDb();
  await db.prepare("INSERT INTO teams (id, name) VALUES (?1, ?2)").bind(TEAM, "Test Team").run();
  await db.prepare("INSERT INTO users (id, email, name, role) VALUES (?1, ?2, ?3, 'editor')").bind(USER, "u@test.local", "Tester").run();
  await db
    .prepare("INSERT INTO pages (id, team_id, title, created_by, updated_by) VALUES (?1, ?2, ?3, ?4, ?4)")
    .bind(PAGE, TEAM, "테스트 페이지", USER)
    .run();
});

const baseReq = () => ({
  pageId: PAGE,
  teamId: TEAM,
  fileName: "report.pdf",
  extension: "pdf",
  mimeType: "application/pdf",
  sizeBytes: 3,
  uploadedBy: USER,
  idempotencyKey: null as string | null,
  body: fakeStream(),
});

describe("upload pipeline", () => {
  it("marks the attachment ready on a successful Drive upload", async () => {
    uploadFileStreaming.mockResolvedValue({ id: "drive_1", webViewLink: "https://drive/1", md5Checksum: "abc123" });

    const env = { DB: db, ENABLE_R2_BACKUP: "false" } as any;
    const result = await runUploadPipeline(env, baseReq());

    expect(result.status).toBe("ready");
    expect(result.drive_file_id).toBe("drive_1");
    expect(deleteFilePermanently).not.toHaveBeenCalled();
  });

  it("marks the attachment failed (not orphaned as ready) when Drive upload throws", async () => {
    uploadFileStreaming.mockRejectedValue(new Error("drive down"));

    const env = { DB: db, ENABLE_R2_BACKUP: "false" } as any;
    await expect(runUploadPipeline(env, baseReq())).rejects.toThrow();

    const rows = await db.prepare("SELECT * FROM attachments WHERE page_id = ?1").bind(PAGE).all();
    expect(rows.results).toHaveLength(1);
    expect(rows.results[0].status).toBe("failed");
  });

  it("compensates by deleting the Drive file when Drive succeeds but D1 cannot record it", async () => {
    uploadFileStreaming.mockResolvedValue({ id: "drive_orphan", webViewLink: null, md5Checksum: null });
    deleteFilePermanently.mockResolvedValue(undefined);

    // Force the D1 write for the driveFileId to fail by dropping the
    // unique index target column type mismatch is hard to fake, so instead
    // we simulate a downstream failure by closing the DB mid-flight via a
    // second attachment already holding that drive_file_id (unique clash).
    await db
      .prepare(
        "INSERT INTO attachments (id, page_id, file_name, extension, mime_type, size_bytes, status, drive_file_id, uploaded_by) VALUES ('att_existing', ?1, 'x.pdf', 'pdf', 'application/pdf', 1, 'ready', 'drive_orphan', ?2)",
      )
      .bind(PAGE, USER)
      .run();

    const env = { DB: db, ENABLE_R2_BACKUP: "false" } as any;
    await expect(runUploadPipeline(env, baseReq())).rejects.toThrow();

    // The compensating delete against Drive must have been attempted.
    expect(deleteFilePermanently).toHaveBeenCalledWith(env, "drive_orphan");
  });

  it("replays an idempotent request instead of uploading twice", async () => {
    uploadFileStreaming.mockResolvedValue({ id: "drive_once", webViewLink: null, md5Checksum: null });
    const env = { DB: db, ENABLE_R2_BACKUP: "false" } as any;

    const first = await runUploadPipeline(env, { ...baseReq(), idempotencyKey: "key-1" });
    const second = await runUploadPipeline(env, { ...baseReq(), idempotencyKey: "key-1" });

    expect(second.id).toBe(first.id);
    expect(uploadFileStreaming).toHaveBeenCalledTimes(1);
  });

  it("retries under the same idempotency key after a prior failure", async () => {
    uploadFileStreaming.mockRejectedValueOnce(new Error("temporary"));
    const env = { DB: db, ENABLE_R2_BACKUP: "false" } as any;
    await expect(runUploadPipeline(env, { ...baseReq(), idempotencyKey: "key-retry" })).rejects.toThrow();

    uploadFileStreaming.mockResolvedValueOnce({ id: "drive_retry", webViewLink: null, md5Checksum: null });
    const retried = await runUploadPipeline(env, { ...baseReq(), idempotencyKey: "key-retry" });
    expect(retried.status).toBe("ready");

    const found = await getAttachmentById(db, retried.id);
    expect(found?.drive_file_id).toBe("drive_retry");
  });
});
