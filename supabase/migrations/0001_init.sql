-- StreakWrapped sync schema.
--
-- Design notes
--
--  * Ids are generated on the client so a habit created offline keeps its
--    identity when it eventually syncs. They are `text` rather than `uuid`
--    because the id generator falls back to a non-UUID form where
--    crypto.randomUUID() is unavailable.
--
--  * `updated_at` is the client's clock and drives last-write-wins.
--    `synced_at` is the server's clock and drives incremental pulls. Mixing
--    the two would let a device with a wrong clock either hide its own
--    writes or dominate every conflict.
--
--  * Deletes are tombstones (`deleted_at`), never row removal, so a deletion
--    on one device reaches the others.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- habits --

create table if not exists public.habits (
  id          text        primary key,
  user_id     uuid        not null references auth.users (id) on delete cascade,
  name        text        not null,
  icon        text        not null default 'fire',
  accent      text        not null default 'hyperpink',
  cadence     text        not null check (cadence in ('daily', 'weekly', 'monthly')),
  target      integer     not null check (target between 1 and 99),
  weekdays    smallint[]  not null default '{0,1,2,3,4,5,6}',
  time_of_day text        not null default 'anytime'
                          check (time_of_day in ('anytime', 'morning', 'afternoon', 'evening')),
  start_date  date        not null,
  created_at  timestamptz not null,
  updated_at  timestamptz not null,
  archived_at timestamptz,
  deleted_at  timestamptz,
  synced_at   timestamptz not null default now()
);

comment on column public.habits.updated_at is
  'Client clock. Drives last-write-wins conflict resolution.';
comment on column public.habits.synced_at is
  'Server clock, set by trigger. Drives the incremental pull cursor.';

-- -------------------------------------------------------------- checkins --

create table if not exists public.checkins (
  habit_id   text        not null references public.habits (id) on delete cascade,
  user_id    uuid        not null references auth.users (id) on delete cascade,
  day        date        not null,
  count      integer     not null check (count >= 0),
  updated_at timestamptz not null,
  synced_at  timestamptz not null default now(),
  primary key (habit_id, day)
);

-- A cleared day is stored as count = 0 rather than deleted, so that clearing
-- it carries a timestamp and can win a conflict against a stale check-in.

create index if not exists habits_user_synced_idx
  on public.habits (user_id, synced_at desc);
create index if not exists checkins_user_synced_idx
  on public.checkins (user_id, synced_at desc);

-- --------------------------------------------------------------- triggers --

create or replace function public.touch_synced_at()
returns trigger
language plpgsql
as $$
begin
  new.synced_at := now();
  return new;
end;
$$;

drop trigger if exists habits_touch_synced_at on public.habits;
create trigger habits_touch_synced_at
  before insert or update on public.habits
  for each row execute function public.touch_synced_at();

drop trigger if exists checkins_touch_synced_at on public.checkins;
create trigger checkins_touch_synced_at
  before insert or update on public.checkins
  for each row execute function public.touch_synced_at();

-- ------------------------------------------------------------------- RLS --

alter table public.habits   enable row level security;
alter table public.checkins enable row level security;

drop policy if exists "habits are private" on public.habits;
create policy "habits are private" on public.habits
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "checkins are private" on public.checkins;
create policy "checkins are private" on public.checkins
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ------------------------------------------------------------------ push --
--
-- Conditional upserts. A plain upsert would let a device that pulled a few
-- seconds ago overwrite a newer row written by another device in the
-- meantime; the `where excluded.updated_at > ...` guard makes that
-- impossible, so last-write-wins holds even under a race.
--
-- user_id is taken from the session rather than the payload, so a client
-- cannot write into someone else's rows even if RLS were misconfigured.

create or replace function public.push_habits(payload jsonb)
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

  with incoming as (
    select
      h ->> 'id'                                        as id,
      auth.uid()                                        as user_id,
      h ->> 'name'                                      as name,
      coalesce(h ->> 'icon', 'fire')                    as icon,
      coalesce(h ->> 'accent', 'hyperpink')             as accent,
      h ->> 'cadence'                                   as cadence,
      (h ->> 'target')::integer                         as target,
      (select coalesce(array_agg(value::smallint), '{}')
         from jsonb_array_elements_text(h -> 'weekdays')) as weekdays,
      coalesce(h ->> 'time_of_day', 'anytime')          as time_of_day,
      (h ->> 'start_date')::date                        as start_date,
      (h ->> 'created_at')::timestamptz                 as created_at,
      (h ->> 'updated_at')::timestamptz                 as updated_at,
      (h ->> 'archived_at')::timestamptz                as archived_at,
      (h ->> 'deleted_at')::timestamptz                 as deleted_at
    from jsonb_array_elements(payload) as h
  )
  insert into public.habits as t (
    id, user_id, name, icon, accent, cadence, target, weekdays,
    time_of_day, start_date, created_at, updated_at, archived_at, deleted_at
  )
  select
    id, user_id, name, icon, accent, cadence, target, weekdays,
    time_of_day, start_date, created_at, updated_at, archived_at, deleted_at
  from incoming
  on conflict (id) do update set
    name        = excluded.name,
    icon        = excluded.icon,
    accent      = excluded.accent,
    cadence     = excluded.cadence,
    target      = excluded.target,
    weekdays    = excluded.weekdays,
    time_of_day = excluded.time_of_day,
    start_date  = excluded.start_date,
    updated_at  = excluded.updated_at,
    archived_at = excluded.archived_at,
    deleted_at  = excluded.deleted_at
  where excluded.updated_at > t.updated_at;

  get diagnostics affected = row_count;
  return affected;
end;
$$;

create or replace function public.push_checkins(payload jsonb)
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

  with incoming as (
    select
      c ->> 'habit_id'                  as habit_id,
      auth.uid()                        as user_id,
      (c ->> 'day')::date               as day,
      (c ->> 'count')::integer          as count,
      (c ->> 'updated_at')::timestamptz as updated_at
    from jsonb_array_elements(payload) as c
  )
  insert into public.checkins as t (habit_id, user_id, day, count, updated_at)
  select i.habit_id, i.user_id, i.day, i.count, i.updated_at
  from incoming i
  -- Skip check-ins whose habit has not been pushed yet; the next sync round
  -- picks them up rather than failing the whole batch on a foreign key.
  where exists (
    select 1 from public.habits h
    where h.id = i.habit_id and h.user_id = i.user_id
  )
  on conflict (habit_id, day) do update set
    count      = excluded.count,
    updated_at = excluded.updated_at
  where excluded.updated_at > t.updated_at;

  get diagnostics affected = row_count;
  return affected;
end;
$$;

revoke all on function public.push_habits(jsonb)   from public;
revoke all on function public.push_checkins(jsonb) from public;
grant execute on function public.push_habits(jsonb)   to authenticated;
grant execute on function public.push_checkins(jsonb) to authenticated;
