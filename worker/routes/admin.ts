import { Hono } from "hono";
import { z } from "zod";
import type { AppBindings } from "../types";
import type { PageCategory } from "../../shared/types";
import { requireAuth } from "../middleware/rbac";
import { inviteUser, listUsers, setUserActive, updateUserRole } from "../db/users";
import { toUserDTO } from "../lib/dto";
import { logActivity } from "../db/activityLog";
import { Errors } from "../lib/errors";
import { createPage, getPageContent, listPages, updatePageContent, updatePageMeta, type PageRow } from "../db/pages";
import { WEGOINN_DB_CONTENT, type ContentSeedNode } from "../data/wegoinnDbContent";

export const adminRoute = new Hono<AppBindings>();

// Any logged-in team member may view/invite/change roles here — opened up
// at the user's explicit request so the whole team can self-serve without
// needing a separate admin promotion step first.
adminRoute.use("/users", requireAuth);
adminRoute.use("/users/*", requireAuth);

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

// Fixed initial "Wegoinn DB" board content — mirrors the team's real Notion
// database one-for-one: 25 real items across the 5 board categories, with
// the card-facing title/category/tags/description/dueDate metadata here and
// the full body content in `../data/wegoinnDbContent.ts`. Re-running the
// seed endpoints is always safe: existing pages are matched by exact title
// and updated in place rather than duplicated.
const SEED_PAGES: { title: string; category: PageCategory; description: string; tags?: string[]; dueDate?: string }[] = [
  // Cleaning
  { title: "더티스컹크 단가표", category: "cleaning", tags: ["견적서"], description: "" },
  { title: "린넨 견적서", category: "cleaning", tags: ["견적서"], description: "" },
  { title: "건조기 청소", category: "cleaning", description: "" },
  { title: "린넨스토리", category: "cleaning", description: "" },
  { title: "서울구수", category: "cleaning", description: "" },
  // Reception
  { title: "인보이스(고객용)", category: "reception", tags: ["템플릿"], description: "" },
  { title: "구수 서울 조식", category: "reception", description: "" },
  { title: "출력물", category: "reception", tags: ["템플릿"], description: "" },
  { title: "리셉션 메뉴얼", category: "reception", tags: ["템플릿"], description: "" },
  { title: "단체예약 명단", category: "reception", tags: ["템플릿"], description: "" },
  { title: "리셉션 연락망", category: "reception", description: "" },
  // 운영(기타)
  { title: "사업자등록증", category: "operations", description: "" },
  { title: "보고서", category: "operations", tags: ["회의록"], description: "" },
  { title: "단체 계약 내용", category: "operations", tags: ["계약서"], description: "" },
  { title: "위고인 규정", category: "operations", description: "" },
  { title: "Application/app", category: "operations", description: "" },
  { title: "주차 등록차량", category: "operations", description: "" },
  { title: "객실 수리", category: "operations", description: "" },
  { title: "Wegoinn Issue", category: "operations", description: "" },
  { title: "비상시 매뉴얼", category: "operations", tags: ["템플릿"], description: "" },
  // Wegoinn 2.0
  { title: "Pinterest", category: "wegoinn2", tags: ["아이디어"], description: "" },
  { title: "창천동 도면", category: "wegoinn2", description: "" },
  { title: "신규호스텔 사진", category: "wegoinn2", tags: ["아이디어"], description: "" },
  {
    title: "예상 공유 숫자놀이",
    category: "wegoinn2",
    tags: ["회의록", "아이디어"],
    description: "",
    dueDate: "2025-05-27",
  },
  // Marketing
  {
    title: "설렌타인 이벤트",
    category: "marketing",
    tags: ["아이디어", "정산"],
    description: "",
    dueDate: "2026-02-14",
  },
];

