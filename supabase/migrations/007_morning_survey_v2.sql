-- Migration 007: Morning sleep survey v2.
-- New responses are stored as one JSON object in `answers` (shape checked by the
-- survey-access Edge Function, supabase/functions/survey-access/morning-survey.ts).
-- The v1 rating columns become optional so earlier responses stay valid.

alter table public.survey_responses
  add column if not exists answers jsonb;

alter table public.survey_responses
  alter column relaxed drop not null,
  alter column sleepy drop not null,
  alter column alert drop not null,
  alter column pleasant drop not null,
  alter column music_workshop drop not null,
  alter column headphones drop not null;
