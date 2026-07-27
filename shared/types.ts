// Types shared between the Worker API and the React frontend.
// Keep this file framework-agnostic (no DOM / Workers-only types).

export type Role = "admin" | "editor" | "viewer";

export type HandoffStatus = "in_progress" | "handoff_pending" | "done" | "on_hold";

export type UploadStatus = "pending" | "ready" | "failed";

export interface UserDTO {
  id: string;
  email: string;
  name: string;
  role: Role;
  avatarUrl: string | null;
}

export interface PageSummaryDTO {
  id: string;
  teamId: string;
  parentId: string | null;
  title: string;
  status: HandoffStatus;
  assigneeId: string | null;
  dueDate: string | null;
  orderKey: number;
  isDeleted: boolean;
  updatedAt: string;
}

export interface PageDetailDTO extends PageSummaryDTO {
  contentJson: PageContent;
  tags: string[];
  version: number;
  contentVersion: number;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
}

// MVP block-based content model. Deliberately simple; extend with new
// block "type" values rather than redesigning the shape.
export type PageBlock =
  | { id: string; type: "heading1" | "heading2" | "heading3" | "paragraph"; text: string }
  | { id: string; type: "bulleted_list_item" | "numbered_list_item"; text: string }
  | { id: string; type: "checklist_item"; text: string; checked: boolean }
  | { id: string; type: "divider" }
  | { id: string; type: "image"; attachmentId: string }
  | { id: string; type: "file"; attachmentId: string };

export interface PageContent {
  blocks: PageBlock[];
}

export interface AttachmentDTO {
  id: string;
  pageId: string;
  fileName: string;
  extension: string;
  mimeType: string;
  sizeBytes: number;
  status: UploadStatus;
  driveFileId: string | null;
  checksum: string | null;
  uploadedBy: string;
  createdAt: string;
  isImage: boolean;
}

export interface CommentDTO {
  id: string;
  pageId: string;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string;
}

export interface StatusHistoryDTO {
  id: string;
  pageId: string;
  fromStatus: HandoffStatus | null;
  toStatus: HandoffStatus;
  changedBy: string;
  changedAt: string;
}

export interface TeamMemberDTO {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  role: Role;
}

export interface ApiError {
  error: string;
  message: string;
}

export const MAX_TITLE_LENGTH = 300;
export const UNTITLED_PAGE_TITLE = "제목 없음";

export const ALLOWED_UPLOAD_EXTENSIONS = [
  "pdf",
  "xls",
  "xlsx",
  "doc",
  "docx",
  "hwp",
  "hwpx",
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "txt",
  "csv",
  "zip",
] as const;

export type AllowedUploadExtension = (typeof ALLOWED_UPLOAD_EXTENSIONS)[number];

export const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp"]);
