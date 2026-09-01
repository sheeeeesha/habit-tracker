-- Running a group after it exists.
--
-- The creator is the admin: they can rename the group, remove somebody, and
-- delete it. Everyone else can leave, and can maintain their own row. That is
-- a deliberately small model — a group of friends does not need roles.
--
-- Cadence and target are NOT editable, and that is the interesting decision.
-- Every member republishes their recent periods on each refresh, so changing
-- the target would silently re-score history that has already been shown to
-- everyone: periods people remember completing would flip to missed. A group
-- that wants a different rhythm should start a different group.

/**
 * Renames or restyles a group. Creator only.
 */
create or replace function public.update_group(
  p_group_id uuid,
  p_name text,
  p_icon text,
  p_accent text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if not exists (
    select 1 from public.groups
    where id = p_group_id and created_by = auth.uid()
  ) then
    raise exception 'only the group creator can change this';
  end if;
  if length(trim(coalesce(p_name, ''))) = 0 then
    raise exception 'a group needs a name';
  end if;

  update public.groups
  set name = trim(p_name), icon = p_icon, accent = p_accent
  where id = p_group_id;
end;
$$;

/**
 * Removes somebody from a group. Creator only, and never themselves.
 *
 * This exists because the group's headline figure is "how many of us showed
 * up". Somebody who joined and drifted away is otherwise stuck in the
 * denominator for good, quietly making everybody else's number look worse.
 *
 * Their published progress goes with them, so the group stops counting a
 * person it can no longer see.
 */
create or replace function public.remove_group_member(
  p_group_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if not exists (
    select 1 from public.groups
    where id = p_group_id and created_by = auth.uid()
  ) then
    raise exception 'only the group creator can remove members';
  end if;
  if p_user_id = auth.uid() then
    -- Removing yourself would leave the group with no admin at all.
    raise exception 'leave the group instead';
  end if;

  delete from public.group_progress
  where group_id = p_group_id and user_id = p_user_id;
  delete from public.group_members
  where group_id = p_group_id and user_id = p_user_id;
end;
$$;

/**
 * Deletes a group outright. Creator only.
 *
 * Members, invitations and published progress cascade. Nobody's habit or
 * check-in history is touched: those belong to the individuals, and always
 * did.
 */
create or replace function public.delete_group(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if not exists (
    select 1 from public.groups
    where id = p_group_id and created_by = auth.uid()
  ) then
    raise exception 'only the group creator can delete it';
  end if;

  delete from public.groups where id = p_group_id;
end;
$$;

revoke all on function public.update_group(uuid, text, text, text) from public;
revoke all on function public.remove_group_member(uuid, uuid) from public;
revoke all on function public.delete_group(uuid) from public;

grant execute on function public.update_group(uuid, text, text, text) to authenticated;
grant execute on function public.remove_group_member(uuid, uuid) to authenticated;
grant execute on function public.delete_group(uuid) to authenticated;
