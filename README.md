# StreakWrapped

A habit tracker with two jobs: make checking something off feel good, and once a
year's worth of check-ins has piled up, replay it as a Spotify-Wrapped-style
story.

Your habits need no account and never leave the device unless you sign in, in
which case they sync across your own devices.

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
| Icon + colour | Identity across cards, calendar, Wrapped and the share card |

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

`npm test` runs the merge and schema tests, `npm run lint` runs ESLint, and
TypeScript is checked as part of `build`.

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
  persistence.ts       navigator.storage.persist + status reporting
  sync/                merge (pure, tested), engine, useSync hook
  supabase/client.ts   configured only when the env vars are present
supabase/
  migrations/          schema, RLS policies, conditional-upsert push RPCs
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

**No emoji anywhere.** A habit's mark is a key into a curated set of 48
Phosphor glyphs, not a literal emoji character. Emoji render as a different
picture on every OS and version — the one thing an interface trying to look
deliberate cannot afford. The glyphs are stored as raw path data on Phosphor's
256 grid and drawn twice from that single source: inline SVG in the DOM, and
`Path2D` on the share card's canvas. Anything else lets the two drift.

**Bold type on flat colour.** Wrapped's own rule, and the reason the archetype
slide knocks a solid panel out of its gradient before setting type on it.

---

## Data

One `localStorage` key, `streakwrapped.v1`:

```jsonc
{
  "version": 2,
  "name": "…",
  "habits": [{ "id", "name", "icon", "accent", "cadence", "target",
               "weekdays", "timeOfDay", "startDate", "createdAt",
               "updatedAt", "archivedAt?", "deletedAt?" }],
  // date -> { n: check-ins, t: when it was written }
  "log": { "<habitId>": { "2026-08-31": { "n": 3, "t": 1788160425512 } } },
  "prefs": { "installDismissedUntil", "installed", "installRequested",
             "reduceMotion" },
  "sync":  { "userId", "lastSyncedAt", "cursor" }
}
```

Settings ▸ *Your data* exports this as JSON and imports it back.

### Durability on one device

On load the app calls `navigator.storage.persist()`. An origin granted
persistent storage is skipped by the browser's eviction pass, which matters
because WebKit otherwise clears script-writable storage after seven days of no
interaction. **Home-screen-installed PWAs are exempt from that seven-day cap**,
so the install CTA is doing real work here, not just cosmetics.

Chromium and Safari grant persistence silently from engagement heuristics and
often refuse a cold request, so Settings ▸ *Your data* reports the actual
status — *Persistent* or *Best effort* — rather than pretending.

Settings ▸ *Your data* also exports the whole database as JSON and imports it
back.

---

## Insights

`/insights` is built from findings rather than from what other habit
dashboards happen to draw. Each panel records the result it exists because of,
and a few obvious charts are deliberately absent.

**On the way to automatic** — Lally et al. (2010) fitted an asymptotic curve to
daily automaticity ratings: a median of 66 days to reach 95% of the asymptote,
with an individual range of 18 to 254. Two things follow that most trackers get
backwards. The curve responds to *repetitions*, not elapsed time, so a habit
done half the days is not halfway — it is 66 repetitions away. And the range is
so wide that a single "you'll have this in N days" number would be false
precision, so the chart shows a position on a curve against the whole range.
Hidden for weekly and monthly habits: Lally studied daily behaviours and the
curve has no established meaning at other cadences.

**When you miss** — the same study found that missing one opportunity did not
materially affect habit formation. What does the damage is the abstinence
violation effect (Polivy & Herman): one lapse reframes the goal as already
broken, and the second miss is where people quit. So this panel does not count
missed days. It counts how often a miss became *two*, which is both the real
failure mode and the one thing actionable tomorrow.

**Consistency, rolling** — Harkin et al. (2016), 138 studies and ~20,000
participants: monitoring progress raises attainment (d+ = 0.40), mediated by
how often progress is actually monitored. Trailing 28 periods rather than
calendar months, because the 1st of the month means nothing to a habit.

**By day of the week** — context stability predicts both automaticity and goal
attainment (Wood & Neal; replicated in 2022 across 218 app users and 308
habits). Weekday is a coarse proxy for context, but it is the one this app can
measure honestly, and the weakest day is flagged because that is the routine
worth planning rather than the one to push harder on.

### What is deliberately not here

- **No correlations between habits.** Over a handful of habits and a few
  hundred days, those correlations are dominated by noise and by testing many
  pairs at once. A scatter plot reading "meditation drives sleep, r = 0.74"
  would be inventing a finding.
- **No time-of-day analysis.** Each cell stores when it was *written*, which
  changes when you backfill a day or migrate the schema. Presenting that as
  when you performed the habit would be reporting an artefact as behaviour.
- **Nothing at all below 10 completed periods.** Rates from fewer swing on a
  single day, and a chart that looks confident about noise is worse than no
  chart.

