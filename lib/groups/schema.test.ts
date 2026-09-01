import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, beforeEach, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";

/**
 * The groups schema, run against a real Postgres.
 *
 * This file is mostly about what people cannot do. Groups are the first place
 * where one person's rows are visible to another, so the interesting cases are
 * the negative ones: a stranger reading a group, an uninvited account joining
 * one, someone publishing progress as somebody else, and the invite box being
 * used to find out whether an address has an account.
 */

const BASE = readFileSync("supabase/migrations/0001_init.sql", "utf8");
const GROUPS = readFileSync("supabase/migrations/0002_groups.sql", "utf8");
const PREVIEW = readFileSync("supabase/migrations/0003_group_preview.sql", "utf8");

const ALICE = { id: "11111111-1111-1111-1111-111111111111", email: "alice@example.com" };
const BOB = { id: "22222222-2222-2222-2222-222222222222", email: "bob@example.com" };
const MALLORY = { id: "33333333-3333-3333-3333-333333333333", email: "mallory@example.com" };

/**
 * Supabase supplies auth.uid(), auth.jwt() and the authenticated role. The
 * session table stands in for the token so a test can switch identity.
 */
const STUBS = `
  create schema if not exists auth;
  create table auth.users (id uuid primary key, email text);
  insert into auth.users (id, email) values
    ('${ALICE.id}', '${ALICE.email}'),
    ('${BOB.id}', '${BOB.email}'),
    ('${MALLORY.id}', '${MALLORY.email}');

  create table _session (uid uuid, email text);
  insert into _session values ('${ALICE.id}', '${ALICE.email}');

  create or replace function auth.uid() returns uuid language sql stable
    as $fn$ select uid from _session limit 1 $fn$;
  create or replace function auth.jwt() returns jsonb language sql stable
    as $fn$ select jsonb_build_object('email', (select email from _session limit 1)) $fn$;

  do $do$ begin
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then
      create role authenticated;
    end if;
    if not exists (select 1 from pg_roles where rolname = 'anon') then
      create role anon;
    end if;
  end $do$;
`;

const GRANTS = `
  grant usage on schema public, auth to authenticated;
  grant select, insert, update, delete on
    public.habits, public.checkins, public.groups, public.group_members,
    public.group_invites, public.group_progress to authenticated;
  grant select on public._session to authenticated;
  grant usage on schema public, auth to anon;
  grant select on public._session to anon;
`;

let db: PGlite;

async function actAs(user: { id: string; email: string }) {
  await db.exec(`update _session set uid = '${user.id}', email = '${user.email}';`);
}

/** Runs as the `authenticated` role, which is the only way RLS applies. */
async function asUser<T>(user: { id: string; email: string }, fn: () => Promise<T>): Promise<T> {
  await actAs(user);
  await db.exec("set role authenticated;");
  try {
    return await fn();
  } finally {
    await db.exec("reset role;");
  }
}

const rows = async <T>(sql: string, params: unknown[] = []) =>
  (await db.query<T>(sql, params)).rows;

async function makeGroup(owner: typeof ALICE, name = "Morning pages") {
  return asUser(owner, async () => {
    const r = await db.query<{ create_group: string }>(
      `select public.create_group($1,$2,$3,$4,$5,$6,$7) as create_group`,
      [name, "book", "acid", "daily", 1, "habit-of-" + owner.id.slice(0, 4), "Owner"],
    );
    return r.rows[0].create_group;
  });
}

