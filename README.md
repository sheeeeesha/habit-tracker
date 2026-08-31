# StreakWrapped

A habit tracker with two jobs: make checking something off feel good, and once a
year's worth of check-ins has piled up, replay it as a Spotify-Wrapped-style
story.

Everything lives in the browser — no account, no server, no network calls.

---

## What it does

**Create a habit.** The composer captures the details that actually change how
tracking behaves:

| Detail | Effect on tracking |
| --- | --- |
| **Cadence** — daily / weekly / monthly | Which calendar bucket the target resets in |
| **Target** — 1–99 per period | How many check-ins complete one period |
| **Weekdays** (daily only) | Days you leave off are rest days: they never break a streak |
| **Time of day** | Labelling only — shown on the card and detail sheet |
| **Start date** | Periods before it are ignored by streaks and rates |
| Emoji + colour | Identity across cards, calendar and Wrapped |

**Check it off.** One tap on the card. Habits with a target above 1 show a
segmented bar and count up; once-a-day habits show a seven-day history strip.
Finishing a period fires confetti and a haptic tick. `Undo` steps back a
check-in, and any past day can be corrected by tapping it in the calendar.

**Streaks that don't lie.** A streak counts consecutive *completed periods*:

- The period in progress is graceful — not having finished today yet doesn't
  wipe your streak, it just isn't counted until you check in.
- Rest days on a weekday-limited habit are skipped, not treated as misses.
- Weekly and monthly habits streak in weeks and months, not days.

**Your Wrapped.** After 10 check-ins, `/wrapped` unlocks a tap-through story:
totals, active and perfect days, longest run, top habits, strongest weekday,
month-by-month shape, hit rate, and a habit personality. The last slide renders
a 1080×1920 poster on a canvas and hands it to the Web Share sheet (or downloads
it as a PNG where sharing files isn't supported).

**Add to home screen.** A CTA on the home feed installs the app. On Android and
desktop Chromium it fires the real install prompt; on iOS it opens illustrated
Share ▸ Add to Home Screen instructions. Once installed it never reappears on
its own — Settings ▸ *Home screen shortcut* ▸ **Show again** is the only way
back. Dismissing with *Not now* snoozes it for 14 days.

---

## Running it

```bash
npm install
```

```bash
npm run dev
```

Then open <http://localhost:3000>.

```bash
npm run build && npm start
```

`npm run lint` runs ESLint. TypeScript is checked as part of `build`.

### Testing the install prompt

`beforeinstallprompt` only fires over HTTPS or on `localhost`, in a Chromium
browser, when the manifest and a service worker with a fetch handler are both
present. All of that is wired up, so `npm run dev` on localhost is enough to see
the real prompt in Chrome or Edge. iOS has no programmatic install at all —
that path always shows the instruction sheet.

The service worker is network-first for pages and skips asset caching on
`localhost`, so it never serves you stale dev chunks.

---

## How it's built

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4. No UI
libraries, no state library, no charting library — the bars, rings, calendar,
confetti and share poster are all hand-rolled.

```
app/
  layout.tsx           fonts, PWA metadata, beforeinstallprompt capture
  page.tsx             today screen: hero, filters, habit list, install CTA
  wrapped/page.tsx     the story, or the "not yet" screen
components/
  HabitCard            check-off button, progress bar, 7-day strip
  HabitSheet           create / edit composer
  HabitDetailSheet     stats + tappable calendar
  InstallCTA           add-to-home-screen banner and iOS instructions
  MenuSheet            name, motion, archive, backup import/export
  Sheet                bottom-sheet primitive (focus trap, scroll lock)
  wrapped/             Story player, slides, motifs, CountUp
lib/
  date.ts              local-timezone date keys and period arithmetic
  streak.ts            the streak / completion engine
  wrapped.ts           derives every Wrapped statistic
  store.tsx            useSyncExternalStore over localStorage
  shareCard.ts         canvas poster + Web Share
  useInstall.ts        beforeinstallprompt, standalone + platform detection
public/
  manifest.webmanifest, sw.js, offline.html, icons/
```

### Notes on a few decisions

**Dates are local, always.** Check-ins are keyed by a local `YYYY-MM-DD` string
and periods are identified by their start date, so nothing drifts across a UTC
boundary and there are no ISO-week/year-boundary bugs.

**The store lives outside React.** `localStorage` is a browser-only external
system, so it's a plain subscribable store read through `useSyncExternalStore`.
The server render and hydration agree, there's no cascading re-render, and
cross-tab sync comes for free.

**Bold type on flat colour.** Wrapped's own rule, and the reason the archetype
slide knocks a solid panel out of its gradient before setting type on it.

---

## Data

One `localStorage` key, `streakwrapped.v1`:

```jsonc
{
  "version": 1,
  "name": "…",
  "habits": [{ "id", "name", "emoji", "accent", "cadence", "target",
               "weekdays", "timeOfDay", "startDate", "createdAt" }],
  "log": { "<habitId>": { "2026-08-31": 3 } },   // date -> check-ins that day
  "prefs": { "installDismissedUntil", "installed", "installRequested",
             "reduceMotion" }
}
```

Settings ▸ *Your data* exports this as JSON and imports it back.

### Durability

On load the app calls `navigator.storage.persist()`. An origin granted
persistent storage is skipped by the browser's eviction pass, which matters
because WebKit otherwise clears script-writable storage after seven days of no
interaction. **Home-screen-installed PWAs are exempt from that seven-day cap**,
so the install CTA is doing real work here, not just cosmetics.

Chromium and Safari grant persistence silently from engagement heuristics and
often refuse a cold request, so Settings ▸ *Your data* reports the actual
status — *Persistent* or *Best effort* — rather than pretending. Clearing site
data still wipes everything either way; export a backup if it matters.

This is still single-device. See **Where this goes next**.

---

## Accessibility

Real buttons everywhere with descriptive `aria-label`s; sheets trap focus,
restore it on close, and close on Escape; the story is fully keyboard-driven
(arrows, space, Escape) with visible prev/next controls rather than invisible
tap zones alone; 44px minimum touch targets; pinch-zoom is left enabled. Motion
respects `prefers-reduced-motion`, and Settings ▸ *Reduce motion* forces it on —
which also turns off the story's auto-advance so slides only move on input.

---

## Where this goes next

The obvious gap is that history lives on one device. The intended shape is
**local-first with sync**: keep the local store as the source of truth so
check-ins stay instant and work offline, and reconcile against a hosted
database when the user is signed in. That preserves the offline behaviour and
adds durability plus cross-device history, rather than trading one for the
other.
