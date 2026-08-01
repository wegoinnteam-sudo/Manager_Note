// Types shared between the Worker API and the React frontend.
// Keep this file framework-agnostic (no DOM / Workers-only types).

export type Role = "admin" | "editor" | "viewer";

export type HandoffStatus = "in_progress" | "handoff_pending" | "done" | "on_hold";

export type UploadStatus = "pending" | "ready" | "failed";

// "Wegoinn DB" board categories — a fixed single-select property on pages,
// mirroring the team's existing Notion database structure.
export type PageCategory = string;

export interface PageCategoryDTO {
  key: PageCategory;
  label: string;
  color: string;
  orderKey: number;
}

// Column order on the "Wegoinn DB" board — matches the team's real Notion
// board layout (Reception, Cleaning, 운영(기타), Wegoinn 2.0, Marketing).
export const PAGE_CATEGORIES: PageCategory[] = ["reception", "cleaning", "operations", "wegoinn2", "marketing"];

export const CATEGORY_LABELS: Record<string, string> = {
  reception: "Reception",
  cleaning: "Cleaning",
  marketing: "Marketing",
  wegoinn2: "Wegoinn 2.0",
  operations: "운영(기타)",
};

export const CATEGORY_COLORS: Record<string, string> = {
  reception: "#2563eb",
  cleaning: "#16a34a",
  marketing: "#9333ea",
  wegoinn2: "#ea580c",
  operations: "#6b7280",
};

export const UNCATEGORIZED_LABEL = "카테고리 없음";
export const UNCATEGORIZED_COLOR = "#9ca3af";

// Known tag names get a fixed color; unrecognized tags fall back to a
// neutral chip so custom/free-form tags still render sensibly.
export const TAG_COLORS: Record<string, string> = {
  계약서: "#dc2626",
  견적서: "#2563eb",
  회의록: "#9333ea",
  템플릿: "#92400e",
  제안서: "#16a34a",
  정산: "#ca8a04",
  아이디어: "#6b7280",
};
export const DEFAULT_TAG_COLOR = "#6b7280";

export interface UserDTO {
  id: string;
  email: string;
  name: string;
  role: Role;
  avatarUrl: string | null;
  // Self-chosen color used to color-code this person's calendar schedules.
  // Null until they pick one in settings — callers fall back to a
  // deterministic per-id color (see src/lib/authorColors.ts).
  color: string | null;
}

export interface PageSummaryDTO {
  id: string;
  teamId: string;
  parentId: string | null;
  title: string;
  status: HandoffStatus;
  assigneeId: string | null;
  dueDate: string | null;
  // Calendar date-range fields. endDate defaults to dueDate (single-day
  // event) when unset — see CATEGORY_COLORS for how a page's category
  // doubles as its calendar color since this app has only one real team.
  endDate: string | null;
  startTime: string | null;
  endTime: string | null;
  allDay: boolean;
  createdBy: string;
  orderKey: number;
  version: number;
  openQuestionCount: number;
  isDeleted: boolean;
  updatedAt: string;
  updatedBy?: string;
  textColor: string | null;
  highlightColor: string | null;
  category: PageCategory | null;
  description: string | null;
  tags: string[];
}

export interface PageDetailDTO extends PageSummaryDTO {
  contentJson: PageContent;
  contentVersion: number;
  updatedBy: string;
  createdAt: string;
}

export type DatabaseViewProperty =
  | "status"
  | "category"
  | "description"
  | "tags"
  | "assigneeId"
  | "createdBy"
  | "dueDate"
  | "updatedAt"
  | "overdue"
  | "daysRemaining"
  | "subItems";

export interface DatabaseTemplate {
  id: string;
  name: string;
  title: string;
  status?: HandoffStatus;
  assigneeId?: string | null;
  dueDate?: string | null;
  content: PageContent;
}

export interface DatabaseViewFilter {
  field: DatabaseViewProperty;
  op: "eq" | "neq" | "contains" | "notContains" | "isEmpty" | "isNotEmpty";
  value?: string;
}

export interface DatabaseViewSort {
  field: "title" | DatabaseViewProperty | "updatedAt";
  direction: "asc" | "desc";
}

export type DatabaseViewGroupBy = "status" | "category" | "assigneeId" | "none";

// MVP block-based content model. Deliberately simple; extend with new
// block "type" values rather than redesigning the shape.
export type PageBlock = PageBlockVariant & { indent?: number };

type PageBlockVariant =
  | { id: string; type: "heading1" | "heading2" | "heading3" | "paragraph"; text: string }
  | { id: string; type: "bulleted_list_item" | "numbered_list_item"; text: string }
  | { id: string; type: "checklist_item"; text: string; checked: boolean }
  | { id: string; type: "divider" }
  | {
      id: string;
      type: "image";
      attachmentId?: string;
      url?: string;
      caption?: string;
      width?: number;
      align?: "left" | "center" | "right";
    }
  | { id: string; type: "file"; attachmentId: string }
  | { id: string; type: "toggle"; text: string; body: string; expanded: boolean }
  | { id: string; type: "callout"; text: string }
  | {
      id: string;
      type: "table";
      rows: string[][];
      colWidths?: number[];
      cellStyles?: Record<string, { color?: string; bg?: string; fontSize?: "sm" | "md" | "lg" }>;
    }
  | { id: string; type: "embed"; url: string }
  | { id: string; type: "bookmark"; url: string }
  | { id: string; type: "toc" }
  | { id: string; type: "page_link"; pageId: string }
  | { id: string; type: "columns"; columns: string[] }
  | {
      id: string;
      type: "database_view";
      view: "table" | "board" | "gallery" | "calendar" | "timeline" | "chart" | "list";
      name?: string;
      properties?: DatabaseViewProperty[];
      filter?: DatabaseViewFilter | null;
      sort?: DatabaseViewSort | null;
      groupBy?: DatabaseViewGroupBy;
      sourcePageId?: string;
      locked?: boolean;
      templates?: DatabaseTemplate[];
      showSubItems?: boolean;
      calendarSize?: number;
      calendarWidth?: number;
      calendarOffset?: number;
    }
  | { id: string; type: "chart" }
  | {
      id: string;
      type: "button";
      label: string;
      templateKey: "meeting_notes" | "handoff_note" | "emergency_manual" | "group_contract" | "room_repair" | "event_report";
    }
  | { id: string; type: "form"; formKey: "leave_request" | "repair_request" | "purchase_request" }
  | { id: string; type: "quote"; text: string }
  | { id: string; type: "code"; text: string; language?: string }
  | { id: string; type: "equation"; text: string }
  | { id: string; type: "secret"; label: string }
  | { id: string; type: "breadcrumb" };

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

export interface InlineQuestionDTO {
  id: string;
  pageId: string;
  blockId: string | null;
  blockLabel: string | null;
  authorId: string;
  authorName: string;
  body: string;
  status: "open" | "resolved";
  resolvedByName: string | null;
  resolvedAt: string | null;
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
  color: string | null;
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
  "ppt",
  "pptx",
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
  "mp4",
  "mov",
  "webm",
  "mp3",
  "wav",
  "m4a",
  "ogg",
] as const;

export type AllowedUploadExtension = (typeof ALLOWED_UPLOAD_EXTENSIONS)[number];

export const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp"]);