describe("groups schema", () => {
  before(async () => {
    db = new PGlite();
    await db.exec(STUBS);
    await db.exec(BASE);
    await db.exec(GROUPS);
    await db.exec(PREVIEW);
    await db.exec(GRANTS);
  });

  after(async () => {
    await db.close();
  });

  beforeEach(async () => {
    await db.exec("reset role;");
    await db.exec("delete from public.group_progress; delete from public.group_invites; delete from public.group_members; delete from public.groups;");
  });

  it("applies cleanly and is safe to re-run", async () => {
    await db.exec(GROUPS);
  });

  it("enrols the creator, so a group is never orphaned", async () => {
    const id = await makeGroup(ALICE);
    const members = await asUser(ALICE, () =>
      rows<{ user_id: string }>(`select user_id from public.group_members where group_id = $1`, [id]),
    );
    assert.deepEqual(members.map((m) => m.user_id), [ALICE.id]);
  });

  describe("visibility", () => {
    it("hides a group entirely from someone who is not in it", async () => {
      const id = await makeGroup(ALICE);
      const seen = await asUser(MALLORY, () =>
        rows(`select id from public.groups where id = $1`, [id]),
      );
      assert.equal(seen.length, 0, "a stranger could see the group");
    });

    it("hides the member list and progress from a non-member", async () => {
      const id = await makeGroup(ALICE);
      await asUser(ALICE, () =>
        db.query(`select public.publish_group_progress($1, $2::jsonb)`, [
          id,
          JSON.stringify([{ period_start: "2026-03-01", completed: true }]),
        ]),
      );

      const [members, progress] = await asUser(MALLORY, async () => [
        await rows(`select * from public.group_members where group_id = $1`, [id]),
        await rows(`select * from public.group_progress where group_id = $1`, [id]),
      ]);
      assert.equal(members.length, 0, "a stranger could read the member list");
      assert.equal(progress.length, 0, "a stranger could read members' progress");
    });
  });

  describe("invitations", () => {
    it("lets the invitee see the group before joining, but only through the invite", async () => {
      const id = await makeGroup(ALICE);
      await asUser(ALICE, () =>
        db.query(`select public.invite_to_group($1, $2)`, [id, "BOB@Example.com"]),
      );

      const pending = await asUser(BOB, () =>
        rows<{ name: string; member_count: number }>(`select * from public.my_pending_invites()`),
      );
      assert.equal(pending.length, 1);
      assert.equal(pending[0].name, "Morning pages");

      // The group row itself is still invisible: an invitation is not membership.
      const direct = await asUser(BOB, () =>
        rows(`select id from public.groups where id = $1`, [id]),
      );
      assert.equal(direct.length, 0);
    });

    it("normalises the address, so casing cannot orphan an invite", async () => {
      const id = await makeGroup(ALICE);
      await asUser(ALICE, () =>
        db.query(`select public.invite_to_group($1, $2)`, [id, "  BoB@EXAMPLE.com "]),
      );
      const pending = await asUser(BOB, () => rows(`select * from public.my_pending_invites()`));
      assert.equal(pending.length, 1);
    });

    it("shows an invitee nothing addressed to somebody else", async () => {
      const id = await makeGroup(ALICE);
      await asUser(ALICE, () =>
        db.query(`select public.invite_to_group($1, $2)`, [id, BOB.email]),
      );
      const pending = await asUser(MALLORY, () => rows(`select * from public.my_pending_invites()`));
      assert.equal(pending.length, 0, "Mallory could see an invite meant for Bob");
    });

    it("succeeds identically for an address with no account, revealing nothing", async () => {
      // If this behaved differently for a real address, the invite box would
      // become a way to test whether somebody has signed up.
      const id = await makeGroup(ALICE);
      await asUser(ALICE, async () => {
        await db.query(`select public.invite_to_group($1, $2)`, [id, "nobody@nowhere.test"]);
        await db.query(`select public.invite_to_group($1, $2)`, [id, BOB.email]);
        // And inviting twice is a no-op rather than an error.
        await db.query(`select public.invite_to_group($1, $2)`, [id, BOB.email]);
      });
      const invites = await asUser(ALICE, () =>
        rows(`select email_lower from public.group_invites where group_id = $1`, [id]),
      );
      assert.equal(invites.length, 2);
    });

    it("refuses invitations from someone outside the group", async () => {
      const id = await makeGroup(ALICE);
      await assert.rejects(
        () =>
          asUser(MALLORY, () =>
            db.query(`select public.invite_to_group($1, $2)`, [id, "victim@example.com"]),
          ),
        /only members can invite/,
      );
    });
  });

  describe("accepting", () => {
    it("joins the group and consumes the invitation", async () => {
      const id = await makeGroup(ALICE);
      await asUser(ALICE, () => db.query(`select public.invite_to_group($1,$2)`, [id, BOB.email]));

      await asUser(BOB, () =>
        db.query(`select public.accept_group_invite($1,$2,$3)`, [id, "bob-habit", "Bob"]),
      );

      const members = await asUser(BOB, () =>
        rows<{ user_id: string; habit_id: string; display_name: string }>(
          `select user_id, habit_id, display_name from public.group_members
            where group_id = $1 order by joined_at`,
          [id],
        ),
      );
      assert.equal(members.length, 2);
      assert.ok(members.some((m) => m.user_id === BOB.id && m.habit_id === "bob-habit"));

      const left = await asUser(BOB, () => rows(`select * from public.my_pending_invites()`));
      assert.equal(left.length, 0, "the invitation should be consumed");
    });

    it("refuses to join a group the caller was never invited to", async () => {
      // Knowing a group id must not be enough. This is the whole point of the
      // accept function running as definer but authorising by verified email.
      const id = await makeGroup(ALICE);
      await assert.rejects(
        () =>
          asUser(MALLORY, () =>
            db.query(`select public.accept_group_invite($1,$2,$3)`, [id, "m-habit", "Mallory"]),
          ),
        /no invitation for this account/,
      );

      const members = await asUser(ALICE, () =>
        rows(`select user_id from public.group_members where group_id = $1`, [id]),
      );
      assert.equal(members.length, 1);
    });

    it("refuses to join on someone else's invitation", async () => {
      const id = await makeGroup(ALICE);
      await asUser(ALICE, () => db.query(`select public.invite_to_group($1,$2)`, [id, BOB.email]));
      await assert.rejects(
        () =>
          asUser(MALLORY, () =>
            db.query(`select public.accept_group_invite($1,$2,$3)`, [id, "m-habit", "Mallory"]),
          ),
        /no invitation for this account/,
        "an invite addressed to Bob let Mallory in",
      );
    });

    it("lets the invitee decline, which removes the invitation", async () => {
      const id = await makeGroup(ALICE);
      await asUser(ALICE, () => db.query(`select public.invite_to_group($1,$2)`, [id, BOB.email]));
      await asUser(BOB, () =>
        db.query(`delete from public.group_invites where group_id = $1`, [id]),
      );
      const pending = await asUser(BOB, () => rows(`select * from public.my_pending_invites()`));
      assert.equal(pending.length, 0);
    });

    it("does not let a stranger delete somebody else's invitation", async () => {
      const id = await makeGroup(ALICE);
      await asUser(ALICE, () => db.query(`select public.invite_to_group($1,$2)`, [id, BOB.email]));
      await asUser(MALLORY, () => db.query(`delete from public.group_invites where group_id = $1`, [id]));
      const pending = await asUser(BOB, () => rows(`select * from public.my_pending_invites()`));
      assert.equal(pending.length, 1, "Mallory revoked an invite she had nothing to do with");
    });
  });

  describe("progress", () => {
    async function groupWithBoth() {
      const id = await makeGroup(ALICE);
      await asUser(ALICE, () => db.query(`select public.invite_to_group($1,$2)`, [id, BOB.email]));
      await asUser(BOB, () =>
        db.query(`select public.accept_group_invite($1,$2,$3)`, [id, "bob-habit", "Bob"]),
      );
      return id;
    }

    it("lets members see each other's completion, and nothing more", async () => {
      const id = await groupWithBoth();
      await asUser(BOB, () =>
        db.query(`select public.publish_group_progress($1,$2::jsonb)`, [
          id,
          JSON.stringify([
            { period_start: "2026-03-01", completed: true },
            { period_start: "2026-03-02", completed: false },
          ]),
        ]),
      );

      const seen = await asUser(ALICE, () =>
        rows<{ user_id: string; completed: boolean }>(
          `select user_id, completed from public.group_progress
            where group_id = $1 order by period_start`,
          [id],
        ),
      );
      assert.equal(seen.length, 2);
      assert.ok(seen.every((r) => r.user_id === BOB.id));
    });

    it("refuses to publish progress on another member's behalf", async () => {
      const id = await groupWithBoth();
      await assert.rejects(
        () =>
          asUser(BOB, () =>
            db.query(
              `insert into public.group_progress (group_id, user_id, period_start, completed)
               values ($1, $2, '2026-03-01', true)`,
              [id, ALICE.id],
            ),
          ),
        /row-level security/i,
        "Bob wrote a row attributed to Alice",
      );
    });

    it("refuses progress from someone outside the group", async () => {
      const id = await groupWithBoth();
      await assert.rejects(
        () =>
          asUser(MALLORY, () =>
            db.query(`select public.publish_group_progress($1,$2::jsonb)`, [
              id,
              JSON.stringify([{ period_start: "2026-03-01", completed: true }]),
            ]),
          ),
        /not a member of this group/,
      );
    });

    it("is idempotent, so republishing corrects rather than duplicates", async () => {
      const id = await groupWithBoth();
      const publish = (completed: boolean) =>
        asUser(BOB, () =>
          db.query(`select public.publish_group_progress($1,$2::jsonb)`, [
            id,
            JSON.stringify([{ period_start: "2026-03-01", completed }]),
          ]),
        );
      await publish(true);
      await publish(false);
      const seen = await asUser(ALICE, () =>
        rows<{ completed: boolean }>(`select completed from public.group_progress where group_id = $1`, [id]),
      );
      assert.equal(seen.length, 1);
      assert.equal(seen[0].completed, false);
    });
  });


  describe("the shareable invite link", () => {
    /**
     * The link exists so somebody who has never opened the app can see what
     * they are being asked to join. It must show enough to decide on and
     * nothing more — and above all it must not be a way in.
     */
    async function asAnon<T>(fn: () => Promise<T>): Promise<T> {
      await db.exec("set role anon;");
      try {
        return await fn();
      } finally {
        await db.exec("reset role;");
      }
    }

    it("shows a signed-out visitor what the group is", async () => {
      const id = await makeGroup(ALICE, "Morning pages");
      const preview = await asAnon(() =>
        rows<{ name: string; member_count: number }>(
          `select * from public.group_preview($1)`,
          [id],
        ),
      );
      assert.equal(preview.length, 1);
      assert.equal(preview[0].name, "Morning pages");
      assert.equal(Number(preview[0].member_count), 1);
    });

    it("exposes nothing about who is in it or how they are doing", async () => {
      const id = await makeGroup(ALICE);
      await asUser(ALICE, () =>
        db.query(`select public.publish_group_progress($1,$2::jsonb)`, [
          id,
          JSON.stringify([{ period_start: "2026-03-01", completed: true }]),
        ]),
      );

      // Denied and empty are both acceptable answers here; what matters is
      // that nothing comes back. Anonymous callers are in fact refused
      // outright, which is the stronger of the two.
      const unreadable = async (sql: string) => {
        try {
          return (await rows(sql, [id])).length === 0;
        } catch {
          return true;
        }
      };

      await asAnon(async () => {
        assert.ok(
          await unreadable(`select * from public.group_members where group_id = $1`),
          "anon could read the member list",
        );
        assert.ok(
          await unreadable(`select * from public.group_progress where group_id = $1`),
          "anon could read progress",
        );
        assert.ok(
          await unreadable(`select * from public.group_invites where group_id = $1`),
          "anon could read the invite list",
        );
        assert.ok(
          await unreadable(`select * from public.groups where id = $1`),
          "anon could read the group row directly",
        );
      });

      // And the preview itself carries only the decision-making fields.
      const preview = await asAnon(() =>
        rows<Record<string, unknown>>(`select * from public.group_preview($1)`, [id]),
      );
      assert.deepEqual(
        Object.keys(preview[0]).sort(),
        ["accent", "cadence", "icon", "member_count", "name", "target"],
        "the preview grew a field that was not reviewed",
      );
    });

    it("is not a way in — following the link grants nothing", async () => {
      // The entire security argument for the link rests on this.
      const id = await makeGroup(ALICE);
      await assert.rejects(
        () =>
          asUser(MALLORY, () =>
            db.query(`select public.accept_group_invite($1,$2,$3)`, [id, "m", "Mallory"]),
          ),
        /no invitation for this account/,
        "holding the link let someone join",
      );
    });

    it("returns nothing for a group id that does not exist", async () => {
      const preview = await asAnon(() =>
        rows(`select * from public.group_preview($1)`, [
          "99999999-9999-9999-9999-999999999999",
        ]),
      );
      assert.equal(preview.length, 0);
    });
  });

  it("leaves personal habits untouched by any of this", async () => {
    // The whole design rests on groups never widening access to the tables
    // holding everyone's actual check-ins.
    const id = await makeGroup(ALICE);
    await asUser(ALICE, () => db.query(`select public.invite_to_group($1,$2)`, [id, BOB.email]));
    await asUser(BOB, () =>
      db.query(`select public.accept_group_invite($1,$2,$3)`, [id, "bob-habit", "Bob"]),
    );

    await asUser(ALICE, () =>
      db.query(`select public.push_habits($1::jsonb)`, [
        JSON.stringify([
          {
            id: "alice-secret",
            name: "Therapy",
            icon: "brain",
            accent: "ultra",
            cadence: "weekly",
            target: 1,
            weekdays: [1],
            time_of_day: "anytime",
            start_date: "2026-01-01",
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z",
          },
        ]),
      ]),
    );

    const seen = await asUser(BOB, () =>
      rows(`select id from public.habits where id = 'alice-secret'`),
    );
    assert.equal(seen.length, 0, "a group member could read a personal habit");
  });
});
