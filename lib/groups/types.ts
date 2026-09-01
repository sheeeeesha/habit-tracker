import type { Cadence } from "../date";

/**
 * The group read-model.
 *
 * None of this is a source of truth. It is fetched, displayed, and thrown
 * away: habits and check-ins live in the local store exactly as they did
 * before groups existed, and nothing here ever writes into them. If the
 * network is gone, the groups screen is empty and the rest of the app is
 * unaffected — which is the whole reason it is kept separate.
 */

export interface Group {
  id: string;
  name: string;
  icon: string;
  accent: string;
  cadence: Cadence;
  target: number;
  createdBy: string;
}

export interface GroupMember {
  userId: string;
  /** The member's own habit, in their own account. */
  habitId: string | null;
  displayName: string;
  joinedAt: string;
}

/** One member's completion for one period — the only thing members share. */
export interface ProgressRow {
  userId: string;
  periodStart: string;
  completed: boolean;
}

export interface GroupDetail {
  group: Group;
  members: GroupMember[];
  progress: ProgressRow[];
}

/** The little a shared invite link reveals, before anyone signs in. */
export interface GroupPreview {
  name: string;
  icon: string;
  accent: string;
  cadence: Cadence;
  target: number;
  memberCount: number;
}

export interface PendingInvite {
  groupId: string;
  name: string;
  icon: string;
  accent: string;
  cadence: Cadence;
  target: number;
  memberCount: number;
  invitedBy: string;
  createdAt: string;
}
