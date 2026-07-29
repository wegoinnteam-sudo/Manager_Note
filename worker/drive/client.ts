import type { Env } from "../types";
import { getDriveAccessToken } from "./auth";
import { Errors } from "../lib/errors";

const DRIVE_FILES_URL = "https://www.googleapis.com/drive/v3/files";
const DRIVE_UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files";

export interface DriveFileMeta {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime: string;
  md5Checksum?: string;
  webViewLink?: string;
  trashed?: boolean;
  parents?: string[];
  hasThumbnail?: boolean;
  thumbnailLink?: string;
}

function driveQuery(env: Env, extra: Record<string, string> = {}): URLSearchParams {
  const params = new URLSearchParams(extra);
  if (env.GOOGLE_DRIVE_SHARED_DRIVE_ID) {
    params.set("supportsAllDrives", "true");
  }
  return params;
}

async function authHeader(env: Env): Promise<Record<string, string>> {
  const token = await getDriveAccessToken(env);
  return { Authorization: `Bearer ${token}` };
}

/**
 * Starts a resumable upload session and streams the request body straight
 * through to Google Drive without buffering the whole file in Worker
 * memory. `sizeBytes` must be known up front (we validate it before
 * calling this) since Drive's resumable endpoint wants Content-Length.
 */
export async function uploadFileStreaming(
  env: Env,
  params: {
    name: string;
    mimeType: string;
    parentFolderId: string;
    sizeBytes: number;
    body: ReadableStream<Uint8Array> | ArrayBuffer;
  },
): Promise<DriveFileMeta> {
  const headers = await authHeader(env);

  const startRes = await fetch(`${DRIVE_UPLOAD_URL}?${driveQuery(env, { uploadType: "resumable" }).toString()}`, {
    method: "POST",
    headers: {
      ...headers,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": params.mimeType,
      "X-Upload-Content-Length": String(params.sizeBytes),
    },
    body: JSON.stringify({ name: params.name, parents: [params.parentFolderId] }),
  });
  if (!startRes.ok) {
    throw Errors.upstream(`Drive 업로드 세션 생성 실패 (${startRes.status})`);
  }
  const uploadUrl = startRes.headers.get("Location");
  if (!uploadUrl) throw Errors.upstream("Drive 업로드 세션 URL을 받지 못했습니다.");

  const putRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": params.mimeType,
      "Content-Length": String(params.sizeBytes),
    },
    body: params.body,
  });
  if (!putRes.ok) {
    throw Errors.upstream(`Drive 파일 업로드 실패 (${putRes.status})`);
  }
  return (await putRes.json()) as DriveFileMeta;
}

/** Streams the raw file bytes back from Drive without buffering in the Worker. */
export async function getFileMediaStream(env: Env, fileId: string): Promise<Response> {
  const headers = await authHeader(env);
  const res = await fetch(
    `${DRIVE_FILES_URL}/${encodeURIComponent(fileId)}?${driveQuery(env, { alt: "media" }).toString()}`,
    { headers },
  );
  if (!res.ok) {
    throw Errors.upstream(`Drive 파일 다운로드 실패 (${res.status})`);
  }
  return res;
}

/** Fetches Drive's generated thumbnail without exposing its short-lived private URL to the browser. */
export async function getFileThumbnailStream(env: Env, fileId: string): Promise<Response> {
  const headers = await authHeader(env);
  const metadataRes = await fetch(
    `${DRIVE_FILES_URL}/${encodeURIComponent(fileId)}?${driveQuery(env, { fields: "hasThumbnail,thumbnailLink" }).toString()}`,
    { headers },
  );
  if (!metadataRes.ok) {
    throw Errors.upstream(`Drive 미리보기 정보 조회 실패 (${metadataRes.status})`);
  }

  const metadata = (await metadataRes.json()) as Pick<DriveFileMeta, "hasThumbnail" | "thumbnailLink">;
  if (!metadata.hasThumbnail || !metadata.thumbnailLink) {
    throw Errors.notFound("아직 PowerPoint 미리보기 이미지가 준비되지 않았습니다.");
  }

  const thumbnailRes = await fetch(metadata.thumbnailLink, { headers });
  if (!thumbnailRes.ok) {
    throw Errors.upstream(`Drive 미리보기 이미지 조회 실패 (${thumbnailRes.status})`);
  }
  return thumbnailRes;
}

export async function getFileMetadata(env: Env, fileId: string, fields = "id,name,mimeType,size,modifiedTime,md5Checksum,webViewLink,trashed,parents"): Promise<DriveFileMeta> {
  const headers = await authHeader(env);
  const res = await fetch(
    `${DRIVE_FILES_URL}/${encodeURIComponent(fileId)}?${driveQuery(env, { fields }).toString()}`,
    { headers },
  );
  if (!res.ok) throw Errors.upstream(`Drive 파일 정보 조회 실패 (${res.status})`);
  return (await res.json()) as DriveFileMeta;
}

export async function moveFile(
  env: Env,
  fileId: string,
  params: { addParent: string; removeParent?: string },
): Promise<void> {
  const headers = await authHeader(env);
  const q = driveQuery(env, { addParents: params.addParent });
  if (params.removeParent) q.set("removeParents", params.removeParent);
  const res = await fetch(`${DRIVE_FILES_URL}/${encodeURIComponent(fileId)}?${q.toString()}`, {
    method: "PATCH",
    headers: { ...headers, "Content-Type": "application/json" },
    body: "{}",
  });
  if (!res.ok) throw Errors.upstream(`Drive 파일 이동 실패 (${res.status})`);
}

