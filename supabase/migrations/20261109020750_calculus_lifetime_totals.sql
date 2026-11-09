-- Additive source ledger. Account deletion removes personal data and solves,
-- while this opaque ID/total tombstone preserves already-earned KGS currency.
-- No existing dc_store operation or stored 1/3/5 point unit is changed.
begin;
lock table daily_calculus.users, daily_calculus.solves in share row exclusive mode;

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

-- Narrow server-only RPC. Uses the existing application store key hash and no
-- client/auth identity or user-editable claim. Every requested ID gets a result.
create or replace function public.dc_lifetime_totals(p_key text, p_user_ids jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $dc_lifetime_totals$
declare v_expected text; v_result jsonb;
begin
  select s.store_key_sha256 into v_expected
  from daily_calculus.settings s where s.singleton=true;
  if p_key is null or p_key !~ '^[0-9a-f]{64}$' or v_expected is null or
    pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_key,'UTF8')),'hex') <> v_expected then
    raise exception 'Unauthorized lifetime source access' using errcode='42501';
  end if;
  if p_user_ids is null or pg_catalog.jsonb_typeof(p_user_ids)<>'array' then
    raise exception 'Invalid lifetime source IDs' using errcode='22023';
  end if;
  if pg_catalog.jsonb_array_length(p_user_ids) not between 1 and 100 or exists (
    select 1 from pg_catalog.jsonb_array_elements(p_user_ids) e(value)
    where pg_catalog.jsonb_typeof(e.value)<>'number' or e.value::text !~ '^[1-9][0-9]{0,9}$'
      or (e.value::text)::numeric > 2147483647
  ) then raise exception 'Invalid lifetime source IDs' using errcode='22023'; end if;
  if (select count(distinct e.value) from pg_catalog.jsonb_array_elements(p_user_ids) e(value))
    <> pg_catalog.jsonb_array_length(p_user_ids) then
    raise exception 'Duplicate lifetime source IDs' using errcode='22023';
  end if;
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'userId',(e.value::text)::integer,
    'totalPoints',coalesce(t.total_points,0),
    'known',t.user_id is not null,
    'deleted',coalesce(t.deleted,true)
  ) order by e.position),'[]'::jsonb) into v_result
  from pg_catalog.jsonb_array_elements(p_user_ids) with ordinality e(value,position)
  left join daily_calculus.lifetime_totals t on t.user_id=(e.value::text)::integer;
  return v_result;
end;
$dc_lifetime_totals$;
revoke all on function public.dc_lifetime_totals(text,jsonb) from public, anon, authenticated;
grant execute on function public.dc_lifetime_totals(text,jsonb) to anon;
commit;
