import type { Env } from "../types";
import { findOrCreateSubfolder } from "./client";
import { Errors } from "../lib/errors";

const SUBFOLDER_NAMES = ["Pages", "Attachments", "Archive", "Deleted", "Backup"] as const;
export type SubfolderName = (typeof SUBFOLDER_NAMES)[number];

const cache = new Map<string, Promise<string>>();

export async function getTeamFolderId(env: Env, name: SubfolderName): Promise<string> {
  const root = env.GOOGLE_DRIVE_FOLDER_ID;
  if (!root) {
    throw Errors.internal("GOOGLE_DRIVE_FOLDER_ID가 설정되지 않았습니다.");
  }
  const key = JSON.stringify([root, env.GOOGLE_DRIVE_SHARED_DRIVE_ID, name]);
  const cached = cache.get(key);
  if (cached) return cached;

  const pending = findOrCreateSubfolder(env, root, name).catch((error: unknown) => {
    cache.delete(key);
    throw error;
  });
  cache.set(key, pending);
  return pending;
}

export async function getTeamFolderIds(env: Env): Promise<Record<SubfolderName, string>> {
  const entries = await Promise.all(
    SUBFOLDER_NAMES.map(async (name) => [name, await getTeamFolderId(env, name)] as const),
  );
  return Object.fromEntries(entries) as Record<SubfolderName, string>;
}
