begin;

create or replace function public.create_group_with_period(
  p_name text,
  p_type public.group_type,
  p_month smallint,
  p_year smallint
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_group_id uuid;
begin
  if v_user_id is null then
    raise exception using
      errcode = '28000',
      message = 'Authentication required';
  end if;

  if p_name is null
    or pg_catalog.char_length(pg_catalog.btrim(p_name)) not between 1 and 120 then
    raise exception using
      errcode = '22023',
      message = 'Group name must contain between 1 and 120 characters';
  end if;

  if p_type is null then
    raise exception using
      errcode = '22023',
      message = 'Invalid group type';
  end if;

  if p_month is null
    or p_year is null
    or p_month not between 1 and 12
    or p_year not between 2000 and 2200 then
    raise exception using
      errcode = '22023',
      message = 'Invalid monthly period';
  end if;

  insert into public.groups (name, type, owner_id)
  values (pg_catalog.btrim(p_name), p_type, v_user_id)
  returning id into v_group_id;

  -- The existing on_group_created trigger creates this membership first.
  -- This upsert also keeps the RPC correct if that trigger is not present.
  insert into public.group_members as existing_member (group_id, user_id, role, status, joined_at)
  values (v_group_id, v_user_id, 'admin', 'active', pg_catalog.now())
  on conflict (group_id, user_id) do update
  set role = excluded.role,
      status = excluded.status,
      joined_at = coalesce(existing_member.joined_at, excluded.joined_at);

  insert into public.monthly_periods (group_id, month, year, status)
  values (v_group_id, p_month, p_year, 'open');

  return v_group_id;
end;
$$;

revoke all on function public.create_group_with_period(text, public.group_type, smallint, smallint)
from public, anon;

grant execute on function public.create_group_with_period(text, public.group_type, smallint, smallint)
to authenticated;

comment on function public.create_group_with_period(text, public.group_type, smallint, smallint)
is 'Atomically creates a private group, its authenticated owner membership, and the initial monthly period.';

commit;
