import { PORTABLE_PREF_KEYS, portablePrefs, type PortablePrefs } from "../store";
import type { Prefs } from "../types";

/**
 * Which way the name and the portable preferences should move.
 *
 * Kept apart from the network call so the rules can be tested without a
 * Supabase client — this is where a "my phone never picked up the setting" bug
 * would live, and it should be provable rather than observed.
 */

export interface ProfileMeta {
  display_name?: unknown;
  display_name_updated_at?: unknown;
  portable_prefs?: unknown;
  portable_prefs_updated_at?: unknown;
}

export interface LocalProfile {
  name: string;
  nameUpdatedAt: number;
  prefs: Prefs;
  prefsUpdatedAt: number;
}

export interface ProfileResolution {
  /** Metadata to write to the account, or null to leave it alone. */
  outgoing: Record<string, unknown> | null;
  /** Values to adopt locally, or null if this device is already current. */
  incoming: {
    name?: string;
    nameUpdatedAt?: number;
    prefs?: Partial<PortablePrefs>;
    prefsUpdatedAt?: number;
  } | null;
}

/**
 * Last-write-wins, with the account's copy breaking exact ties.
 *
 * Preferences resolve as a group rather than field by field. Changing the
 * model on one device while toggling reduced motion on another, both offline,
 * settles on one device's group — acceptable for four settings that change
 * rarely, and the alternative is four more timestamps to carry and reconcile.
 *
 * Nothing here touches the API key. Syncing it would write a live key into the
 * database at rest, so it stays on whichever device typed it.
 */
export function resolveProfile(
  meta: ProfileMeta | null | undefined,
  local: LocalProfile,
): ProfileResolution {
  const m = meta ?? {};
  const outgoing: Record<string, unknown> = {};
  const incoming: NonNullable<ProfileResolution["incoming"]> = {};

  // --- display name --------------------------------------------------------
  const remoteName = typeof m.display_name === "string" ? m.display_name : "";
  const remoteNameAt =
    typeof m.display_name_updated_at === "number" ? m.display_name_updated_at : 0;

  if (remoteName !== local.name) {
    if (local.nameUpdatedAt > remoteNameAt) {
      outgoing.display_name = local.name;
      outgoing.display_name_updated_at = local.nameUpdatedAt;
    } else if (remoteNameAt > 0) {
      incoming.name = remoteName;
      incoming.nameUpdatedAt = remoteNameAt;
    }
    // Neither branch: the account has no name and this device has not set one
    // either. Writing an empty string over nothing helps no one.
  }

  // --- portable preferences ------------------------------------------------
  const mine = portablePrefs(local.prefs);
  const remotePrefs =
    m.portable_prefs && typeof m.portable_prefs === "object"
      ? (m.portable_prefs as Partial<PortablePrefs>)
      : null;
  const remotePrefsAt =
    typeof m.portable_prefs_updated_at === "number" ? m.portable_prefs_updated_at : 0;

  const differ =
    !remotePrefs || PORTABLE_PREF_KEYS.some((k) => !Object.is(remotePrefs[k], mine[k]));

  if (differ) {
    if (local.prefsUpdatedAt > remotePrefsAt) {
      outgoing.portable_prefs = mine;
      outgoing.portable_prefs_updated_at = local.prefsUpdatedAt;
    } else if (remotePrefs && remotePrefsAt > 0) {
      // Only the keys this version knows about, so a field added by a newer
      // client cannot land in prefs as something nothing here reads.
      const adopted: Partial<PortablePrefs> = {};
      for (const k of PORTABLE_PREF_KEYS) {
        if (remotePrefs[k] !== undefined) {
          (adopted as Record<string, unknown>)[k] = remotePrefs[k];
        }
      }
      incoming.prefs = adopted;
      incoming.prefsUpdatedAt = remotePrefsAt;
    }
    // Neither branch: a device that has never changed a preference, against an
    // account that has never stored one. Defaults on both sides; nothing to do.
  }

  return {
    outgoing: Object.keys(outgoing).length ? outgoing : null,
    incoming: Object.keys(incoming).length ? incoming : null,
  };
}
