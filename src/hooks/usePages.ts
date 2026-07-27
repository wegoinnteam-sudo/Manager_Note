import { useCallback, useEffect, useState } from "react";
import type { PageSummaryDTO } from "@shared/types";
import { api } from "@/lib/api";

export function usePages() {
  const [pages, setPages] = useState<PageSummaryDTO[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const { pages: rows } = await api.listPages();
      setPages(rows);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { pages, loading, refresh, setPages };
}

export interface PageTreeNode {
  page: PageSummaryDTO;
  children: PageTreeNode[];
}

export function buildPageTree(pages: PageSummaryDTO[]): PageTreeNode[] {
  const byId = new Map<string, PageTreeNode>();
  pages.forEach((p) => byId.set(p.id, { page: p, children: [] }));
  const roots: PageTreeNode[] = [];
  pages.forEach((p) => {
    const node = byId.get(p.id)!;
    if (p.parentId && byId.has(p.parentId)) {
      byId.get(p.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  });
  const sortByOrder = (nodes: PageTreeNode[]) => {
    nodes.sort((a, b) => a.page.orderKey - b.page.orderKey);
    nodes.forEach((n) => sortByOrder(n.children));
  };
  sortByOrder(roots);
  return roots;
}
