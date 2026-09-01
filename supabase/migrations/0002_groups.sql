-- Shared habits.
--
-- Design notes
--
--  * `habits` and `checkins` are not touched. A group does not own anyone's
--    habit; it points at a habit each member already owns in their own
--    account. So the RLS on the tables holding every personal habit stays
--    exactly as it was, and a bug in this file cannot reach them.
--
--  * Members never read each other's check-ins. Each member publishes a
--    derived per-period "did I complete it" row, and that is the entire
--    surface other members can see. Nothing about their other habits, their
--    times, or their counts is shared.
--
--  * Membership checks go through a SECURITY DEFINER helper. A policy on
--    group_members that queries group_members recurses infinitely; the helper
--    runs outside RLS and breaks the cycle.
--
--  * Invites are addressed to an email, never to a user. Nothing in here can
--    answer "does this address have an account", because nothing here ever
--    looks one up.

-- ---------------------------------------------------------------- tables --

create table if not exists public.groups (
  id         uuid        primary key default gen_random_uuid(),
  name       text        not null check (length(trim(name)) between 1 and 60),
  icon       text        not null default 'fire',
  accent     text        not null default 'hyperpink',
  cadence    text        not null check (cadence in ('daily', 'weekly', 'monthly')),
  target     integer     not null check (target between 1 and 99),
  created_by uuid        not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.group_members (
  group_id     uuid        not null references public.groups (id) on delete cascade,
  user_id      uuid        not null references auth.users (id) on delete cascade,
  -- The member's OWN habit, in their own account. Deliberately not a foreign
  -- key: habit ids are generated on the client, so the row exists locally
  -- before it has synced, and accepting an invite must not wait on that.
  habit_id     text,
  display_name text        not null check (length(trim(display_name)) between 1 and 40),
  joined_at    timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table if not exists public.group_invites (
  group_id   uuid        not null references public.groups (id) on delete cascade,
  -- Lower-cased for matching. Compared against the address in the caller's
  -- verified JWT, so only the person who actually controls it can act on it.
  email_lower text       not null check (position('@' in email_lower) > 1),
  invited_by uuid        not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (group_id, email_lower)
);

create table if not exists public.group_progress (
  group_id     uuid        not null references public.groups (id) on delete cascade,
  user_id      uuid        not null references auth.users (id) on delete cascade,
  period_start date        not null,
  completed    boolean     not null,
  updated_at   timestamptz not null default now(),
  primary key (group_id, user_id, period_start)
);

create index if not exists group_members_user_idx on public.group_members (user_id);
create index if not exists group_invites_email_idx on public.group_invites (email_lower);
create index if not exists group_progress_group_period_idx
  on public.group_progress (group_id, period_start desc);

-- --------------------------------------------------------------- helpers --

/**
 * Membership test that runs outside RLS.
 *
 * Every policy below needs to ask "is the caller in this group", and
 * group_members answering that about itself is infinite recursion. Running
 * the check as the definer sidesteps the policy entirely.
 */
create or replace function public.is_group_member(p_group_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.group_members
    where group_id = p_group_id and user_id = auth.uid()
  );
$$;

/** The caller's verified address, lower-cased. Null when not signed in. */
create or replace function public.caller_email()
returns text
language sql
stable
set search_path = public
as $$
  select lower(nullif(auth.jwt() ->> 'email', ''));
$$;

-- ------------------------------------------------------------------- RLS --

alter table public.groups         enable row level security;
alter table public.group_members  enable row level security;
alter table public.group_invites  enable row level security;
alter table public.group_progress enable row level security;

-- Groups: visible to members. Creation and mutation go through the functions
-- below, which is why there is no direct insert or update policy.
drop policy if exists "groups are visible to members" on public.groups;
create policy "groups are visible to members" on public.groups
  for select using (public.is_group_member(id));

-- Members: everyone in a group can see who else is in it.
drop policy if exists "members see each other" on public.group_members;
create policy "members see each other" on public.group_members
  for select using (public.is_group_member(group_id));

-- A member may point their own row at a different habit, and may leave.
drop policy if exists "members maintain their own row" on public.group_members;
create policy "members maintain their own row" on public.group_members
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "members may leave" on public.group_members;
create policy "members may leave" on public.group_members
  for delete using (user_id = auth.uid());

-- Invites: readable by the group, and by whoever the invite is addressed to.
-- The second arm is what lets an invitee act on an invitation to a group they
-- cannot otherwise see.
drop policy if exists "invites are visible to group and invitee" on public.group_invites;
create policy "invites are visible to group and invitee" on public.group_invites
  for select using (
    public.is_group_member(group_id) or email_lower = public.caller_email()
  );

-- Either side can withdraw: the group revokes, the invitee declines.
drop policy if exists "invites can be withdrawn or declined" on public.group_invites;
create policy "invites can be withdrawn or declined" on public.group_invites
  for delete using (
    public.is_group_member(group_id) or email_lower = public.caller_email()
  );

-- Progress: readable by the group, writable only for yourself.
drop policy if exists "progress is visible to the group" on public.group_progress;
create policy "progress is visible to the group" on public.group_progress
  for select using (public.is_group_member(group_id));

drop policy if exists "members publish only their own progress" on public.group_progress;
create policy "members publish only their own progress" on public.group_progress
  for all
  using (user_id = auth.uid() and public.is_group_member(group_id))
  with check (user_id = auth.uid() and public.is_group_member(group_id));

-- ------------------------------------------------------------- functions --

/**
 * Creates a group and enrols the creator in one statement, so a group can
 * never exist with nobody able to see it.
 */
create or replace function public.create_group(
  p_name text,
  p_icon text,
  p_accent text,
  p_cadence text,
  p_target integer,
  p_habit_id text,
  p_display_name text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id  uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  insert into public.groups (name, icon, accent, cadence, target, created_by)
  values (trim(p_name), p_icon, p_accent, p_cadence, p_target, v_uid)
  returning id into v_id;

  insert into public.group_members (group_id, user_id, habit_id, display_name)
  values (
    v_id,
    v_uid,
    p_habit_id,
    coalesce(nullif(trim(p_display_name), ''), split_part(public.caller_email(), '@', 1))
  );

  return v_id;
end;
$$;

/**
 * Records an invitation against an email address.
 *
 * Returns nothing and succeeds whether or not that address has an account,
 * has already been invited, or is already a member. That is the point: a
 * function that reported "no such user" would turn the invite box into a
 * tool for testing whether someone has signed up.
 */
create or replace function public.invite_to_group(p_group_id uuid, p_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(p_email));
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if not public.is_group_member(p_group_id) then
    raise exception 'only members can invite';
  end if;
  if position('@' in v_email) < 2 then
    raise exception 'that does not look like an email address';
  end if;

  insert into public.group_invites (group_id, email_lower, invited_by)
  values (p_group_id, v_email, auth.uid())
  on conflict (group_id, email_lower) do nothing;
end;
$$;

/**
 * Invitations addressed to the caller, with enough of the group to decide on.
 *
 * An RPC rather than a policy widening `groups`: an invitee needs to see a
 * group's name before joining, and that is the only thing they should see of
 * a group they are not yet in.
 */
create or replace function public.my_pending_invites()
returns table (
  group_id     uuid,
  name         text,
  icon         text,
  accent       text,
  cadence      text,
  target       integer,
  member_count bigint,
  invited_by   text,
  created_at   timestamptz
)
language sql
security definer
stable
set search_path = public
as $$
  select
    g.id,
    g.name,
    g.icon,
    g.accent,
    g.cadence,
    g.target,
    (select count(*) from public.group_members m where m.group_id = g.id),
    coalesce(
      (select m.display_name from public.group_members m
        where m.group_id = g.id and m.user_id = i.invited_by),
      'a member'
    ),
    i.created_at
  from public.group_invites i
  join public.groups g on g.id = i.group_id
  where i.email_lower = public.caller_email()
    and not exists (
      select 1 from public.group_members m
      where m.group_id = g.id and m.user_id = auth.uid()
    );
$$;

/**
 * Joins a group the caller was invited to, and consumes the invitation.
 *
 * SECURITY DEFINER because the caller is not a member yet, so the member-only
 * policies would block the insert. Everything it needs to authorise is
 * checked here: the caller must be signed in, and the invitation must be
 * addressed to the verified address in their own token. There is no path in
 * which a group id alone is enough to join.
 */
create or replace function public.accept_group_invite(
  p_group_id uuid,
  p_habit_id text,
  p_display_name text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_email text := public.caller_email();
begin
  if v_uid is null or v_email is null then
    raise exception 'not authenticated';
  end if;

  if not exists (
    select 1 from public.group_invites
    where group_id = p_group_id and email_lower = v_email
  ) then
    raise exception 'no invitation for this account';
  end if;

  insert into public.group_members (group_id, user_id, habit_id, display_name)
  values (
    p_group_id,
    v_uid,
    p_habit_id,
    coalesce(nullif(trim(p_display_name), ''), split_part(v_email, '@', 1))
  )
  on conflict (group_id, user_id) do update
    set habit_id = excluded.habit_id;

  delete from public.group_invites
  where group_id = p_group_id and email_lower = v_email;
end;
$$;

/** Publishes the caller's own per-period completion for one group. */
create or replace function public.publish_group_progress(
  p_group_id uuid,
  payload jsonb
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  affected integer;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if not public.is_group_member(p_group_id) then
    raise exception 'not a member of this group';
  end if;

  insert into public.group_progress (group_id, user_id, period_start, completed, updated_at)
  select
    p_group_id,
    auth.uid(),
    (p ->> 'period_start')::date,
    (p ->> 'completed')::boolean,
    now()
  from jsonb_array_elements(payload) as p
  on conflict (group_id, user_id, period_start) do update
    set completed = excluded.completed, updated_at = now();

  get diagnostics affected = row_count;
  return affected;
end;
$$;

-- ---------------------------------------------------------------- grants --

revoke all on function public.create_group(text, text, text, text, integer, text, text) from public;
revoke all on function public.invite_to_group(uuid, text) from public;
revoke all on function public.accept_group_invite(uuid, text, text) from public;
revoke all on function public.my_pending_invites() from public;
revoke all on function public.publish_group_progress(uuid, jsonb) from public;

grant execute on function public.create_group(text, text, text, text, integer, text, text) to authenticated;
grant execute on function public.invite_to_group(uuid, text) to authenticated;
grant execute on function public.accept_group_invite(uuid, text, text) to authenticated;
grant execute on function public.my_pending_invites() to authenticated;
grant execute on function public.publish_group_progress(uuid, jsonb) to authenticated;
grant execute on function public.is_group_member(uuid) to authenticated;
grant execute on function public.caller_email() to authenticated;
