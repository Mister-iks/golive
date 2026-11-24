import { connect, startQueue, type Database, type PgBoss } from "@golive/db";

// Kept on globalThis so hot reload in development does not open new pools.
const g = globalThis as unknown as { __golive?: { database?: Database; boss?: Promise<PgBoss> } };
const state = (g.__golive ??= {});

export function database(): Database {
  return (state.database ??= connect());
}

export const db = () => database().db;

export function queue(): Promise<PgBoss> {
  state.boss ??= startQueue().catch((e) => {
    state.boss = undefined;
    throw e;
  });
  return state.boss;
}
