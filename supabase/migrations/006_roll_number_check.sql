-- Migration 006: Let the welcome page check whether a roll number has already registered,
-- without giving the browser read access to the participants table.
-- Returns only true/false — never any participant data.

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
