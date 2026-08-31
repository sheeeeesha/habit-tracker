"use client";

import { useState } from "react";
import { isSyncConfigured } from "@/lib/supabase/client";
import { signInWithEmail, signOut, verifyEmailCode } from "@/lib/sync/engine";
import { useSyncView } from "./SyncProvider";
import type { SyncStatus } from "@/lib/sync/useSync";

const STATUS_COPY: Record<SyncStatus, { label: string; tone: string }> = {
  disabled: { label: "Off", tone: "bg-white/10 text-bone/50" },
  "signed-out": { label: "Local only", tone: "bg-white/10 text-bone/50" },
  idle: { label: "Synced", tone: "bg-fresh/20 text-fresh" },
  syncing: { label: "Syncing", tone: "bg-electric/20 text-electric" },
  offline: { label: "Offline", tone: "bg-highlight/20 text-highlight" },
  error: { label: "Failed", tone: "bg-hyperpink/20 text-hyperpink" },
};

function relativeTime(ms: number | null): string {
  if (!ms) return "never";
  const diff = Date.now() - ms;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)} min ago`;
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)} h ago`;
  return `${Math.round(diff / 86_400_000)} d ago`;
}

export function SyncSection() {
  const { status, email, lastSyncedAt, error, sync } = useSyncView();
  const [address, setAddress] = useState("");
  const [code, setCode] = useState("");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const badge = STATUS_COPY[status];

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = address.trim();
    if (!trimmed) return;
    setSending(true);
    setProblem(null);
    const failure = await signInWithEmail(trimmed);
    setSending(false);
    if (failure) setProblem(failure);
    else {
      setSentTo(trimmed);
      setCode("");
    }
  }

  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    if (!sentTo || !code.trim()) return;
    setVerifying(true);
    setProblem(null);
    const failure = await verifyEmailCode(sentTo, code);
    setVerifying(false);
    if (failure) setProblem(failure);
    else setSentTo(null);
  }

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <p className="text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-bone/45">
          Backup &amp; sync
        </p>
        <span
          className={`rounded-full px-2.5 py-1 text-[0.625rem] font-bold uppercase ${badge.tone}`}
        >
          {badge.label}
        </span>
      </div>

      {!isSyncConfigured ? (
        <p className="rounded-2xl border border-white/10 bg-white/4 px-4 py-3 text-xs leading-relaxed text-bone/45">
          This build has no Supabase project attached, so everything stays on this
          device. Set <code className="text-bone/70">NEXT_PUBLIC_SUPABASE_URL</code>{" "}
          and <code className="text-bone/70">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to
          turn on cross-device sync.
        </p>
      ) : email ? (
        <div className="rounded-2xl border border-white/10 bg-white/4 px-4 py-3.5">
          <p className="truncate text-[0.9375rem] font-semibold text-bone">{email}</p>
          <p className="mt-0.5 text-xs text-bone/45">
            Last synced {relativeTime(lastSyncedAt)}
            {status === "offline" && " — you're offline, changes are queued"}
          </p>
          {status === "error" && error && (
            <p className="mt-1.5 text-xs font-medium text-hyperpink">{error}</p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={sync}
              disabled={status === "syncing"}
              className="rounded-full border border-white/12 px-3.5 py-1.5 text-xs font-semibold text-bone/70 transition hover:bg-white/10 hover:text-bone active:scale-95 disabled:opacity-50"
            >
              {status === "syncing" ? "Syncing…" : "Sync now"}
            </button>
            <button
              type="button"
              onClick={() => void signOut()}
              className="rounded-full border border-white/12 px-3.5 py-1.5 text-xs font-semibold text-bone/50 transition hover:bg-white/10 hover:text-bone active:scale-95"
            >
              Sign out
            </button>
          </div>
        </div>
      ) : sentTo ? (
        <form
          onSubmit={submitCode}
          className="rounded-2xl border border-fresh/25 bg-fresh/8 p-4"
        >
          <p className="text-[0.9375rem] font-semibold text-bone">Check your email</p>
          <p className="mt-0.5 text-xs leading-relaxed text-bone/55">
            Sent to {sentTo}. Enter the code from the email. If there is no
            code, long-press the button, copy the link and paste that instead.
            Either one signs in <em>this</em> copy of the app, which tapping the
            link cannot do once it is on your home screen.
          </p>
          <label htmlFor="sync-code" className="sr-only">
            Code from the email, or the sign-in link
          </label>
          <input
            id="sync-code"
            data-autofocus
            type="text"
            // Numeric for a code, but a pasted URL has to be allowed through.
            inputMode={/^\d*$/.test(code) ? "numeric" : "text"}
            autoComplete="one-time-code"
            enterKeyHint="go"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Code, or paste the link"
            className={`mt-3 w-full rounded-xl border border-white/12 bg-white/5 px-3.5 py-2.5 text-bone outline-none transition placeholder:text-bone/25 focus:border-white/30 ${
              /^\d*$/.test(code) && code.length <= 10
                ? "text-center text-lg font-bold tracking-[0.4em] placeholder:tracking-normal placeholder:text-sm placeholder:font-normal"
                : "text-xs"
            }`}
          />
          {problem && (
            <p className="mt-1.5 text-xs font-medium text-hyperpink">{problem}</p>
          )}
          <button
            type="submit"
            disabled={verifying || !code.trim()}
            className="mt-2.5 w-full rounded-xl bg-fresh px-4 py-2.5 text-sm font-bold text-[#00160a] transition active:scale-[0.98] disabled:opacity-40"
          >
            {verifying ? "Signing in…" : "Sign in"}
          </button>
          <button
            type="button"
            onClick={() => {
              setSentTo(null);
              setProblem(null);
            }}
            className="mt-2 w-full rounded-full px-3.5 py-1.5 text-xs font-semibold text-bone/50 transition hover:bg-white/10 hover:text-bone"
          >
            Use a different address
          </button>
        </form>
      ) : (
        <form onSubmit={sendCode} className="rounded-2xl border border-white/10 bg-white/4 p-4">
          <p className="mb-3 text-xs leading-relaxed text-bone/45">
            Sign in to keep your streaks safe and pick them up on another device.
            Your habits stay on this device too, so the app still works offline.
          </p>
          <label htmlFor="sync-email" className="sr-only">
            Email address
          </label>
          <input
            id="sync-email"
            type="email"
            required
            autoComplete="email"
            inputMode="email"
            enterKeyHint="send"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="you@example.com"
            className="w-full rounded-xl border border-white/12 bg-white/5 px-3.5 py-2.5 text-sm text-bone outline-none transition placeholder:text-bone/30 focus:border-white/30"
          />
          {problem && (
            <p className="mt-1.5 text-xs font-medium text-hyperpink">{problem}</p>
          )}
          <button
            type="submit"
            disabled={sending}
            className="mt-2.5 w-full rounded-xl bg-fresh px-4 py-2.5 text-sm font-bold text-[#00160a] transition active:scale-[0.98] disabled:opacity-60"
          >
            {sending ? "Sending…" : "Email me a sign-in code"}
          </button>
        </form>
      )}
    </div>
  );
}
