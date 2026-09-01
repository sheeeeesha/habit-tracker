"use client";

import { useEffect, useState } from "react";
import { HabitTile } from "../HabitGlyph";
import * as api from "@/lib/groups/api";
import { accentOf } from "@/lib/palette";
import type { GroupPreview } from "@/lib/groups/types";

interface InviteLandingProps {
  groupId: string;
  /** True once the pending invitations for this account have been fetched. */
  invitesLoaded: boolean;
  /** Whether an invitation to this group is actually waiting for this account. */
  hasInvite: boolean;
  alreadyMember: boolean;
  signedIn: boolean;
  onDismiss: () => void;
}

/**
 * What someone sees after following a shared invite link.
 *
 * The link carries no authority, so this panel's whole job is to explain the
 * one thing that decides whether it works: the invitation is attached to an
 * email address, and it only appears for the account using that address. Being
 * signed in as the wrong person looks exactly like not being invited, and
 * without saying so the failure is baffling.
 */
export function InviteLanding({
  groupId,
  invitesLoaded,
  hasInvite,
  alreadyMember,
  signedIn,
  onDismiss,
}: InviteLandingProps) {
  const [preview, setPreview] = useState<GroupPreview | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    api.groupPreview(groupId).then((r) => {
      if (!live) return;
      if (r.ok) setPreview(r.data);
      else setProblem(r.error);
    });
    return () => {
      live = false;
    };
  }, [groupId]);

  // The invitation itself is rendered by the page, so once it has arrived this
  // panel would only be repeating it.
  if (hasInvite || alreadyMember) return null;

  const accent = accentOf(preview?.accent ?? "hyperpink");
  const periodWord =
    preview?.cadence === "weekly" ? "week" : preview?.cadence === "monthly" ? "month" : "day";

  return (
    <section
      className="rounded-[1.75rem] border p-4 sm:p-5"
      style={{
        borderColor: `color-mix(in srgb, ${accent.hex} 35%, transparent)`,
        background: `color-mix(in srgb, ${accent.hex} 8%, transparent)`,
      }}
    >
      <p className="text-[0.6875rem] font-bold uppercase tracking-[0.16em] text-bone/45">
        You followed an invite link
      </p>

      {problem ? (
        <p className="mt-2 text-sm leading-relaxed text-bone/55">{problem}</p>
      ) : !preview ? (
        <div className="mt-3 h-10 w-40 animate-pulse rounded-lg bg-white/8" />
      ) : (
        <>
          <div className="mt-2 flex items-center gap-3">
            <HabitTile icon={preview.icon} accent={preview.accent} size={44} glow />
            <div className="min-w-0">
              <p className="truncate text-lg font-bold leading-tight">{preview.name}</p>
              <p className="text-sm text-bone/55">
                {preview.target > 1 ? `${preview.target}× a ${periodWord}` : `Every ${periodWord}`}{" "}
                &middot; {preview.memberCount} member{preview.memberCount === 1 ? "" : "s"}
              </p>
            </div>
          </div>

          <p className="mt-3 text-sm leading-relaxed text-bone/55">
            {!signedIn ? (
              <>
                Sign in with <strong className="text-bone">the email address you were
                invited on</strong>, and this invitation will be waiting. The link
                itself does not let anyone in &mdash; that is deliberate.
              </>
            ) : !invitesLoaded ? (
              "Checking for your invitation…"
            ) : (
              <>
                No invitation to this group is waiting for the account you are
                signed in as. Invitations are attached to an email address, so
                this usually means it was sent to a different one &mdash; sign in
                with that address, or ask them to invite the one you use here.
              </>
            )}
          </p>
        </>
      )}

      <button
        type="button"
        onClick={onDismiss}
        className="mt-3 rounded-full px-3.5 py-1.5 text-xs font-semibold text-bone/45 transition hover:bg-white/10 hover:text-bone"
      >
        Dismiss
      </button>
    </section>
  );
}
