"use client";

import { getSupabase } from "../supabase/client";
import type { Cadence } from "../date";
import type {
  GroupDetail,
  GroupMember,
  GroupPreview,
  PendingInvite,
  ProgressRow,
} from "./types";
import type { PublishRow } from "./progress";

/**
 * Every call the groups feature makes.
 *
 * All of it is network-only and none of it touches the local habit store.
 * Failures return a message rather than throwing, because a group screen that
 * cannot load is a normal state, not an error worth interrupting anyone over.
 */

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

const ok = <T>(data: T): Result<T> => ({ ok: true, data });
const fail = (error: string): Result<never> => ({ ok: false, error });

const NOT_CONFIGURED = "Groups need an account. Sign in from Settings first.";

function friendly(message: string): string {
  if (/not authenticated/i.test(message)) return "Sign in first.";
  if (/only members can invite/i.test(message)) return "Only members can invite people.";
  if (/no invitation/i.test(message)) {
    return "That invitation is no longer available for this account.";
  }
  if (/not a member/i.test(message)) return "You are not in this group.";
  if (/failed to fetch|network/i.test(message)) return "Can't reach the network.";
  // PostgREST's answer when a function or table does not exist, which in
  // practice means the groups migrations have not been run on this project.
  if (/schema cache|could not find the (function|table)|does not exist/i.test(message)) {
    return "Shared habits aren't set up on this deployment yet.";
  }
  return message;
}

async function client() {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session ? supabase : null;
}

/** As `client`, for the calls that also need to name the caller's own rows. */
async function clientAsUser() {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session ? { supabase, userId: data.session.user.id } : null;
}

/**
 * What a group looks like to somebody following a shared link.
 *
 * Works without a session on purpose — the whole point is that a person who
 * has never opened the app can see what they are being asked to join. It
 * returns the group's name and rhythm and nothing else, and following a link
 * grants no access whatsoever.
 */
export async function groupPreview(groupId: string): Promise<Result<GroupPreview>> {
  const supabase = getSupabase();
  if (!supabase) return fail(NOT_CONFIGURED);
  try {
    const { data, error } = await supabase.rpc("group_preview", {
      p_group_id: groupId,
    });
    if (error) throw new Error(error.message);
    const row = (data ?? [])[0] as Record<string, unknown> | undefined;
    if (!row) return fail("That invite link points at a group that no longer exists.");
    return ok({
      name: row.name as string,
      icon: row.icon as string,
      accent: row.accent as string,
      cadence: row.cadence as Cadence,
      target: row.target as number,
      memberCount: Number(row.member_count ?? 0),
    });
  } catch (e) {
    return fail(friendly(e instanceof Error ? e.message : "Could not read that link."));
  }
}

export async function listGroups(): Promise<Result<GroupDetail[]>> {
  const supabase = await client();
  if (!supabase) return fail(NOT_CONFIGURED);

  try {
    // RLS already limits this to groups the caller belongs to, so there is no
    // filter here to get wrong.
    const { data: groups, error } = await supabase
      .from("groups")
      .select("id, name, icon, accent, cadence, target, created_by")
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    if (!groups?.length) return ok([]);

    const ids = groups.map((g) => g.id as string);
    const [{ data: members, error: mErr }, { data: progress, error: pErr }] =
      await Promise.all([
        supabase
          .from("group_members")
          .select("group_id, user_id, habit_id, display_name, joined_at")
          .in("group_id", ids),
        supabase
          .from("group_progress")
          .select("group_id, user_id, period_start, completed")
          .in("group_id", ids),
      ]);
    if (mErr) throw new Error(mErr.message);
    if (pErr) throw new Error(pErr.message);

    return ok(
      groups.map((g) => ({
        group: {
          id: g.id as string,
          name: g.name as string,
          icon: g.icon as string,
          accent: g.accent as string,
          cadence: g.cadence as Cadence,
          target: g.target as number,
          createdBy: g.created_by as string,
        },
        members: (members ?? [])
          .filter((m) => m.group_id === g.id)
          .map(
            (m): GroupMember => ({
              userId: m.user_id as string,
              habitId: (m.habit_id as string | null) ?? null,
              displayName: m.display_name as string,
              joinedAt: m.joined_at as string,
            }),
          ),
        progress: (progress ?? [])
          .filter((p) => p.group_id === g.id)
          .map(
            (p): ProgressRow => ({
              userId: p.user_id as string,
              periodStart: p.period_start as string,
              completed: p.completed as boolean,
            }),
          ),
      })),
    );
  } catch (e) {
    return fail(friendly(e instanceof Error ? e.message : "Could not load groups."));
  }
}

