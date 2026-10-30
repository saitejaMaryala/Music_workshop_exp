-- TESTING ONLY: deletes every participant, session and survey response so you can start fresh.
-- Run in Supabase > SQL Editor. This cannot be undone — never run it once the real study has begun.
-- Not a migration: `supabase db push` skips it (its name has no number prefix).
--
-- Removes: participants, study_sessions, survey_responses (the last two cascade from
-- participants), plus the Supabase Auth users created for participants' survey links.
-- Kept: the table structure, admin_users and the admins' sign-in accounts.

begin;

-- Survey-link sign-in accounts that belong to participants (never admins). Matched by the saved
-- link and by email, so an account whose link was never saved is removed too.
delete from auth.users
where (
    id in (select auth_user_id from public.participants where auth_user_id is not null)
    or lower(email) in (select lower(email::text) from public.participants)
  )
  and id not in (select user_id from public.admin_users);

-- All study data. CASCADE empties study_sessions and survey_responses too.
truncate table public.participants restart identity cascade;

commit;

-- Check: every count should be 0, and admins should still be there.
select
  (select count(*) from public.participants)     as participants,
  (select count(*) from public.study_sessions)   as study_sessions,
  (select count(*) from public.survey_responses) as survey_responses,
  (select count(*) from public.admin_users)      as admin_users_kept;
