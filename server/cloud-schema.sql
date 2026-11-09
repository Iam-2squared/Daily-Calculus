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
  points integer not null check(points in (0,1,3,5)),
  solved_at timestamptz not null,
  solved_date date not null,
  primary key (user_id, problem_id),
  constraint dc_points_match_level check (
    points=0 or (level = 'basic' and points = 1) or
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

create table if not exists daily_calculus.scoring_voids (
  user_id integer not null,
  problem_id text not null,
  original_points integer not null check(original_points in (1,3,5)),
  reason text not null check(char_length(reason) between 1 and 200),
  voided_at timestamptz not null default now(),
  primary key(user_id,problem_id),
  foreign key(user_id,problem_id) references daily_calculus.solves(user_id,problem_id) on delete cascade
);
create table if not exists daily_calculus.scoring_state (
  user_id integer primary key references daily_calculus.users(id) on delete cascade,
  mistakes integer not null default 0 check(mistakes between 0 and 2),
  correct_streak integer not null default 0 check(correct_streak between 0 and 2),
  check(correct_streak=0 or mistakes=2)
);
create table if not exists daily_calculus.wrong_attempts (
  user_id integer not null references daily_calculus.users(id) on delete cascade,
  problem_id text not null check(char_length(problem_id) between 1 and 80),
  wrong_date date not null,
  primary key(user_id,problem_id,wrong_date)
);
create index if not exists dc_wrong_attempts_date_user on daily_calculus.wrong_attempts(wrong_date,user_id);
create table if not exists daily_calculus.solve_awards (
  user_id integer not null,
  problem_id text not null,
  pending boolean not null default false,
  award_date date,
  awarded_at timestamptz,
  primary key(user_id,problem_id),
  foreign key(user_id,problem_id) references daily_calculus.solves(user_id,problem_id) on delete cascade,
  check((award_date is null)=(awarded_at is null)),
  check(not pending or awarded_at is null),
  check(awarded_at is null or (isfinite(awarded_at) and award_date=(awarded_at at time zone 'Asia/Tokyo')::date))
);
create index if not exists dc_solve_awards_date_user on daily_calculus.solve_awards(award_date,user_id);
alter table daily_calculus.wrong_attempts enable row level security;
alter table daily_calculus.solve_awards enable row level security;
revoke all on daily_calculus.wrong_attempts,daily_calculus.solve_awards from public,anon,authenticated;
-- Old positive receipts retain their original award time. Old zero-point gate
-- and pause receipts receive no pending eligibility and can never be re-awarded.
insert into daily_calculus.solve_awards(user_id,problem_id,pending,award_date,awarded_at)
select user_id,problem_id,false,solved_date,solved_at from daily_calculus.solves where points>0
on conflict(user_id,problem_id) do nothing;

-- Correct learning receipts are final. Score corrections use the existing
-- auditable scoring_voids ledger, never a rewrite of an awarded-ID receipt.
create or replace function daily_calculus.reject_solve_points_update()
returns trigger language plpgsql set search_path='' as $final_points$
begin
  raise exception 'Solve points are final; point updates are not allowed' using errcode='23514';
end;
$final_points$;
revoke all on function daily_calculus.reject_solve_points_update() from public,anon,authenticated;
drop trigger if exists dc_lifetime_solve_update on daily_calculus.solves;
drop trigger if exists dc_solve_points_final on daily_calculus.solves;
create trigger dc_solve_points_final before update of points on daily_calculus.solves
for each row when(old.points is distinct from new.points)
execute function daily_calculus.reject_solve_points_update();

create table if not exists daily_calculus.scoring_reset_operations (
  reset_id uuid primary key,
  solved_date date not null,
  created_at timestamptz not null default now(),
  manifest jsonb not null check(pg_catalog.jsonb_typeof(manifest)='array')
);
alter table daily_calculus.scoring_reset_operations enable row level security;
revoke all on daily_calculus.scoring_reset_operations from public, anon, authenticated;

create table if not exists daily_calculus.scoring_control (
  singleton boolean primary key default true check(singleton),
  paused boolean not null default false,
  frozen_at timestamptz
);
insert into daily_calculus.scoring_control(singleton,paused,frozen_at)
  values(true,false,null) on conflict(singleton) do nothing;
alter table daily_calculus.scoring_control enable row level security;
revoke all on daily_calculus.scoring_control from public, anon, authenticated;

-- One canonical mathematical statement can affect an account's scoring gate
-- and score only on its first attempt, across dates, modes, levels, and IDs.
create table if not exists daily_calculus.problem_fingerprints (
  problem_id text primary key check(char_length(problem_id) between 1 and 80),
  fingerprint text not null check(fingerprint ~ '^[0-9a-f]{64}$'),
  unique(problem_id,fingerprint)
);
create index if not exists dc_problem_fingerprints_content on daily_calculus.problem_fingerprints(fingerprint);
create table if not exists daily_calculus.content_receipts (
  user_id integer not null references daily_calculus.users(id) on delete cascade,
  fingerprint text not null check(fingerprint ~ '^[0-9a-f]{64}$'),
  first_problem_id text not null,
  first_seen_date date not null check(isfinite(first_seen_date)),
  primary key(user_id,fingerprint),
  foreign key(first_problem_id,fingerprint) references daily_calculus.problem_fingerprints(problem_id,fingerprint)
);
create table if not exists daily_calculus.content_guard (
  singleton boolean primary key default true check(singleton),
  enabled boolean not null default false,
  enabled_at timestamptz,
  manifest_sha256 text check(manifest_sha256 ~ '^[0-9a-f]{64}$'),
  check(not enabled or (enabled_at is not null and manifest_sha256 is not null))
);
insert into daily_calculus.content_guard(singleton,enabled) values(true,false) on conflict(singleton) do nothing;
alter table daily_calculus.problem_fingerprints enable row level security;
alter table daily_calculus.content_receipts enable row level security;
alter table daily_calculus.content_guard enable row level security;
revoke all on daily_calculus.problem_fingerprints,daily_calculus.content_receipts,daily_calculus.content_guard from public,anon,authenticated;

-- Root/admin-only activation: validate a trusted-generator manifest against
-- every live historical receipt before atomically enabling the strict guard.
-- Counts/coverage are checked under the same lock order as dc_store, so an
-- answer racing a stale export aborts activation rather than escaping dedup.
create or replace function daily_calculus.enable_question_content_guard(p_manifest jsonb)
returns jsonb language plpgsql security definer set search_path='' as $content_import$
declare
  v_enabled boolean;
  v_old_hash text;
  v_manifest_hash text;
  v_maps jsonb;
  v_claims jsonb;
  v_bad boolean;
  v_solve_count bigint;
  v_wrong_count bigint;
begin
  if p_manifest is null or pg_catalog.jsonb_typeof(p_manifest)<>'object' or
    p_manifest->>'version' is distinct from '1' or
    pg_catalog.jsonb_typeof(p_manifest->'problem_fingerprints') is distinct from 'array' or
    pg_catalog.jsonb_typeof(p_manifest->'content_receipts') is distinct from 'array' or
    coalesce(p_manifest->>'solveCount','') !~ '^[0-9]{1,9}$' or
    coalesce(p_manifest->>'wrongCount','') !~ '^[0-9]{1,9}$' then
    raise exception 'Invalid content manifest' using errcode='22023';
  end if;
  v_maps:=p_manifest->'problem_fingerprints'; v_claims:=p_manifest->'content_receipts';
  if pg_catalog.jsonb_array_length(v_maps)>100000 or pg_catalog.jsonb_array_length(v_claims)>100000 then
    raise exception 'Content manifest is too large' using errcode='22023';
  end if;
  if exists(select 1 from pg_catalog.jsonb_array_elements(v_maps) x where
    pg_catalog.jsonb_typeof(x) is distinct from 'object' or
    pg_catalog.jsonb_typeof(x->'problem_id') is distinct from 'string' or
    char_length(x->>'problem_id') not between 1 and 80 or
    pg_catalog.jsonb_typeof(x->'fingerprint') is distinct from 'string' or
    coalesce(x->>'fingerprint','') !~ '^[0-9a-f]{64}$') or
    exists(select 1 from pg_catalog.jsonb_array_elements(v_claims) x where
    pg_catalog.jsonb_typeof(x) is distinct from 'object' or
    pg_catalog.jsonb_typeof(x->'user_id') is distinct from 'number' or
    coalesce(x->>'user_id','') !~ '^[1-9][0-9]{0,9}$' or
    (x->>'user_id')::numeric>2147483647 or
    pg_catalog.jsonb_typeof(x->'fingerprint') is distinct from 'string' or
    coalesce(x->>'fingerprint','') !~ '^[0-9a-f]{64}$' or
    pg_catalog.jsonb_typeof(x->'first_problem_id') is distinct from 'string' or
    char_length(x->>'first_problem_id') not between 1 and 80 or
    pg_catalog.jsonb_typeof(x->'first_seen_date') is distinct from 'string' or
    coalesce(x->>'first_seen_date','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$') then
    raise exception 'Invalid content manifest entry' using errcode='22023';
  end if;
  if (select count(distinct x->>'problem_id') from pg_catalog.jsonb_array_elements(v_maps) x)
       <>pg_catalog.jsonb_array_length(v_maps) or
     (select count(distinct (x->>'user_id',x->>'fingerprint')) from pg_catalog.jsonb_array_elements(v_claims) x)
       <>pg_catalog.jsonb_array_length(v_claims) then
    raise exception 'Duplicate content manifest entry' using errcode='22023';
  end if;
  v_manifest_hash:=pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_manifest::text,'UTF8')),'hex');
  perform 1 from daily_calculus.scoring_control where singleton=true for update;
  select enabled,manifest_sha256 into v_enabled,v_old_hash from daily_calculus.content_guard where singleton=true for update;
  if not found then raise exception 'Missing content guard'; end if;
  if v_enabled then
    if v_old_hash<>v_manifest_hash then raise exception 'Content guard already enabled with another manifest'; end if;
    return pg_catalog.jsonb_build_object('enabled',true,'alreadyEnabled',true,'manifestSha256',v_manifest_hash);
  end if;
  lock table daily_calculus.users,daily_calculus.solves,daily_calculus.wrong_attempts in share row exclusive mode;
  select count(*) into v_solve_count from daily_calculus.solves;
  select count(*) into v_wrong_count from daily_calculus.wrong_attempts;
  if v_solve_count<>(p_manifest->>'solveCount')::bigint or v_wrong_count<>(p_manifest->>'wrongCount')::bigint then
    raise exception 'Historical attempts changed; rebuild content manifest';
  end if;
  if exists(select 1 from pg_catalog.jsonb_to_recordset(v_maps) x(problem_id text,fingerprint text)
    join daily_calculus.problem_fingerprints m on m.problem_id=x.problem_id where m.fingerprint<>x.fingerprint) then
    raise exception 'Historical fingerprint changed';
  end if;
  -- A supplied map must describe exactly the historical ID set, not a partial
  -- export. The mathematics itself is reconstructed by the trusted script.
  with historical as(select problem_id from daily_calculus.solves union select problem_id from daily_calculus.wrong_attempts),
    supplied as(select x.problem_id from pg_catalog.jsonb_to_recordset(v_maps) x(problem_id text,fingerprint text))
  select exists((select problem_id from historical except select problem_id from supplied)
    union all(select problem_id from supplied except select problem_id from historical)) into v_bad;
  if v_bad then raise exception 'Content manifest does not cover every historical ID'; end if;
  insert into daily_calculus.problem_fingerprints(problem_id,fingerprint)
    select x.problem_id,x.fingerprint from pg_catalog.jsonb_to_recordset(v_maps) x(problem_id text,fingerprint text)
    on conflict(problem_id) do nothing;
  with attempts as(
    select s.user_id,m.fingerprint,s.problem_id,s.solved_date as seen_date from daily_calculus.solves s
      join daily_calculus.problem_fingerprints m on m.problem_id=s.problem_id
    union all
    select w.user_id,m.fingerprint,w.problem_id,w.wrong_date from daily_calculus.wrong_attempts w
      join daily_calculus.problem_fingerprints m on m.problem_id=w.problem_id
  ),expected as(
    select distinct on(user_id,fingerprint) user_id,fingerprint,problem_id as first_problem_id,seen_date as first_seen_date
      from attempts order by user_id,fingerprint,seen_date,problem_id collate "C"
  ),supplied as(
    select * from pg_catalog.jsonb_to_recordset(v_claims) x(user_id integer,fingerprint text,first_problem_id text,first_seen_date date)
  ) select exists((select * from expected except select * from supplied)
    union all(select * from supplied except select * from expected)) into v_bad;
  if v_bad then raise exception 'Content claim manifest differs from historical first attempts'; end if;
  insert into daily_calculus.content_receipts as existing(user_id,fingerprint,first_problem_id,first_seen_date)
    select * from pg_catalog.jsonb_to_recordset(v_claims) x(user_id integer,fingerprint text,first_problem_id text,first_seen_date date)
    on conflict(user_id,fingerprint) do update set
      first_problem_id=excluded.first_problem_id,first_seen_date=excluded.first_seen_date
    where (excluded.first_seen_date,excluded.first_problem_id collate "C") <
      (existing.first_seen_date,existing.first_problem_id collate "C");
  update daily_calculus.content_guard set enabled=true,enabled_at=pg_catalog.now(),manifest_sha256=v_manifest_hash where singleton=true;
  return pg_catalog.jsonb_build_object('enabled',true,'alreadyEnabled',false,'solveCount',v_solve_count,
    'wrongCount',v_wrong_count,'mapCount',pg_catalog.jsonb_array_length(v_maps),
    'claimCount',pg_catalog.jsonb_array_length(v_claims),'manifestSha256',v_manifest_hash);
