import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";

/**
 * Runs supabase/migrations/0001_init.sql against a real Postgres (compiled to
 * WASM) and exercises the guarantees the SQL is responsible for.
 *
 * The push functions are where sync can silently lose data: a plain upsert
 * would let a device that pulled a moment ago overwrite a newer row from
 * another device. That rule lives in SQL, not TypeScript, so it has to be
 * tested in SQL.
 */

const MIGRATION = readFileSync("supabase/migrations/0001_init.sql", "utf8");

const ALICE = "11111111-1111-1111-1111-111111111111";
const BOB = "22222222-2222-2222-2222-222222222222";

/**
 * Supabase supplies `auth.users`, `auth.uid()` and the `authenticated` role.
 * Stubbing them is what lets the migration run verbatim — nothing in the file
 * under test is modified or skipped.
 */
const SUPABASE_STUBS = `
  create schema if not exists auth;
  create table auth.users (id uuid primary key);
  insert into auth.users (id) values ('${ALICE}'), ('${BOB}');
  create table _session (uid uuid);
  insert into _session values ('${ALICE}');
  create or replace function auth.uid() returns uuid language sql stable
    as $fn$ select uid from _session limit 1 $fn$;
  do $do$ begin
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then
      create role authenticated;
    end if;
  end $do$;
`;

/**
 * Supabase grants the `authenticated` role access to public tables by default.
 * Replicating that is what lets the tests run *as* that role, which is the only
 * way RLS is actually enforced — the owner and superuser bypass it.
 */
const SUPABASE_GRANTS = `
  grant usage on schema public to authenticated;
  grant select, insert, update, delete on public.habits to authenticated;
  grant select, insert, update, delete on public.checkins to authenticated;
  grant select on public._session to authenticated;
  grant usage on schema auth to authenticated;
`;

let db: PGlite;

function habitRow(over: Record<string, unknown> = {}) {
  return {
    id: "h1",
    name: "Read",
    icon: "book",
    accent: "acid",
    cadence: "daily",
    target: 1,
    weekdays: [1, 2, 3, 4, 5],
    time_of_day: "evening",
    start_date: "2026-01-01",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-06-01T00:00:00Z",
    archived_at: null,
    deleted_at: null,
    ...over,
  };
}

function checkinRow(over: Record<string, unknown> = {}) {
  return {
    habit_id: "h1",
    day: "2026-06-15",
    count: 3,
    updated_at: "2026-06-15T10:00:00Z",
    ...over,
  };
}

async function push(fn: string, rows: unknown[]): Promise<number> {
  const res = await db.query<{ n: number }>(`select ${fn}($1::jsonb) as n`, [
    JSON.stringify(rows),
  ]);
  return res.rows[0].n;
}

async function one<T>(sql: string): Promise<T> {
  return (await db.query<T>(sql)).rows[0];
}

async function actAs(userId: string) {
  await db.exec(`update _session set uid = '${userId}';`);
}

/**
 * Runs `fn` as the `authenticated` role, which is the only way RLS is actually
 * enforced — the table owner and the superuser bypass it. The role change has
 * to be its own statement: PGlite's `query()` uses the extended protocol, which
 * refuses more than one command per call.
 */
async function asAuthenticated<T>(fn: () => Promise<T>): Promise<T> {
  await db.exec("set role authenticated;");
  try {
    return await fn();
  } finally {
    await db.exec("reset role;");
  }
}

