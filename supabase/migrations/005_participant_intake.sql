-- Migration 005: Store the intake questionnaire (age group, branch, year, music training,
-- sleep-listening habits and beliefs about music & sleep) answered before listening.
-- Shape is validated by the start-session Edge Function (supabase/functions/start-session/intake.ts).

alter table public.participants
  add column if not exists intake jsonb;
