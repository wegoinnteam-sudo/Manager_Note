import { useEffect, useState } from "react";
import type { UserDTO } from "@shared/types";
import { api } from "@/lib/api";

// Mirrors useTeamMembers's fetch-once-on-mount pattern. Used where a
// component several layers below AppShell (which already has `user` from
// useAuth) needs the current identity without threading it through every
// intermediate component's props.
export function useCurrentUser() {
  const [user, setUser] = useState<UserDTO | null>(null);
  useEffect(() => {
    api.me().then(setUser).catch(() => setUser(null));
  }, []);
  return user;
}
