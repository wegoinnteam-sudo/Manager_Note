import { useCallback, useEffect, useState } from "react";
import type { TeamMemberDTO } from "@shared/types";
import { api } from "@/lib/api";

export function useTeamMembers() {
  const [members, setMembers] = useState<TeamMemberDTO[]>([]);
  const refresh = useCallback(async () => {
    const { members: rows } = await api.listTeamMembers();
    setMembers(rows);
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);
  return { members, refresh };
}

export function memberName(members: TeamMemberDTO[], id: string | null): string {
  if (!id) return "-";
  return members.find((m) => m.id === id)?.name ?? id;
}