end;
$content_import$;
revoke all on function daily_calculus.enable_question_content_guard(jsonb) from public,anon,authenticated;

create table if not exists daily_calculus.lifetime_totals (
  user_id integer primary key check (user_id > 0),
  total_points bigint not null default 0 check (total_points between 0 and 1000000000),
  deleted boolean not null default false
);
alter table daily_calculus.lifetime_totals enable row level security;
revoke all on daily_calculus.lifetime_totals from public, anon, authenticated;

insert into daily_calculus.lifetime_totals(user_id,total_points,deleted)
select u.id, coalesce(sum(s.points),0),false
from daily_calculus.users u left join daily_calculus.solves s on s.user_id=u.id
group by u.id
on conflict (user_id) do nothing;

create or replace function daily_calculus.track_lifetime_totals()
returns trigger language plpgsql security definer set search_path = ''
as $lifetime_trigger$
begin
  if tg_table_name = 'users' and tg_op = 'INSERT' then
    insert into daily_calculus.lifetime_totals(user_id) values(new.id);
    return new;
  elsif tg_table_name = 'users' and tg_op = 'DELETE' then
    update daily_calculus.lifetime_totals set deleted=true where user_id=old.id;
    return old;
  elsif tg_table_name = 'solves' and tg_op = 'INSERT' then
    update daily_calculus.lifetime_totals set total_points=total_points+new.points
    where user_id=new.user_id and not deleted;
    if not found then raise exception 'Missing lifetime source'; end if;
    return new;
  end if;
  raise exception 'Invalid lifetime source operation';
