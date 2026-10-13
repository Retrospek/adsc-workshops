-- Outthink the Room
-- Run this entire file once in the Supabase SQL Editor for a new project.

create extension if not exists pgcrypto;

do $$ begin
  create type public.outthink_phase as enum ('collecting', 'guessing', 'revealed');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9]{6}$'),
  title text not null check (char_length(title) between 1 and 80),
  phase public.outthink_phase not null default 'collecting',
  sample_percent integer not null default 50 check (sample_percent between 1 and 100),
  host_token uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now()
);

create table if not exists public.participants (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 50),
  created_at timestamptz not null default now()
);

create table if not exists public.responses (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  value numeric(6,2) not null check (value between 0 and 100),
  is_sample boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (room_id, participant_id)
);

create table if not exists public.guesses (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  guessed_mean numeric(6,2) not null check (guessed_mean between 0 and 100),
  guessed_stddev numeric(6,2) not null check (guessed_stddev between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (room_id, participant_id)
);

create index if not exists responses_room_id_idx on public.responses(room_id);
create index if not exists responses_room_sample_idx on public.responses(room_id, is_sample);
create index if not exists participants_room_id_idx on public.participants(room_id);
create index if not exists guesses_room_id_idx on public.guesses(room_id);

-- Tables are private. The browser receives only data supplied by the narrow RPCs below.
alter table public.rooms enable row level security;
alter table public.participants enable row level security;
alter table public.responses enable row level security;
alter table public.guesses enable row level security;

revoke all on table public.rooms, public.participants, public.responses, public.guesses from anon, authenticated;

create or replace function public.create_room(p_title text)
returns table(code text, host_token uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_code text;
  v_token uuid := gen_random_uuid();
  v_title text := coalesce(nullif(trim(p_title), ''), 'Outthink the Room');
  attempt integer;
begin
  if char_length(v_title) > 80 then
    raise exception 'Room names must be 80 characters or fewer.';
  end if;

  for attempt in 1..12 loop
    v_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    begin
      insert into public.rooms (code, title, host_token)
      values (v_code, v_title, v_token);
      return query select v_code, v_token;
      return;
    exception when unique_violation then
      -- A six-character collision is very unlikely; make another code if it happens.
    end;
  end loop;
  raise exception 'Could not create a unique room code. Please try again.';
end;
$$;

create or replace function public.join_room(p_code text, p_display_name text)
returns table(participant_id uuid, title text, phase public.outthink_phase)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_room public.rooms%rowtype;
  v_participant_id uuid;
  v_name text := trim(p_display_name);
begin
  select * into v_room from public.rooms r where r.code = upper(trim(p_code));
  if not found then raise exception 'That room code does not exist.'; end if;
  if v_room.phase <> 'collecting' then raise exception 'This room is no longer accepting new players.'; end if;
  if v_name is null or char_length(v_name) = 0 then raise exception 'Enter a name to join.'; end if;
  if char_length(v_name) > 50 then raise exception 'Names must be 50 characters or fewer.'; end if;

  insert into public.participants (room_id, display_name)
  values (v_room.id, v_name)
  returning id into v_participant_id;

  return query select v_participant_id, v_room.title, v_room.phase;
end;
$$;

create or replace function public.submit_response(p_code text, p_participant_id uuid, p_value numeric)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_room_id uuid;
begin
  select r.id into v_room_id
  from public.rooms r
  join public.participants p on p.room_id = r.id
  where r.code = upper(trim(p_code)) and p.id = p_participant_id and r.phase = 'collecting';
  if not found then raise exception 'Responses are closed for this room.'; end if;
  if p_value is null or p_value < 0 or p_value > 100 then raise exception 'Choose a number from 0 to 100.'; end if;

  insert into public.responses (room_id, participant_id, value)
  values (v_room_id, p_participant_id, p_value)
  on conflict (room_id, participant_id) do update
  set value = excluded.value, updated_at = now();
end;
$$;

create or replace function public.get_player_state(p_code text, p_participant_id uuid)
returns table(
  title text,
  phase public.outthink_phase,
  participant_count integer,
  response_count integer,
  sample_count integer,
  sample_percent integer,
  own_value numeric,
  own_guess_mean numeric,
  own_guess_stddev numeric
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1 from public.rooms r join public.participants p on p.room_id = r.id
    where r.code = upper(trim(p_code)) and p.id = p_participant_id
  ) then raise exception 'You are not a player in this room.'; end if;

  return query
  select r.title, r.phase,
    (select count(*)::integer from public.participants p where p.room_id = r.id),
    (select count(*)::integer from public.responses s where s.room_id = r.id),
    (select count(*)::integer from public.responses s where s.room_id = r.id and s.is_sample),
    r.sample_percent,
    own_response.value,
    own_guess.guessed_mean,
    own_guess.guessed_stddev
  from public.rooms r
  join public.participants self on self.room_id = r.id and self.id = p_participant_id
  left join public.responses own_response on own_response.room_id = r.id and own_response.participant_id = self.id
  left join public.guesses own_guess on own_guess.room_id = r.id and own_guess.participant_id = self.id
  where r.code = upper(trim(p_code));
end;
$$;

create or replace function public.get_visible_sample(p_code text, p_participant_id uuid)
returns table(value numeric)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_room_id uuid;
begin
  select r.id into v_room_id
  from public.rooms r join public.participants p on p.room_id = r.id
  where r.code = upper(trim(p_code)) and p.id = p_participant_id
    and r.phase in ('guessing', 'revealed');
  if not found then raise exception 'The sample is not available yet.'; end if;
  return query select s.value from public.responses s where s.room_id = v_room_id and s.is_sample order by s.created_at, s.id;
end;
$$;

create or replace function public.get_visible_full_distribution(p_code text, p_participant_id uuid)
returns table(value numeric)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_room_id uuid;
begin
  select r.id into v_room_id
  from public.rooms r join public.participants p on p.room_id = r.id
  where r.code = upper(trim(p_code)) and p.id = p_participant_id and r.phase = 'revealed';
  if not found then raise exception 'The full distribution has not been revealed.'; end if;
  return query select s.value from public.responses s where s.room_id = v_room_id order by s.created_at, s.id;
end;
$$;

create or replace function public.submit_guess(p_code text, p_participant_id uuid, p_guess_mean numeric, p_guess_stddev numeric)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_room_id uuid;
begin
  select r.id into v_room_id
  from public.rooms r join public.participants p on p.room_id = r.id
  where r.code = upper(trim(p_code)) and p.id = p_participant_id and r.phase = 'guessing';
  if not found then raise exception 'Estimates are closed for this room.'; end if;
  if p_guess_mean is null or p_guess_stddev is null or p_guess_mean < 0 or p_guess_mean > 100 or p_guess_stddev < 0 or p_guess_stddev > 100 then
    raise exception 'Both estimates must be between 0 and 100.';
  end if;

  insert into public.guesses (room_id, participant_id, guessed_mean, guessed_stddev)
  values (v_room_id, p_participant_id, p_guess_mean, p_guess_stddev)
  on conflict (room_id, participant_id) do update
  set guessed_mean = excluded.guessed_mean, guessed_stddev = excluded.guessed_stddev, updated_at = now();
end;
$$;

create or replace function public.host_room_summary(p_code text, p_host_token uuid)
returns table(
  title text,
  phase public.outthink_phase,
  participant_count integer,
  response_count integer,
  guess_count integer,
  sample_count integer,
  sample_percent integer,
  actual_mean numeric,
  actual_stddev numeric
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_room public.rooms%rowtype;
begin
  select * into v_room from public.rooms r where r.code = upper(trim(p_code)) and r.host_token = p_host_token;
  if not found then raise exception 'Host access was not recognized.'; end if;

  return query select
    v_room.title, v_room.phase,
    (select count(*)::integer from public.participants p where p.room_id = v_room.id),
    (select count(*)::integer from public.responses s where s.room_id = v_room.id),
    (select count(*)::integer from public.guesses g where g.room_id = v_room.id),
    (select count(*)::integer from public.responses s where s.room_id = v_room.id and s.is_sample),
    v_room.sample_percent,
    case when v_room.phase = 'revealed' then (select avg(s.value) from public.responses s where s.room_id = v_room.id) else null end,
    case when v_room.phase = 'revealed' then (select stddev_pop(s.value) from public.responses s where s.room_id = v_room.id) else null end;
end;
$$;

create or replace function public.host_close_responses(p_code text, p_host_token uuid, p_sample_percent integer)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_room public.rooms%rowtype;
  v_response_count integer;
  v_sample_count integer;
begin
  select * into v_room from public.rooms r where r.code = upper(trim(p_code)) and r.host_token = p_host_token for update;
  if not found then raise exception 'Host access was not recognized.'; end if;
  if v_room.phase <> 'collecting' then raise exception 'This room has already moved on.'; end if;
  if p_sample_percent is null or p_sample_percent < 1 or p_sample_percent > 100 then raise exception 'Choose a reveal amount from 1%% to 100%%.'; end if;

  select count(*)::integer into v_response_count from public.responses s where s.room_id = v_room.id;
  if v_response_count = 0 then raise exception 'Wait for at least one response.'; end if;
  v_sample_count := greatest(1, ceil(v_response_count * p_sample_percent / 100.0)::integer);

  update public.responses set is_sample = false where room_id = v_room.id;
  with chosen as (
    select id from public.responses where room_id = v_room.id order by random() limit v_sample_count
  )
  update public.responses s set is_sample = true from chosen where s.id = chosen.id;

  update public.rooms set phase = 'guessing', sample_percent = p_sample_percent where id = v_room.id;
end;
$$;

create or replace function public.host_reveal_results(p_code text, p_host_token uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_room_id uuid;
begin
  select r.id into v_room_id from public.rooms r where r.code = upper(trim(p_code)) and r.host_token = p_host_token and r.phase = 'guessing' for update;
  if not found then raise exception 'This room is not ready to reveal yet.'; end if;
  update public.rooms set phase = 'revealed' where id = v_room_id;
end;
$$;

revoke all on function public.create_room(text) from public;
revoke all on function public.join_room(text, text) from public;
revoke all on function public.submit_response(text, uuid, numeric) from public;
revoke all on function public.get_player_state(text, uuid) from public;
revoke all on function public.get_visible_sample(text, uuid) from public;
revoke all on function public.get_visible_full_distribution(text, uuid) from public;
revoke all on function public.submit_guess(text, uuid, numeric, numeric) from public;
revoke all on function public.host_room_summary(text, uuid) from public;
revoke all on function public.host_close_responses(text, uuid, integer) from public;
revoke all on function public.host_reveal_results(text, uuid) from public;

grant execute on function public.create_room(text) to anon, authenticated;
grant execute on function public.join_room(text, text) to anon, authenticated;
grant execute on function public.submit_response(text, uuid, numeric) to anon, authenticated;
grant execute on function public.get_player_state(text, uuid) to anon, authenticated;
grant execute on function public.get_visible_sample(text, uuid) to anon, authenticated;
grant execute on function public.get_visible_full_distribution(text, uuid) to anon, authenticated;
grant execute on function public.submit_guess(text, uuid, numeric, numeric) to anon, authenticated;
grant execute on function public.host_room_summary(text, uuid) to anon, authenticated;
grant execute on function public.host_close_responses(text, uuid, integer) to anon, authenticated;
grant execute on function public.host_reveal_results(text, uuid) to anon, authenticated;
