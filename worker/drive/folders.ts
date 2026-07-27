import type { Env } from "../types";
import { findOrCreateSubfolder } from "./client";
import { Errors } from "../lib/errors";

const SUBFOLDER_NAMES = ["Pages", "Attachments", "Archive", "Deleted", "Backup"] as const;
export type SubfolderName = (typeof SUBFOLDER_NAMES)[number];

// Per-isolate cache of resolved subfolder IDs, keyed by root folder id.
const cache = new Map<string, Record<SubfolderName, string>>();

export async function getTeamFolderIds(env: Env): Promise<Record<SubfolderName, string>> {
  const root = env.GOOGLE_DRIVE_FOLDER_ID;
  if (!root) {
    throw Errors.internal("GOOGLE_DRIVE_FOLDER_ID가 설정되지 않았습니다.");
  }
  const cached = cache.get(root);
  if (cached) return cached;

  const entries = await Promise.all(
    SUBFOLDER_NAMES.map(async (name) => [name, await findOrCreateSubfolder(env, root, name)] as const),
  );
  const result = Object.fromEntries(entries) as Record<SubfolderName, string>;
  cache.set(root, result);
  return result;
}
