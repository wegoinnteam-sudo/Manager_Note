import { useCallback, useState } from "react";

const NAME_KEY = "th_guest_name";
const CLIENT_ID_KEY = "th_guest_client_id";
const COLOR_KEY = "th_guest_color";
const ANIMAL_KEY = "th_guest_animal";

// A small fixed palette so cursor colors stay legible and distinct rather
// than random RGB noise.
const COLORS = ["#e11d48", "#2563eb", "#059669", "#d97706", "#7c3aed", "#0891b2", "#db2777", "#65a30d"];
const ANIMALS = ["🦊", "🐼", "🐯", "🐸", "🐨", "🐙", "🦁", "🐧", "🦄", "🐰", "🦉", "🐬"];

function pickColor(): string {
  return COLORS[Math.floor(Math.random() * COLORS.length)];
}

function pickAnimal(): string {
  return ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
}

export interface GuestIdentity {
  clientId: string;
  name: string;
  color: string;
  animal: string;
}

export function useGuestIdentity() {
  const [identity, setIdentity] = useState<GuestIdentity | null>(() => {
    const name = localStorage.getItem(NAME_KEY);
    if (!name) return null;
    let clientId = sessionStorage.getItem(CLIENT_ID_KEY);
    if (!clientId) {
      clientId = crypto.randomUUID();
      sessionStorage.setItem(CLIENT_ID_KEY, clientId);
    }
    let color = sessionStorage.getItem(COLOR_KEY);
    if (!color) {
      color = pickColor();
      sessionStorage.setItem(COLOR_KEY, color);
    }
    let animal = sessionStorage.getItem(ANIMAL_KEY);
    if (!animal) {
      animal = pickAnimal();
      sessionStorage.setItem(ANIMAL_KEY, animal);
    }
    return { clientId, name, color, animal };
  });

  const setName = useCallback((name: string) => {
    const trimmed = name.trim().slice(0, 40);
    if (!trimmed) return;
    const clientId = sessionStorage.getItem(CLIENT_ID_KEY) ?? crypto.randomUUID();
    const color = sessionStorage.getItem(COLOR_KEY) ?? pickColor();
    const animal = sessionStorage.getItem(ANIMAL_KEY) ?? pickAnimal();
    localStorage.setItem(NAME_KEY, trimmed);
    sessionStorage.setItem(CLIENT_ID_KEY, clientId);
    sessionStorage.setItem(COLOR_KEY, color);
    sessionStorage.setItem(ANIMAL_KEY, animal);
    setIdentity({ clientId, name: trimmed, color, animal });
  }, []);

  return { identity, setName };
}