export async function listInvites(): Promise<Result<PendingInvite[]>> {
  const supabase = await client();
  if (!supabase) return fail(NOT_CONFIGURED);
  try {
    const { data, error } = await supabase.rpc("my_pending_invites");
    if (error) throw new Error(error.message);
    return ok(
      (data ?? []).map(
        (r: Record<string, unknown>): PendingInvite => ({
          groupId: r.group_id as string,
          name: r.name as string,
          icon: r.icon as string,
          accent: r.accent as string,
          cadence: r.cadence as Cadence,
          target: r.target as number,
          memberCount: Number(r.member_count ?? 0),
          invitedBy: (r.invited_by as string) ?? "a member",
          createdAt: r.created_at as string,
        }),
      ),
    );
  } catch (e) {
    return fail(friendly(e instanceof Error ? e.message : "Could not load invitations."));
  }
}

export async function createGroup(input: {
  name: string;
  icon: string;
  accent: string;
  cadence: Cadence;
  target: number;
  habitId: string;
  displayName: string;
}): Promise<Result<string>> {
  const supabase = await client();
  if (!supabase) return fail(NOT_CONFIGURED);
  try {
    const { data, error } = await supabase.rpc("create_group", {
      p_name: input.name,
      p_icon: input.icon,
      p_accent: input.accent,
      p_cadence: input.cadence,
      p_target: input.target,
      p_habit_id: input.habitId,
      p_display_name: input.displayName,
    });
    if (error) throw new Error(error.message);
    return ok(data as string);
  } catch (e) {
    return fail(friendly(e instanceof Error ? e.message : "Could not create the group."));
  }
}

/**
 * Records an invitation. Deliberately reports the same thing whether or not
 * the address has an account — the server does not tell us, by design, and
 * inventing a distinction here would undo that.
 */
export async function invite(groupId: string, email: string): Promise<Result<null>> {
  const supabase = await client();
  if (!supabase) return fail(NOT_CONFIGURED);
  try {
    const { error } = await supabase.rpc("invite_to_group", {
      p_group_id: groupId,
      p_email: email,
    });
    if (error) throw new Error(error.message);
    return ok(null);
  } catch (e) {
    return fail(friendly(e instanceof Error ? e.message : "Could not send the invitation."));
  }
}

export async function acceptInvite(
  groupId: string,
  habitId: string,
  displayName: string,
): Promise<Result<null>> {
  const supabase = await client();
  if (!supabase) return fail(NOT_CONFIGURED);
  try {
    const { error } = await supabase.rpc("accept_group_invite", {
      p_group_id: groupId,
      p_habit_id: habitId,
      p_display_name: displayName,
    });
    if (error) throw new Error(error.message);
    return ok(null);
  } catch (e) {
    return fail(friendly(e instanceof Error ? e.message : "Could not join the group."));
  }
}

export async function declineInvite(groupId: string): Promise<Result<null>> {
  const supabase = await client();
  if (!supabase) return fail(NOT_CONFIGURED);
  try {
    // The policy limits this to invitations addressed to the caller, so there
    // is nothing to scope here beyond the group.
    const { error } = await supabase.from("group_invites").delete().eq("group_id", groupId);
    if (error) throw new Error(error.message);
    return ok(null);
  } catch (e) {
    return fail(friendly(e instanceof Error ? e.message : "Could not decline."));
  }
}

export async function leaveGroup(groupId: string, userId: string): Promise<Result<null>> {
  const supabase = await client();
  if (!supabase) return fail(NOT_CONFIGURED);
  try {
    const { error } = await supabase
      .from("group_members")
      .delete()
      .eq("group_id", groupId)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return ok(null);
  } catch (e) {
    return fail(friendly(e instanceof Error ? e.message : "Could not leave the group."));
  }
}

export async function publishProgress(
  groupId: string,
  rows: PublishRow[],
): Promise<Result<null>> {
  const supabase = await client();
  if (!supabase) return fail(NOT_CONFIGURED);
  if (!rows.length) return ok(null);
  try {
    const { error } = await supabase.rpc("publish_group_progress", {
      p_group_id: groupId,
      payload: rows,
    });
    if (error) throw new Error(error.message);
    return ok(null);
  } catch (e) {
    return fail(friendly(e instanceof Error ? e.message : "Could not publish progress."));
  }
}

export async function updateGroup(
  groupId: string,
  input: { name: string; icon: string; accent: string },
): Promise<Result<null>> {
  const supabase = await client();
  if (!supabase) return fail(NOT_CONFIGURED);
  try {
    const { error } = await supabase.rpc("update_group", {
      p_group_id: groupId,
      p_name: input.name,
      p_icon: input.icon,
      p_accent: input.accent,
    });
    if (error) throw new Error(error.message);
    return ok(null);
  } catch (e) {
    return fail(friendly(e instanceof Error ? e.message : "Could not save the group."));
  }
}

export async function removeMember(
  groupId: string,
  userId: string,
): Promise<Result<null>> {
  const supabase = await client();
  if (!supabase) return fail(NOT_CONFIGURED);
  try {
    const { error } = await supabase.rpc("remove_group_member", {
      p_group_id: groupId,
      p_user_id: userId,
    });
    if (error) throw new Error(error.message);
    return ok(null);
  } catch (e) {
    return fail(friendly(e instanceof Error ? e.message : "Could not remove them."));
  }
}

