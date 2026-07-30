import { useCallback, useEffect, useState } from "react";
import type { PageCategoryDTO } from "@shared/types";
import { api } from "@/lib/api";

export function usePageCategories() {
  const [categories, setCategories] = useState<PageCategoryDTO[]>([]);

  const refresh = useCallback(async () => {
    const result = await api.listPageCategories();
    setCategories(result.categories);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { categories, refresh };
}
