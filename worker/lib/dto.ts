import type { PageRow, PageContentRow } from "../db/pages";
import type { AttachmentRow } from "../db/attachments";
import type { CommentRow } from "../db/comments";
import type { StatusHistoryRow } from "../db/statusHistory";
import type { UserRow } from "../db/users";
import type {
  PageSummaryDTO,
  PageDetailDTO,
  AttachmentDTO,
  CommentDTO,
  StatusHistoryDTO,
  UserDTO,
  PageContent,
  PageCategory,
} from "../../shared/types";
import { IMAGE_EXTENSIONS } from "../../shared/types";

export function toUserDTO(row: UserRow): UserDTO {
  return { id: row.id, email: row.email, name: row.name, role: row.role, avatarUrl: row.avatar_url };
}

export function toPageSummaryDTO(row: PageRow): PageSummaryDTO {
  return {
    id: row.id,
    teamId: row.team_id,
    parentId: row.parent_id,
    title: row.title,
    status: row.status,
    assigneeId: row.assignee_id,
    dueDate: row.due_date,
    endDate: row.end_date,
    startTime: row.start_time,
    endTime: row.end_time,
    allDay: !!row.all_day,
    createdBy: row.created_by,
    orderKey: row.order_key,
    version: row.version,
    openQuestionCount: row.open_question_count ?? 0,
    isDeleted: !!row.is_deleted,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
    textColor: row.text_color,
    highlightColor: row.highlight_color,
    category: (row.category as PageCategory | null) ?? null,
    description: row.description,
    tags: safeParseTags(row.tags),
  };
}

export function toPageDetailDTO(page: PageRow, content: PageContentRow): PageDetailDTO {
  let parsed: PageContent;
  try {
    parsed = JSON.parse(content.content_json);
  } catch {
    parsed = { blocks: [] };
  }
  return {
    ...toPageSummaryDTO(page),
    contentJson: parsed,
    version: page.version,
    contentVersion: content.version,
    updatedBy: page.updated_by,
    createdAt: page.created_at,
  };
}

function safeParseTags(raw: string): string[] {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function toAttachmentDTO(row: AttachmentRow): AttachmentDTO {
  return {
    id: row.id,
    pageId: row.page_id,
    fileName: row.file_name,
    extension: row.extension,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    status: row.status,
    driveFileId: row.drive_file_id,
    checksum: row.checksum,
    uploadedBy: row.uploaded_by,
    createdAt: row.created_at,
    isImage: IMAGE_EXTENSIONS.has(row.extension.toLowerCase()),
  };
}

export function toCommentDTO(row: CommentRow): CommentDTO {
  return {
    id: row.id,
    pageId: row.page_id,
    authorId: row.author_id,
    authorName: row.author_name,
    body: row.body,
    createdAt: row.created_at,
  };
}

export function toStatusHistoryDTO(row: StatusHistoryRow): StatusHistoryDTO {
  return {
    id: row.id,
    pageId: row.page_id,
    fromStatus: row.from_status,
    toStatus: row.to_status,
    changedBy: row.changed_by,
    changedAt: row.changed_at,
  };
}
