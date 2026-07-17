begin;

alter table public.balance_accounts
  add column if not exists notes text;

alter table public.balance_accounts
  drop constraint if exists balance_accounts_notes_check;

alter table public.balance_accounts
  add constraint balance_accounts_notes_check
  check (notes is null or char_length(notes) <= 1000);

drop policy if exists "balance_accounts_insert_members" on public.balance_accounts;
drop policy if exists "balance_accounts_update_members" on public.balance_accounts;

create policy "balance_accounts_insert_self"
on public.balance_accounts for insert to authenticated
with check (
  user_id = (select auth.uid())
  and (select private.is_group_member(group_id))
);

create policy "balance_accounts_update_self"
on public.balance_accounts for update to authenticated
using (
  user_id = (select auth.uid())
  and (select private.is_group_member(group_id))
)
with check (
  user_id = (select auth.uid())
  and (select private.is_group_member(group_id))
);

drop policy if exists "balance_movements_insert_members" on public.balance_movements;
drop policy if exists "balance_movements_update_members" on public.balance_movements;
drop policy if exists "balance_movements_delete_members" on public.balance_movements;

create policy "balance_movements_insert_self"
on public.balance_movements for insert to authenticated
with check (
  user_id = (select auth.uid())
  and (select private.is_group_member(group_id))
);

create policy "balance_movements_update_self"
on public.balance_movements for update to authenticated
using (
  user_id = (select auth.uid())
  and (select private.is_group_member(group_id))
)
with check (
  user_id = (select auth.uid())
  and (select private.is_group_member(group_id))
);

create policy "balance_movements_delete_self"
on public.balance_movements for delete to authenticated
using (
  user_id = (select auth.uid())
  and (select private.is_group_member(group_id))
);

create or replace function private.refresh_balance_account(
  p_group_id uuid,
  p_user_id uuid,
  p_period_id uuid
)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.balance_accounts as account
  set
    current_balance = account.starting_balance + coalesce((
      select sum(
        case movement.type
          when 'income' then movement.amount
          else -movement.amount
        end
      )
      from public.balance_movements as movement
      where movement.group_id = p_group_id
        and movement.user_id = p_user_id
        and movement.monthly_period_id = p_period_id
    ), 0),
    updated_at = now()
  where account.group_id = p_group_id
    and account.user_id = p_user_id
    and account.monthly_period_id = p_period_id;
$$;

revoke all on function private.refresh_balance_account(uuid, uuid, uuid) from public, anon, authenticated;

create or replace function private.handle_balance_movement_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform private.refresh_balance_account(old.group_id, old.user_id, old.monthly_period_id);
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    perform private.refresh_balance_account(new.group_id, new.user_id, new.monthly_period_id);
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists balance_movements_refresh_account on public.balance_movements;
create trigger balance_movements_refresh_account
after insert or update or delete on public.balance_movements
for each row execute function private.handle_balance_movement_change();

create or replace function public.set_my_starting_balance(
  p_group_id uuid,
  p_month smallint,
  p_year smallint,
  p_starting_balance numeric,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_period_id uuid;
  v_period_status public.monthly_period_status;
  v_account_id uuid;
  v_current_balance numeric(14,2);
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_month not between 1 and 12 or p_year not between 2000 and 2200 then
    raise exception 'Invalid reference period';
  end if;

  if p_starting_balance is null or p_starting_balance < 0 then
    raise exception 'Starting balance cannot be negative';
  end if;

  if p_notes is not null and char_length(p_notes) > 1000 then
    raise exception 'Notes are too long';
  end if;

  if not private.is_group_member(p_group_id) then
    raise exception 'Active group membership required';
  end if;

  if not exists (
    select 1 from public.groups
    where id = p_group_id
      and type = 'balance_control'
      and archived_at is null
  ) then
    raise exception 'A balance_control group is required';
  end if;

  insert into public.monthly_periods (group_id, month, year)
  values (p_group_id, p_month, p_year)
  on conflict (group_id, month, year) do nothing;

  select id, status into v_period_id, v_period_status
  from public.monthly_periods
  where group_id = p_group_id
    and month = p_month
    and year = p_year;

  if v_period_status = 'closed' then
    raise exception 'Closed periods cannot be changed';
  end if;

  select p_starting_balance + coalesce(sum(
    case type when 'income' then amount else -amount end
  ), 0)
  into v_current_balance
  from public.balance_movements
  where group_id = p_group_id
    and user_id = v_user_id
    and monthly_period_id = v_period_id;

  insert into public.balance_accounts (
    group_id,
    user_id,
    monthly_period_id,
    starting_balance,
    current_balance,
    notes
  ) values (
    p_group_id,
    v_user_id,
    v_period_id,
    p_starting_balance,
    v_current_balance,
    nullif(btrim(p_notes), '')
  )
  on conflict (group_id, user_id, monthly_period_id)
  do update set
    starting_balance = excluded.starting_balance,
    current_balance = excluded.current_balance,
    notes = excluded.notes,
    updated_at = now()
  returning id into v_account_id;

  return v_account_id;
end;
$$;

revoke all on function public.set_my_starting_balance(uuid, smallint, smallint, numeric, text) from public, anon;
grant execute on function public.set_my_starting_balance(uuid, smallint, smallint, numeric, text) to authenticated;

do $$
begin
  if exists (
    select 1 from pg_catalog.pg_publication
    where pubname = 'supabase_realtime'
  ) and not exists (
    select 1 from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'installments'
  ) then
    execute 'alter publication supabase_realtime add table public.installments';
  end if;
end;
$$;

commit;
