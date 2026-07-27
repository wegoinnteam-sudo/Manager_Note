import { useEffect, useState } from "react";
import type { TeamMemberDTO } from "@shared/types";
import { api } from "@/lib/api";

export function useTeamMembers() {
  const [members, setMembers] = useState<TeamMemberDTO[]>([]);
  useEffect(() => {
    api.listTeamMembers().then((r) => setMembers(r.members));
  }, []);
  return members;
}

export function memberName(members: TeamMemberDTO[], id: string | null): string {
  if (!id) return "-";
  return members.find((m) => m.id === id)?.name ?? id;
}
