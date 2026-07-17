begin;

create or replace function public.create_group_with_period(
  p_name text,
  p_type public.group_type,
  p_month smallint,
  p_year smallint
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_group_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if char_length(btrim(p_name)) < 1 or char_length(btrim(p_name)) > 120 then
    raise exception 'Group name must contain between 1 and 120 characters';
  end if;

  if p_month not between 1 and 12 or p_year not between 2000 and 2200 then
    raise exception 'Invalid monthly period';
  end if;

  insert into public.groups (name, type, owner_id)
  values (btrim(p_name), p_type, v_user_id)
  returning id into v_group_id;

  insert into public.monthly_periods (group_id, month, year, status)
  values (v_group_id, p_month, p_year, 'open');

  return v_group_id;
end;
$$;

revoke all on function public.create_group_with_period(text, public.group_type, smallint, smallint) from public, anon;
grant execute on function public.create_group_with_period(text, public.group_type, smallint, smallint) to authenticated;

create or replace function public.get_group_invite_preview(p_token uuid)
returns table (
  group_name text,
  group_type public.group_type
)
language sql
stable
security definer
set search_path = ''
as $$
  select target_group.name, target_group.type
  from public.group_invites as invite
  join public.groups as target_group on target_group.id = invite.group_id
  where (select auth.uid()) is not null
    and invite.invite_token = p_token
    and invite.active = true
    and (invite.expires_at is null or invite.expires_at > now())
    and (invite.max_uses is null or invite.used_count < invite.max_uses)
    and target_group.archived_at is null
  limit 1;
$$;

revoke all on function public.get_group_invite_preview(uuid) from public, anon;
grant execute on function public.get_group_invite_preview(uuid) to authenticated;

do $$
declare
  table_name text;
  realtime_tables constant text[] := array[
    'groups',
    'group_members',
    'monthly_periods',
    'expenses',
    'expense_participants',
    'balance_accounts',
    'balance_movements',
    'app_notifications'
  ];
begin
  if not exists (
    select 1 from pg_catalog.pg_publication where pubname = 'supabase_realtime'
  ) then
    execute 'create publication supabase_realtime';
  end if;

  foreach table_name in array realtime_tables loop
    if not exists (
      select 1
      from pg_catalog.pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end;
$$;

commit;
