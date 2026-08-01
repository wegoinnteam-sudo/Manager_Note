import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb } from "./helpers/fakeD1";
import { listGuestColors, setGuestColor } from "../db/guestColors";

let db: any;
const TEAM = "team_test";

beforeEach(async () => {
  db = createTestDb();
  await db.prepare("INSERT INTO teams (id, name) VALUES (?1, ?2)").bind(TEAM, "Test Team").run();
});

describe("guestColors", () => {
  it("sets and lists a guest color", async () => {
    await setGuestColor(db, TEAM, "이대일", "#2563eb");
    await setGuestColor(db, TEAM, "Daniel", "#db2777");
    const colors = await listGuestColors(db, TEAM);
    expect(colors).toEqual(
      expect.arrayContaining([
        { name: "이대일", color: "#2563eb" },
        { name: "Daniel", color: "#db2777" },
      ]),
    );
  });

  it("overwrites an existing color for the same name (upsert)", async () => {
    await setGuestColor(db, TEAM, "Jane", "#2563eb");
    await setGuestColor(db, TEAM, "Jane", "#059669");
    const colors = await listGuestColors(db, TEAM);
    expect(colors).toEqual([{ name: "Jane", color: "#059669" }]);
  });

  it("deletes the row when color is null (reset to default)", async () => {
    await setGuestColor(db, TEAM, "Jane", "#2563eb");
    await setGuestColor(db, TEAM, "Jane", null);
    const colors = await listGuestColors(db, TEAM);
    expect(colors).toEqual([]);
  });
});
