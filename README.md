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

**Forgot to tick yesterday.** The home screen says how many daily habits went
unticked and opens a list of just those. Backfilling re-scores properly —
streaks, rates and the automaticity curve all re-read from the log, so a run
you actually kept comes back rather than being forgiven. Capped at yesterday;
anything older is a correction and lives in the habit's calendar, where you can
see what you are changing.

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

### About widgets

There is no home-screen or lock-screen widget, and there cannot be one. Widgets
are native extensions — WidgetKit on iOS, App Widgets on Android — and no web
API exposes them on either platform. The `widgets` member some manifests carry
targets the Windows 11 widgets board, not a phone home screen.

The closest thing a website can do is badge its own installed icon, which
Settings ▸ *Count on the app icon* turns on. It shows how many habits are still
due, so a clear icon means a clear day. Platform behaviour differs and is worth
knowing before relying on it:

- **iOS 16.4+** shows the number, but only for a web app added to the home
  screen, and only after notification permission is granted — even though
  nothing is ever notified.
- **Android Chrome** shows a dot, not the number.
- **Desktop Chrome and Edge** show the number.

A real widget would mean shipping a native app.

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

## Together (shared habits)

A group is one goal that several people track **separately**. Nobody edits
anybody else's data, and that constraint is what keeps this cheap and safe
rather than a rewrite.

Run [`supabase/migrations/0002_groups.sql`](supabase/migrations/0002_groups.sql)
alongside the first migration to enable it.

### How it fits

`habits` and `checkins` are **not touched** — not their columns, not their
policies. A group does not own a habit; it holds a pointer to a habit each
member already owns in their own account. Joining a group creates an ordinary
habit in your account that you check off exactly like any other. So the tables
holding everyone's real history keep the single-owner RLS they always had, and
a bug in the groups code cannot reach them. There is a test asserting exactly
that.

The group read-model lives in React state and is **never persisted**. Offline,
the Together page is empty and the rest of the app is untouched — check-ins,
streaks and Wrapped all work as they always did. A social feature must never be
able to block a check-in.

### What members can see

One thing: whether you completed the shared goal in each period. Not your other
habits, not your check-in times, not your counts. Each member computes their own
per-period completion locally and publishes that; nobody ever reads anyone
else's raw check-ins.

### Invitations

Invites are addressed to an **email**, never to a user, and nothing in the
schema ever looks an address up. `invite_to_group` returns the same nothing
whether the address has an account, has already been invited, or is already a
member — otherwise the invite box becomes a way to test whether somebody has
signed up.

Accepting is authorised by the **verified address in the caller's own token**.
Knowing a group id is not enough, and neither is an invitation addressed to
somebody else; both are tested. Nothing is shared until the invitee accepts, so
being invited leaks nothing about you to the group.

### The invite link

Nothing is emailed. An invitation is a row that appears when the invitee opens
Together signed in with the address it was sent to — which is secure, and
invisible to anyone who does not already use the app.

**Share invite link** closes that gap: it produces `/groups?invite=<group_id>`
to send over whatever you actually talk on. The link is a **pointer, not a
credential**. Following it grants nothing; the recipient still only sees the
invitation if it was addressed to the verified address on their own account,
and there is a test asserting that holding the link does not let you join.

What the link does expose to whoever holds it is the group's name, rhythm and
member count, through `group_preview` — readable without a session so that
somebody who has never opened the app can see what they are being asked to
join. Not member names, not anyone's progress, not the invite list. That is the
unlisted-link model: the id is a random uuid, and the only way to have one is
for a member to have sent it to you.

The landing page's real job is explaining the failure that is otherwise
baffling: **signing in with a different address than you were invited on looks
exactly like not being invited at all.**

### Running a group

The creator is the admin — rename and restyle it, remove somebody, delete it.
Everyone else can leave and can maintain their own row (the name they go by,
and which of their habits the group reads).

Removing a member takes their published progress with them. The group's
headline is *how many of us showed up*, so somebody who joined and drifted away
would otherwise sit in the denominator forever, quietly making everyone else's
number look worse.

**The rhythm cannot be edited**, and that is a decision rather than an omission.
Every member republishes their recent periods on each refresh, so changing the
target would re-score history the group has already seen: periods people
remember completing would flip to missed. A group that wants a different rhythm
is a different group.

Deleting a group removes it for everyone and touches nobody's habit or history.
Those belong to the individuals and always did — there is a test for it.

#### When the linked habit goes away

