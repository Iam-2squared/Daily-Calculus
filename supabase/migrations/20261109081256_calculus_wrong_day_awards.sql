-- A wrong canonical question answer blocks only that question's awards for
-- that Japanese calendar day. Existing gate/pause zero receipts stay permanent.
-- Learning receipts remain unchanged; positive upgrade income is monotonic.
begin;
do $preflight$
begin
  if md5(pg_get_functiondef('public.dc_store(text,text,jsonb)'::regprocedure))
      is distinct from 'b3b0dbb5928e2189fa56f271cabdea9b' then
    raise exception 'Daily store definition changed; review wrong-day migration';
  end if;
end;
$preflight$;
-- Preserve the existing global control value while draining in-flight answers.
select 1 from daily_calculus.scoring_control where singleton=true for update;
lock table daily_calculus.users,daily_calculus.solves in share row exclusive mode;
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

create or replace function daily_calculus.track_lifetime_totals()
returns trigger language plpgsql security definer set search_path = ''
as $lifetime_trigger$
begin
  if tg_table_name='users' and tg_op='INSERT' then
    insert into daily_calculus.lifetime_totals(user_id) values(new.id);
    return new;
  elsif tg_table_name='users' and tg_op='DELETE' then
    update daily_calculus.lifetime_totals set deleted=true where user_id=old.id;
    return old;
  elsif tg_table_name='solves' and tg_op='INSERT' then
    update daily_calculus.lifetime_totals set total_points=total_points+new.points
      where user_id=new.user_id and not deleted;
    if not found then raise exception 'Missing lifetime source'; end if;
    return new;
  elsif tg_table_name='solves' and tg_op='UPDATE' then
    if old.points<>0 or new.points<>(case old.level when 'basic' then 1 when 'applied' then 3 when 'advanced' then 5 else -1 end)
       or (new.user_id,new.problem_id,new.level,new.solved_at,new.solved_date)
          is distinct from (old.user_id,old.problem_id,old.level,old.solved_at,old.solved_date)
       or not exists(select 1 from daily_calculus.solve_awards a where a.user_id=old.user_id and a.problem_id=old.problem_id and a.pending)
       or exists(select 1 from daily_calculus.scoring_voids v where v.user_id=old.user_id and v.problem_id=old.problem_id) then
      raise exception 'Only pending zero-point awards may increase lifetime income' using errcode='23514';
    end if;
    update daily_calculus.lifetime_totals set total_points=total_points+new.points-old.points
      where user_id=new.user_id and not deleted;
    if not found then raise exception 'Missing lifetime source'; end if;
    return new;
  end if;
  raise exception 'Invalid lifetime source operation';
