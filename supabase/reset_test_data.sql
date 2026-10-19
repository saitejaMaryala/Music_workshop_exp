-- TESTING ONLY: deletes every study response so you can start fresh.
-- Run in Supabase > SQL Editor. This cannot be undone — never run it once the real study has begun.
--
-- Removes: participants, study_sessions, playback_events, survey_responses
-- (the last three cascade from participants), plus the Supabase Auth users that were
-- created for participants' survey links. Admin accounts (admin_users) are kept.

begin;

-- Survey-link sign-in accounts that belong to participants (never admins).
delete from auth.users
where id in (select auth_user_id from public.participants where auth_user_id is not null)
  and id not in (select user_id from public.admin_users);

-- All study data. CASCADE empties study_sessions, playback_events and survey_responses too.
truncate table public.participants restart identity cascade;

commit;

-- Check: every count should be 0.
select
  (select count(*) from public.participants)     as participants,
  (select count(*) from public.study_sessions)   as study_sessions,
  (select count(*) from public.playback_events)  as playback_events,
  (select count(*) from public.survey_responses) as survey_responses;
