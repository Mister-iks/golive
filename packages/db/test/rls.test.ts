import postgres from "postgres";
import { migrate } from "../src/migrate";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TEMPLATES, validateSpec } from "@golive/spec";
import { activityLog, asUser, connect, eq, orgMembers, organizations, projectMembers, projects, sql, users, type Database } from "../src";

/**
 * Row level security is the last line of defense between tenants.
 * These tests run against a real PostgreSQL (DATABASE_URL_TEST) and are skipped without one.
 */
const URL = process.env.DATABASE_URL_TEST;
const d = URL ? describe : describe.skip;

d("row level security", () => {
  let database: Database;
  const parsed = validateSpec(structuredClone(TEMPLATES[0]!.spec));
  if (!parsed.ok) throw new Error("template");
  const spec = parsed.spec;

  beforeAll(async () => {
    const admin = postgres(URL!, { max: 1, onnotice: () => {} });
    await admin.unsafe("drop schema if exists public cascade; drop schema if exists golive cascade; drop schema if exists pgboss cascade; create schema public;");
    await admin.end();
    await migrate(URL!);
    database = connect(URL!);
    const { db } = database;
    await db.insert(users).values([
      { id: "alice", name: "Alice", email: "alice@example.test" },
      { id: "bob", name: "Bob", email: "bob@example.test" },
      { id: "carol", name: "Carol", email: "carol@example.test" },
    ]);
    await db.insert(organizations).values([
      { id: "org-a", name: "Agence A" },
      { id: "org-b", name: "Agence B" },
    ]);
    await db.insert(orgMembers).values([
      { orgId: "org-a", userId: "alice", role: "owner" },
      { orgId: "org-b", userId: "bob", role: "owner" },
      { orgId: "org-a", userId: "carol", role: "guest" },
    ]);
    await db.insert(projects).values([
      { id: "pa1", orgId: "org-a", name: "A1", spec },
      { id: "pa2", orgId: "org-a", name: "A2", spec },
      { id: "pb1", orgId: "org-b", name: "B1", spec },
    ]);
    await db.insert(projectMembers).values({ projectId: "pa2", userId: "carol", orgId: "org-a", role: "lecteur" });
  });

  afterAll(async () => {
    await database?.close();
  });

  const visible = (user: string) => asUser(database.db, user, async (tx) => (await tx.select({ id: projects.id }).from(projects)).map((r) => r.id).sort());

  it("confines each user to their organization", async () => {
    expect(await visible("alice")).toEqual(["pa1", "pa2"]);
    expect(await visible("bob")).toEqual(["pb1"]);
  });

  it("limits guests to the projects shared with them", async () => {
    expect(await visible("carol")).toEqual(["pa2"]);
  });

  it("forbids writing into another organization", async () => {
    const updated = await asUser(database.db, "bob", (tx) => tx.update(projects).set({ name: "pwned" }).where(eq(projects.id, "pa1")).returning());
    expect(updated).toEqual([]);
    await expect(asUser(database.db, "bob", (tx) => tx.insert(projects).values({ orgId: "org-a", name: "x", spec }))).rejects.toThrow();
  });

  it("lets members create a project and read it back", async () => {
    const [p] = await asUser(database.db, "alice", (tx) => tx.insert(projects).values({ orgId: "org-a", name: "A3", spec }).returning());
    expect(p?.orgId).toBe("org-a");
    await asUser(database.db, "alice", (tx) => tx.delete(projects).where(eq(projects.id, p!.id)));
  });

  it("forbids readers from editing", async () => {
    const updated = await asUser(database.db, "carol", (tx) => tx.update(projects).set({ name: "x" }).where(eq(projects.id, "pa2")).returning());
    expect(updated).toEqual([]);
  });

  it("forbids claiming ownership of an existing organization", async () => {
    await expect(asUser(database.db, "bob", (tx) => tx.insert(orgMembers).values({ orgId: "org-a", userId: "bob", role: "owner" }))).rejects.toThrow();
  });

  it("lets a user create a new organization and become its owner", async () => {
    await asUser(database.db, "bob", async (tx) => {
      await tx.insert(organizations).values({ id: "org-c", name: "C" });
      await tx.insert(orgMembers).values({ orgId: "org-c", userId: "bob", role: "owner" });
    });
    const orgs = await asUser(database.db, "bob", (tx) => tx.select({ id: organizations.id }).from(organizations));
    expect(orgs.map((o) => o.id).sort()).toEqual(["org-b", "org-c"]);
  });

  it("hides users who share no organization", async () => {
    const seen = await asUser(database.db, "bob", (tx) => tx.select({ id: users.id }).from(users));
    expect(seen.map((u) => u.id)).toEqual(["bob"]);
  });

  it("keeps the activity log append only, even for the owner role", async () => {
    await database.db.insert(activityLog).values({ orgId: "org-a", actorId: "alice", action: "test" });
    await expect(database.db.execute(sql`delete from activity_log`)).rejects.toMatchObject({ cause: { message: expect.stringMatching(/append only/) } });
    await expect(
      asUser(database.db, "alice", (tx) => tx.insert(activityLog).values({ orgId: "org-a", actorId: "bob", action: "spoof" })),
    ).rejects.toThrow();
  });

  it("migrations are idempotent", async () => {
    expect(await migrate(URL!)).toEqual([]);
  });
});