A member can delete or archive the habit their group reads, like any other.
They stop publishing — but they used to stay in the denominator, so the group's
count stuck permanently below its membership and *everyone showed up* became
unreachable no matter how well anybody did. Their old rows sat on the server
with nothing able to correct them.

`habit_id` on the membership row now carries one meaning, and it is the only
part of this the other members can see: **I am currently tracking this.** It is
cleared when the habit goes away, which is what takes somebody out of the
denominator. They stay on the member list, marked as not tracking, because they
are still in the group and can point it at another habit.

Deleting and archiving part company over the published rows:

- **Deleted** — the rows are erased too. The local check-in history went with
  the habit, so the group's copy could never be corrected again, and leaving it
  would blend two habits' histories under one name if the member later linked a
  different one.
- **Archived** — the rows stay. It is a pause, and restoring the habit brings
  the history back intact. Publishing an archived habit would be worse than
  going quiet: `periodHistory` runs to today regardless, so it would post a
  *miss* for every period since it was put away.

This happens at the moment of deletion, not awaited — deleting a habit is a
local act that must not wait on, or fail with, the network — and it is
reconciled again whenever the groups screen loads, which catches the offline
case and a deletion made on another device.

**An absent habit is not a deleted one.** The store keeps tombstones, so a
deletion is provable; a habit that is merely missing from this device is very
often one that has not synced here yet. Acting on that absence would let a
phone that just signed in erase a group history it has never seen, so the
unsure case says so plainly and changes nothing — and it is the one case where
the sheet does not offer to relink, because taking that offer would detach a
link that was fine.

Detaching is two ordinary statements rather than a function of its own: the
existing policies already permit exactly it and nothing more. That is a claim
about the policies, so the schema tests check both halves — that a member can
clear their own link and erase their own rows, and that the same statements
aimed at somebody else do nothing. The erase runs *before* the unlink, so a
failure leaves the link set and the next refresh retries; the other order would
throw away the only marker saying there is anything left to clean up.

The broken link is called out on the group's card in the list and in the sheet,
which offers to point it at another habit. Neither silently repairs it: which
habit now stands for the group's goal is not a guess worth making on somebody's
behalf.

### No leaderboard, deliberately

The group view shows *how many of us showed up*, never a ranking. Social
visibility sharpens the abstinence violation effect: rank people by streak and
whoever slips is publicly last, which is the moment they leave. Members appear
in join order, each with their own rate, and `memberStandings` returns them that
way so no component can quietly sort by performance.

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

### The written reading

Optional, off by default, and behind Settings ▸ *Written insights*. It asks
Claude to read the panels above and say what stands out.

**The model is given figures, never data.** Everything in the payload has
already been computed by `lib/analytics.ts` and is displayed on the same screen
as the reading. No check-ins, no dates, no raw counts — a test asserts the
payload contains no date and no log, because that property is the only thing
making a written insight trustworthy. The reading can be wrong about meaning,
which is arguable; it cannot be wrong about arithmetic.

It must also cite the figure it leaned on, and that citation is shown, so the
reading can be checked against the charts rather than taken on trust. The
prompt carries the same research the panels do, so the advice cannot contradict
them — no promising a date from the 66-repetition median, and treating a weak
weekday as a scheduling problem rather than a character one.

Readings are cached against a hash of the exact numbers that produced them.
Opening the page twice costs one request, and when a check-in moves the figures
the key changes and the stale reading disappears rather than sitting above
charts it does not describe.

The habit's **name** is the one genuinely personal field that leaves the
device. It is included because without it the advice degrades to "your daily
habit" — and it is exactly why the feature waits to be switched on.

#### Providing a key

Two ways. The deployment can set `ANTHROPIC_API_KEY` (server-side, **no**
`NEXT_PUBLIC_` prefix — that prefix would publish it to every visitor), or a
person can enter their own in Settings and pick a model.

Settings supports **Anthropic** and **OpenCode Go**. Go fronts around
twenty-five open models behind *three different API shapes*, and which one a
model wants is a property of the model rather than the provider — Kimi, GLM and
DeepSeek speak OpenAI chat-completions; MiniMax and Qwen speak the Anthropic
messages shape; Grok, GPT and Muse Spark speak OpenAI responses. Sending the
wrong one is a 404 or a silently empty reply, so `lib/insightModels.ts` records
it per model and a test pins the pairings that break quietly if they drift. A
model id can also be typed in by hand; an unknown one is called with
chat-completions, which is what most open models use.