end;
$lifetime_trigger$;
revoke all on function daily_calculus.track_lifetime_totals() from public,anon,authenticated;
drop trigger if exists dc_lifetime_solve_update on daily_calculus.solves;
create trigger dc_lifetime_solve_update after update of points on daily_calculus.solves
for each row when (old.points is distinct from new.points)
execute function daily_calculus.track_lifetime_totals();

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
  v_pending boolean;
  v_wrong_today boolean;
  v_wrong_day_blocked boolean;
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
    -- Keep the existing pause -> account lock order. Wrong/correct races and
    -- pending upgrades serialize per account across all Function instances.
    select c.paused,c.frozen_at into v_paused,v_frozen_at
      from daily_calculus.scoring_control c where c.singleton=true for share;
    if not found then v_paused:=false; v_frozen_at:=null; end if;
    perform 1 from daily_calculus.users u where u.id=v_user_id for update;
    if not found then raise exception 'Unknown solve account' using errcode='23503'; end if;
    insert into daily_calculus.scoring_state(user_id) values(v_user_id) on conflict(user_id) do nothing;
    select st.mistakes,st.correct_streak into v_mistakes,v_correct_streak
      from daily_calculus.scoring_state st where st.user_id=v_user_id for update;
    select * into v_solve from daily_calculus.solves s where s.user_id=v_user_id and s.problem_id=v_problem_id;
    v_exists := found;
    if v_exists and v_solve.level<>v_level then
      raise exception 'Solve difficulty changed' using errcode='22023';
    end if;
    select sa.pending into v_pending from daily_calculus.solve_awards sa
      where sa.user_id=v_user_id and sa.problem_id=v_problem_id;
    v_pending := coalesce(v_pending,false);
    select exists(select 1 from daily_calculus.wrong_attempts w
      where w.user_id=v_user_id and w.problem_id=v_problem_id and w.wrong_date=v_answer_date) into v_wrong_today;
    v_awarded_points:=0; v_award_blocked:=false; v_award_paused:=false; v_wrong_day_blocked:=v_wrong_today;
    if not (p_payload->>'correct')::boolean then
      if not v_exists or (v_solve.points=0 and v_pending) then
        insert into daily_calculus.wrong_attempts(user_id,problem_id,wrong_date)
          values(v_user_id,v_problem_id,v_answer_date) on conflict do nothing;
        v_wrong_today:=true; v_wrong_day_blocked:=true;
      end if;
      if not v_exists then
        v_mistakes:=least(2,v_mistakes+1);
        v_correct_streak:=0;
        update daily_calculus.scoring_state set mistakes=v_mistakes,correct_streak=v_correct_streak where user_id=v_user_id;
      end if;
    elsif not v_exists then
      v_award_blocked := v_mistakes=2 and v_correct_streak<2;
      v_award_paused := v_paused;
      v_wrong_day_blocked := v_wrong_today;
      v_pending := v_wrong_today and not v_paused;
      v_awarded_points := case when v_paused or v_award_blocked or v_wrong_today then 0 else v_points end;
      insert into daily_calculus.solves(user_id,problem_id,level,points,solved_at,solved_date)
        values(v_user_id,v_problem_id,v_level,v_awarded_points,v_answered_at,v_answer_date);
      insert into daily_calculus.solve_awards(user_id,problem_id,pending,award_date,awarded_at)
        values(v_user_id,v_problem_id,v_pending,
          case when v_awarded_points>0 then v_answer_date else null end,
          case when v_awarded_points>0 then v_answered_at else null end);
      if v_mistakes=2 and v_correct_streak<2 then
        v_correct_streak:=v_correct_streak+1;
      elsif v_mistakes=2 then
        v_mistakes:=0; v_correct_streak:=0;
      end if;
      update daily_calculus.scoring_state set mistakes=v_mistakes,correct_streak=v_correct_streak where user_id=v_user_id;
    elsif v_solve.points=0 and v_pending then
      if v_solve.level<>v_level then raise exception 'Pending solve difficulty changed' using errcode='22023'; end if;
      v_wrong_day_blocked:=v_wrong_today;
      v_award_paused:=v_paused;
      v_award_blocked:=v_mistakes=2;
      if v_answer_date>v_solve.solved_date and not v_wrong_today and not v_paused and v_mistakes<2
         and not exists(select 1 from daily_calculus.scoring_voids sv where sv.user_id=v_user_id and sv.problem_id=v_problem_id) then
        -- The lifetime UPDATE trigger checks the still-pending metadata. Both
        -- this financial delta and the metadata clear commit atomically.
        update daily_calculus.solves set points=v_points
          where user_id=v_user_id and problem_id=v_problem_id and points=0;
        get diagnostics v_changed=row_count;
        if v_changed<>1 then raise exception 'Pending award changed concurrently' using errcode='40001'; end if;
        update daily_calculus.solve_awards set pending=false,award_date=v_answer_date,awarded_at=v_answered_at
          where user_id=v_user_id and problem_id=v_problem_id and pending;
        get diagnostics v_changed=row_count;
        if v_changed<>1 then raise exception 'Pending award metadata changed concurrently' using errcode='40001'; end if;
        v_awarded_points:=v_points; v_pending:=false;
      end if;
      -- Repeating a learning receipt never advances the account-wide recovery.
    end if;
    return pg_catalog.jsonb_build_object(
      'pointsEarned',v_awarded_points,'alreadySolved',v_exists,
      'scoring',pg_catalog.jsonb_build_object('mistakes',v_mistakes,'correctStreak',v_correct_streak,'requiredCorrectStreak',3,'locked',v_mistakes=2),
      'awardBlocked',v_award_blocked,'awardPaused',v_award_paused,
      'awardWrongDayBlocked',v_wrong_day_blocked,'awardPending',v_pending,
      'scoringFrozenAt',v_frozen_at
    );

  when 'stats' then
    v_user_id := (p_payload->>'userId')::integer;
    v_week := (p_payload->>'weekStart')::date;
    select c.paused,c.frozen_at into v_paused,v_frozen_at
      from daily_calculus.scoring_control c where c.singleton=true;
    select pg_catalog.jsonb_build_object(
      'totalPoints',coalesce(sum(case when sv.user_id is null then s.points else 0 end),0),
      'weeklyPoints',coalesce(sum(case when sv.user_id is null then s.points else 0 end)
        filter(where coalesce(sa.award_date,s.solved_date)>=v_week),0),
      'solvedCount',count(*),'streak',0,
      'scoringPaused',coalesce(v_paused,false),'scoringFrozenAt',v_frozen_at,
      'scoring',coalesce((select pg_catalog.jsonb_build_object(
        'mistakes',st.mistakes,'correctStreak',st.correct_streak,'requiredCorrectStreak',3,'locked',st.mistakes=2)
        from daily_calculus.scoring_state st where st.user_id=v_user_id),
        '{"mistakes":0,"correctStreak":0,"requiredCorrectStreak":3,"locked":false}'::jsonb),
      'wrongTodayIds',coalesce((select pg_catalog.jsonb_agg(w.problem_id order by w.problem_id)
        from daily_calculus.wrong_attempts w where w.user_id=v_user_id and w.wrong_date=(p_payload->>'today')::date),'[]'::jsonb),
      'pendingAwardIds',coalesce((select pg_catalog.jsonb_agg(pa.problem_id order by pa.problem_id)
        from daily_calculus.solve_awards pa join daily_calculus.solves ps on ps.user_id=pa.user_id and ps.problem_id=pa.problem_id
        where pa.user_id=v_user_id and pa.pending and ps.points=0 and not exists(
          select 1 from daily_calculus.scoring_voids pv where pv.user_id=pa.user_id and pv.problem_id=pa.problem_id)),'[]'::jsonb),
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
          select coalesce(la.award_date,ls.solved_date) as day,0::bigint as correct_count,
            sum(case when lv.user_id is null then ls.points else 0 end) as points
            from daily_calculus.solves ls left join daily_calculus.solve_awards la on la.user_id=ls.user_id and la.problem_id=ls.problem_id
            left join daily_calculus.scoring_voids lv on lv.user_id=ls.user_id and lv.problem_id=ls.problem_id
            where ls.user_id=v_user_id group by coalesce(la.award_date,ls.solved_date)
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
    with totals as (
      select u.id, u.username,
             coalesce(sum(case when sv.user_id is null and (v_period='all' or coalesce(sa.award_date,s.solved_date)>=v_week)
               then s.points else 0 end),0) as points
        from daily_calculus.users as u left join daily_calculus.solves as s on s.user_id=u.id
        left join daily_calculus.solve_awards as sa on sa.user_id=s.user_id and sa.problem_id=s.problem_id
        left join daily_calculus.scoring_voids as sv on sv.user_id=s.user_id and sv.problem_id=s.problem_id
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

notify pgrst,'reload schema';
commit;