describe("supabase schema", () => {
  before(async () => {
    db = new PGlite();
    await db.exec(SUPABASE_STUBS);
    await db.exec(MIGRATION);
    await db.exec(SUPABASE_GRANTS);
  });

  after(async () => {
    await db.close();
  });

  it("applies cleanly and is safe to re-run", async () => {
    // Deploys re-apply the file; every statement is guarded for that.
    await db.exec(MIGRATION);
  });

  it("enables row level security on both tables", async () => {
    const rows = (
      await db.query<{ relname: string; relrowsecurity: boolean }>(
        `select relname, relrowsecurity from pg_class
         where relname in ('habits','checkins')`,
      )
    ).rows;
    assert.equal(rows.length, 2);
    for (const r of rows) {
      assert.equal(r.relrowsecurity, true, `${r.relname} has RLS off`);
    }

    const policies = (
      await db.query<{ tablename: string }>(
        `select tablename from pg_policies where schemaname = 'public'`,
      )
    ).rows.map((r) => r.tablename);
    assert.deepEqual(policies.sort(), ["checkins", "habits"]);
  });

  describe("push_habits", () => {
    it("inserts a new row and round-trips the weekday array", async () => {
      assert.equal(await push("push_habits", [habitRow()]), 1);
      const row = await one<{ weekdays: number[] }>(
        `select weekdays from habits where id = 'h1'`,
      );
      assert.deepEqual(row.weekdays, [1, 2, 3, 4, 5]);
    });

    it("refuses a write older than the stored row", async () => {
      const applied = await push("push_habits", [
        habitRow({ name: "STALE", updated_at: "2026-05-01T00:00:00Z" }),
      ]);
      assert.equal(applied, 0, "a stale write reported as applied");
      const row = await one<{ name: string }>(
        `select name from habits where id = 'h1'`,
      );
      assert.equal(row.name, "Read", "a stale write overwrote a newer row");
    });

    it("accepts a write newer than the stored row", async () => {
      const applied = await push("push_habits", [
        habitRow({ name: "Read more", updated_at: "2026-07-01T00:00:00Z" }),
      ]);
      assert.equal(applied, 1);
      const row = await one<{ name: string }>(
        `select name from habits where id = 'h1'`,
      );
      assert.equal(row.name, "Read more");
    });

    it("advances synced_at on every write, so pull cursors move", async () => {
      const before = await one<{ synced_at: string }>(
        `select synced_at from habits where id = 'h1'`,
      );
      await push("push_habits", [
        habitRow({ name: "Bump", updated_at: "2026-08-01T00:00:00Z" }),
      ]);
      const after = await one<{ synced_at: string }>(
        `select synced_at from habits where id = 'h1'`,
      );
      assert.ok(
        +new Date(after.synced_at) > +new Date(before.synced_at),
        "synced_at did not advance",
      );
    });
  });

  describe("push_checkins", () => {
    it("inserts, then refuses a stale count", async () => {
      assert.equal(await push("push_checkins", [checkinRow()]), 1);
      await push("push_checkins", [
        checkinRow({ count: 99, updated_at: "2026-06-14T10:00:00Z" }),
      ]);
      const row = await one<{ count: number }>(
        `select count from checkins where day = '2026-06-15'`,
      );
      assert.equal(row.count, 3);
    });

    it("applies a cleared day, which is a real value and not an absence", async () => {
      // If a zero could not win, undoing a check-in would silently come back
      // on the next sync.
      await push("push_checkins", [
        checkinRow({ count: 0, updated_at: "2026-06-16T10:00:00Z" }),
      ]);
      const row = await one<{ count: number }>(
        `select count from checkins where day = '2026-06-15'`,
      );
      assert.equal(row.count, 0);
    });

    it("skips a check-in whose habit is missing without failing the batch", async () => {
      // Habits and check-ins are pushed separately, so a check-in can arrive
      // before its habit. That must not abort every row alongside it, or sync
      // would retry the same batch forever.
      const applied = await push("push_checkins", [
        checkinRow({ habit_id: "not-pushed-yet", day: "2026-06-20" }),
        checkinRow({ day: "2026-06-21", updated_at: "2026-06-21T10:00:00Z" }),
      ]);
      assert.equal(applied, 1);
      const days = (
        await db.query<{ day: string }>(`select day from checkins order by day`)
      ).rows.length;
      assert.equal(days, 2, "the valid sibling row was lost");
    });
  });

  it("takes user_id from the session, never from the payload", async () => {
    await actAs(BOB);
    await push("push_habits", [habitRow({ id: "h2", name: "Bob's habit" })]);

    const bob = await one<{ user_id: string }>(
      `select user_id from habits where id = 'h2'`,
    );
    assert.equal(bob.user_id, BOB);

    const alice = await one<{ user_id: string }>(
      `select user_id from habits where id = 'h1'`,
    );
    assert.equal(alice.user_id, ALICE, "another user's row was reassigned");
  });

  describe("row level security, enforced as the authenticated role", () => {
    it("hides other users' habits from a select", async () => {
      await actAs(ALICE);
      const rows = await asAuthenticated(async () =>
        (await db.query<{ id: string }>(`select id from public.habits order by id`))
          .rows,
      );
      assert.deepEqual(
        rows.map((r) => r.id),
        ["h1"],
        "a user could see another user's habits",
      );
    });

    it("hides other users' check-ins from a select", async () => {
      await actAs(BOB);
      const rows = await asAuthenticated(async () =>
        (await db.query<{ habit_id: string }>(`select habit_id from public.checkins`))
          .rows,
      );
      assert.equal(rows.length, 0, "Bob could read Alice's check-ins");
    });

    it("refuses a write into another user's row", async () => {
      await actAs(BOB);
      await assert.rejects(
        () =>
          asAuthenticated(() =>
            db.query(
              `insert into public.habits
                 (id, user_id, name, icon, accent, cadence, target, weekdays,
                  time_of_day, start_date, created_at, updated_at)
               values ('h3', $1, 'Planted in another account', 'fire', 'acid',
                       'daily', 1, '{1}', 'anytime', '2026-01-01', now(), now())`,
              [ALICE],
            ),
          ),
        /row-level security/i,
        "a user was able to write a row owned by someone else",
      );
    });

    it("refuses to reassign an owned row to another user", async () => {
      await actAs(ALICE);
      await assert.rejects(
        () =>
          asAuthenticated(() =>
            db.query(`update public.habits set user_id = $1 where id = 'h1'`, [BOB]),
          ),
        /row-level security/i,
        "a user was able to hand their row to someone else",
      );
    });
  });
});