end;
$lifetime_trigger$;
revoke all on function daily_calculus.track_lifetime_totals() from public, anon, authenticated;

drop trigger if exists dc_lifetime_user_insert on daily_calculus.users;
create trigger dc_lifetime_user_insert after insert on daily_calculus.users
for each row execute function daily_calculus.track_lifetime_totals();
drop trigger if exists dc_lifetime_user_delete on daily_calculus.users;
create trigger dc_lifetime_user_delete after delete on daily_calculus.users
for each row execute function daily_calculus.track_lifetime_totals();
drop trigger if exists dc_lifetime_solve_insert on daily_calculus.solves;
create trigger dc_lifetime_solve_insert after insert on daily_calculus.solves
for each row execute function daily_calculus.track_lifetime_totals();


-- The first attempt consumes scoring only for this Japanese calendar day.
-- Old global content_receipts remain an immutable historical audit source.
create table if not exists daily_calculus.daily_content_receipts (
  user_id integer not null references daily_calculus.users(id) on delete cascade,
  fingerprint text not null check(fingerprint ~ '^[0-9a-f]{64}$'),
  attempt_date date not null check(isfinite(attempt_date)),
  first_problem_id text not null check(char_length(first_problem_id) between 1 and 80),
  first_correct_at timestamptz,
  correct_problem_id text check(char_length(correct_problem_id) between 1 and 80),
  primary key(user_id,fingerprint,attempt_date),
  check((first_correct_at is null)=(correct_problem_id is null)),
  check(first_correct_at is null or (isfinite(first_correct_at) and attempt_date=(first_correct_at at time zone 'Asia/Tokyo')::date))
);
create index if not exists dc_daily_content_date_user on daily_calculus.daily_content_receipts(attempt_date,user_id);
create table if not exists daily_calculus.daily_awards (
  user_id integer not null references daily_calculus.users(id) on delete cascade,
  fingerprint text not null check(fingerprint ~ '^[0-9a-f]{64}$'),
  award_date date not null,
  problem_id text not null,
  level text not null check(level in ('basic','applied','advanced')),
  points integer not null check((level='basic' and points=1) or (level='applied' and points=3) or (level='advanced' and points=5)),
  awarded_at timestamptz not null check(isfinite(awarded_at)),
  primary key(user_id,fingerprint,award_date),
  foreign key(user_id,problem_id) references daily_calculus.solves(user_id,problem_id) on delete cascade,
  check(award_date=(awarded_at at time zone 'Asia/Tokyo')::date)
);
create index if not exists dc_daily_awards_date_user on daily_calculus.daily_awards(award_date,user_id);
alter table daily_calculus.daily_content_receipts enable row level security;
alter table daily_calculus.daily_awards enable row level security;
revoke all on daily_calculus.daily_content_receipts,daily_calculus.daily_awards from public,anon,authenticated;