adminRoute.post("/seed-wegoinn-db", requireAuth, async (c) => {
  const user = c.var.user!;
  const existing = await listPages(c.env.DB, c.var.teamId);
  const existingRootByTitle = new Map(existing.filter((p) => !p.parent_id && !p.is_deleted).map((p) => [p.title, p]));

  const created: string[] = [];
  const updated: string[] = [];
  const skipped: string[] = [];
  for (const item of SEED_PAGES) {
    const row = existingRootByTitle.get(item.title);
    if (row) {
      const currentTags: string[] = JSON.parse(row.tags || "[]");
      const nextTags = item.tags ?? [];
      const metaMatches =
        row.category === item.category &&
        row.description === item.description &&
        (row.due_date ?? undefined) === item.dueDate &&
        JSON.stringify(currentTags) === JSON.stringify(nextTags);
      if (metaMatches) {
        skipped.push(item.title);
        continue;
      }
      await updatePageMeta(c.env.DB, {
        teamId: c.var.teamId,
        id: row.id,
        expectedVersion: row.version,
        updatedBy: user.id,
        patch: {
          category: item.category,
          tags: nextTags,
          description: item.description,
          dueDate: item.dueDate ?? null,
        },
      });
      updated.push(item.title);
      continue;
    }
    const { page } = await createPage(c.env.DB, {
      teamId: c.var.teamId,
      parentId: null,
      title: item.title,
      createdBy: user.id,
      category: item.category,
      tags: item.tags,
      description: item.description,
    });
    if (item.dueDate) {
      await updatePageMeta(c.env.DB, {
        teamId: c.var.teamId,
        id: page.id,
        expectedVersion: page.version,
        updatedBy: user.id,
        patch: { dueDate: item.dueDate },
      });
    }
    created.push(page.title);
  }

  if (created.length > 0 || updated.length > 0) {
    await logActivity(c.env.DB, {
      teamId: c.var.teamId,
      pageId: null,
      actorId: user.id,
      action: "wegoinn_db.seeded",
      metadata: { created: created.length, updated: updated.length, skipped: skipped.length },
    });
  }

  return c.json({ created, updated, skipped });
});

const seedMetaByTitle = new Map(SEED_PAGES.map((item) => [item.title, item]));

adminRoute.post("/seed-wegoinn-db-content", requireAuth, async (c) => {
  const user = c.var.user!;
  const rows = await listPages(c.env.DB, c.var.teamId);
  const byParentAndTitle = (parentId: string | null, title: string) =>
    rows.find((r) => r.parent_id === parentId && r.title === title && !r.is_deleted);

  let pagesCreated = 0;
  let contentFilled = 0;

  const ensureNode = async (node: ContentSeedNode, parentId: string | null): Promise<void> => {
    let target: PageRow | undefined = byParentAndTitle(parentId, node.title);

    if (!target) {
      // Top-level nodes (parentId === null) reuse Stage 1's category/tags so
      // this endpoint works even if the initial seed hasn't been run yet.
      const meta = parentId === null ? seedMetaByTitle.get(node.title) : undefined;
      const { page } = await createPage(c.env.DB, {
        teamId: c.var.teamId,
        parentId,
        title: node.title,
        createdBy: user.id,
        category: meta?.category,
        tags: meta?.tags,
        description: meta?.description,
      });
      rows.push(page);
      target = page;
      pagesCreated += 1;
      if (meta?.dueDate) {
        await updatePageMeta(c.env.DB, {
          teamId: c.var.teamId,
          id: page.id,
          expectedVersion: page.version,
          updatedBy: user.id,
          patch: { dueDate: meta.dueDate },
        });
      }
      if (node.blocks) {
        const content = await getPageContent(c.env.DB, page.id);
        if (content) {
          await updatePageContent(c.env.DB, {
            pageId: page.id,
            expectedVersion: content.version,
            content: { blocks: node.blocks },
            updatedBy: user.id,
          });
          contentFilled += 1;
        }
      }
    } else if (node.blocks) {
      // These 25 titles are a fixed, curated dataset (this exact seed script
      // is the only thing that writes them) — re-running always refreshes
      // the body to the latest authored content instead of only filling
      // still-empty pages, per the "update existing data in place" rule.
      const content = await getPageContent(c.env.DB, target.id);
      if (content) {
        await updatePageContent(c.env.DB, {
          pageId: target.id,
          expectedVersion: content.version,
          content: { blocks: node.blocks },
          updatedBy: user.id,
        });
        contentFilled += 1;
      }
    }

    if (node.children) {
      for (const child of node.children) {
        await ensureNode(child, target.id);
      }
    }
  };

  for (const node of WEGOINN_DB_CONTENT) {
    await ensureNode(node, null);
  }

  await logActivity(c.env.DB, {
    teamId: c.var.teamId,
    pageId: null,
    actorId: user.id,
    action: "wegoinn_db.content_seeded",
    metadata: { pagesCreated, contentFilled },
  });

  return c.json({ pagesCreated, contentFilled });
});
