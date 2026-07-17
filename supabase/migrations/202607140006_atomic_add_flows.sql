begin;

alter table public.balance_movements
  add column if not exists movement_date date not null default current_date,
  add column if not exists notes text;

alter table public.balance_movements
  drop constraint if exists balance_movements_notes_check;

alter table public.balance_movements
  add constraint balance_movements_notes_check
  check (notes is null or char_length(notes) <= 2000);

alter table public.installments
  add column if not exists first_due_date date,
  add column if not exists notes text,
  add column if not exists notify_before_due boolean not null default false;

alter table public.installments
  drop constraint if exists installments_notes_check;

alter table public.installments
  add constraint installments_notes_check
  check (notes is null or char_length(notes) <= 2000);

alter table public.recurring_rules
  add column if not exists notify_before_due boolean not null default false;

create or replace function public.add_balance_income(
  p_group_id uuid,
  p_month smallint,
  p_year smallint,
  p_amount numeric,
  p_user_id uuid,
  p_origin text,
  p_movement_date date,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_period_id uuid;
  v_period_status public.monthly_period_status;
  v_movement_id uuid;
begin
  if v_actor is null then raise exception 'Authentication required'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Amount must be positive'; end if;
  if p_month not between 1 and 12 or p_year not between 2000 and 2200 then raise exception 'Invalid reference period'; end if;
  if p_movement_date is null then raise exception 'Movement date is required'; end if;
  if char_length(btrim(coalesce(p_origin, ''))) not between 1 and 255 then raise exception 'Origin is required'; end if;
  if p_notes is not null and char_length(p_notes) > 2000 then raise exception 'Notes are too long'; end if;

  if not private.is_group_member(p_group_id) then raise exception 'Active group membership required'; end if;
  if not exists (select 1 from public.groups where id = p_group_id and type = 'balance_control' and archived_at is null) then
    raise exception 'A balance_control group is required';
  end if;
  if p_user_id <> v_actor and not private.is_group_admin(p_group_id) then
    raise exception 'Only admins can add an entry for another member';
  end if;
  if not private.is_group_user_active(p_group_id, p_user_id) then raise exception 'Responsible member must be active'; end if;

  insert into public.monthly_periods (group_id, month, year)
  values (p_group_id, p_month, p_year)
  on conflict (group_id, month, year) do nothing;

  select id, status into v_period_id, v_period_status
  from public.monthly_periods
  where group_id = p_group_id and month = p_month and year = p_year;
  if v_period_status = 'closed' then raise exception 'Closed periods cannot be changed'; end if;

  insert into public.balance_movements (
    group_id, monthly_period_id, user_id, type, amount, description, movement_date, notes
  ) values (
    p_group_id, v_period_id, p_user_id, 'income', p_amount, btrim(p_origin), p_movement_date, nullif(btrim(p_notes), '')
  ) returning id into v_movement_id;

  return v_movement_id;
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

  if v_group_type = 'balance_control' and p_status <> 'review' then
    insert into public.balance_movements (
      group_id, monthly_period_id, user_id, type, amount, description,
      related_expense_id, movement_date, notes
    ) values (
      p_group_id, v_period_id, p_responsible_user_id, 'expense', p_amount, btrim(p_title),
      v_expense_id, p_purchase_date, nullif(btrim(p_notes), '')
    );
  end if;

  if coalesce(p_notify_group, false) then
    insert into public.app_notifications (group_id, user_id, title, message, type)
    select p_group_id, member.user_id, 'Nova despesa', btrim(p_title), 'expense_added'
    from public.group_members as member
    where member.group_id = p_group_id and member.status = 'active';
  end if;

  return v_expense_id;
end;
$$;

create or replace function public.add_group_installment(
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
  p_notify_before_due boolean default false
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

  if exists (
    select 1 from public.installments
    where group_id = p_group_id and active and paid_by_user_id = p_responsible_user_id
      and lower(btrim(title)) = lower(btrim(p_title))
  ) then raise exception 'This installment already exists'; end if;

  insert into public.monthly_periods (group_id, month, year)
  values (p_group_id, p_month, p_year)
  on conflict (group_id, month, year) do nothing;
  select id, status into v_period_id, v_period_status
  from public.monthly_periods where group_id = p_group_id and month = p_month and year = p_year;
  if v_period_status = 'closed' then raise exception 'Closed periods cannot be changed'; end if;

  v_installment_amount := round(p_total_amount / p_total_installments, 2);
  insert into public.installments (
    group_id, title, total_amount, installment_amount, total_installments, current_installment,
    due_day, card_label, paid_by_user_id, shared, active, first_due_date, notes, notify_before_due
  ) values (
    p_group_id, btrim(p_title), p_total_amount, v_installment_amount, p_total_installments, 1,
    extract(day from p_first_due_date)::smallint, nullif(btrim(p_card_label), ''),
    p_responsible_user_id, case when v_group_type = 'house_split' then true else coalesce(p_shared, false) end, true, p_first_due_date,
    nullif(btrim(p_notes), ''), coalesce(p_notify_before_due, false)
  ) returning id into v_installment_id;

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

    if v_group_type = 'balance_control' then
      insert into public.balance_movements (
        group_id, monthly_period_id, user_id, type, amount, description,
        related_expense_id, movement_date, notes
      ) values (
        p_group_id, v_period_id, p_responsible_user_id, 'expense', v_installment_amount,
        btrim(p_title), v_expense_id, p_first_due_date, nullif(btrim(p_notes), '')
      );
    end if;
  end if;

  if coalesce(p_notify_group, false) then
    insert into public.app_notifications (group_id, user_id, title, message, type)
    select p_group_id, member.user_id, 'Novo parcelamento', btrim(p_title), 'installment_added'
    from public.group_members as member
    where member.group_id = p_group_id and member.status = 'active';
  end if;

  return jsonb_build_object('installment_id', v_installment_id, 'expense_id', v_expense_id);
end;
$$;

revoke all on function public.add_balance_income(uuid, smallint, smallint, numeric, uuid, text, date, text) from public, anon;
grant execute on function public.add_balance_income(uuid, smallint, smallint, numeric, uuid, text, date, text) to authenticated;

revoke all on function public.add_group_expense(uuid, smallint, smallint, text, numeric, text, public.expense_type, date, date, uuid, public.expense_status, boolean, text, uuid[], boolean, boolean) from public, anon;
grant execute on function public.add_group_expense(uuid, smallint, smallint, text, numeric, text, public.expense_type, date, date, uuid, public.expense_status, boolean, text, uuid[], boolean, boolean) to authenticated;

revoke all on function public.add_group_installment(uuid, smallint, smallint, text, numeric, integer, date, text, uuid, boolean, uuid[], text, boolean, boolean) from public, anon;
grant execute on function public.add_group_installment(uuid, smallint, smallint, text, numeric, integer, date, text, uuid, boolean, uuid[], text, boolean, boolean) to authenticated;

commit;
