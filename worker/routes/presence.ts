import { Hono } from "hono";
import type { AppBindings } from "../types";

export const presenceRoute = new Hono<AppBindings>();

// One fixed room for the whole (single) team — presence is ephemeral, so
// there is nothing to scope per-team beyond keeping the Durable Object name
// stable across requests.
presenceRoute.get("/", async (c) => {
  const id = c.env.PRESENCE.idFromName("default-room");
  const stub = c.env.PRESENCE.get(id);
  return stub.fetch(c.req.raw);
});