Sources: [Lally et al., 2010](https://onlinelibrary.wiley.com/doi/10.1002/ejsp.674) ·
[Harkin et al., 2016](https://pubmed.ncbi.nlm.nih.gov/26479070/) ·
[context stability, 2022](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2022.883795/full)

---

## Sync

Sync is **optional and local-first**. With no Supabase project configured the
app behaves exactly as described above: habits stay on the device, no account
required.
Attach one and the same local database gains a durable backup and cross-device
history.

The local store stays the source of truth. A check-in writes to localStorage
and renders immediately; syncing happens afterwards, in the background, and a
failure never blocks the tap. Being offline is a normal state, not an error.

### Setting it up

1. Create a project at [supabase.com](https://supabase.com) (the free tier is
   plenty — this schema is tiny).
2. Run [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql)
   in the SQL editor, or `supabase db push` with the CLI.
3. Copy `.env.example` to `.env.local` and fill in the project URL and anon key
   from **Project Settings ▸ Data API**.
4. Under **Authentication ▸ URL Configuration**, set **Site URL** to your
   deployed origin and add `http://localhost:3000/**` to **Redirect URLs**.
   Set only the first and every local sign-in link will bounce you to
   production.
5. **Configure custom SMTP before you rely on this.** Supabase's built-in
   mailer is capped at **two messages an hour**, carries no delivery SLA, and
   is documented as non-production. Two sign-in attempts and you are locked out
   for the hour.

   Any provider works; with [Resend](https://resend.com) it is a verified
   domain plus, under **Authentication ▸ SMTP Settings**:

   | Field | Value |
   | --- | --- |
   | Host | `smtp.resend.com` |
   | Port | `465` |
   | Username | `resend` |
   | Password | your Resend API key |
   | Sender | an address on your verified domain |

   Enabling custom SMTP starts you at 30 messages an hour, adjustable under
   **Authentication ▸ Rate Limits**.

The anon key is meant to be public. Every table is behind row-level security,
so it can only ever read and write the signed-in user's own rows — which the
migration's tests exercise directly.

Sign-in is a passwordless six-digit code. Nothing else is collected.

**A code rather than a link, because of installed apps.** Tapping a link hands
the session to whichever browser the OS decides to open, and an installed web
app has its own storage — so the browser ends up signed in and the app the
person is actually holding does not. Typing the code creates the session in
whichever copy they typed it into, which is by definition the right one. The
link still works if they use the browser.

The same field also accepts the **sign-in link** pasted in. The link is in
every email whatever the template says, and carries the same token as a query
parameter — so this works with a stock Supabase project and no dashboard edit
at all. Long-press the button in the email, copy the link, paste it in.

For an actual six-digit code, add `{{ .Token }}` to the **Magic Link** template
under **Authentication ▸ Email Templates**; the stock template contains only
`{{ .ConfirmationURL }}`. That is a nicer experience, but it is optional.

The auth flow is **implicit rather than PKCE**, deliberately. PKCE keeps a code
verifier in the localStorage of the browser that *requested* the link, and mail
apps routinely open links in their own in-app webview, which has separate
storage — so the exchange fails and the link silently does nothing. The whole
promise of a magic link is that it works wherever you tap it. The trade is that
tokens ride in the URL fragment for an instant before supabase-js consumes them
and cleans the URL; fragments are never sent to a server, and there is no
server-side session here to protect.

The sync runtime is mounted **above the page**, not inside Settings. Creating
the Supabase client is what makes it look at the URL for a magic-link callback,
and it also owns the auth subscription and the background sync triggers — so
gating it behind a sheet meant sign-in links did nothing and check-ins only
synced while that sheet happened to be open.

**Deliverability is not optional.** A first message from a freshly verified
domain lands in spam more often than not, because the domain has no sending
reputation yet. Publish a DMARC record (`_dmarc`, starting at `p=none`) once
SPF and DKIM verify.

### How conflicts are resolved

Last-write-wins, resolved **per habit row and per (habit, day) check-in cell**
rather than over the document as a whole. Two phones that touched different
days of the same habit both keep their edit; only a genuine same-cell collision
has a loser.

- **Ties go to the server.** Arbitrary, but it has to be consistent — if ties
  went to the client, every sync would re-push rows the server already had and
  the two sides would trade writes forever.
- **`updated_at` is the client's clock** and decides conflicts. **`synced_at`
  is the server's clock** and drives the incremental pull cursor. Mixing them
  would let a device with a wrong clock either hide its own writes or win every
  conflict. The pull cursor is deliberately rewound a few seconds each time, so
  a row can be fetched twice — harmless, the merge treats it as a tie — rather
  than missed once.
- **Deletes are tombstones**, not row removal, so a deletion actually reaches
  the other devices. They are purged locally after 90 days.
- **The push is a conditional upsert** (`where excluded.updated_at > ...`)
  inside a `security invoker` function, so a client that pulled a few seconds
  ago cannot clobber a newer row written meanwhile. `user_id` is taken from the
  session rather than the payload.
- **Clearing a day is a value, not an absence.** It is stored as `count = 0`
  with a timestamp, so undoing a check-in beats a stale one on the server
  instead of silently reappearing.
- **The display name rides on the auth user's metadata**, not a table of its
  own. It is one string that changes about once, so a table with its own
  policies and conflict resolution would be a lot of machinery for it. Same
  last-write-wins rule as everything else.
- **Signing into a different account wipes local data first**, so a shared
  device never merges one person's habits into another's. That check reads
  `ownerId`, which records who the local database belongs to and survives
  signing out — the signed-in `userId` does not, so a sign-out between the two
  accounts would walk straight past the guard. Signing *out* keeps the habits,
  since they are still usable offline; device preferences survive the wipe too,
  having nothing to do with who is signed in.
- **An incremental pull returns only what changed**, so a local row missing
  from the response usually means "unchanged upstream", not "never uploaded".
  A row is queued for push only if it also beat the remote copy or was edited
  since the last successful sync. Without that, every sync re-uploads the
  entire history — harmless, since the conditional upsert makes it a no-op,
  but it grows forever and fires on every check-in.

### What is tested

`npm test` runs both halves of the sync contract.

**The merge** (`lib/sync/merge.test.ts`) — last-write-wins in both directions,
ties, tombstone propagation, per-day independence, convergence (a second merge
pushes nothing), cleared-day precedence, and the row conversions.

**The schema** (`lib/sync/schema.test.ts`) — the migration is applied to a real
Postgres compiled to WebAssembly, verbatim, with only Supabase's `auth.uid()`,
`auth.users` and default grants stubbed around it. It then checks the things
the SQL is responsible for: stale writes rejected and newer ones accepted for
both tables, a cleared day beating a stale check-in, a check-in for an unknown
habit skipped instead of failing the batch alongside it, `synced_at` advancing
so pull cursors move, `user_id` taken from the session rather than the payload,
and the migration being safe to re-apply.

RLS is exercised **as the `authenticated` role**, not merely asserted to be
switched on — the table owner bypasses row-level security, so a test that
queries as the owner proves nothing. Under that role one user cannot read
another's habits or check-ins, cannot insert a row owned by someone else, and
cannot reassign their own row away. Weakening either policy to `using (true)`
fails three of those tests, which is the check that they are worth having.

The one path not exercised end to end is the wire between the client and a live
Supabase project (auth callback and PostgREST). Run through a sign-in once
against your own project before trusting it with real history.

---

## Deploying

The app builds to fully static output, so any host works, but Vercel needs no
configuration at all — the framework is detected and there is nothing to set
beyond environment variables.

1. **Import the repo** at [vercel.com/new](https://vercel.com/new). Next.js is
   detected; leave the build settings alone.
2. **Add the environment variables** *before* the first build if you want sync:
   `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`, under
   Settings ▸ Environment Variables. `NEXT_PUBLIC_*` values are inlined at
   build time, so adding them later needs a redeploy to take effect.
3. **Add the domain** under Settings ▸ Domains.
4. **Create the DNS record Vercel shows you.** For a subdomain that is a CNAME
   pointing at a `*.vercel-dns*.com` host; Vercel displays the exact value,
   which is account-specific. Add it wherever the domain's nameservers live —
   if they are not Vercel's, that is your registrar's DNS panel, not Vercel.
5. **Add the deployed URL to Supabase** under Authentication ▸ URL
   Configuration, or magic links will bounce.

### Analytics

Vercel Web Analytics is wired up in `app/layout.tsx`. It has to be switched on
for the project as well — **Vercel ▸ your project ▸ Analytics ▸ Enable** — or
the script 404s and nothing is recorded.

It counts page views, visitors, referrers and rough device and country
breakdowns. It is cookieless and does not follow anyone between sites. **No
habit data goes near it**: check-ins live on the device, and reach your own
Supabase project only if you sign in. Nothing about what you track, or how
often, is sent to Vercel.

The free tier caps events per month, and the script is a no-op in local
development, so figures only appear for the deployed site.

### Notes for a custom domain

- The manifest uses a relative `start_url`, so the PWA install and the service
  worker work on any hostname with no changes.
- Habits are stored per-origin. Moving the app to a new domain does not carry
  local data across — signing in is what moves history between origins, which
  is one more reason to set sync up before you hand the link to anyone.

---

## Accessibility

Real buttons everywhere with descriptive `aria-label`s; sheets trap focus,
restore it on close, and close on Escape; the story is fully keyboard-driven
(arrows, space, Escape) with visible prev/next controls rather than invisible
tap zones alone; 44px minimum touch targets; pinch-zoom is left enabled. Motion
respects `prefers-reduced-motion`, and Settings ▸ *Reduce motion* forces it on —
which also turns off the story's auto-advance so slides only move on input.
