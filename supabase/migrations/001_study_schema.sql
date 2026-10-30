-- Study schema: everything the site and the Edge Functions need, in one file.
-- Run once in Supabase > SQL Editor on a database that has no study tables yet
-- (admin_users may already exist; it is kept). Safe to run again.

create extension if not exists pgcrypto;
create extension if not exists citext;

-- Leftovers from earlier test scripts, if they were ever run.
drop function if exists public.testing_backdate_session() cascade;
drop function if exists public.apply_test_audio_seconds() cascade;
drop table if exists public.test_settings;
-- No longer used: the threshold moment is already in study_sessions.qualified_at / listened_seconds.
drop table if exists public.playback_events;

-- ---------------------------------------------------------------------------
-- Session status
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.study_status as enum ('listening', 'queued', 'sending', 'email_sent', 'survey_submitted', 'exited');
exception
  when duplicate_object then null;
end $$;
alter type public.study_status add value if not exists 'sending' after 'queued';

-- ---------------------------------------------------------------------------
-- Participants
-- Contact details are kept apart from survey answers. Admin reporting uses participant IDs
-- and roll numbers; it never exposes email addresses.
-- The four section columns hold the details-page questionnaire as
-- { "<question text>": <answer> } (written by the start-session Edge Function).
-- ---------------------------------------------------------------------------
create table if not exists public.participants (
  id uuid primary key default gen_random_uuid(),
  roll_number citext unique,
  email citext not null unique,
  display_name text,
  from_workshop boolean not null default false,
  auth_user_id uuid unique references auth.users(id) on delete set null,
  about_you jsonb not null,
  your_sleep jsonb not null,
  listening_habits jsonb not null,
  beliefs_about_music_and_sleep jsonb not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Listening sessions (one per participant)
-- ---------------------------------------------------------------------------
create table if not exists public.study_sessions (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null unique references public.participants(id) on delete cascade,
  device_token_hash text not null unique,
  condition_id text not null check (condition_id in ('condition-a', 'condition-b')),
  duration_seconds integer not null check (duration_seconds > 0),
  status public.study_status not null default 'listening',
  listened_seconds integer not null default 0,
  loop_count integer not null default 0,
  qualified_at timestamptz,
  release_at timestamptz,
  email_sent_at timestamptz,
  email_provider_id text,
  email_attempts integer not null default 0,
  sending_started_at timestamptz,
  resend_count integer not null default 0,
  last_resend_at timestamptz,
  created_at timestamptz not null default now(),
  ended_at timestamptz
);

create index if not exists sessions_queued_for_email on public.study_sessions (release_at) where status = 'queued';
create index if not exists sessions_by_participant on public.study_sessions (participant_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Morning survey responses (one per session)
-- The five section columns hold the survey as { "<question text>": <answer> }
-- (written by the survey-access Edge Function).
-- ---------------------------------------------------------------------------
create table if not exists public.survey_responses (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references public.study_sessions(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  your_night jsonb not null,
  how_it_felt jsonb not null,
  the_audio jsonb not null,
  night_factors jsonb not null,
  in_your_own_words jsonb not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Administrators (kept if it already exists)
-- ---------------------------------------------------------------------------
create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Access: no policies, so the browser (anon key) cannot read or write any table.
-- The Edge Functions use the service role.
-- ---------------------------------------------------------------------------
alter table public.participants enable row level security;
alter table public.study_sessions enable row level security;
alter table public.survey_responses enable row level security;
alter table public.admin_users enable row level security;

grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant all on all functions in schema public to service_role;

-- ---------------------------------------------------------------------------
-- Welcome page check: has this roll number already registered? Returns only true/false.
-- ---------------------------------------------------------------------------
create or replace function public.is_roll_number_registered(p_roll_number text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.participants
    where roll_number = trim(p_roll_number)
  );
$$;

revoke all on function public.is_roll_number_registered(text) from public;
grant execute on function public.is_roll_number_registered(text) to anon, authenticated;
