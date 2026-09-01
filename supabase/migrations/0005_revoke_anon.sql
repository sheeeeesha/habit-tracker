-- Make "authenticated only" true rather than incidental.
--
-- Supabase ships `alter default privileges in schema public grant execute on
-- functions to anon, authenticated, service_role`, so every function created
-- here picks up an explicit grant to `anon`. `revoke all ... from public` in
-- the earlier migrations does not touch that: PUBLIC and anon are different
-- grantees.
--
-- In practice nothing leaked. Each of these either raises 'not authenticated'
-- on entry, or filters on `caller_email()`, which is null without a session.
-- But `my_pending_invites` was relying on that filter alone — it answered an
-- anonymous caller with 200 and an empty list rather than refusing. It reads
-- group_invites and groups as the definer, so it should be refused outright
-- and not left depending on a null comparison to come out the right way.
--
-- group_preview is deliberately excluded: being readable without a session is
-- the entire point of it.

revoke execute on function public.my_pending_invites()                      from anon;
revoke execute on function public.create_group(text, text, text, text, integer, text, text) from anon;
revoke execute on function public.invite_to_group(uuid, text)               from anon;
revoke execute on function public.accept_group_invite(uuid, text, text)     from anon;
revoke execute on function public.publish_group_progress(uuid, jsonb)       from anon;
revoke execute on function public.is_group_member(uuid)                     from anon;
revoke execute on function public.update_group(uuid, text, text, text)      from anon;
revoke execute on function public.remove_group_member(uuid, uuid)           from anon;
revoke execute on function public.delete_group(uuid)                        from anon;

-- The sync functions from the first migration have the same exposure.
revoke execute on function public.push_habits(jsonb)   from anon;
revoke execute on function public.push_checkins(jsonb) from anon;
