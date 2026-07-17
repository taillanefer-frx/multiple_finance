do $$
declare
  expected_tables constant text[] := array[
    'profiles',
    'groups',
    'group_members',
    'group_invites',
    'monthly_periods',
    'expenses',
    'expense_participants',
    'recurring_rules',
    'installments',
    'receipts',
    'balance_accounts',
    'balance_movements',
    'app_notifications'
  ];
  table_name text;
  realtime_table text;
begin
  foreach table_name in array expected_tables loop
    if not exists (
      select 1
      from pg_catalog.pg_class as class
      join pg_catalog.pg_namespace as namespace on namespace.oid = class.relnamespace
      where namespace.nspname = 'public'
        and class.relname = table_name
        and class.relrowsecurity = true
    ) then
      raise exception 'RLS is not enabled on public.%', table_name;
    end if;

    if not exists (
      select 1
      from pg_catalog.pg_policies
      where schemaname = 'public'
        and tablename = table_name
    ) then
      raise exception 'No RLS policy exists on public.%', table_name;
    end if;
  end loop;

  if not exists (
    select 1 from storage.buckets
    where id = 'receipts' and public = false
  ) then
    raise exception 'The receipts bucket is missing or public';
  end if;

  if (
    select count(*)
    from pg_catalog.pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname like 'receipts_storage_%'
  ) <> 4 then
    raise exception 'The receipts bucket must have SELECT, INSERT, UPDATE and DELETE policies';
  end if;

  foreach realtime_table in array array[
    'groups',
    'group_members',
    'monthly_periods',
    'expenses',
    'expense_participants',
    'balance_accounts',
    'balance_movements',
    'app_notifications'
  ] loop
    if not exists (
      select 1
      from pg_catalog.pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = realtime_table
    ) then
      raise exception 'public.% is missing from the supabase_realtime publication', realtime_table;
    end if;
  end loop;

  if pg_catalog.has_function_privilege('anon', 'public.accept_group_invite(uuid)', 'EXECUTE') then
    raise exception 'anon must not execute accept_group_invite';
  end if;

  if pg_catalog.has_function_privilege('anon', 'public.get_group_invite_preview(uuid)', 'EXECUTE') then
    raise exception 'anon must not execute get_group_invite_preview';
  end if;

  if pg_catalog.has_function_privilege(
    'anon',
    'public.create_group_with_period(text, public.group_type, smallint, smallint)',
    'EXECUTE'
  ) then
    raise exception 'anon must not execute create_group_with_period';
  end if;
end;
$$;
