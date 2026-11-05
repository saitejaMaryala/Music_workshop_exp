-- Per participant: did they finish listening, did they fill the morning survey?
-- Run in the Supabase SQL editor (or: npx supabase db query --remote=<ref> --read-only -f participant_status.sql).
select
  p.roll_number                                                as "Roll Number",
  case when s.qualified_at is not null then '✅' else '❌' end as "Listened",
  case when sr.id is not null          then '✅' else '❌' end as "Survey form"
from participants p
left join study_sessions   s  on s.participant_id = p.id
left join survey_responses sr on sr.session_id    = s.id
where p.roll_number <> '200'
order by (sr.id is null), (s.qualified_at is null), p.roll_number;
