import type {
  UserDTO,
  PageSummaryDTO,
  PageDetailDTO,
  AttachmentDTO,
  CommentDTO,
  StatusHistoryDTO,
  PageContent,
  HandoffStatus,
  Role,
  TeamMemberDTO,
  InlineQuestionDTO,
  PageCategory,
  PageCategoryDTO,
} from "@shared/types";

export class ApiClientError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? "GET").toUpperCase();
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && init.body && typeof init.body === "string") {
    headers.set("Content-Type", "application/json");
  }
  if (method !== "GET" && method !== "HEAD") {
    const csrf = readCookie("th_csrf");
    if (csrf) headers.set("X-CSRF-Token", csrf);
  }

  const res = await fetch(path, { ...init, method, headers, credentials: "include" });
  if (res.status === 204) return undefined as T;

  const isJson = res.headers.get("content-type")?.includes("application/json");
  const body = isJson ? await res.json().catch(() => null) : null;

  if (!res.ok) {
    throw new ApiClientError(res.status, body?.error ?? "error", body?.message ?? `요청 실패 (${res.status})`);
  }
  return body as T;
}

export const api = {
  me: () => request<UserDTO>("/api/me"),
  logout: () => request<{ ok: true }>("/api/auth/logout", { method: "POST" }),

  listPages: (opts: { trash?: boolean } = {}) =>
    request<{ pages: PageSummaryDTO[] }>(`/api/pages${opts.trash ? "?trash=1" : ""}`),
  listPageCategories: () => request<{ categories: PageCategoryDTO[] }>("/api/page-categories"),
  createPageCategory: (label: string, color: string) =>
    request<PageCategoryDTO>("/api/page-categories", { method: "POST", body: JSON.stringify({ label, color }) }),
  deletePageCategory: (key: string) => request<{ ok: true }>(`/api/page-categories/${encodeURIComponent(key)}`, { method: "DELETE" }),
  reorderPageCategories: (keys: string[]) =>
    request<{ ok: true }>("/api/page-categories/reorder", { method: "PATCH", body: JSON.stringify({ keys }) }),
  createPage: (input: {
    parentId?: string | null;
    title?: string;
    category?: PageCategory | null;
    description?: string | null;
    tags?: string[];
    orderKey?: number;
  }) => request<PageDetailDTO>("/api/pages", { method: "POST", body: JSON.stringify(input) }),
  getPage: (id: string) => request<PageDetailDTO>(`/api/pages/${id}`),
  updatePageMeta: (
    id: string,
    input: {
      expectedVersion: number;
      title?: string;
      status?: HandoffStatus;
      assigneeId?: string | null;
      dueDate?: string | null;
      endDate?: string | null;
      startTime?: string | null;
      endTime?: string | null;
      allDay?: boolean;
      tags?: string[];
      parentId?: string | null;
      orderKey?: number;
      textColor?: string | null;
      highlightColor?: string | null;
      category?: PageCategory | null;
      description?: string | null;
    },
  ) => request<PageDetailDTO>(`/api/pages/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
  updatePageContent: (id: string, expectedVersion: number, content: PageContent) =>
    request<PageDetailDTO>(`/api/pages/${id}/content`, {
      method: "PATCH",
      body: JSON.stringify({ expectedVersion, content }),
    }),
  deletePage: (id: string) => request<{ ok: true }>(`/api/pages/${id}`, { method: "DELETE" }),
  restorePage: (id: string) => request<{ ok: true }>(`/api/pages/${id}/restore`, { method: "POST" }),

  getSecretValue: (pageId: string, blockId: string) =>
    request<{ value: string }>(`/api/pages/${pageId}/secrets/${blockId}`),
  setSecretValue: (pageId: string, blockId: string, value: string) =>
    request<{ ok: true }>(`/api/pages/${pageId}/secrets/${blockId}`, { method: "PUT", body: JSON.stringify({ value }) }),

  listAttachments: (pageId: string) => request<{ attachments: AttachmentDTO[] }>(`/api/pages/${pageId}/attachments`),
  deleteAttachment: (id: string) => request<{ ok: true }>(`/api/attachments/${id}`, { method: "DELETE" }),

  listComments: (pageId: string) => request<{ comments: CommentDTO[] }>(`/api/pages/${pageId}/comments`),
  createComment: (pageId: string, body: string, authorName?: string) =>
    request<CommentDTO>(`/api/pages/${pageId}/comments`, { method: "POST", body: JSON.stringify({ body, authorName }) }),

  listQuestions: (pageId: string) =>
    request<{ questions: InlineQuestionDTO[] }>(`/api/pages/${pageId}/questions`),
  createQuestion: (pageId: string, input: { body: string; blockId?: string | null; blockLabel?: string | null }) =>
    request<{ id: string }>(`/api/pages/${pageId}/questions`, { method: "POST", body: JSON.stringify(input) }),
  setQuestionResolved: (pageId: string, questionId: string, resolved: boolean) =>
    request<{ ok: true }>(`/api/pages/${pageId}/questions/${questionId}`, {
      method: "PATCH",
      body: JSON.stringify({ resolved }),
    }),
  getOnboardingProgress: (pageId: string) =>
    request<{ completedBlockIds: string[] }>(`/api/pages/${pageId}/onboarding-progress`),
  setOnboardingProgress: (pageId: string, blockId: string, completed: boolean) =>
    request<{ ok: true }>(`/api/pages/${pageId}/onboarding-progress`, {
      method: "PUT",
      body: JSON.stringify({ blockId, completed }),
    }),

  listHistory: (pageId: string) => request<{ history: StatusHistoryDTO[] }>(`/api/pages/${pageId}/history`),

  listTeamMembers: () => request<{ members: TeamMemberDTO[] }>("/api/team/members"),

  search: (q: string) => request<{ pages: PageSummaryDTO[]; attachments: AttachmentDTO[] }>(`/api/search?q=${encodeURIComponent(q)}`),

  driveSync: () => request<{ status: string; filesAdded: number; filesUpdated: number; filesSkipped: number; errorMessage: string | null }>(
    "/api/drive/sync",
    { method: "POST" },
  ),
  driveSyncStatus: () => request<{ state: unknown; logs: unknown[] }>("/api/drive/sync/status"),

  adminListUsers: () => request<{ users: UserDTO[] }>("/api/admin/users"),
  adminInvite: (email: string, role: Role) =>
    request<UserDTO>("/api/admin/users/invite", { method: "POST", body: JSON.stringify({ email, role }) }),
  adminSetRole: (id: string, role: Role) =>
    request<{ ok: true }>(`/api/admin/users/${id}/role`, { method: "PATCH", body: JSON.stringify({ role }) }),
  adminSetActive: (id: string, isActive: boolean) =>
    request<{ ok: true }>(`/api/admin/users/${id}/active`, { method: "PATCH", body: JSON.stringify({ isActive }) }),
  adminSeedWegoinnDb: () =>
    request<{ created: string[]; skipped: string[] }>("/api/admin/seed-wegoinn-db", { method: "POST" }),
  adminSeedWegoinnDbContent: () =>
    request<{ pagesCreated: number; contentFilled: number }>("/api/admin/seed-wegoinn-db-content", { method: "POST" }),
};

/**
 * Uploads a single file with progress reporting via XHR (fetch has no
 * upload-progress event). Streams from the browser's perspective; the
 * Worker on the other end streams it straight through to Drive/R2.
 */
export function uploadAttachment(
  pageId: string,
  file: File,
  opts: { idempotencyKey: string; onProgress?: (pct: number) => void; signal?: AbortSignal },
): Promise<AttachmentDTO> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/pages/${pageId}/attachments`);
    xhr.withCredentials = true;
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.setRequestHeader("X-File-Name", encodeURIComponent(file.name));
    xhr.setRequestHeader("X-Idempotency-Key", opts.idempotencyKey);
    const csrf = readCookie("th_csrf");
    if (csrf) xhr.setRequestHeader("X-CSRF-Token", csrf);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && opts.onProgress) opts.onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      let body: any = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        /* ignore */
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(body as AttachmentDTO);
      } else {
        reject(new ApiClientError(xhr.status, body?.error ?? "error", body?.message ?? "업로드에 실패했습니다."));
      }
    };
    xhr.onerror = () => reject(new ApiClientError(0, "network_error", "네트워크 오류로 업로드에 실패했습니다."));
    xhr.onabort = () => reject(new ApiClientError(0, "aborted", "업로드가 취소되었습니다."));
    if (opts.signal) {
      opts.signal.addEventListener("abort", () => xhr.abort());
    }
    xhr.send(file);
  });
}
