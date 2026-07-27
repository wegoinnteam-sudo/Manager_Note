import type { Env } from "../types";
import { getTeamFolderIds } from "./folders";
import { getStartPageToken, listChanges, listFilesModifiedAfter, type DriveFileMeta } from "./client";
import {
  createReadyAttachmentFromDrive,
  findByDriveFileId,
  softDeleteAttachment,
  updateAttachmentFromDrive,
} from "../db/attachments";
import { createSyncLog, finishSyncLog, getSyncState, upsertSyncState } from "../db/driveSync";
import { createPage, getPageById } from "../db/pages";
import { getTeamById, setDriveInboxPageId } from "../db/teams";
import { ensureSystemUser } from "../db/users";
import { extensionOf, isAllowedExtension } from "../lib/validation";

const FOLDER_MIME = "application/vnd.google-apps.folder";

export interface SyncResult {
  status: "success" | "failed" | "partial";
  filesAdded: number;
  filesUpdated: number;
  filesSkipped: number;
  errorMessage: string | null;
}

async function ensureDriveInboxPage(env: Env, teamId: string, systemUserId: string): Promise<string> {
  const team = await getTeamById(env.DB, teamId);
  if (team?.drive_inbox_page_id) {
    const existing = await getPageById(env.DB, teamId, team.drive_inbox_page_id);
    if (existing && !existing.is_deleted) return existing.id;
  }
  const { page } = await createPage(env.DB, {
    teamId,
    parentId: null,
    title: "Drive 가져오기함",
    createdBy: systemUserId,
    isSystem: true,
  });
  await setDriveInboxPageId(env.DB, teamId, page.id);
  return page.id;
}

async function importOrUpdateFile(
  env: Env,
  attachmentsFolderId: string,
  inboxPageId: string,
  systemUserId: string,
  file: DriveFileMeta,
  counters: { added: number; updated: number; skipped: number },
): Promise<void> {
  if (file.mimeType === FOLDER_MIME) return;
  if (!file.parents?.includes(attachmentsFolderId)) return; // only the shared Attachments folder is auto-imported

  const existing = await findByDriveFileId(env.DB, file.id);
  const ext = extensionOf(file.name);

  if (file.trashed) {
    if (existing) {
      await softDeleteAttachment(env.DB, existing.id);
      counters.updated++;
    }
    return;
  }

  if (!isAllowedExtension(ext)) {
    counters.skipped++;
    return;
  }

  if (existing) {
    await updateAttachmentFromDrive(env.DB, existing.id, {
      fileName: file.name,
      mimeType: file.mimeType,
      sizeBytes: Number(file.size ?? 0),
      checksum: file.md5Checksum ?? null,
    });
    counters.updated++;
    return;
  }

  // Brand new file someone dropped directly into Drive: park it in the
  // "Drive 가져오기함" inbox page for an admin to move to the right page.
  await createReadyAttachmentFromDrive(env.DB, {
    pageId: inboxPageId,
    fileName: file.name,
    extension: ext,
    mimeType: file.mimeType,
    sizeBytes: Number(file.size ?? 0),
    driveFileId: file.id,
    driveWebViewLink: file.webViewLink ?? null,
    checksum: file.md5Checksum ?? null,
    uploadedBy: systemUserId,
  });
  counters.added++;
}

export async function runDriveSync(env: Env, teamId: string, trigger: "manual" | "cron"): Promise<SyncResult> {
  const state = await getSyncState(env.DB, teamId);
  if (state?.status === "running") {
    return { status: "partial", filesAdded: 0, filesUpdated: 0, filesSkipped: 0, errorMessage: "이미 동기화가 진행 중입니다." };
  }

  await upsertSyncState(env.DB, teamId, { status: "running" });
  const logId = await createSyncLog(env.DB, teamId, trigger);
  const counters = { added: 0, updated: 0, skipped: 0 };

  try {
    const systemUser = await ensureSystemUser(env.DB);
    const inboxPageId = await ensureDriveInboxPage(env, teamId, systemUser.id);
    const folders = await getTeamFolderIds(env);

    if (!state?.last_page_token) {
      // First run: no changes-token yet, so do a full baseline listing of
      // the Attachments folder, then start tracking changes from now on.
      const startToken = await getStartPageToken(env);
      let pageToken: string | undefined;
      do {
        const page = await listFilesModifiedAfter(env, folders.Attachments, null, pageToken);
        for (const file of page.files) {
          await importOrUpdateFile(env, folders.Attachments, inboxPageId, systemUser.id, file, counters);
        }
        pageToken = page.nextPageToken;
      } while (pageToken);

      await upsertSyncState(env.DB, teamId, {
        status: "idle",
        last_synced_at: new Date().toISOString(),
        last_page_token: startToken,
      });
    } else {
      let token = state.last_page_token;
      let newToken: string | undefined;
      for (;;) {
        const result = await listChanges(env, token);
        for (const change of result.changes) {
          if (change.removed || !change.file) {
            const existing = await findByDriveFileId(env.DB, change.fileId);
            if (existing) {
              await softDeleteAttachment(env.DB, existing.id);
              counters.updated++;
            }
            continue;
          }
          await importOrUpdateFile(env, folders.Attachments, inboxPageId, systemUser.id, change.file, counters);
        }
        if (result.newStartPageToken) newToken = result.newStartPageToken;
        if (!result.nextPageToken) break;
        token = result.nextPageToken;
      }

      await upsertSyncState(env.DB, teamId, {
        status: "idle",
        last_synced_at: new Date().toISOString(),
        last_page_token: newToken ?? token,
      });
    }

    await finishSyncLog(env.DB, logId, {
      status: "success",
      filesAdded: counters.added,
      filesUpdated: counters.updated,
      filesSkipped: counters.skipped,
      errorMessage: null,
    });
    return { status: "success", filesAdded: counters.added, filesUpdated: counters.updated, filesSkipped: counters.skipped, errorMessage: null };
  } catch (err) {
    // Deliberately do NOT advance last_page_token on failure — the next
    // run (manual or cron) retries from the same cursor.
    await upsertSyncState(env.DB, teamId, { status: "failed" });
    const message = err instanceof Error ? err.message : "unknown_error";
    await finishSyncLog(env.DB, logId, {
      status: "failed",
      filesAdded: counters.added,
      filesUpdated: counters.updated,
      filesSkipped: counters.skipped,
      errorMessage: message.slice(0, 500),
    });
    return { status: "failed", filesAdded: counters.added, filesUpdated: counters.updated, filesSkipped: counters.skipped, errorMessage: message };
  }
}
