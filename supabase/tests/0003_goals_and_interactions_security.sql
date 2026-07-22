do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'group_transaction_reactions',
    'installment_payments',
    'installment_milestones',
    'financial_goals',
    'goal_contributions',
    'goal_monthly_amount_history'
  ] loop
    if not exists (
      select 1 from pg_catalog.pg_class as class
      join pg_catalog.pg_namespace as namespace on namespace.oid = class.relnamespace
      where namespace.nspname = 'public' and class.relname = table_name and class.relrowsecurity
    ) then raise exception 'RLS is not enabled on public.%', table_name;
    end if;

    if not exists (
      select 1 from pg_catalog.pg_policies
      where schemaname = 'public' and tablename = table_name
    ) then raise exception 'No RLS policy exists on public.%', table_name;
    end if;
  end loop;

  if pg_catalog.has_function_privilege('anon', 'public.set_group_transaction_reaction(text,uuid,text)', 'EXECUTE')
    or pg_catalog.has_function_privilege('anon', 'public.mark_installment_paid(uuid)', 'EXECUTE')
    or pg_catalog.has_function_privilege('anon', 'public.mark_group_expense_paid_v2(uuid)', 'EXECUTE')
    or pg_catalog.has_function_privilege('anon', 'public.create_financial_goal(text,numeric,public.goal_priority,date,date,numeric,uuid)', 'EXECUTE')
    or pg_catalog.has_function_privilege('anon', 'public.update_financial_goal(uuid,text,numeric,public.goal_priority,date,date,numeric)', 'EXECUTE')
    or pg_catalog.has_function_privilege('anon', 'public.record_goal_contribution(uuid,numeric,public.goal_contribution_source,date,date,uuid)', 'EXECUTE')
  then raise exception 'anon must not execute the migration 012 RPCs';
  end if;

  if not pg_catalog.has_function_privilege('authenticated', 'public.set_group_transaction_reaction(text,uuid,text)', 'EXECUTE')
    or not pg_catalog.has_function_privilege('authenticated', 'public.mark_installment_paid(uuid)', 'EXECUTE')
    or not pg_catalog.has_function_privilege('authenticated', 'public.mark_group_expense_paid_v2(uuid)', 'EXECUTE')
    or not pg_catalog.has_function_privilege('authenticated', 'public.create_financial_goal(text,numeric,public.goal_priority,date,date,numeric,uuid)', 'EXECUTE')
    or not pg_catalog.has_function_privilege('authenticated', 'public.update_financial_goal(uuid,text,numeric,public.goal_priority,date,date,numeric)', 'EXECUTE')
    or not pg_catalog.has_function_privilege('authenticated', 'public.record_goal_contribution(uuid,numeric,public.goal_contribution_source,date,date,uuid)', 'EXECUTE')
  then raise exception 'authenticated is missing a migration 012 RPC grant';
  end if;

  if pg_catalog.has_table_privilege('authenticated', 'public.financial_goals', 'INSERT')
    or pg_catalog.has_table_privilege('authenticated', 'public.goal_contributions', 'INSERT')
    or pg_catalog.has_table_privilege('authenticated', 'public.group_transaction_reactions', 'INSERT')
  then raise exception 'Sensitive writes must remain restricted to validated RPCs';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.group_transaction_reactions'::regclass
      and conname = 'group_transaction_reactions_target_user_key'
  ) then raise exception 'One reaction per member and transaction is not enforced';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_indexes
    where schemaname = 'public' and tablename = 'goal_contributions'
      and indexname = 'goal_contributions_one_monthly_idx'
  ) then raise exception 'Monthly goal contributions are not protected against duplicates';
  end if;
end;
$$;