-- Backfill eligibility markers only. No historical financial receipt, visible
-- cancellation, lifetime total, or external wallet watermark is rewritten.
do $daily_coverage$
begin
  if exists(select 1 from daily_calculus.solves s left join daily_calculus.problem_fingerprints m on m.problem_id=s.problem_id where m.problem_id is null)
     or exists(select 1 from daily_calculus.wrong_attempts w left join daily_calculus.problem_fingerprints m on m.problem_id=w.problem_id where m.problem_id is null) then
    raise exception 'Historical content mappings are incomplete; stop daily scoring migration';
  end if;
end;
$daily_coverage$;
with attempts as(
  select s.user_id,m.fingerprint,s.solved_date as day,s.problem_id from daily_calculus.solves s join daily_calculus.problem_fingerprints m on m.problem_id=s.problem_id
  union all
  select w.user_id,m.fingerprint,w.wrong_date,w.problem_id from daily_calculus.wrong_attempts w join daily_calculus.problem_fingerprints m on m.problem_id=w.problem_id
  union all
  select a.user_id,m.fingerprint,a.award_date,a.problem_id from daily_calculus.solve_awards a join daily_calculus.problem_fingerprints m on m.problem_id=a.problem_id where a.award_date is not null
  union all
  select c.user_id,c.fingerprint,c.first_seen_date,c.first_problem_id from daily_calculus.content_receipts c
),first_attempts as(
  select distinct on(user_id,fingerprint,day) user_id,fingerprint,day,problem_id
    from attempts order by user_id,fingerprint,day,problem_id collate "C"
)
insert into daily_calculus.daily_content_receipts(user_id,fingerprint,attempt_date,first_problem_id)
  select user_id,fingerprint,day,problem_id from first_attempts on conflict do nothing;
with corrects as(
  select s.user_id,m.fingerprint,s.solved_date as day,s.problem_id,s.solved_at as correct_at from daily_calculus.solves s join daily_calculus.problem_fingerprints m on m.problem_id=s.problem_id
  union all
  select a.user_id,m.fingerprint,a.award_date,a.problem_id,a.awarded_at from daily_calculus.solve_awards a join daily_calculus.problem_fingerprints m on m.problem_id=a.problem_id where a.award_date is not null
),first_corrects as(
  select distinct on(user_id,fingerprint,day) user_id,fingerprint,day,problem_id,correct_at
    from corrects order by user_id,fingerprint,day,correct_at,problem_id collate "C"
)
update daily_calculus.daily_content_receipts c set first_correct_at=f.correct_at,correct_problem_id=f.problem_id
  from first_corrects f where c.user_id=f.user_id and c.fingerprint=f.fingerprint and c.attempt_date=f.day and c.first_correct_at is null;

