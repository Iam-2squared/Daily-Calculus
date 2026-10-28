-- Apply through the Supabase SQL editor/management API after substituting the
-- SHA-256 hex digest of the server-only 256-bit CALCULUS_STORE_KEY below.
-- The raw key must never be stored here or sent to a browser.
-- Supabase's anon role may call only the narrow, secret-gated RPC. Application
-- tables live outside exposed schemas and have RLS and no client grants.

create schema if not exists daily_calculus;
revoke all on schema daily_calculus from public, anon, authenticated;

create table if not exists daily_calculus.settings (
  singleton boolean primary key default true check (singleton),
  store_key_sha256 text not null check (store_key_sha256 ~ '^[0-9a-f]{64}$')
);
insert into daily_calculus.settings (singleton, store_key_sha256)
values (true, '__CALCULUS_STORE_KEY_SHA256__')
on conflict (singleton) do update set store_key_sha256 = excluded.store_key_sha256;

create table if not exists daily_calculus.users (
  id integer generated always as identity primary key,
  username text not null check (char_length(username) between 2 and 20),
  username_key text not null unique check (char_length(username_key) between 2 and 80),
  password_hash text not null check (password_hash ~ '^[0-9a-f]{128}$'),
  password_salt text not null check (password_salt ~ '^[0-9a-f]{32}$'),
  created_at timestamptz not null default now()
);
create table if not exists daily_calculus.sessions (
  token_hash text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  user_id integer not null references daily_calculus.users(id) on delete cascade,
  expires_at bigint not null
);
create index if not exists dc_sessions_expiry on daily_calculus.sessions(expires_at);
create index if not exists dc_sessions_user on daily_calculus.sessions(user_id);
create table if not exists daily_calculus.solves (
  user_id integer not null references daily_calculus.users(id) on delete cascade,
  problem_id text not null check (char_length(problem_id) between 1 and 80),
  level text not null check (level in ('basic','applied','advanced')),
  points integer not null,
  solved_at timestamptz not null,
  solved_date date not null,
  primary key (user_id, problem_id),
  constraint dc_points_match_level check (
    (level = 'basic' and points = 1) or
    (level = 'applied' and points = 3) or
    (level = 'advanced' and points = 5)
  )
);
create index if not exists dc_solves_date_user on daily_calculus.solves(solved_date, user_id);
create table if not exists daily_calculus.auth_attempts (
  key_hash text primary key check (key_hash ~ '^[0-9a-f]{64}$'),
  count integer not null check (count > 0),
  expires_at bigint not null
);
create index if not exists dc_attempts_expiry on daily_calculus.auth_attempts(expires_at);

alter table daily_calculus.settings enable row level security;
alter table daily_calculus.users enable row level security;
alter table daily_calculus.sessions enable row level security;
alter table daily_calculus.solves enable row level security;
alter table daily_calculus.auth_attempts enable row level security;
revoke all on all tables in schema daily_calculus from public, anon, authenticated;
revoke all on all sequences in schema daily_calculus from public, anon, authenticated;
revoke all on all functions in schema daily_calculus from public, anon, authenticated;

