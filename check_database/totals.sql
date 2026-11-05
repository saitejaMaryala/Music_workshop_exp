-- Totals: how many registered, how many finished listening, how many filled the survey.
select
  count(*)                                           as participants,
  count(*) filter (where s.qualified_at is not null) as listened,
  count(*) filter (where sr.id is not null)          as filled_survey
from participants p
left join study_sessions   s  on s.participant_id = p.id
left join survey_responses sr on sr.session_id    = s.id
where p.roll_number <> '200';
