-- A shareable invite link.
--
-- Invitations live in the database and only appear to the address they were
-- addressed to, which is secure but invisible: nothing is emailed, so somebody
-- who does not already use the app has no way of finding out. The link closes
-- that gap by letting the inviter send it over whatever they actually talk on.
--
-- The link is a POINTER, NOT A CREDENTIAL. Following it grants nothing. The
-- recipient still only sees the invitation if it was addressed to the verified
-- address on their own account, exactly as before. Nothing in this file can be
-- used to join a group.
--
-- What it does expose, to anyone holding a group's id: the group's name, icon,
-- colour, rhythm and how many people are in it. That is the unlisted-link
-- model — the id is a random uuid nobody can guess, and the only way to have
-- one is for a member to have deliberately sent it. Deliberately absent:
-- member names, anybody's progress, and the invite list.

create or replace function public.group_preview(p_group_id uuid)
returns table (
  name         text,
  icon         text,
  accent       text,
  cadence      text,
  target       integer,
  member_count bigint
)
language sql
security definer
stable
set search_path = public
as $$
  select
    g.name,
    g.icon,
    g.accent,
    g.cadence,
    g.target,
    (select count(*) from public.group_members m where m.group_id = g.id)
  from public.groups g
  where g.id = p_group_id;
$$;

revoke all on function public.group_preview(uuid) from public;
-- Readable without a session on purpose: the whole point is that somebody who
-- has never opened the app can see what they are being asked to join.
grant execute on function public.group_preview(uuid) to anon, authenticated;