Anthropic keeps the SDK path, where `messages.parse` enforces the schema. The
gateway has no comparable guarantee, so those replies go through a defensive
parser — open models routinely answer with a markdown fence or a sentence of
preamble even when asked for bare JSON, and a partial object is rejected rather
than rendered as a card with blanks in it.

#### Where the key goes, and why

**Neither provider sends CORS headers, so a browser cannot call them
directly.** The key is therefore kept on the device, sent to this app's own
server on each reading, and forwarded once. It is never stored server-side,
never attached to an error, and travels in a header rather than the body so it
cannot land in a request-body log beside the statistics. Upstream failures
return fixed strings rather than anything derived from the response.

On a deployment you run yourself that is your own key on your own server. On
somebody else's, you are trusting whoever runs it — which the Settings panel
says in as many words rather than leaving to be discovered.

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
  chart. The written reading refuses below the same floor rather than spending
  a request on it.
- **No AI anywhere near the numbers.** Every figure is computed locally and
  deterministically. The model interprets; it never calculates, and it never
  sees enough to try.

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

### When it runs

Event-driven, never on a timer. There is no polling anywhere.

- **2.5s after the last local change**, debounced — eight taps produce one sync
- On returning to the foreground, on regaining a network, on load, and on
  signing in or out
- On demand from Settings ▸ *Sync now*

An idle app has no timer running at all, and a backgrounded one is frozen by
the OS. The cost of a normal day is a handful of small requests.

Local writes never wait on any of this: a check-in is in localStorage before
the network is touched, and the pull cursor only advances on a fully
successful round trip, so a failed attempt simply retries on the next trigger.

The gap this leaves is that another device's changes do not arrive until you
foreground the app. For a habit tracker that is the right trade — foregrounding
is the moment you care — but it would be wrong for anything conversational.

**A sync write-back is not a local change.** The merged result goes back into
the store, which is a change like any other, so a sync listener on *every*
change means each sync schedules the next one and the app talks to the network
forever at the debounce interval — behaving perfectly correctly the whole time.
`subscribeToLocalChanges` exists for exactly that distinction, and
`lib/store.test.ts` pins it.

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
- **The name and some settings ride on the auth user's metadata**, not a
  table of their own — a handful of fields that change about once each, where
  a table with its own policies and conflict resolution would be a lot of
  machinery. Same last-write-wins rule as everything else. Which settings, and
  why only those, is [below](#which-settings-travel).
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

### Which settings travel

Four: **written insights on or off**, the **provider**, the **model**, and
**reduce motion**. Those describe a person's preference, so they should be the
same wherever that person opens the app.

Everything else stays on the device it was set on, and each for a reason.
`installed` and its siblings describe *this* device rather than a wish.
`iconBadge` depends on notification permission granted per device, so syncing
"on" to a phone that never granted it would show a toggle that does nothing.
`backfillDismissedOn` churns daily and is about one banner.

**The API key never syncs.** Syncing it would write a live key into the
database, at rest, indefinitely — a much worse place for it than the one
browser that typed it. It is the one setting you re-enter per device, and that
is the intended trade.

Two details that are easy to get wrong, so both are pinned by tests:

- **Only a portable setting advances the timestamp** the four are carried
  under. If dismissing a banner advanced it too, that dismissal would carry a
  newer stamp than a model chosen on another device and quietly overwrite it —
  and the symptom would look like "the setting isn't syncing" rather than like
  a clobber.
- **The remote copy is read with `getUser`, not the session already in hand.**
  `getSession` returns what is in local storage without asking the server, so
  its metadata is a snapshot from when the access token was last issued, up to
  an hour old. Deciding against that snapshot is not just late: a device whose
  snapshot predates another device's change reads its own older edit as the
  newer one and pushes it over the top. If that fetch fails there is no safe
  decision to make, so this round does nothing and habits sync as usual.

The four resolve as a group rather than field by field. Changing the model on
one device while toggling reduced motion on another, both offline, settles on
one device's group. That is a real if unlikely loss, accepted because the
alternative is four more timestamps to carry, store and reconcile for settings
that change about once.

### What is tested

`npm test` runs both halves of the sync contract.

**The profile** (`lib/sync/profile.test.ts`, `lib/prefsSync.test.ts`) — which
settings travel and which do not, that the key and the device facts are in
neither direction of the wire, that the account breaks exact ties, that an
adopted value keeps the remote timestamp instead of being restamped as a fresh
local edit, that a device-scoped change does not advance the shared clock, and
that adopting a pulled value does not schedule another sync.

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
