import { Hono } from "hono";
import { z } from "zod";
import type { AppBindings } from "../types";
import type { PageCategory } from "../../shared/types";
import { requireRole } from "../middleware/rbac";
import { inviteUser, listUsers, setUserActive, updateUserRole } from "../db/users";
import { toUserDTO } from "../lib/dto";
import { logActivity } from "../db/activityLog";
import { Errors } from "../lib/errors";
import { createPage, listPages } from "../db/pages";

export const adminRoute = new Hono<AppBindings>();

adminRoute.use("*", requireRole("admin"));

adminRoute.get("/users", async (c) => {
  const rows = await listUsers(c.env.DB);
  return c.json({ users: rows.map(toUserDTO) });
});

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "editor", "viewer"]).default("viewer"),
});

adminRoute.post("/users/invite", async (c) => {
  const body = inviteSchema.parse(await c.req.json());
  const user = await inviteUser(c.env.DB, body.email, body.role);
  await logActivity(c.env.DB, {
    teamId: c.var.teamId,
    pageId: null,
    actorId: c.var.user!.id,
    action: "user.invited",
    metadata: { email: body.email, role: body.role },
  });
  return c.json(toUserDTO(user), 201);
});

const roleSchema = z.object({ role: z.enum(["admin", "editor", "viewer"]) });

adminRoute.patch("/users/:id/role", async (c) => {
  const body = roleSchema.parse(await c.req.json());
  if (c.req.param("id") === c.var.user!.id && body.role !== "admin") {
    throw Errors.badRequest("본인의 관리자 권한은 스스로 낮출 수 없습니다.");
  }
  await updateUserRole(c.env.DB, c.req.param("id"), body.role);
  await logActivity(c.env.DB, {
    teamId: c.var.teamId,
    pageId: null,
    actorId: c.var.user!.id,
    action: "user.role_changed",
    metadata: { userId: c.req.param("id"), role: body.role },
  });
  return c.json({ ok: true });
});

const activeSchema = z.object({ isActive: z.boolean() });

adminRoute.patch("/users/:id/active", async (c) => {
  const body = activeSchema.parse(await c.req.json());
  if (c.req.param("id") === c.var.user!.id) {
    throw Errors.badRequest("본인 계정은 스스로 비활성화할 수 없습니다.");
  }
  await setUserActive(c.env.DB, c.req.param("id"), body.isActive);
  return c.json({ ok: true });
});

// Fixed initial "Wegoinn DB" board content — mirrors the team's existing
// Notion database structure/categories one-for-one (see project docs for
// the full spec). Deliberately just titles/categories/tags for now; the
// deep per-page content (규정 문서, 매뉴얼, 계약서 하위 페이지 등) is a
// separate follow-up pass, not seeded here.
const SEED_PAGES: { title: string; category: PageCategory; tags?: string[] }[] = [
  // Cleaning
  { title: "더티스컹크 단가표", category: "cleaning", tags: ["견적서"] },
  { title: "린넨 견적서", category: "cleaning", tags: ["견적서"] },
  { title: "건조기 청소", category: "cleaning" },
  { title: "린넨스토리", category: "cleaning" },
  { title: "서울구수", category: "cleaning" },
  // Reception
  { title: "인보이스(고객용)", category: "reception", tags: ["템플릿"] },
  { title: "구수 서울 조식", category: "reception" },
  { title: "출력물", category: "reception" },
  { title: "리셉션 메뉴얼", category: "reception" },
  { title: "단체예약 명단", category: "reception" },
  { title: "리셉션 연락망", category: "reception" },
  // 운영(기타)
  { title: "사업자등록증", category: "operations" },
  { title: "보고서", category: "operations" },
  { title: "단체 계약 내용", category: "operations", tags: ["계약서"] },
  { title: "위고인 규정", category: "operations" },
  { title: "Application/app", category: "operations" },
  { title: "주차 등록차량", category: "operations" },
  { title: "객실 수리", category: "operations" },
  { title: "Wegoinn Issue", category: "operations" },
  { title: "비상시 매뉴얼", category: "operations" },
  // Wegoinn 2.0
  { title: "Pinterest", category: "wegoinn2" },
  { title: "창천동 도면", category: "wegoinn2" },
  { title: "신규호스텔 사진", category: "wegoinn2" },
  { title: "예상 공유 숫자놀이", category: "wegoinn2" },
  // Marketing
  { title: "설렌타인 이벤트", category: "marketing" },
];

adminRoute.post("/seed-wegoinn-db", async (c) => {
  const user = c.var.user!;
  const existing = await listPages(c.env.DB, c.var.teamId);
  const existingRoot = new Set(existing.filter((p) => !p.parent_id && !p.is_deleted).map((p) => p.title));

  const created: string[] = [];
  const skipped: string[] = [];
  for (const item of SEED_PAGES) {
    if (existingRoot.has(item.title)) {
      skipped.push(item.title);
      continue;
    }
    const { page } = await createPage(c.env.DB, {
      teamId: c.var.teamId,
      parentId: null,
      title: item.title,
      createdBy: user.id,
      category: item.category,
      tags: item.tags,
    });
    created.push(page.title);
  }

  if (created.length > 0) {
    await logActivity(c.env.DB, {
      teamId: c.var.teamId,
      pageId: null,
      actorId: user.id,
      action: "wegoinn_db.seeded",
      metadata: { created: created.length, skipped: skipped.length },
    });
  }

  return c.json({ created, skipped });
});