-- Deliberately SECURITY DEFINER: the app uses its own PIN/session model, not
-- Supabase Auth. The high-entropy server-only key authenticates this fixed
-- operation API before any private data is accessed. No arbitrary SQL is used.
create or replace function public.dc_store(p_key text, p_operation text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $dc_store$
declare
  v_expected text;
  v_result jsonb;
  v_user daily_calculus.users%rowtype;
  v_user_id integer;
  v_now bigint;
  v_limit integer;
  v_count integer;
  v_changed integer;
  v_exists boolean;
  v_key_hash text;
  v_week date;
  v_period text;
  v_level text;
  v_points integer;
begin
  select s.store_key_sha256 into v_expected
    from daily_calculus.settings as s where s.singleton = true;
  if p_key is null or p_key !~ '^[0-9a-f]{64}$' or v_expected is null or
     pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_key, 'UTF8')), 'hex') <> v_expected then
    raise exception 'Unauthorized application store access' using errcode = '42501';
  end if;
  if p_payload is null or pg_catalog.jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Invalid operation payload' using errcode = '22023';
  end if;

  case p_operation
  when 'user_by_key' then
    select u.* into v_user from daily_calculus.users as u where u.username_key = p_payload->>'key';
    if not found then return 'null'::jsonb; end if;
    return pg_catalog.to_jsonb(v_user);

  when 'user_create' then
    insert into daily_calculus.users(username, username_key, password_hash, password_salt, created_at)
      values (p_payload->>'username', p_payload->>'key', p_payload->>'hash', p_payload->>'salt', (p_payload->>'createdAt')::timestamptz)
      on conflict (username_key) do nothing returning * into v_user;
    if not found then return 'null'::jsonb; end if;
    return pg_catalog.to_jsonb(v_user);

  when 'session_get' then
    select pg_catalog.jsonb_build_object('id', u.id, 'username', u.username, 'createdAt', u.created_at)
      into v_result from daily_calculus.sessions as s
      join daily_calculus.users as u on u.id = s.user_id
      where s.token_hash = p_payload->>'tokenHash' and s.expires_at > (p_payload->>'nowMs')::bigint;
    return coalesce(v_result, 'null'::jsonb);

  when 'session_create' then
    delete from daily_calculus.sessions where expires_at <= (p_payload->>'nowMs')::bigint;
    insert into daily_calculus.sessions(token_hash, user_id, expires_at)
      values (p_payload->>'tokenHash', (p_payload->>'userId')::integer, (p_payload->>'expiresAt')::bigint);
    return 'null'::jsonb;

  when 'session_delete' then
    delete from daily_calculus.sessions where token_hash = p_payload->>'tokenHash';
    return 'null'::jsonb;

  when 'rate_consume' then
    v_now := (p_payload->>'nowMs')::bigint;
    v_limit := (p_payload->>'maximum')::integer;
    if v_now is null or v_limit is null or v_limit < 1 or v_limit > 100 then
      raise exception 'Invalid rate limit' using errcode = '22023';
    end if;
    v_key_hash := pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_payload->>'key', 'UTF8')), 'hex');
    -- Atomic upsert prevents parallel serverless instances bypassing PIN limits.
    -- Cap increments at maximum+1, and clean expired rows on each auth request.
    delete from daily_calculus.auth_attempts where expires_at <= v_now;
    insert into daily_calculus.auth_attempts as attempts(key_hash, count, expires_at)
      values (v_key_hash, 1, v_now + 900000)
      on conflict (key_hash) do update set
        count = least(attempts.count + 1, v_limit + 1)
      returning count into v_count;
    return pg_catalog.to_jsonb(v_count <= v_limit);

  when 'rate_clear' then
    delete from daily_calculus.auth_attempts
      where key_hash = pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_payload->>'key', 'UTF8')), 'hex');
    return 'null'::jsonb;

  when 'solve_record' then
    v_user_id := (p_payload->>'userId')::integer;
    select exists(select 1 from daily_calculus.solves as s
      where s.user_id = v_user_id and s.problem_id = p_payload->>'problemId') into v_exists;
    v_changed := 0;
    if (p_payload->>'correct')::boolean then
      v_level := p_payload->>'level';
      v_points := case v_level when 'basic' then 1 when 'applied' then 3 when 'advanced' then 5 else null end;
      if v_points is null or (p_payload->>'points')::integer is distinct from v_points then
        raise exception 'Invalid problem points' using errcode = '22023';
      end if;
      insert into daily_calculus.solves(user_id, problem_id, level, points, solved_at, solved_date)
        values (v_user_id, p_payload->>'problemId', v_level, v_points,
                (p_payload->>'solvedAt')::timestamptz, (p_payload->>'date')::date)
        on conflict (user_id, problem_id) do nothing;
      get diagnostics v_changed = row_count;
      -- A concurrent request may have inserted after the first exists check.
      v_exists := v_changed = 0;
    end if;
    return pg_catalog.jsonb_build_object('pointsEarned', case when v_changed = 1 then v_points else 0 end, 'alreadySolved', v_exists);

  when 'stats' then
    v_user_id := (p_payload->>'userId')::integer;
    v_week := (p_payload->>'weekStart')::date;
    select pg_catalog.jsonb_build_object(
      'totalPoints', coalesce(sum(s.points), 0),
      'weeklyPoints', coalesce(sum(s.points) filter(where s.solved_date >= v_week), 0),
      'solvedCount', count(*),
      'streak', 0,
      'activity', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('date', a.solved_date, 'count', a.count, 'points', a.points) order by a.solved_date)
        from (select sa.solved_date, count(*) as count, sum(sa.points) as points from daily_calculus.solves as sa where sa.user_id = v_user_id group by sa.solved_date) as a), '[]'::jsonb),
      'solvedIds', coalesce(pg_catalog.jsonb_agg(s.problem_id order by s.solved_at desc), '[]'::jsonb),
      'levelCounts', pg_catalog.jsonb_build_object('basic', count(*) filter(where s.level = 'basic'), 'applied', count(*) filter(where s.level = 'applied'), 'advanced', count(*) filter(where s.level = 'advanced'))
    ) into v_result from daily_calculus.solves as s where s.user_id = v_user_id;
    return v_result;

  when 'rankings' then
    v_user_id := (p_payload->>'userId')::integer;
    v_period := p_payload->>'period';
    v_week := (p_payload->>'weekStart')::date;
    if v_period is null or v_period not in ('all', 'week') then
      raise exception 'Invalid ranking period' using errcode = '22023';
    end if;
    with totals as (
      select u.id, u.username, coalesce(sum(s.points), 0) as points
        from daily_calculus.users as u left join daily_calculus.solves as s
          on s.user_id = u.id and (v_period = 'all' or s.solved_date >= v_week)
        group by u.id
    ), ranked as (
      select t.*, rank() over(order by t.points desc) as rank from totals as t
    ), top_users as (
      select r.* from ranked as r order by r.points desc, pg_catalog.lower(r.username), r.id limit 25
    )
    select pg_catalog.jsonb_build_object(
      'entries', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('rank', r.rank, 'username', r.username, 'points', r.points, 'isYou', coalesce(r.id = v_user_id, false)) order by r.points desc, pg_catalog.lower(r.username), r.id) from top_users as r), '[]'::jsonb),
      'me', (select pg_catalog.jsonb_build_object('rank', r.rank, 'username', r.username, 'points', r.points, 'isYou', true) from ranked as r where r.id = v_user_id),
      'totalUsers', (select count(*) from daily_calculus.users),
      'period', v_period,
      'weekStart', v_week
    ) into v_result;
    return v_result;

  else
    raise exception 'Unsupported application store operation' using errcode = '22023';
  end case;
end;
$dc_store$;
revoke all on function public.dc_store(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.dc_store(text, text, jsonb) to anon;
comment on function public.dc_store(text, text, jsonb) is
  'Daily Calculus server-only store API. Requires a separate 256-bit application key; private tables have no client access.';
notify pgrst, 'reload schema';