-- New credits have their own append-only receipt; old solves.points stay final.
create or replace function daily_calculus.track_daily_award_income()
returns trigger language plpgsql security definer set search_path='' as $daily_income$
begin
  update daily_calculus.lifetime_totals set total_points=total_points+new.points
    where user_id=new.user_id and not deleted;
  if not found then raise exception 'Missing lifetime source'; end if;
  return new;
end;
$daily_income$;
revoke all on function daily_calculus.track_daily_award_income() from public,anon,authenticated;
drop trigger if exists dc_daily_award_income on daily_calculus.daily_awards;
create trigger dc_daily_award_income after insert on daily_calculus.daily_awards
for each row execute function daily_calculus.track_daily_award_income();
create or replace function daily_calculus.protect_daily_awards()
returns trigger language plpgsql set search_path='' as $daily_immutable$
begin
  -- The account deletion FK may remove personal receipts after its parent row
  -- disappears. The opaque gross-income tombstone remains in lifetime_totals.
  if tg_op='DELETE' and not exists(select 1 from daily_calculus.users where id=old.user_id) then return old; end if;
  raise exception 'Daily award receipts are immutable' using errcode='23514';
end;
$daily_immutable$;
revoke all on function daily_calculus.protect_daily_awards() from public,anon,authenticated;
drop trigger if exists dc_daily_awards_immutable on daily_calculus.daily_awards;
create trigger dc_daily_awards_immutable before update or delete on daily_calculus.daily_awards
for each row execute function daily_calculus.protect_daily_awards();

-- A cached pre-cutover RPC may resume after the migration lock is released.
-- Require the new daily claim protocol and reject every new legacy positive
-- solve, while leaving all pre-existing positive financial rows untouched.
create or replace function daily_calculus.require_daily_attempt_before_legacy_write()
returns trigger language plpgsql set search_path='' as $daily_write_guard$
declare v_day date;v_fingerprint text;
begin
  if tg_table_name='solves' then
    if new.points<>0 then raise exception 'Future learning receipts must have zero points' using errcode='23514'; end if;
    v_day:=new.solved_date;
  elsif tg_table_name='wrong_attempts' then
    v_day:=new.wrong_date;
  else raise exception 'Invalid daily learning operation';
  end if;
  select fingerprint into v_fingerprint from daily_calculus.problem_fingerprints where problem_id=new.problem_id;
  if not exists(select 1 from daily_calculus.daily_content_receipts c where c.user_id=new.user_id and c.attempt_date=v_day
    and (c.fingerprint=v_fingerprint or c.first_problem_id=new.problem_id)) then
    raise exception 'A daily attempt claim is required before learning writes' using errcode='23514';
  end if;
  return new;
end;
$daily_write_guard$;
revoke all on function daily_calculus.require_daily_attempt_before_legacy_write() from public,anon,authenticated;
drop trigger if exists dc_new_solves_daily_protocol on daily_calculus.solves;
create trigger dc_new_solves_daily_protocol before insert on daily_calculus.solves
for each row execute function daily_calculus.require_daily_attempt_before_legacy_write();
drop trigger if exists dc_new_wrongs_daily_protocol on daily_calculus.wrong_attempts;
create trigger dc_new_wrongs_daily_protocol before insert on daily_calculus.wrong_attempts
for each row execute function daily_calculus.require_daily_attempt_before_legacy_write();

