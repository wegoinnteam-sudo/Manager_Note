// Single in-memory room (one Durable Object instance, always addressed by the
// same fixed name) broadcasting live presence: who is connected, which page
// they're looking at, and where their text cursor is within it. Nothing here
// is persisted — presence only matters while sockets are open, so there's
// nothing to durably store between connections.

interface PresenceInfo {
  clientId: string;
  name: string;
  color: string;
  animal: string;
  pageId: string | null;
  blockId: string | null;
  offset: number;
}

type ClientMessage =
  | { type: "join"; clientId: string; name: string; color: string; animal?: string }
  | { type: "update"; pageId: string | null; blockId: string | null; offset: number };

const MAX_NAME_LENGTH = 40;
const COLORS = ["#e11d48", "#2563eb", "#059669", "#d97706", "#7c3aed", "#0891b2", "#db2777", "#65a30d", "#ea580c", "#4f46e5", "#0d9488", "#9333ea"];
const ANIMALS = ["🦊", "🐼", "🐯", "🐸", "🐨", "🐙", "🦁", "🐧", "🦄", "🐰", "🦉", "🐬"];

function identityIndex(clientId: string): number {
  let hash = 0;
  for (const ch of clientId) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return hash % ANIMALS.length;
}

export class PresenceRoom {
  private sessions = new Map<WebSocket, PresenceInfo>();

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected a WebSocket upgrade request", { status: 426 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.handleSession(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  private handleSession(ws: WebSocket) {
    ws.accept();

    ws.addEventListener("message", (event) => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(typeof event.data === "string" ? event.data : "");
      } catch {
        return;
      }

      if (msg.type === "join") {
        const clientId = String(msg.clientId).slice(0, 64);
        const usedAnimals = new Set(Array.from(this.sessions.values()).map((session) => session.animal));
        let index = identityIndex(clientId);
        for (let i = 0; i < ANIMALS.length && usedAnimals.has(ANIMALS[index]); i += 1) {
          index = (index + 1) % ANIMALS.length;
        }
        this.sessions.set(ws, {
          clientId,
          name: String(msg.name).slice(0, MAX_NAME_LENGTH) || "익명",
          color: COLORS[index],
          animal: ANIMALS[index],
          pageId: null,
          blockId: null,
          offset: 0,
        });
        this.broadcast();
        return;
      }

      if (msg.type === "update") {
        const info = this.sessions.get(ws);
        if (!info) return;
        info.pageId = msg.pageId ?? null;
        info.blockId = msg.blockId ?? null;
        info.offset = Number.isFinite(msg.offset) ? msg.offset : 0;
        this.broadcast();
      }
    });

    const leave = () => {
      this.sessions.delete(ws);
      this.broadcast();
    };
    ws.addEventListener("close", leave);
    ws.addEventListener("error", leave);
  }

  private broadcast() {
    const payload = JSON.stringify({ type: "presence", users: Array.from(this.sessions.values()) });
    for (const ws of this.sessions.keys()) {
      try {
        ws.send(payload);
      } catch {
        this.sessions.delete(ws);
      }
    }
  }
}
