begin;

alter table public.installments
  add column if not exists idempotency_key uuid;

create unique index if not exists installments_group_idempotency_key_uidx
  on public.installments (group_id, idempotency_key)
  where idempotency_key is not null;

with ranked_movements as (
  select
    id,
    row_number() over (
      partition by related_expense_id
      order by created_at, id
    ) as position
  from public.balance_movements
  where related_expense_id is not null
)
delete from public.balance_movements as movement
using ranked_movements as ranked
where movement.id = ranked.id
  and ranked.position > 1;

create unique index if not exists balance_movements_related_expense_uidx
  on public.balance_movements (related_expense_id)
  where related_expense_id is not null;

alter table public.balance_movements
  drop constraint if exists balance_movements_expense_group_fk;

alter table public.balance_movements
  add constraint balance_movements_expense_group_fk
  foreign key (related_expense_id, group_id)
  references public.expenses (id, group_id)
  on delete cascade;

create or replace function private.try_create_group_notifications(
  p_group_id uuid,
  p_title text,
  p_message text,
  p_type text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    insert into public.app_notifications (group_id, user_id, title, message, type)
    select
      p_group_id,
      member.user_id,
      btrim(p_title),
      btrim(p_message),
      btrim(p_type)
    from public.group_members as member
    where member.group_id = p_group_id
      and member.status = 'active';

    return true;
  exception when others then
    raise warning 'Optional group notification failed for group %: %', p_group_id, sqlerrm;
    return false;
  end;
end;
$$;

revoke all on function private.try_create_group_notifications(uuid, text, text, text)
  from public, anon, authenticated;

create or replace function private.sync_balance_movement_for_expense(p_expense_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expense record;
begin
  select
    expense.id,
    expense.group_id,
    expense.monthly_period_id,
    expense.title,
    expense.amount,
    expense.purchase_date,
    expense.paid_by_user_id,
    expense.status,
    expense.notes,
    group_record.type as group_type
  into v_expense
  from public.expenses as expense
  join public.groups as group_record on group_record.id = expense.group_id
  where expense.id = p_expense_id;

  if not found or v_expense.group_type <> 'balance_control' then
    return;
  end if;

  if v_expense.status in ('review', 'cancelled') then
    delete from public.balance_movements
    where related_expense_id = v_expense.id;
    return;
  end if;

  if v_expense.paid_by_user_id is null then
    delete from public.balance_movements
    where related_expense_id = v_expense.id;
    raise warning 'Balance expense % has no responsible member and was not applied to a balance', v_expense.id;
    return;
  end if;

  insert into public.balance_movements (
    group_id,
    monthly_period_id,
    user_id,
    type,
    amount,
    description,
    related_expense_id,
    movement_date,
    notes
  ) values (
    v_expense.group_id,
    v_expense.monthly_period_id,
    v_expense.paid_by_user_id,
    'expense',
    v_expense.amount,
    v_expense.title,
    v_expense.id,
    v_expense.purchase_date,
    v_expense.notes
  )
  on conflict (related_expense_id) where related_expense_id is not null
  do update set
    group_id = excluded.group_id,
    monthly_period_id = excluded.monthly_period_id,
    user_id = excluded.user_id,
    type = 'expense',
    amount = excluded.amount,
    description = excluded.description,
    movement_date = excluded.movement_date,
    notes = excluded.notes;
end;
$$;

revoke all on function private.sync_balance_movement_for_expense(uuid)
  from public, anon, authenticated;

create or replace function private.guard_expense_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_group_id uuid;
  v_period_id uuid;
  v_group_type public.group_type;
  v_archived_at timestamptz;
  v_period_status public.monthly_period_status;
begin
  if tg_op = 'DELETE' then
    v_group_id := old.group_id;
    v_period_id := old.monthly_period_id;
  else
    v_group_id := new.group_id;
    v_period_id := new.monthly_period_id;
  end if;

  if tg_op = 'UPDATE'
    and (new.group_id <> old.group_id or new.monthly_period_id <> old.monthly_period_id) then
    raise exception 'Expense group and reference period cannot be changed';
  end if;

  select type, archived_at
  into v_group_type, v_archived_at
  from public.groups
  where id = v_group_id;

  if v_group_type is null or v_archived_at is not null then
    raise exception 'An active group is required';
  end if;

  select status into v_period_status
  from public.monthly_periods
  where id = v_period_id
    and group_id = v_group_id;

  if v_period_status is null then
    raise exception 'Expense period was not found';
  end if;

  if v_period_status = 'closed' then
    raise exception 'Closed periods cannot be changed';
  end if;

  if tg_op = 'DELETE'
    and v_group_type = 'balance_control'
    and v_actor is not null
    and old.paid_by_user_id is distinct from v_actor
    and not private.is_group_admin(v_group_id) then
    raise exception 'Only admins can delete an expense from another member balance';
  end if;

  if tg_op <> 'DELETE' and v_group_type = 'balance_control' then
    if new.paid_by_user_id is null then
      raise exception 'A balance expense requires a responsible member';
    end if;

    if not private.is_group_user_active(v_group_id, new.paid_by_user_id) then
      raise exception 'Responsible member must be active';
    end if;

    if v_actor is not null
      and new.paid_by_user_id <> v_actor
      and not private.is_group_admin(v_group_id) then
      raise exception 'Only admins can change another member balance';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function private.guard_expense_write()
  from public, anon, authenticated;

create or replace function private.handle_expense_balance_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.sync_balance_movement_for_expense(new.id);
  return new;
end;
$$;

revoke all on function private.handle_expense_balance_sync()
  from public, anon, authenticated;

drop trigger if exists expenses_guard_financial_consistency on public.expenses;
create trigger expenses_guard_financial_consistency
before insert or update or delete on public.expenses
for each row execute function private.guard_expense_write();

drop trigger if exists expenses_sync_balance_after_insert on public.expenses;
create trigger expenses_sync_balance_after_insert
after insert on public.expenses
for each row execute function private.handle_expense_balance_sync();

drop trigger if exists expenses_sync_balance_after_update on public.expenses;
create trigger expenses_sync_balance_after_update
after update of title, amount, purchase_date, paid_by_user_id, status, monthly_period_id, notes
on public.expenses
for each row execute function private.handle_expense_balance_sync();

do $$
declare
  v_expense_id uuid;
begin
  for v_expense_id in
    select expense.id
    from public.expenses as expense
    join public.groups as group_record on group_record.id = expense.group_id
    where group_record.type = 'balance_control'
  loop
    perform private.sync_balance_movement_for_expense(v_expense_id);
  end loop;
end;
$$;

create or replace function public.update_group_expense(
  p_expense_id uuid,
  p_title text,
  p_amount numeric,
  p_category text,
  p_type public.expense_type,
  p_purchase_date date,
  p_due_date date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_expense record;
begin
  if v_actor is null then raise exception 'Authentication required'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Amount must be positive'; end if;
  if char_length(btrim(coalesce(p_title, ''))) not between 1 and 180 then raise exception 'Title is required'; end if;
  if char_length(btrim(coalesce(p_category, ''))) not between 1 and 80 then raise exception 'Category is required'; end if;
  if p_purchase_date is null then raise exception 'Purchase date is required'; end if;

  select
    expense.id,
    expense.group_id,
    expense.monthly_period_id,
    expense.amount,
    expense.status,
    expense.paid_by_user_id,
    group_record.type as group_type,
    group_record.archived_at,
    period.status as period_status
  into v_expense
  from public.expenses as expense
  join public.groups as group_record on group_record.id = expense.group_id
  join public.monthly_periods as period on period.id = expense.monthly_period_id
  where expense.id = p_expense_id
  for update of expense;

  if not found then raise exception 'Expense not found'; end if;
  if not private.is_group_member(v_expense.group_id) then raise exception 'Active group membership required'; end if;
  if v_expense.archived_at is not null then raise exception 'Archived groups cannot be changed'; end if;
  if v_expense.period_status = 'closed' then raise exception 'Closed periods cannot be changed'; end if;
  if v_expense.status = 'cancelled' then raise exception 'Cancelled expenses cannot be edited'; end if;

  if v_expense.group_type = 'balance_control'
    and v_expense.paid_by_user_id <> v_actor
    and not private.is_group_admin(v_expense.group_id) then
    raise exception 'Only admins can change another member balance';
  end if;

  if v_expense.group_type = 'house_split'
    and p_amount <> v_expense.amount
    and exists (
      select 1 from public.expense_participants
      where expense_id = p_expense_id and included
    ) then
    raise exception 'Participant shares must be recalculated before changing the total';
  end if;

  update public.expenses
  set
    title = btrim(p_title),
    amount = p_amount,
    category = btrim(p_category),
    type = p_type,
    purchase_date = p_purchase_date,
    due_date = p_due_date
  where id = p_expense_id;

  return p_expense_id;
end;
$$;

create or replace function public.approve_group_expense(p_expense_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_expense record;
begin
  if v_actor is null then raise exception 'Authentication required'; end if;

  select
    expense.group_id,
    expense.status,
    expense.paid_by_user_id,
    group_record.type as group_type,
    group_record.archived_at,
    period.status as period_status
  into v_expense
  from public.expenses as expense
  join public.groups as group_record on group_record.id = expense.group_id
  join public.monthly_periods as period on period.id = expense.monthly_period_id
  where expense.id = p_expense_id
  for update of expense;

  if not found then raise exception 'Expense not found'; end if;
  if not private.is_group_member(v_expense.group_id) then raise exception 'Active group membership required'; end if;
  if v_expense.archived_at is not null then raise exception 'Archived groups cannot be changed'; end if;
  if v_expense.period_status = 'closed' then raise exception 'Closed periods cannot be changed'; end if;
  if v_expense.status = 'cancelled' then raise exception 'Cancelled expenses cannot be approved'; end if;
  if v_expense.group_type = 'balance_control'
    and v_expense.paid_by_user_id <> v_actor
    and not private.is_group_admin(v_expense.group_id) then
    raise exception 'Only admins can change another member balance';
  end if;

  update public.expenses
  set status = case when status = 'review' then 'open' else status end
  where id = p_expense_id;

  return p_expense_id;
end;
$$;

create or replace function public.mark_group_expense_paid(p_expense_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_expense record;
begin
  if v_actor is null then raise exception 'Authentication required'; end if;

  select
    expense.group_id,
    expense.status,
    expense.paid_by_user_id,
    group_record.type as group_type,
    group_record.archived_at,
    period.status as period_status
  into v_expense
  from public.expenses as expense
  join public.groups as group_record on group_record.id = expense.group_id
  join public.monthly_periods as period on period.id = expense.monthly_period_id
  where expense.id = p_expense_id
  for update of expense;

  if not found then raise exception 'Expense not found'; end if;
  if not private.is_group_member(v_expense.group_id) then raise exception 'Active group membership required'; end if;
  if v_expense.archived_at is not null then raise exception 'Archived groups cannot be changed'; end if;
  if v_expense.period_status = 'closed' then raise exception 'Closed periods cannot be changed'; end if;
  if v_expense.status = 'cancelled' then raise exception 'Cancelled expenses cannot be marked as paid'; end if;
  if v_expense.group_type = 'balance_control'
    and v_expense.paid_by_user_id <> v_actor
    and not private.is_group_admin(v_expense.group_id) then
    raise exception 'Only admins can change another member balance';
  end if;

  update public.expenses set status = 'paid' where id = p_expense_id;
  return p_expense_id;
end;
$$;

create or replace function public.cancel_group_expense(p_expense_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_expense record;
begin
  if v_actor is null then raise exception 'Authentication required'; end if;

  select
    expense.group_id,
    expense.paid_by_user_id,
    group_record.type as group_type,
    group_record.archived_at,
    period.status as period_status
  into v_expense
  from public.expenses as expense
  join public.groups as group_record on group_record.id = expense.group_id
  join public.monthly_periods as period on period.id = expense.monthly_period_id
  where expense.id = p_expense_id
  for update of expense;

  if not found then raise exception 'Expense not found'; end if;
  if not private.is_group_member(v_expense.group_id) then raise exception 'Active group membership required'; end if;
  if v_expense.archived_at is not null then raise exception 'Archived groups cannot be changed'; end if;
  if v_expense.period_status = 'closed' then raise exception 'Closed periods cannot be changed'; end if;
  if v_expense.group_type = 'balance_control'
    and v_expense.paid_by_user_id <> v_actor
    and not private.is_group_admin(v_expense.group_id) then
    raise exception 'Only admins can change another member balance';
  end if;

  update public.expenses set status = 'cancelled' where id = p_expense_id;
  return p_expense_id;
end;
$$;

create or replace function public.add_group_expense(
  p_group_id uuid,
  p_month smallint,
  p_year smallint,
  p_title text,
  p_amount numeric,
  p_category text,
  p_expense_type public.expense_type,
  p_purchase_date date,
  p_due_date date,
  p_responsible_user_id uuid,
  p_status public.expense_status,
  p_notify_group boolean,
  p_notes text,
  p_participant_ids uuid[],
  p_repeat_monthly boolean default false,
  p_notify_before_due boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_group_type public.group_type;
  v_period_id uuid;
  v_period_status public.monthly_period_status;
  v_expense_id uuid;
  v_recurring_id uuid;
  v_participants uuid[];
  v_count integer;
  v_total_cents bigint;
  v_base_cents bigint;
  v_remainder bigint;
begin
  if v_actor is null then raise exception 'Authentication required'; end if;
  if not private.is_group_member(p_group_id) then raise exception 'Active group membership required'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Amount must be positive'; end if;
  if char_length(btrim(coalesce(p_title, ''))) not between 1 and 180 then raise exception 'Title is required'; end if;
  if char_length(btrim(coalesce(p_category, ''))) not between 1 and 80 then raise exception 'Category is required'; end if;
  if p_purchase_date is null then raise exception 'Purchase date is required'; end if;
  if p_status not in ('open', 'paid', 'review') then raise exception 'Invalid initial status'; end if;
  if p_expense_type = 'installment' then raise exception 'Use add_group_installment for installments'; end if;
  if p_notes is not null and char_length(p_notes) > 4000 then raise exception 'Notes are too long'; end if;

  select type into v_group_type from public.groups where id = p_group_id and archived_at is null;
  if v_group_type is null then raise exception 'Group not found'; end if;
  if not private.is_group_user_active(p_group_id, p_responsible_user_id) then raise exception 'Responsible member must be active'; end if;
  if v_group_type = 'balance_control' and p_responsible_user_id <> v_actor and not private.is_group_admin(p_group_id) then
    raise exception 'Only admins can use another member balance';
  end if;

  select coalesce(array_agg(distinct participant_id), '{}'::uuid[])
  into v_participants
  from unnest(coalesce(p_participant_ids, '{}'::uuid[])) as selected(participant_id);
  v_count := cardinality(v_participants);

  if v_group_type = 'house_split' and v_count = 0 then raise exception 'At least one participant is required'; end if;
  if exists (
    select 1 from unnest(v_participants) as selected(participant_id)
    where not private.is_group_user_active(p_group_id, participant_id)
  ) then raise exception 'Every participant must be an active member'; end if;

  insert into public.monthly_periods (group_id, month, year)
  values (p_group_id, p_month, p_year)
  on conflict (group_id, month, year) do nothing;
  select id, status into v_period_id, v_period_status
  from public.monthly_periods where group_id = p_group_id and month = p_month and year = p_year;
  if v_period_status = 'closed' then raise exception 'Closed periods cannot be changed'; end if;

  if p_expense_type = 'fixed' and exists (
    select 1 from public.expenses
    where group_id = p_group_id and monthly_period_id = v_period_id
      and type = 'fixed' and lower(btrim(title)) = lower(btrim(p_title)) and status <> 'cancelled'
  ) then raise exception 'This fixed expense already exists in the selected month'; end if;

  if p_expense_type = 'fixed' and p_repeat_monthly then
    select id into v_recurring_id from public.recurring_rules
    where group_id = p_group_id and active and lower(btrim(title)) = lower(btrim(p_title))
      and due_day = extract(day from coalesce(p_due_date, p_purchase_date))::smallint
    limit 1;
    if v_recurring_id is null then
      insert into public.recurring_rules (
        group_id, title, amount, category, due_day, paid_by_user_id, active, notify_before_due
      ) values (
        p_group_id, btrim(p_title), p_amount, btrim(p_category),
        extract(day from coalesce(p_due_date, p_purchase_date))::smallint,
        p_responsible_user_id, true, p_notify_before_due
      ) returning id into v_recurring_id;
    end if;
  end if;

  insert into public.expenses (
    group_id, monthly_period_id, title, amount, category, type, purchase_date, due_date,
    paid_by_user_id, created_by, status, notify_group, notes, recurring_rule_id
  ) values (
    p_group_id, v_period_id, btrim(p_title), p_amount, btrim(p_category), p_expense_type,
    p_purchase_date, p_due_date, p_responsible_user_id, v_actor, p_status,
    coalesce(p_notify_group, false), nullif(btrim(p_notes), ''), v_recurring_id
  ) returning id into v_expense_id;

  if v_count > 0 then
    v_total_cents := round(p_amount * 100)::bigint;
    v_base_cents := v_total_cents / v_count;
    v_remainder := v_total_cents % v_count;
    insert into public.expense_participants (expense_id, user_id, share_amount, share_percent, included)
    select
      v_expense_id,
      participant_id,
      (v_base_cents + case when ordinality <= v_remainder then 1 else 0 end)::numeric / 100,
      round(100::numeric / v_count, 4),
      true
    from unnest(v_participants) with ordinality as selected(participant_id, ordinality);
  end if;

  if coalesce(p_notify_group, false) then
    perform private.try_create_group_notifications(
      p_group_id,
      'Nova despesa',
      btrim(p_title),
      'expense_added'
    );
  end if;

  return v_expense_id;
end;
$$;

drop function if exists public.add_group_installment(
  uuid, smallint, smallint, text, numeric, integer, date, text,
  uuid, boolean, uuid[], text, boolean, boolean
);

create function public.add_group_installment(
  p_group_id uuid,
  p_month smallint,
  p_year smallint,
  p_title text,
  p_total_amount numeric,
  p_total_installments integer,
  p_first_due_date date,
  p_card_label text,
  p_responsible_user_id uuid,
  p_shared boolean,
  p_participant_ids uuid[],
  p_notes text,
  p_notify_group boolean,
  p_notify_before_due boolean,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_group_type public.group_type;
  v_period_id uuid;
  v_period_status public.monthly_period_status;
  v_installment_id uuid;
  v_expense_id uuid;
  v_installment_amount numeric(14,2);
  v_participants uuid[];
  v_count integer;
  v_total_cents bigint;
  v_base_cents bigint;
  v_remainder bigint;
begin
  if v_actor is null then raise exception 'Authentication required'; end if;
  if not private.is_group_member(p_group_id) then raise exception 'Active group membership required'; end if;
  if p_idempotency_key is null then raise exception 'Idempotency key is required'; end if;
  if p_total_amount is null or p_total_amount <= 0 then raise exception 'Total amount must be positive'; end if;
  if p_total_installments is null or p_total_installments <= 0 or p_total_installments > 600 then raise exception 'Invalid installment count'; end if;
  if p_first_due_date is null then raise exception 'First due date is required'; end if;
  if char_length(btrim(coalesce(p_title, ''))) not between 1 and 180 then raise exception 'Title is required'; end if;
  if p_card_label is not null and char_length(btrim(p_card_label)) > 80 then raise exception 'Card label is too long'; end if;
  if p_notes is not null and char_length(p_notes) > 2000 then raise exception 'Notes are too long'; end if;

  select type into v_group_type from public.groups where id = p_group_id and archived_at is null;
  if v_group_type is null then raise exception 'Group not found'; end if;
  if not private.is_group_user_active(p_group_id, p_responsible_user_id) then raise exception 'Responsible member must be active'; end if;
  if v_group_type = 'balance_control' and p_responsible_user_id <> v_actor and not private.is_group_admin(p_group_id) then
    raise exception 'Only admins can use another member balance';
  end if;

  select installment.id
  into v_installment_id
  from public.installments as installment
  where installment.group_id = p_group_id
    and installment.idempotency_key = p_idempotency_key;

  if found then
    select expense.id into v_expense_id
    from public.expenses as expense
    where expense.installment_id = v_installment_id
    order by expense.created_at
    limit 1;
    return jsonb_build_object('installment_id', v_installment_id, 'expense_id', v_expense_id, 'replayed', true);
  end if;

  select coalesce(array_agg(distinct participant_id), '{}'::uuid[])
  into v_participants
  from unnest(coalesce(p_participant_ids, '{}'::uuid[])) as selected(participant_id);
  v_count := cardinality(v_participants);
  if (v_group_type = 'house_split' or coalesce(p_shared, false)) and v_count = 0 then
    raise exception 'At least one participant is required for a shared installment';
  end if;
  if exists (
    select 1 from unnest(v_participants) as selected(participant_id)
    where not private.is_group_user_active(p_group_id, participant_id)
  ) then raise exception 'Every participant must be an active member'; end if;

  insert into public.monthly_periods (group_id, month, year)
  values (p_group_id, p_month, p_year)
  on conflict (group_id, month, year) do nothing;
  select id, status into v_period_id, v_period_status
  from public.monthly_periods where group_id = p_group_id and month = p_month and year = p_year;
  if v_period_status = 'closed' then raise exception 'Closed periods cannot be changed'; end if;

  v_installment_amount := round(p_total_amount / p_total_installments, 2);
  insert into public.installments (
    group_id, title, total_amount, installment_amount, total_installments, current_installment,
    due_day, card_label, paid_by_user_id, shared, active, first_due_date, notes,
    notify_before_due, idempotency_key
  ) values (
    p_group_id, btrim(p_title), p_total_amount, v_installment_amount, p_total_installments, 1,
    extract(day from p_first_due_date)::smallint, nullif(btrim(p_card_label), ''),
    p_responsible_user_id, case when v_group_type = 'house_split' then true else coalesce(p_shared, false) end,
    true, p_first_due_date, nullif(btrim(p_notes), ''), coalesce(p_notify_before_due, false), p_idempotency_key
  )
  on conflict (group_id, idempotency_key) where idempotency_key is not null
  do nothing
  returning id into v_installment_id;

  if v_installment_id is null then
    select installment.id into v_installment_id
    from public.installments as installment
    where installment.group_id = p_group_id
      and installment.idempotency_key = p_idempotency_key;

    select expense.id into v_expense_id
    from public.expenses as expense
    where expense.installment_id = v_installment_id
    order by expense.created_at
    limit 1;

    return jsonb_build_object('installment_id', v_installment_id, 'expense_id', v_expense_id, 'replayed', true);
  end if;

  if extract(month from p_first_due_date)::smallint = p_month
    and extract(year from p_first_due_date)::smallint = p_year then
    insert into public.expenses (
      group_id, monthly_period_id, title, amount, category, type, purchase_date, due_date,
      paid_by_user_id, created_by, status, notify_group, notes, installment_id
    ) values (
      p_group_id, v_period_id, btrim(p_title), v_installment_amount, 'Cartão', 'installment',
      least(current_date, p_first_due_date), p_first_due_date, p_responsible_user_id, v_actor,
      'open', coalesce(p_notify_group, false), nullif(btrim(p_notes), ''), v_installment_id
    ) returning id into v_expense_id;

    if v_count > 0 then
      v_total_cents := round(v_installment_amount * 100)::bigint;
      v_base_cents := v_total_cents / v_count;
      v_remainder := v_total_cents % v_count;
      insert into public.expense_participants (expense_id, user_id, share_amount, share_percent, included)
      select
        v_expense_id,
        participant_id,
        (v_base_cents + case when ordinality <= v_remainder then 1 else 0 end)::numeric / 100,
        round(100::numeric / v_count, 4),
        true
      from unnest(v_participants) with ordinality as selected(participant_id, ordinality);
    end if;
  end if;

  if coalesce(p_notify_group, false) then
    perform private.try_create_group_notifications(
      p_group_id,
      'Novo parcelamento',
      btrim(p_title),
      'installment_added'
    );
  end if;

  return jsonb_build_object('installment_id', v_installment_id, 'expense_id', v_expense_id, 'replayed', false);
end;
$$;

revoke all on function public.update_group_expense(uuid, text, numeric, text, public.expense_type, date, date)
  from public, anon;
grant execute on function public.update_group_expense(uuid, text, numeric, text, public.expense_type, date, date)
  to authenticated;

revoke all on function public.approve_group_expense(uuid) from public, anon;
grant execute on function public.approve_group_expense(uuid) to authenticated;

revoke all on function public.mark_group_expense_paid(uuid) from public, anon;
grant execute on function public.mark_group_expense_paid(uuid) to authenticated;

revoke all on function public.cancel_group_expense(uuid) from public, anon;
grant execute on function public.cancel_group_expense(uuid) to authenticated;

revoke all on function public.add_group_expense(
  uuid, smallint, smallint, text, numeric, text, public.expense_type, date, date,
  uuid, public.expense_status, boolean, text, uuid[], boolean, boolean
) from public, anon;
grant execute on function public.add_group_expense(
  uuid, smallint, smallint, text, numeric, text, public.expense_type, date, date,
  uuid, public.expense_status, boolean, text, uuid[], boolean, boolean
) to authenticated;

revoke all on function public.add_group_installment(
  uuid, smallint, smallint, text, numeric, integer, date, text,
  uuid, boolean, uuid[], text, boolean, boolean, uuid
) from public, anon;
grant execute on function public.add_group_installment(
  uuid, smallint, smallint, text, numeric, integer, date, text,
  uuid, boolean, uuid[], text, boolean, boolean, uuid
) to authenticated;

commit;
