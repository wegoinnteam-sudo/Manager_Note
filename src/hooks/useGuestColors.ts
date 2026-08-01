import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";

// Name -> color map for calendar author color-coding (see
// src/lib/authorColors.ts for why this is keyed by guest display name
// instead of the shared account id). Mirrors useTeamMembers's
// fetch-once-with-refresh pattern.
export function useGuestColors() {
  const [colors, setColors] = useState<Record<string, string>>({});
  const refresh = useCallback(async () => {
    const { colors: rows } = await api.listGuestColors();
    setColors(Object.fromEntries(rows.map((r) => [r.name, r.color])));
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);
  return { colors, refresh };
}
