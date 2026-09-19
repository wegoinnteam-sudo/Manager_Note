import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb } from "./helpers/fakeD1";
import {
  createHandoverNotice,
  listHandoverNotices,
  setHandoverNoticeAck,
  setHandoverNoticeDone,
  softDeleteHandoverNotice,
} from "../db/handoverNotices";
import { createHandoverPhoto, deleteHandoverPhotoRow, getHandoverPhotoForTeam } from "../db/handoverPhotos";

let db: any;
const TEAM = "team_test";
const USER = "user_test";

beforeEach(async () => {
  db = createTestDb();
  await db.prepare("INSERT INTO teams (id, name) VALUES (?1, ?2)").bind(TEAM, "Test Team").run();
  await db
    .prepare("INSERT INTO users (id, email, name, role) VALUES (?1, ?2, ?3, ?4)")
    .bind(USER, "user@example.com", "Daniel", "editor")
    .run();
});

const sampleInput = {
  noticeDate: "2026-09-19",
  noticeTime: "08:45",
  fromName: "Jane",
  reference: "Kim · 812호",
  category: "reception" as const,
  body: "PMS 객실 연결 확인 부탁드립니다.",
};

describe("handoverNotices", () => {
  it("creates and lists a notice, newest first", async () => {
    const first = await createHandoverNotice(db, TEAM, sampleInput, USER);
    const second = await createHandoverNotice(
      db,
      TEAM,
      { ...sampleInput, noticeTime: "09:18", category: "hostel", body: "복도 소음 문의" },
      USER,
    );

    const notices = await listHandoverNotices(db, TEAM);
    expect(notices).toHaveLength(2);
    expect(notices[0].id).toBe(second.id);
    expect(notices[1].id).toBe(first.id);
    expect(notices[1].isDone).toBe(false);
    expect(notices[1].completedBy).toBeNull();
  });

  it("marks a notice done with a completer, then can undo it", async () => {
    const created = await createHandoverNotice(db, TEAM, sampleInput, USER);

    const done = await setHandoverNoticeDone(db, TEAM, created.id, { isDone: true, completedBy: "가원" });
    expect(done?.isDone).toBe(true);
    expect(done?.completedBy).toBe("가원");
    expect(done?.completedAt).not.toBeNull();

    const undone = await setHandoverNoticeDone(db, TEAM, created.id, { isDone: false, completedBy: null });
    expect(undone?.isDone).toBe(false);
    expect(undone?.completedBy).toBeNull();
    expect(undone?.completedAt).toBeNull();
  });

  it("returns null when completing a notice from another team", async () => {
    const created = await createHandoverNotice(db, TEAM, sampleInput, USER);
    const result = await setHandoverNoticeDone(db, "team_other", created.id, { isDone: true, completedBy: "하나" });
    expect(result).toBeNull();
  });

  it("soft-deletes a notice so it no longer appears in the list", async () => {
    const created = await createHandoverNotice(db, TEAM, sampleInput, USER);
    const other = await createHandoverNotice(db, TEAM, { ...sampleInput, category: "hostel" as const }, USER);

    const deleted = await softDeleteHandoverNotice(db, TEAM, created.id);
    expect(deleted).toBe(true);

    const notices = await listHandoverNotices(db, TEAM);
    expect(notices.map((n) => n.id)).toEqual([other.id]);

    // Deleting again (or a notice from another team) reports nothing changed.
    expect(await softDeleteHandoverNotice(db, TEAM, created.id)).toBe(false);
    expect(await softDeleteHandoverNotice(db, "team_other", other.id)).toBe(false);
  });

  it("embeds each notice's photos in the list, grouped correctly", async () => {
    const first = await createHandoverNotice(db, TEAM, sampleInput, USER);
    const second = await createHandoverNotice(db, TEAM, { ...sampleInput, category: "hostel" as const }, USER);

    await createHandoverPhoto(db, {
      noticeId: first.id,
      teamId: TEAM,
      fileName: "damage.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 12345,
      driveFileId: "drive_1",
      driveWebViewLink: null,
      uploadedBy: USER,
    });
    const photo2 = await createHandoverPhoto(db, {
      noticeId: first.id,
      teamId: TEAM,
      fileName: "damage2.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 22345,
      driveFileId: "drive_2",
      driveWebViewLink: null,
      uploadedBy: USER,
    });

    const notices = await listHandoverNotices(db, TEAM);
    const firstDto = notices.find((n) => n.id === first.id)!;
    const secondDto = notices.find((n) => n.id === second.id)!;
    expect(firstDto.photos).toHaveLength(2);
    expect(firstDto.photos[0].url).toBe(`/api/handover/photos/${firstDto.photos[0].id}/preview`);
    expect(secondDto.photos).toHaveLength(0);

    expect(await getHandoverPhotoForTeam(db, TEAM, photo2.id)).not.toBeNull();
    expect(await getHandoverPhotoForTeam(db, "team_other", photo2.id)).toBeNull();

    await deleteHandoverPhotoRow(db, photo2.id);
    const afterDelete = await listHandoverNotices(db, TEAM);
    expect(afterDelete.find((n) => n.id === first.id)!.photos).toHaveLength(1);
  });

  it("an 'everyone' notice is only done once all four names have acked", async () => {
    const created = await createHandoverNotice(db, TEAM, { ...sampleInput, category: "everyone" as const }, USER);
    expect(created.isDone).toBe(false);

    await setHandoverNoticeAck(db, TEAM, created.id, "Justin", true);
    let notice = (await listHandoverNotices(db, TEAM)).find((n) => n.id === created.id)!;
    expect(notice.acks).toEqual(["Justin"]);
    expect(notice.isDone).toBe(false);

    await setHandoverNoticeAck(db, TEAM, created.id, "Jane", true);
    await setHandoverNoticeAck(db, TEAM, created.id, "Been", true);
    const last = await setHandoverNoticeAck(db, TEAM, created.id, "Daniel", true);
    expect(last?.isDone).toBe(true);
    expect(last?.acks).toHaveLength(4);

    // Un-acking one name drops it back to not-done.
    await setHandoverNoticeAck(db, TEAM, created.id, "Jane", false);
    notice = (await listHandoverNotices(db, TEAM)).find((n) => n.id === created.id)!;
    expect(notice.acks.sort()).toEqual(["Been", "Daniel", "Justin"]);
    expect(notice.isDone).toBe(false);
  });

  it("rejects acking a notice that isn't category 'everyone'", async () => {
    const created = await createHandoverNotice(db, TEAM, sampleInput, USER);
    expect(await setHandoverNoticeAck(db, TEAM, created.id, "Justin", true)).toBeNull();
  });

  it("rejects setting done/undone on an 'everyone' notice via the ordinary completer flow", async () => {
    const created = await createHandoverNotice(db, TEAM, { ...sampleInput, category: "everyone" as const }, USER);
    // setHandoverNoticeDone itself doesn't guard category (the route does),
    // but it must not silently make an "everyone" notice look done via the
    // is_done column — isDone stays derived from acks regardless.
    const result = await setHandoverNoticeDone(db, TEAM, created.id, { isDone: true, completedBy: "Daniel" });
    expect(result?.isDone).toBe(false);
  });
});
