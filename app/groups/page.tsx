"use client";

import Link from "next/link";
import { useState } from "react";
import { Aurora } from "@/components/Aurora";
import { HabitTile } from "@/components/HabitGlyph";
import { CaretLeft, ICON_WEIGHT, Plus } from "@/components/icons";
import { GroupComposer } from "@/components/groups/GroupComposer";
import { GroupEditSheet } from "@/components/groups/GroupEditSheet";
import { GroupDetailSheet } from "@/components/groups/GroupDetailSheet";
import { InviteLanding } from "@/components/groups/InviteLanding";
import { useGroups } from "@/lib/groups/useGroups";
import { currentTally, groupTimeline } from "@/lib/groups/progress";
import type { GroupDetail, PendingInvite } from "@/lib/groups/types";
import { accentOf } from "@/lib/palette";
import { useStore } from "@/lib/store";
import { isActive } from "@/lib/types";
import { clearUrlFlag, useUrlValue } from "@/lib/useUrlFlag";

function cadenceLine(cadence: string, target: number) {
  const per = cadence === "daily" ? "day" : cadence === "weekly" ? "week" : "month";
  return target > 1 ? `${target}× a ${per}` : `Every ${per}`;
}

export default function GroupsPage() {
  const groups = useGroups();
  const [composing, setComposing] = useState(false);
  const [open, setOpen] = useState<GroupDetail | null>(null);
  const [editing, setEditing] = useState<GroupDetail | null>(null);
  const { habits } = useStore();
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  // Someone arriving from a shared link. The id is only ever used to look up
  // what the group is called — it grants nothing.
  const linkedGroupId = useUrlValue("invite");
  const [linkDismissed, setLinkDismissed] = useState(false);
  const showLanding = !!linkedGroupId && !linkDismissed;

  const detail = open ? groups.groups.find((g) => g.group.id === open.group.id) ?? null : null;

  async function respond(invite: PendingInvite, join: boolean) {
    setBusy(invite.groupId);
    setProblem(null);
    const result = join
      ? await groups.accept(invite)
      : await groups.decline(invite.groupId);
    setBusy(null);
    if (!result.ok) setProblem(result.error);
  }

  return (
    <>
      <Aurora />
      <div className="mx-auto flex min-h-svh w-full max-w-2xl flex-col px-4 pt-safe sm:px-6">
        <header className="flex items-center gap-3 py-4">
          <Link
            href="/"
            aria-label="Back"
            className="tap-target -ml-2 grid place-items-center rounded-full text-bone/60 transition hover:bg-white/10 hover:text-bone active:scale-90"
          >
            <CaretLeft size={22} weight={ICON_WEIGHT} aria-hidden />
          </Link>
          <h1 className="display-md">Together</h1>
        </header>

        <main className="flex-1 pb-28">
          {groups.status === "disabled" ? (
            <p className="card p-6 text-sm leading-relaxed text-bone/55">
              Shared habits need an account, since they have to reach other
              people. Everything else in the app keeps working without one.
            </p>
          ) : groups.status === "signed-out" ? (
            <div className="space-y-3">
              {showLanding && linkedGroupId && (
                <InviteLanding
                  groupId={linkedGroupId}
                  invitesLoaded={false}
                  hasInvite={false}
                  alreadyMember={false}
                  signedIn={false}
                  onDismiss={() => {
                    setLinkDismissed(true);
                    clearUrlFlag("invite");
                  }}
                />
              )}
              <div className="card p-6">
              <p className="text-base font-bold text-bone">Sign in to track together</p>
              <p className="mt-1.5 text-sm leading-relaxed text-bone/55">
                Your own habits stay on this device either way. Signing in is
                what lets a group see whether you showed up — and nothing else.
              </p>
                <Link
                  href="/?settings=1"
                  className="mt-4 inline-block rounded-2xl bg-fresh px-5 py-3 text-sm font-bold text-[#00160a] transition active:scale-95"
                >
                  Open Settings
                </Link>
              </div>
            </div>
          ) : groups.status === "error" ? (
            <div className="card p-6">
              <p className="text-base font-bold text-bone">Can&rsquo;t load your groups</p>
              <p className="mt-1.5 text-sm text-bone/55">{groups.error}</p>
              <button
                type="button"
                onClick={() => void groups.refresh()}
                className="mt-4 rounded-full border border-white/12 px-4 py-2 text-sm font-semibold text-bone/70 transition hover:bg-white/10"
              >
                Try again
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {problem && (
                <p className="rounded-2xl border border-hyperpink/30 bg-hyperpink/10 px-4 py-3 text-sm font-medium text-hyperpink">
                  {problem}
                </p>
              )}

              {showLanding && linkedGroupId && (
                <InviteLanding
                  groupId={linkedGroupId}
                  invitesLoaded={groups.status === "ready"}
                  hasInvite={groups.invites.some((i) => i.groupId === linkedGroupId)}
                  alreadyMember={groups.groups.some((g) => g.group.id === linkedGroupId)}
                  // Narrowed to loading/ready by this branch.
                  signedIn
                  onDismiss={() => {
                    setLinkDismissed(true);
                    clearUrlFlag("invite");
                  }}
                />
              )}

              {/* Invitations — nothing is shared until one of these is accepted. */}
              {groups.invites.map((invite) => {
                const accent = accentOf(invite.accent);
                return (
                  <section
                    key={invite.groupId}
                    className="rounded-[1.75rem] border p-4 sm:p-5"
                    style={{
                      borderColor: `color-mix(in srgb, ${accent.hex} 40%, transparent)`,
                      background: `color-mix(in srgb, ${accent.hex} 10%, transparent)`,
                    }}
                  >
                    <p className="text-[0.6875rem] font-bold uppercase tracking-[0.16em] text-bone/45">
                      Invitation
                    </p>
                    <div className="mt-2 flex items-center gap-3">
                      <HabitTile icon={invite.icon} accent={invite.accent} size={44} glow />
                      <div className="min-w-0">
                        <p className="truncate text-lg font-bold leading-tight">{invite.name}</p>
                        <p className="text-sm text-bone/55">
                          {cadenceLine(invite.cadence, invite.target)} &middot;{" "}
                          {invite.memberCount} member{invite.memberCount === 1 ? "" : "s"}
                        </p>
                      </div>
                    </div>
                    <p className="mt-3 text-sm leading-relaxed text-bone/55">
                      {invite.invitedBy} invited you. Joining creates this habit in
                      your own account and shares one thing with the group:
                      whether you completed it each {invite.cadence === "daily" ? "day" : invite.cadence === "weekly" ? "week" : "month"}.
                      Nothing else you track is visible.
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={busy === invite.groupId}
                        onClick={() => void respond(invite, true)}
                        className="rounded-2xl px-5 py-2.5 text-sm font-bold transition active:scale-95 disabled:opacity-60"
                        style={{ background: accent.hex, color: accent.ink }}
                      >
                        {busy === invite.groupId ? "Joining…" : "Join"}
                      </button>
                      <button
                        type="button"
                        disabled={busy === invite.groupId}
                        onClick={() => void respond(invite, false)}
                        className="rounded-2xl border border-white/12 px-5 py-2.5 text-sm font-semibold text-bone/60 transition hover:bg-white/8 active:scale-95 disabled:opacity-60"
                      >
                        No thanks
                      </button>
                    </div>
                  </section>
                );
              })}

              {groups.status === "loading" && !groups.groups.length ? (
                <div className="card grid place-items-center p-10">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/15 border-t-hyperpink" />
                </div>
              ) : groups.groups.length === 0 && groups.invites.length === 0 ? (
                <div className="card p-6 text-center sm:p-8">
                  <p className="display-md text-bone">Better with company</p>
                  <p className="mx-auto mt-2 max-w-[36ch] text-sm leading-relaxed text-bone/55">
                    A shared habit is one goal, tracked separately. Everyone
                    checks in for themselves; the group sees who showed up, and
                    nothing else.
                  </p>
                </div>
              ) : (
                groups.groups.map((detailItem) => {
                  const { group, members, progress } = detailItem;
                  const accent = accentOf(group.accent);
                  const now = currentTally(members, progress, group.cadence);
                  const timeline = groupTimeline(members, progress, group.cadence, 14);
                  return (
                    <button
                      key={group.id}
                      type="button"
                      onClick={() => setOpen(detailItem)}
                      className="card w-full p-4 text-left transition hover:bg-white/8 active:scale-[0.99] sm:p-5"
                    >
                      <div className="flex items-center gap-3">
                        <HabitTile icon={group.icon} accent={group.accent} size={44} glow />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-lg font-bold leading-tight">{group.name}</p>
                          <p className="text-sm text-bone/50">
                            {cadenceLine(group.cadence, group.target)} &middot;{" "}
                            {members.length} member{members.length === 1 ? "" : "s"}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p
                            className="font-display text-2xl leading-none tabular-nums"
                            style={{ color: accent.hex }}
                          >
                            {now.completed}
                            <span className="text-bone/35">/{now.members}</span>
                          </p>
                          <p className="mt-1 text-[0.625rem] font-semibold uppercase tracking-wider text-bone/40">
                            {group.cadence === "daily" ? "today" : "this period"}
                          </p>
                        </div>
                      </div>

                      <div className="mt-3.5 flex items-end gap-1" aria-hidden>
                        {timeline.map((t) => (
                          <span
                            key={t.periodStart}
                            className="h-8 flex-1 rounded-sm bg-white/6"
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
                    </button>
                  );
                })
              )}
            </div>
          )}
        </main>
      </div>

      {groups.status === "ready" && (
        <button
          type="button"
          onClick={() => setComposing(true)}
          aria-label="New group"
          className="fixed right-4 z-30 inline-flex items-center gap-2 rounded-full bg-bone px-5 py-4 font-bold text-ink shadow-2xl transition active:scale-90 inset-safe-b sm:right-6"
        >
          <Plus size={20} weight={ICON_WEIGHT} aria-hidden />
          <span className="text-sm">New group</span>
        </button>
      )}

      <GroupComposer
        open={composing}
        onClose={() => setComposing(false)}
        onCreate={groups.create}
      />
      <GroupDetailSheet
        key={detail?.group.id ?? "none"}
        open={!!detail && !editing}
        detail={detail}
        userId={groups.userId}
        habits={habits.filter(isActive)}
        onClose={() => setOpen(null)}
        onLeave={groups.leave}
        onRemove={groups.remove}
        onDestroy={groups.destroy}
        onRelink={groups.relink}
        onEdit={setEditing}
        onRefresh={groups.refresh}
      />
      <GroupEditSheet
        key={`edit-${editing?.group.id ?? "none"}`}
        open={!!editing}
        detail={editing}
        onClose={() => setEditing(null)}
        onSave={groups.update}
      />
    </>
  );
}