alter table daily_calculus.scoring_voids enable row level security;
alter table daily_calculus.scoring_state enable row level security;

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
  v_mistakes integer;
  v_correct_streak integer;
  v_awarded_points integer;
  v_award_blocked boolean;
  v_paused boolean;
  v_frozen_at timestamptz;
  v_award_paused boolean;
  v_problem_id text;
  v_answered_at timestamptz;
  v_answer_date date;
  v_solve daily_calculus.solves%rowtype;
  v_wrong_today boolean;
  v_wrong_day_blocked boolean;
  v_award_eligible boolean;
  v_guard_enabled boolean;
  v_input_fingerprint text;
  v_fingerprint text;
  v_known_fingerprint text;
  v_duplicate boolean;
  v_gate_eligible boolean;
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

  when 'user_delete' then
    if pg_catalog.jsonb_typeof(p_payload->'userId') is distinct from 'number' or
       (p_payload->>'userId') !~ '^[1-9][0-9]*$' then
      raise exception 'Invalid user ID' using errcode = '22023';
    end if;
    v_user_id := (p_payload->>'userId')::integer;
    -- The server passes only the authenticated account ID. Foreign-key cascades
    -- revoke every session and remove that account's solves in this transaction.
    delete from daily_calculus.users where id = v_user_id;
    return 'null'::jsonb;

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

  when 'scoring_control' then
    select pg_catalog.jsonb_build_object('scoringPaused',c.paused,'scoringFrozenAt',c.frozen_at)
      into v_result from daily_calculus.scoring_control as c where c.singleton=true;
    return coalesce(v_result,'{"scoringPaused":false,"scoringFrozenAt":null}'::jsonb);

  when 'solve_record' then
    v_user_id := (p_payload->>'userId')::integer;
    v_problem_id := p_payload->>'problemId';
    v_level := p_payload->>'level';
    v_points := case v_level when 'basic' then 1 when 'applied' then 3 when 'advanced' then 5 else null end;
    if v_user_id is null or v_user_id<=0 or
       pg_catalog.jsonb_typeof(p_payload->'correct') is distinct from 'boolean' or
       pg_catalog.jsonb_typeof(p_payload->'problemId') is distinct from 'string' or
       char_length(v_problem_id) not between 1 and 80 or
       v_points is null or (p_payload->>'points')::integer is distinct from v_points then
      raise exception 'Invalid solve payload' using errcode='22023';
    end if;
    v_answered_at := (p_payload->>'solvedAt')::timestamptz;
    v_answer_date := (v_answered_at at time zone 'Asia/Tokyo')::date;
    if v_answered_at is null or not isfinite(v_answered_at) or
       (p_payload->>'date')::date is distinct from v_answer_date then
      raise exception 'Solve date must match the Japanese answer date' using errcode='22023';
    end if;
    -- Keep control -> guard -> account lock order, including activation.
    select c.paused,c.frozen_at into v_paused,v_frozen_at
      from daily_calculus.scoring_control c where c.singleton=true for share;
    if not found then v_paused:=false; v_frozen_at:=null; end if;
    select g.enabled into v_guard_enabled from daily_calculus.content_guard g where g.singleton=true for share;
    if not found then raise exception 'Missing content guard'; end if;
    perform 1 from daily_calculus.users u where u.id=v_user_id for update;
    if not found then raise exception 'Unknown solve account' using errcode='23503'; end if;
    select * into v_solve from daily_calculus.solves s where s.user_id=v_user_id and s.problem_id=v_problem_id;
    v_exists := found;
    if v_exists and v_solve.level<>v_level then
      raise exception 'Solve difficulty changed' using errcode='22023';
    end if;
    v_input_fingerprint:=case when pg_catalog.jsonb_typeof(p_payload->'contentFingerprint')='string'
      and (p_payload->>'contentFingerprint') ~ '^[0-9a-f]{64}$' then p_payload->>'contentFingerprint' else null end;
    select m.fingerprint into v_known_fingerprint from daily_calculus.problem_fingerprints m where m.problem_id=v_problem_id;
    if v_input_fingerprint is not null then
      insert into daily_calculus.problem_fingerprints(problem_id,fingerprint)
        values(v_problem_id,v_input_fingerprint) on conflict(problem_id) do nothing;
      select m.fingerprint into v_known_fingerprint from daily_calculus.problem_fingerprints m where m.problem_id=v_problem_id;
      if v_known_fingerprint<>v_input_fingerprint then
        raise exception 'Problem content fingerprint changed' using errcode='22023';
      end if;
    end if;
    v_fingerprint:=coalesce(v_input_fingerprint,v_known_fingerprint);
    if v_guard_enabled and v_fingerprint is null then
      -- Old in-flight servers cannot introduce new unmapped history after the
      -- audited import. A known stored mapping can safely serve old daily IDs.
      select st.mistakes,st.correct_streak into v_mistakes,v_correct_streak
        from daily_calculus.scoring_state st where st.user_id=v_user_id;
      v_mistakes:=coalesce(v_mistakes,0);v_correct_streak:=coalesce(v_correct_streak,0);
      return pg_catalog.jsonb_build_object('pointsEarned',0,'alreadySolved',v_exists,
        'scoring',pg_catalog.jsonb_build_object('mistakes',v_mistakes,'correctStreak',v_correct_streak,'requiredCorrectStreak',3,'locked',v_mistakes=2),
        'awardBlocked',false,'awardPaused',false,'awardWrongDayBlocked',false,
        'awardPending',false,'awardDuplicate',false,'awardAttemptedToday',false,'awardUnavailable',true,'scoringFrozenAt',v_frozen_at);
    end if;
    -- Only unguarded local/legacy fixtures may fall back to an ID identity.
    -- Production's enabled guard returned above for any unknown missing key.
    v_fingerprint:=coalesce(v_fingerprint,pg_catalog.encode(pg_catalog.sha256(
      pg_catalog.convert_to('daily-calculus:unmapped-id:v1:'||v_problem_id,'UTF8')),'hex'));
    -- Keep the nonfinancial global audit claim too. A cached old RPC resumed
    -- after cutover then sees a duplicate and cannot progress the gate again.
    if v_known_fingerprint is not null then
      insert into daily_calculus.content_receipts(user_id,fingerprint,first_problem_id,first_seen_date)
        values(v_user_id,v_fingerprint,v_problem_id,v_answer_date) on conflict(user_id,fingerprint) do nothing;
    end if;
    insert into daily_calculus.daily_content_receipts(user_id,fingerprint,attempt_date,first_problem_id)
      values(v_user_id,v_fingerprint,v_answer_date,v_problem_id) on conflict(user_id,fingerprint,attempt_date) do nothing;
    get diagnostics v_changed=row_count;
    v_duplicate:=v_changed=0;
    -- Secret-bound c4 challenges and daily IDs may score once per content/day.
    -- Public-seed legacy challenges remain unranked and consume today's claim.
    v_award_eligible:=v_problem_id !~ '^c[123][pt]\.'
      and p_payload->'awardEligible' is distinct from 'false'::jsonb;
    v_gate_eligible:=v_award_eligible and not v_duplicate;
    insert into daily_calculus.scoring_state(user_id) values(v_user_id) on conflict(user_id) do nothing;
    select st.mistakes,st.correct_streak into v_mistakes,v_correct_streak
      from daily_calculus.scoring_state st where st.user_id=v_user_id for update;
    select exists(select 1 from daily_calculus.wrong_attempts w
      left join daily_calculus.problem_fingerprints wm on wm.problem_id=w.problem_id
      where w.user_id=v_user_id and w.wrong_date=v_answer_date and
        (w.problem_id=v_problem_id or (v_fingerprint is not null and wm.fingerprint=v_fingerprint))) into v_wrong_today;
    v_awarded_points:=0;v_award_blocked:=false;v_award_paused:=false;v_wrong_day_blocked:=v_wrong_today;
    if not (p_payload->>'correct')::boolean then
      if not v_duplicate then
        insert into daily_calculus.wrong_attempts(user_id,problem_id,wrong_date)
          values(v_user_id,v_problem_id,v_answer_date) on conflict do nothing;
        v_wrong_today:=true;v_wrong_day_blocked:=true;
      end if;
      if v_gate_eligible then
        v_mistakes:=least(2,v_mistakes+1);v_correct_streak:=0;
        update daily_calculus.scoring_state set mistakes=v_mistakes,correct_streak=v_correct_streak where user_id=v_user_id;
      end if;
    else
      v_award_blocked:=v_gate_eligible and v_mistakes=2 and v_correct_streak<2;
      v_award_paused:=v_paused;
      v_awarded_points:=case when not v_gate_eligible or v_paused or v_award_blocked or v_wrong_today then 0 else v_points end;
      if not v_exists then
        -- First-learning identity remains unique and immutable. Every new
        -- monetary credit is stored in the separate append-only daily ledger.
        insert into daily_calculus.solves(user_id,problem_id,level,points,solved_at,solved_date)
          values(v_user_id,v_problem_id,v_level,0,v_answered_at,v_answer_date);
        insert into daily_calculus.solve_awards(user_id,problem_id,pending,award_date,awarded_at)
          values(v_user_id,v_problem_id,false,null,null);
      end if;
      update daily_calculus.daily_content_receipts set first_correct_at=v_answered_at,correct_problem_id=v_problem_id
        where user_id=v_user_id and fingerprint=v_fingerprint and attempt_date=v_answer_date and first_correct_at is null;
      if v_awarded_points>0 then
        insert into daily_calculus.daily_awards(user_id,fingerprint,award_date,problem_id,level,points,awarded_at)
          values(v_user_id,v_fingerprint,v_answer_date,v_problem_id,v_level,v_awarded_points,v_answered_at);
      end if;
      if v_gate_eligible and v_mistakes=2 and v_correct_streak<2 then
        v_correct_streak:=v_correct_streak+1;
      elsif v_gate_eligible and v_mistakes=2 then
        v_mistakes:=0;v_correct_streak:=0;
      end if;
      update daily_calculus.scoring_state set mistakes=v_mistakes,correct_streak=v_correct_streak where user_id=v_user_id;
    end if;
    return pg_catalog.jsonb_build_object(
      'pointsEarned',v_awarded_points,'alreadySolved',v_exists,
      'scoring',pg_catalog.jsonb_build_object('mistakes',v_mistakes,'correctStreak',v_correct_streak,'requiredCorrectStreak',3,'locked',v_mistakes=2),
      'awardBlocked',v_award_blocked,'awardPaused',v_award_paused,
      'awardWrongDayBlocked',v_wrong_day_blocked,'awardPending',false,
      'awardDuplicate',v_duplicate,'awardAttemptedToday',true,'awardUnavailable',not v_award_eligible,'scoringFrozenAt',v_frozen_at
    );

  when 'stats' then
    v_user_id := (p_payload->>'userId')::integer;
    v_week := (p_payload->>'weekStart')::date;
    select c.paused,c.frozen_at into v_paused,v_frozen_at
      from daily_calculus.scoring_control c where c.singleton=true;
    select pg_catalog.jsonb_build_object(
      'totalPoints',coalesce(sum(case when sv.user_id is null then s.points else 0 end),0)+
        coalesce((select sum(da.points) from daily_calculus.daily_awards da where da.user_id=v_user_id),0),
      'weeklyPoints',coalesce(sum(case when sv.user_id is null then s.points else 0 end)
        filter(where coalesce(sa.award_date,s.solved_date)>=v_week),0)+
        coalesce((select sum(da.points) from daily_calculus.daily_awards da where da.user_id=v_user_id and da.award_date>=v_week),0),
      'solvedCount',count(*),'streak',0,
      'scoringPaused',coalesce(v_paused,false),'scoringFrozenAt',v_frozen_at,
      'scoring',coalesce((select pg_catalog.jsonb_build_object(
        'mistakes',st.mistakes,'correctStreak',st.correct_streak,'requiredCorrectStreak',3,'locked',st.mistakes=2)
        from daily_calculus.scoring_state st where st.user_id=v_user_id),
        '{"mistakes":0,"correctStreak":0,"requiredCorrectStreak":3,"locked":false}'::jsonb),
      'wrongTodayIds',coalesce((select pg_catalog.jsonb_agg(ids.problem_id order by ids.problem_id) from (
        select w.problem_id from daily_calculus.wrong_attempts w where w.user_id=v_user_id and w.wrong_date=(p_payload->>'today')::date
        union
        select own.problem_id from (
          select s.problem_id from daily_calculus.solves s where s.user_id=v_user_id
          union select w.problem_id from daily_calculus.wrong_attempts w where w.user_id=v_user_id
        ) own join daily_calculus.problem_fingerprints om on om.problem_id=own.problem_id
        join daily_calculus.problem_fingerprints wm on wm.fingerprint=om.fingerprint
        join daily_calculus.wrong_attempts w on w.problem_id=wm.problem_id
        where w.user_id=v_user_id and w.wrong_date=(p_payload->>'today')::date
      ) ids),'[]'::jsonb),
      'pendingAwardIds','[]'::jsonb,
      'attemptedTodayContentIds',coalesce((select pg_catalog.jsonb_agg(c.fingerprint order by c.fingerprint)
        from daily_calculus.daily_content_receipts c where c.user_id=v_user_id and c.attempt_date=(p_payload->>'today')::date),'[]'::jsonb),
      'activity',coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'date',a.day,'count',a.correct_count,'points',a.points) order by a.day) from (
        select events.day,sum(events.correct_count) as correct_count,sum(events.points) as points from (
          select ls.solved_date as day,count(*) as correct_count,0::bigint as points
            from daily_calculus.solves ls where ls.user_id=v_user_id group by ls.solved_date
          union all
          select la.award_date as day,count(*) as correct_count,0::bigint as points
            from daily_calculus.solve_awards la join daily_calculus.solves ls on ls.user_id=la.user_id and ls.problem_id=la.problem_id
            where la.user_id=v_user_id and la.award_date<>ls.solved_date group by la.award_date
          union all
          select c.attempt_date as day,count(*) as correct_count,0::bigint as points
            from daily_calculus.daily_content_receipts c where c.user_id=v_user_id and c.first_correct_at is not null
              and not exists(select 1 from daily_calculus.solves counted
                left join daily_calculus.problem_fingerprints cm on cm.problem_id=counted.problem_id
                where counted.user_id=c.user_id and counted.solved_date=c.attempt_date and
                  (cm.fingerprint=c.fingerprint or counted.problem_id=c.correct_problem_id))
              and not exists(select 1 from daily_calculus.solve_awards ca
                left join daily_calculus.problem_fingerprints cm on cm.problem_id=ca.problem_id
                where ca.user_id=c.user_id and ca.award_date=c.attempt_date and
                  (cm.fingerprint=c.fingerprint or ca.problem_id=c.correct_problem_id))
            group by c.attempt_date
          union all
          select coalesce(la.award_date,ls.solved_date) as day,0::bigint as correct_count,
            sum(case when lv.user_id is null then ls.points else 0 end) as points
            from daily_calculus.solves ls left join daily_calculus.solve_awards la on la.user_id=ls.user_id and la.problem_id=ls.problem_id
            left join daily_calculus.scoring_voids lv on lv.user_id=ls.user_id and lv.problem_id=ls.problem_id
            where ls.user_id=v_user_id group by coalesce(la.award_date,ls.solved_date)
          union all
          select da.award_date as day,0::bigint as correct_count,sum(da.points) as points
            from daily_calculus.daily_awards da where da.user_id=v_user_id group by da.award_date
        ) events group by events.day
      ) a),'[]'::jsonb),
      'solvedIds',coalesce(pg_catalog.jsonb_agg(s.problem_id order by s.solved_at desc),'[]'::jsonb),
      'levelCounts',pg_catalog.jsonb_build_object('basic',count(*) filter(where s.level='basic'),
        'applied',count(*) filter(where s.level='applied'),'advanced',count(*) filter(where s.level='advanced'))
    ) into v_result from daily_calculus.solves s
      left join daily_calculus.solve_awards sa on sa.user_id=s.user_id and sa.problem_id=s.problem_id
      left join daily_calculus.scoring_voids sv on sv.user_id=s.user_id and sv.problem_id=s.problem_id
      where s.user_id=v_user_id;
    return v_result;

  when 'rankings' then
    v_user_id := (p_payload->>'userId')::integer;
    v_period := p_payload->>'period';
    v_week := (p_payload->>'weekStart')::date;
    if v_period is null or v_period not in ('all', 'week') then
      raise exception 'Invalid ranking period' using errcode = '22023';
    end if;
    with credits as(
      select s.user_id,coalesce(sa.award_date,s.solved_date) as award_date,
        case when sv.user_id is null then s.points else 0 end as points
        from daily_calculus.solves s
        left join daily_calculus.solve_awards sa on sa.user_id=s.user_id and sa.problem_id=s.problem_id
        left join daily_calculus.scoring_voids sv on sv.user_id=s.user_id and sv.problem_id=s.problem_id
      union all
      select da.user_id,da.award_date,da.points from daily_calculus.daily_awards da
    ),totals as (
      select u.id,u.username,coalesce(sum(c.points),0) as points
        from daily_calculus.users u left join credits c on c.user_id=u.id and (v_period='all' or c.award_date>=v_week)
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