export async function deleteGroup(groupId: string): Promise<Result<null>> {
  const supabase = await client();
  if (!supabase) return fail(NOT_CONFIGURED);
  try {
    const { error } = await supabase.rpc("delete_group", { p_group_id: groupId });
    if (error) throw new Error(error.message);
    return ok(null);
  } catch (e) {
    return fail(friendly(e instanceof Error ? e.message : "Could not delete the group."));
  }
}

/**
 * Keeps the caller's own row current: the name they go by, and which habit
 * this group reads. Covered by the "members maintain their own row" policy,
 * so it needs no function of its own.
 */
export async function updateMyMembership(
  groupId: string,
  userId: string,
  patch: { displayName?: string; habitId?: string },
): Promise<Result<null>> {
  const supabase = await client();
  if (!supabase) return fail(NOT_CONFIGURED);
  const row: Record<string, string> = {};
  if (patch.displayName !== undefined) row.display_name = patch.displayName;
  if (patch.habitId !== undefined) row.habit_id = patch.habitId;
  if (!Object.keys(row).length) return ok(null);
  try {
    const { error } = await supabase
      .from("group_members")
      .update(row)
      .eq("group_id", groupId)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return ok(null);
  } catch (e) {
    return fail(friendly(e instanceof Error ? e.message : "Could not update your details."));
  }
}

/** Pending invitations sent by this group, so members can see and revoke them. */
export async function listSentInvites(groupId: string): Promise<Result<string[]>> {
  const supabase = await client();
  if (!supabase) return fail(NOT_CONFIGURED);
  try {
    const { data, error } = await supabase
      .from("group_invites")
      .select("email_lower")
      .eq("group_id", groupId);
    if (error) throw new Error(error.message);
    return ok((data ?? []).map((r) => r.email_lower as string));
  } catch (e) {
    return fail(friendly(e instanceof Error ? e.message : "Could not load invitations."));
  }
}

export async function revokeInvite(
  groupId: string,
  email: string,
): Promise<Result<null>> {
  const supabase = await client();
  if (!supabase) return fail(NOT_CONFIGURED);
  try {
    const { error } = await supabase
      .from("group_invites")
      .delete()
      .eq("group_id", groupId)
      .eq("email_lower", email.toLowerCase());
    if (error) throw new Error(error.message);
    return ok(null);
  } catch (e) {
    return fail(friendly(e instanceof Error ? e.message : "Could not revoke."));
  }
}

/**
 * Detaches a habit from every group of the caller's that was reading it.
 *
 * Deleting a habit used to leave the group holding a pointer to nothing: the
 * member stopped publishing but stayed in the count, so the group could never
 * reach "everyone showed up" again and nobody was told why. Clearing the link
 * is what takes them out of the denominator — `habit_id` is the only part of
 * this the other members can see.
 *
 * `erasePublished` is the difference between deleting a habit and archiving
 * one. A deletion takes the local history with it, so leaving the group's copy
 * behind would strand rows that can never be corrected, and would blend two
 * habits' histories under one name if the member later linked a different one.
 * Archiving is a pause, so those rows stay and come back intact on relinking.
 *
 * The erase happens before the unlink, deliberately. If it fails, the link is
 * still set and the next refresh tries the whole thing again; the other order
 * would lose the only marker saying there is anything left to clean up.
 *
 * Scoped to the caller's own rows on every statement, and both policies
 * already allow exactly this — `for all` on progress, and "members maintain
 * their own row" for the link — so it needs no function of its own.
 */
export async function unlinkHabit(
  habitId: string,
  opts: { erasePublished: boolean },
): Promise<Result<number>> {
  const session = await clientAsUser();
  if (!session) return fail(NOT_CONFIGURED);
  const { supabase, userId } = session;

  try {
    const { data: rows, error } = await supabase
      .from("group_members")
      .select("group_id")
      .eq("user_id", userId)
      .eq("habit_id", habitId);
    if (error) throw new Error(error.message);
    if (!rows?.length) return ok(0);

    for (const row of rows) {
      const groupId = row.group_id as string;
      if (opts.erasePublished) {
        const { error: pErr } = await supabase
          .from("group_progress")
          .delete()
          .eq("group_id", groupId)
          .eq("user_id", userId);
        if (pErr) throw new Error(pErr.message);
      }
      const { error: mErr } = await supabase
        .from("group_members")
        .update({ habit_id: null })
        .eq("group_id", groupId)
        .eq("user_id", userId);
      if (mErr) throw new Error(mErr.message);
    }
    return ok(rows.length);
  } catch (e) {
    return fail(friendly(e instanceof Error ? e.message : "Could not detach that habit."));
  }
}
