import { useCallback, useState } from "react";

const NAME_KEY = "th_guest_name";
const CLIENT_ID_KEY = "th_guest_client_id";
const COLOR_KEY = "th_guest_color";

// A small fixed palette so cursor colors stay legible and distinct rather
// than random RGB noise.
const COLORS = ["#e11d48", "#2563eb", "#059669", "#d97706", "#7c3aed", "#0891b2", "#db2777", "#65a30d"];

function pickColor(): string {
  return COLORS[Math.floor(Math.random() * COLORS.length)];
}

export interface GuestIdentity {
  clientId: string;
  name: string;
  color: string;
}

export function useGuestIdentity() {
  const [identity, setIdentity] = useState<GuestIdentity | null>(() => {
    const name = localStorage.getItem(NAME_KEY);
    if (!name) return null;
    let clientId = localStorage.getItem(CLIENT_ID_KEY);
    if (!clientId) {
      clientId = crypto.randomUUID();
      localStorage.setItem(CLIENT_ID_KEY, clientId);
    }
    let color = localStorage.getItem(COLOR_KEY);
    if (!color) {
      color = pickColor();
      localStorage.setItem(COLOR_KEY, color);
    }
    return { clientId, name, color };
  });

  const setName = useCallback((name: string) => {
    const trimmed = name.trim().slice(0, 40);
    if (!trimmed) return;
    const clientId = localStorage.getItem(CLIENT_ID_KEY) ?? crypto.randomUUID();
    const color = localStorage.getItem(COLOR_KEY) ?? pickColor();
    localStorage.setItem(NAME_KEY, trimmed);
    localStorage.setItem(CLIENT_ID_KEY, clientId);
    localStorage.setItem(COLOR_KEY, color);
    setIdentity({ clientId, name: trimmed, color });
  }, []);

  return { identity, setName };
}
