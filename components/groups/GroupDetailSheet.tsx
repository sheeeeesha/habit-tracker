"use client";

import { useEffect, useState } from "react";
import { Sheet } from "../Sheet";
import { HabitTile } from "../HabitGlyph";
import { Check, ICON_WEIGHT } from "../icons";
import * as api from "@/lib/groups/api";
import {
  currentTally,
  linkState,
  groupNote,
  groupTimeline,
  memberStandings,
} from "@/lib/groups/progress";
import type { GroupDetail } from "@/lib/groups/types";
import type { Habit } from "@/lib/types";
import { accentOf } from "@/lib/palette";

interface GroupDetailSheetProps {
  open: boolean;
  detail: GroupDetail | null;
  userId: string | null;
  /** The caller's own habits, for repairing a broken link. */
  habits: Habit[];
  onClose: () => void;
  onLeave: (groupId: string) => Promise<api.Result<null>>;
  onRemove: (groupId: string, memberId: string) => Promise<api.Result<null>>;
  onDestroy: (groupId: string) => Promise<api.Result<null>>;
  onRelink: (groupId: string, habitId: string) => Promise<api.Result<null>>;
  onEdit: (detail: GroupDetail) => void;
  onRefresh: () => Promise<void>;
}

export function GroupDetailSheet({
  open,
  detail,
  userId,
  habits,
  onClose,
  onLeave,
  onRemove,
  onDestroy,
  onRelink,
  onEdit,
  onRefresh,
}: GroupDetailSheetProps) {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, setPending] = useState<string[]>([]);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  const groupId = detail?.group.id ?? null;

  // No form reset here: the caller remounts this sheet per group (see the
  // `key` on <GroupDetailSheet>), so the state above starts fresh every time
  // it opens. The effect only fetches, and writes state from the callback.
  useEffect(() => {
    if (!open || !groupId) return;
    let live = true;
    api.listSentInvites(groupId).then((r) => {
      if (live && r.ok) setPending(r.data);
    });
    return () => {
      live = false;
    };
  }, [open, groupId]);

  if (!detail) return null;

  const { group, members, progress } = detail;
  const accent = accentOf(group.accent);
  const now = currentTally(members, progress, group.cadence);
  const timeline = groupTimeline(members, progress, group.cadence, 14);
  const standings = memberStandings(members, progress, group.cadence);
  const note = groupNote(timeline);
  const periodWord =
    group.cadence === "daily" ? "day" : group.cadence === "weekly" ? "week" : "month";
  const isCreator = userId === group.createdBy;

  // The habit this group reads from can be deleted or archived like any
  // other, at which point the member stops publishing. Surfacing that beats
  // leaving somebody to wonder why their name never lights up.
  const me = members.find((m) => m.userId === userId);
  const link = me ? linkState(me.habitId, habits) : null;
  const linkBroken = !!link && link.kind !== "tracking";
  // Being unsure is its own case. A habit that is merely absent from this
  // device is very often one that has not synced here yet, and telling
  // somebody it was deleted — then offering to replace it — is how a link
  // that was fine gets detached for good.
  const linkUnsure = link?.kind === "unknown";
  // Habits this group could read instead. Archiving the linked habit tends to
  // empty this, since the archived one is itself excluded — so the empty case
  // needs an answer rather than a blank row of nothing.
  const relinkable = habits.filter(
    (h) => !h.deletedAt && !h.archivedAt && h.cadence === group.cadence,
  );

  async function sendInvite(e: React.FormEvent) {
    e.preventDefault();
    const address = email.trim();
    if (!address || !groupId) return;
    setSending(true);
    setProblem(null);
    const result = await api.invite(groupId, address);
    setSending(false);
    if (!result.ok) {
      setProblem(result.error);
      return;
    }
    // Deliberately the same message whatever happened at the other end: the
    // server does not tell us whether that address has an account, and saying
    // anything more specific would turn this box into a way to find out.
    setSent(address);
    setEmail("");
    const refreshed = await api.listSentInvites(groupId);
    if (refreshed.ok) setPending(refreshed.data);
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={group.name}
      description={`${members.length} member${members.length === 1 ? "" : "s"} · everyone tracks it separately`}
    >
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <HabitTile icon={group.icon} accent={group.accent} size={52} glow />
          <div>
            <p className="font-display text-3xl leading-none tabular-nums" style={{ color: accent.hex }}>
              {now.completed}
              <span className="text-bone/30">/{now.members}</span>
            </p>
            <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-bone/40">
              showed up this {periodWord}
            </p>
          </div>
        </div>

        {note && (
          <p
            className="rounded-2xl px-4 py-3 text-sm font-medium leading-relaxed"
            style={{
              background: `color-mix(in srgb, ${accent.hex} 12%, transparent)`,
              color: accent.hex,
            }}
          >
            {note}
          </p>
        )}

        <div>
          <p className="mb-2 text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-bone/45">
            Last 14 {periodWord}s
          </p>
          <div className="flex items-end gap-1" aria-hidden>
            {timeline.map((t) => (
              <span
                key={t.periodStart}
                title={`${t.completed} of ${t.members}`}
                className="h-10 flex-1 rounded-sm bg-white/6"
                style={{
                  background:
                    t.ratio > 0
                      ? `color-mix(in srgb, ${accent.hex} ${Math.round(t.ratio * 100)}%, rgba(246,242,233,.07))`
                      : undefined,
                  outline: t.current ? `1px solid ${accent.hex}` : undefined,
                }}
              />
            ))}
          </div>
          <p className="mt-2 text-xs leading-relaxed text-bone/35">
            How much of the group showed up, not who. Nobody is ranked here on
            purpose &mdash; a table with someone at the bottom is the fastest
            way to lose them.
          </p>
        </div>

        {/* Members, in join order. Never sorted by performance. */}
        <div>
          <p className="mb-2 text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-bone/45">
            Who&rsquo;s in
          </p>
          <ul className="space-y-2">
            {standings.map((s) => {
              const isMe = s.member.userId === userId;
              return (
                <li
                  key={s.member.userId}
                  className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/4 px-3.5 py-3"
                >
                  <span
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold"
                    style={
                      s.doneThisPeriod
                        ? { background: accent.hex, color: accent.ink }
                        : { background: "rgba(246,242,233,.08)", color: "rgba(246,242,233,.4)" }
                    }
                  >
                    {s.doneThisPeriod ? (
                      <Check size={15} weight={ICON_WEIGHT} aria-hidden />
                    ) : (
                      s.member.displayName.slice(0, 1).toUpperCase()
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[0.9375rem] font-semibold text-bone">
                      {s.member.displayName}
                      {isMe && <span className="ml-1.5 text-xs text-bone/35">you</span>}
                    </span>
                    <span className="block text-xs text-bone/45">
                      {!s.tracking
                        ? "not tracking this right now"
                        : s.rate === null
                          ? "nothing published yet"
                          : `${Math.round(s.rate * 100)}% of the last ${s.published}`}
                    </span>
                  </span>
                  {isCreator && !isMe && (
                    <button
                      type="button"
                      onClick={async () => {
                        if (removing !== s.member.userId) {
                          setRemoving(s.member.userId);
                          return;
                        }
                        if (!groupId) return;
                        const r = await onRemove(groupId, s.member.userId);
                        setRemoving(null);
                        if (!r.ok) setProblem(r.error);
                      }}
                      className="shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold text-bone/35 transition hover:bg-white/10 hover:text-hyperpink"
                    >
                      {removing === s.member.userId ? "Sure?" : "Remove"}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        {linkBroken && (
          <div className="rounded-2xl border border-highlight/30 bg-highlight/8 p-4">
            <p className="text-[0.9375rem] font-semibold text-bone">
              {linkUnsure
                ? "This device can't see the habit for this group"
                : "Nothing is being shared from this device"}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-bone/55">
              {link?.kind === "deleted" ? (
                <>
                  The habit this group was reading has been deleted, so what it
                  had published has been withdrawn along with it. Point the
                  group at another habit to start again.
                </>
              ) : link?.kind === "archived" ? (
                <>
                  The habit this group was reading is archived, so nothing is
                  reaching it. Your published history is still here and comes
                  back if you restore that habit from Settings — or point the
                  group at a different one.
                </>
              ) : link?.kind === "unknown" ? (
                <>
                  It may simply not have synced to this device yet. Nothing has
                  been changed, and it should sort itself out once this device
                  catches up. Check in from the device you usually use.
                </>
              ) : (
                <>
                  This group is not reading any of your habits. Point it at one
                  to start sharing again.
                </>
              )}
            </p>
            {!linkUnsure &&
              (relinkable.length ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {relinkable.map((h) => (
                    <button
                      key={h.id}
                      type="button"
                      onClick={() => void onRelink(group.id, h.id)}
                      className="rounded-full border border-white/12 px-3 py-1.5 text-xs font-semibold text-bone/70 transition hover:bg-white/10 hover:text-bone active:scale-95"
                    >
                      {h.name}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-xs leading-relaxed text-bone/40">
                  You have no other {group.cadence} habit to point
                  it at. Start one on the home screen and it will appear here.
                </p>
              ))}
          </div>
        )}

        {/* Invite ------------------------------------------------------- */}
        <div>
          <p className="mb-2 text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-bone/45">
            Invite someone
          </p>
          <form onSubmit={sendInvite} className="rounded-2xl border border-white/10 bg-white/4 p-3.5">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="their@email.com"
              autoComplete="off"
              aria-label="Email address to invite"
              className="w-full rounded-xl border border-white/12 bg-white/5 px-3.5 py-2.5 text-sm text-bone outline-none transition placeholder:text-bone/30 focus:border-white/30"
            />
            {problem && <p className="mt-1.5 text-xs font-medium text-hyperpink">{problem}</p>}
            <button
              type="submit"
              disabled={sending || !email.trim()}
              className="mt-2.5 w-full rounded-xl px-4 py-2.5 text-sm font-bold transition active:scale-[0.98] disabled:opacity-40"
              style={{ background: accent.hex, color: accent.ink }}
            >
              {sending ? "Sending…" : "Send invitation"}
            </button>
            {sent && (
              <p className="mt-2 text-xs leading-relaxed text-bone/55">
                Invitation recorded for <span className="text-bone">{sent}</span>.
                Nothing is emailed &mdash; it appears when they open Together and
                sign in with that address. Send them the link below so they know.
              </p>
            )}
          </form>

          {/* The link is a pointer, not a key: following it grants nothing.
              The recipient still only sees the invitation if it was addressed
              to the verified address on their own account. */}
          <button
            type="button"
            onClick={async () => {
              if (!groupId) return;
              const url = `${window.location.origin}/groups?invite=${groupId}`;
              try {
                if (navigator.share) {
                  await navigator.share({
                    title: group.name,
                    text: `Join "${group.name}" on StreakWrapped`,
                    url,
                  });
                } else {
                  await navigator.clipboard.writeText(url);
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 2500);
                }
              } catch {
                // Share sheet dismissed, or the clipboard was refused.
              }
            }}
            className="mt-2 w-full rounded-xl border border-white/12 px-4 py-2.5 text-sm font-semibold text-bone/70 transition hover:bg-white/10 hover:text-bone active:scale-[0.98]"
          >
            {copied ? "Link copied" : "Share invite link"}
          </button>
          <p className="mt-1.5 text-xs leading-relaxed text-bone/35">
            Safe to send anywhere. The link only opens the app &mdash; whoever
            follows it still has to sign in with the address you invited.
          </p>

          {pending.length > 0 && (
            <ul className="mt-2 space-y-1.5">
              {pending.map((address) => (
                <li
                  key={address}
                  className="flex items-center gap-2 rounded-xl border border-white/8 px-3 py-2 text-xs text-bone/50"
                >
                  <span className="min-w-0 flex-1 truncate">{address}</span>
                  <span className="shrink-0 text-bone/30">invited</span>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!groupId) return;
                      await api.revokeInvite(groupId, address);
                      const r = await api.listSentInvites(groupId);
                      if (r.ok) setPending(r.data);
                    }}
                    className="shrink-0 rounded-full px-2 py-1 font-semibold text-bone/40 transition hover:bg-white/10 hover:text-hyperpink"
                  >
                    Revoke
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-3 border-t border-white/8 pt-4">
          {isCreator && (
            <button
              type="button"
              onClick={() => onEdit(detail)}
              className="rounded-full border border-white/12 px-4 py-2 text-sm font-semibold text-bone/70 transition hover:bg-white/10 hover:text-bone active:scale-95"
            >
              Edit group
            </button>
          )}

          <div>
            <button
              type="button"
              onClick={async () => {
                if (!confirmLeave) {
                  setConfirmLeave(true);
                  return;
                }
                if (!groupId) return;
                const result = await onLeave(groupId);
                if (result.ok) {
                  onClose();
                  await onRefresh();
                } else setProblem(result.error);
              }}
              className="text-sm font-semibold text-bone/45 transition hover:text-hyperpink"
            >
              {confirmLeave ? "Tap again to leave this group" : "Leave group"}
            </button>
            <p className="mt-1.5 text-xs leading-relaxed text-bone/30">
              Your habit and its whole history stay with you. Leaving only stops
              the group seeing whether you showed up.
            </p>
          </div>

          {isCreator && (
            <div>
              <button
                type="button"
                onClick={async () => {
                  if (!confirmDelete) {
                    setConfirmDelete(true);
                    return;
                  }
                  if (!groupId) return;
                  const result = await onDestroy(groupId);
                  if (result.ok) onClose();
                  else setProblem(result.error);
                }}
                className="text-sm font-semibold text-bone/45 transition hover:text-hyperpink"
              >
                {confirmDelete
                  ? "Tap again to delete this group for everyone"
                  : "Delete group"}
              </button>
              <p className="mt-1.5 text-xs leading-relaxed text-bone/30">
                Removes the group for every member. Nobody loses their habit or
                any of its history &mdash; those were always theirs.
              </p>
            </div>
          )}
        </div>
      </div>
    </Sheet>
  );
}