export async function deleteFilePermanently(env: Env, fileId: string): Promise<void> {
  const headers = await authHeader(env);
  const res = await fetch(`${DRIVE_FILES_URL}/${encodeURIComponent(fileId)}?${driveQuery(env).toString()}`, {
    method: "DELETE",
    headers,
  });
  if (!res.ok && res.status !== 404) throw Errors.upstream(`Drive 파일 삭제 실패 (${res.status})`);
}

export async function findOrCreateSubfolder(env: Env, parentFolderId: string, name: string): Promise<string> {
  const headers = await authHeader(env);
  const q = driveQuery(env, {
    q: `'${parentFolderId}' in parents and name = '${escapeQ(name)}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: "files(id,name)",
  });
  if (env.GOOGLE_DRIVE_SHARED_DRIVE_ID) {
    q.set("includeItemsFromAllDrives", "true");
    q.set("corpora", "drive");
    q.set("driveId", env.GOOGLE_DRIVE_SHARED_DRIVE_ID);
  }
  const listRes = await fetch(`${DRIVE_FILES_URL}?${q.toString()}`, { headers });
  if (!listRes.ok) throw Errors.upstream(`Drive 폴더 조회 실패 (${listRes.status})`);
  const listJson = (await listRes.json()) as { files: { id: string; name: string }[] };
  if (listJson.files?.[0]) return listJson.files[0].id;

  const createRes = await fetch(`${DRIVE_FILES_URL}?${driveQuery(env).toString()}`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", parents: [parentFolderId] }),
  });
  if (!createRes.ok) throw Errors.upstream(`Drive 폴더 생성 실패 (${createRes.status})`);
  const created = (await createRes.json()) as { id: string };
  return created.id;
}

export interface ListFilesResult {
  files: DriveFileMeta[];
  nextPageToken?: string;
}

/** Fallback for the very first sync (no changes-token yet): list by modifiedTime. */
export async function listFilesModifiedAfter(
  env: Env,
  folderId: string,
  afterIso: string | null,
  pageToken?: string,
): Promise<ListFilesResult> {
  const headers = await authHeader(env);
  const qParts = [`'${folderId}' in parents`, "trashed = false"];
  if (afterIso) qParts.push(`modifiedTime > '${afterIso}'`);
  const q = driveQuery(env, {
    q: qParts.join(" and "),
    fields: "nextPageToken, files(id,name,mimeType,size,modifiedTime,md5Checksum,webViewLink,trashed,parents)",
    pageSize: "100",
  });
  if (pageToken) q.set("pageToken", pageToken);
  if (env.GOOGLE_DRIVE_SHARED_DRIVE_ID) {
    q.set("includeItemsFromAllDrives", "true");
    q.set("corpora", "drive");
    q.set("driveId", env.GOOGLE_DRIVE_SHARED_DRIVE_ID);
  }
  const res = await fetch(`${DRIVE_FILES_URL}?${q.toString()}`, { headers });
  if (!res.ok) throw Errors.upstream(`Drive 파일 목록 조회 실패 (${res.status})`);
  return (await res.json()) as ListFilesResult;
}

export async function getStartPageToken(env: Env): Promise<string> {
  const headers = await authHeader(env);
  const q = driveQuery(env);
  if (env.GOOGLE_DRIVE_SHARED_DRIVE_ID) q.set("driveId", env.GOOGLE_DRIVE_SHARED_DRIVE_ID);
  const res = await fetch(`https://www.googleapis.com/drive/v3/changes/startPageToken?${q.toString()}`, { headers });
  if (!res.ok) throw Errors.upstream(`Drive 변경 토큰 조회 실패 (${res.status})`);
  const json = (await res.json()) as { startPageToken: string };
  return json.startPageToken;
}

export interface DriveChange {
  fileId: string;
  removed: boolean;
  file?: DriveFileMeta;
}

export interface ListChangesResult {
  changes: DriveChange[];
  newStartPageToken?: string;
  nextPageToken?: string;
}

/** Incremental sync via Drive's Changes API — avoids re-listing the whole folder every run. */
export async function listChanges(env: Env, pageToken: string): Promise<ListChangesResult> {
  const headers = await authHeader(env);
  const q = driveQuery(env, {
    pageToken,
    fields: "newStartPageToken, nextPageToken, changes(fileId, removed, file(id,name,mimeType,size,modifiedTime,md5Checksum,webViewLink,trashed,parents))",
    pageSize: "100",
  });
  if (env.GOOGLE_DRIVE_SHARED_DRIVE_ID) {
    q.set("driveId", env.GOOGLE_DRIVE_SHARED_DRIVE_ID);
    q.set("includeItemsFromAllDrives", "true");
  }
  const res = await fetch(`https://www.googleapis.com/drive/v3/changes?${q.toString()}`, { headers });
  if (!res.ok) throw Errors.upstream(`Drive 변경 목록 조회 실패 (${res.status})`);
  return (await res.json()) as ListChangesResult;
}

function escapeQ(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}
