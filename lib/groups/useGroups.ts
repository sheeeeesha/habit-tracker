"use client";

import { useCallback, useEffect, useState } from "react";
import * as api from "./api";
import { myProgressRows } from "./progress";
import { addHabit, readState } from "../store";
import { emptyDraft } from "../habits";
import { getSupabase, isSyncConfigured } from "../supabase/client";
import type { Cadence } from "../date";
import type { GroupDetail, PendingInvite } from "./types";
import type { AccentKey } from "../palette";
import type { HabitIconKey } from "../habitIcons";

/**
 * The groups read-model, held in React state and nowhere else.
 *
 * Not persisted on purpose. Groups are the one part of this app that genuinely
 * requires the network, and caching them would create a second, quietly stale
 * copy of other people's progress. Offline, this is simply empty and the rest
 * of the app carries on exactly as it always has.
 */

export type GroupsStatus = "disabled" | "signed-out" | "loading" | "ready" | "error";

export interface GroupsView {
  status: GroupsStatus;
  groups: GroupDetail[];
  invites: PendingInvite[];
  error: string | null;
  userId: string | null;
  refresh: () => Promise<void>;
  create: (input: {
    name: string;
    icon: HabitIconKey;
    accent: AccentKey;
    cadence: Cadence;
    target: number;
  }) => Promise<api.Result<string>>;
  accept: (invite: PendingInvite) => Promise<api.Result<null>>;
  decline: (groupId: string) => Promise<api.Result<null>>;
  leave: (groupId: string) => Promise<api.Result<null>>;
}

export function useGroups(): GroupsView {
  const [status, setStatus] = useState<GroupsStatus>(
    isSyncConfigured ? "loading" : "disabled",
  );
  const [groups, setGroups] = useState<GroupDetail[]>([]);
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  /**
   * Publishes the caller's own completion for each group, then reloads.
   *
   * Publishing is derived entirely from the local store: this reads the habit
   * the member linked when they joined and republishes the recent window. It
   * is idempotent, so doing it on every refresh costs one small upsert and
   * removes any need to track what was last sent.
   */
  const refresh = useCallback(async () => {
    // The session lookup comes first deliberately: this runs straight from an
    // effect, and every state write below it therefore lands in a callback
    // rather than synchronously during the effect.
    const supabase = getSupabase();
    const session = supabase ? (await supabase.auth.getSession()).data.session : null;

    if (!supabase) {
      setStatus("disabled");
      return;
    }
    if (!session) {
      setStatus("signed-out");
      setGroups([]);
      setInvites([]);
      return;
    }
    setUserId(session.user.id);
    setStatus("loading");

    const [groupsResult, invitesResult] = await Promise.all([
      api.listGroups(),
      api.listInvites(),
    ]);

    if (!groupsResult.ok) {
      setError(groupsResult.error);
      setStatus("error");
      return;
    }
    setInvites(invitesResult.ok ? invitesResult.data : []);

    // Publish before showing, so the member's own row is current in what they
    // are about to look at.
    const state = readState();
    await Promise.all(
      groupsResult.data.map(async (detail) => {
        const me = detail.members.find((m) => m.userId === session.user.id);
        if (!me?.habitId) return;
        const habit = state.habits.find((h) => h.id === me.habitId && !h.deletedAt);
        if (!habit) return;
        await api.publishProgress(detail.group.id, myProgressRows(habit, state.log));
      }),
    );

    const fresh = await api.listGroups();
    setGroups(fresh.ok ? fresh.data : groupsResult.data);
    setError(null);
    setStatus("ready");
  }, []);

  /**
   * Load once the auth state is known, and again whenever it changes.
   *
   * Driving this off the session rather than off mount fixes a real gap:
   * signing in or out from Settings while this page is open used to leave a
   * stale list on screen. It is also the shape an effect is meant to have —
   * subscribe to an external system and act in the callback, rather than
   * kicking off work synchronously in the body.
   */
  useEffect(() => {
    const supabase = getSupabase();
    // Not configured: the initial status is already "disabled".
    if (!supabase) return;

    let live = true;
    supabase.auth.getSession().then(() => {
      if (live) void refresh();
    });
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      if (live) void refresh();
    });

    return () => {
      live = false;
      sub.subscription.unsubscribe();
    };
  }, [refresh]);

  /**
   * Creating a group also creates the caller's own habit for it, locally.
   *
   * The habit is theirs like any other — it syncs through the existing path,
   * appears on the home screen, and is checked off the same way. The group
   * only holds a pointer to it.
   */
  const create = useCallback<GroupsView["create"]>(
    async (input) => {
      const state = readState();
      const habit = addHabit({
        ...emptyDraft(input.accent),
        name: input.name,
        icon: input.icon,
        accent: input.accent,
        cadence: input.cadence,
        target: input.target,
      });

      const result = await api.createGroup({
        name: input.name,
        icon: input.icon,
        accent: input.accent,
        cadence: input.cadence,
        target: input.target,
        habitId: habit.id,
        displayName: state.name,
      });
      if (result.ok) await refresh();
      return result;
    },
    [refresh],
  );

  const accept = useCallback<GroupsView["accept"]>(
    async (invite) => {
      const state = readState();
      // Same shape as creating one: the joiner gets their own habit, matching
      // the group's rhythm, that they own outright.
      const habit = addHabit({
        ...emptyDraft(invite.accent as AccentKey),
        name: invite.name,
        icon: invite.icon as HabitIconKey,
        accent: invite.accent as AccentKey,
        cadence: invite.cadence,
        target: invite.target,
      });

      const result = await api.acceptInvite(invite.groupId, habit.id, state.name);
      if (result.ok) await refresh();
      return result;
    },
    [refresh],
  );

  const decline = useCallback<GroupsView["decline"]>(
    async (groupId) => {
      const result = await api.declineInvite(groupId);
      if (result.ok) await refresh();
      return result;
    },
    [refresh],
  );

  const leave = useCallback<GroupsView["leave"]>(
    async (groupId) => {
      if (!userId) return { ok: false, error: "Sign in first." };
      const result = await api.leaveGroup(groupId, userId);
      // The habit stays. Leaving a group is not a reason to lose the history
      // of a habit the person owns.
      if (result.ok) await refresh();
      return result;
    },
    [refresh, userId],
  );

  return { status, groups, invites, error, userId, refresh, create, accept, decline, leave };
}
