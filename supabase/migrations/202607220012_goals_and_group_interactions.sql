begin;

-- Enrich notifications without changing their recipient-only visibility.
alter table public.app_notifications
  add column if not exists actor_user_id uuid references public.profiles (id) on delete set null;

update public.app_notifications as notification
set actor_user_id = coalesce(
  (select expense.created_by from public.expenses as expense where expense.id = notification.related_expense_id),
  (select installment.paid_by_user_id from public.installments as installment where installment.id = notification.related_installment_id),
  (select target_group.owner_id from public.groups as target_group where target_group.id = notification.group_id)
)
where notification.actor_user_id is null;

-- Migration 011 allowed one row per emoji. Keep only the latest reaction and
-- enforce the product rule: one current reaction per member and event.
with ranked as (
  select id, row_number() over (partition by event_id, user_id order by created_at desc, id desc) as position
  from public.notification_reactions
)
delete from public.notification_reactions as reaction
using ranked
where reaction.id = ranked.id and ranked.position > 1;

alter table public.notification_reactions
  drop constraint if exists notification_reactions_event_user_emoji_key;

alter table public.notification_reactions
  add constraint notification_reactions_event_user_key unique (event_id, user_id);

-- A transaction reaction is attached to the financial record itself, so it is
-- available in both the group dashboard and any related notification.
create table public.group_transaction_reactions (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  target_kind text not null check (target_kind in ('expense', 'installment')),
  target_id uuid not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  emoji text not null check (emoji in ('👍', '❤️', '🎉', '👀', '🙌')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint group_transaction_reactions_target_user_key unique (target_kind, target_id, user_id)
);

create index group_transaction_reactions_group_target_idx
  on public.group_transaction_reactions (group_id, target_kind, target_id);

create trigger group_transaction_reactions_set_updated_at
before update on public.group_transaction_reactions
for each row execute function private.set_updated_at();

alter table public.group_transaction_reactions enable row level security;
revoke all on table public.group_transaction_reactions from public, anon, authenticated;
grant select on table public.group_transaction_reactions to authenticated;

create policy "group_transaction_reactions_select_members"
on public.group_transaction_reactions for select to authenticated
using ((select private.is_group_member(group_id)));

create or replace function public.set_group_transaction_reaction(
  p_target_kind text,
  p_target_id uuid,
  p_emoji text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_group_id uuid;
  v_reaction_id uuid;
begin
  if v_actor is null then raise exception 'Authentication required'; end if;
  if p_target_kind not in ('expense', 'installment') then raise exception 'Invalid reaction target'; end if;
  if p_target_id is null then raise exception 'Reaction target is required'; end if;
  if p_emoji is not null and p_emoji not in ('👍', '❤️', '🎉', '👀', '🙌') then
    raise exception 'Invalid reaction';
  end if;

  if p_target_kind = 'expense' then
    select expense.group_id into v_group_id
    from public.expenses as expense where expense.id = p_target_id;
  else
    select installment.group_id into v_group_id
    from public.installments as installment where installment.id = p_target_id;
  end if;

  if v_group_id is null then raise exception 'Financial record not found'; end if;
  if not private.is_group_member(v_group_id) then raise exception 'Active group membership required'; end if;

  if p_emoji is null then
    delete from public.group_transaction_reactions
    where target_kind = p_target_kind and target_id = p_target_id and user_id = v_actor;
    return null;
  end if;

  insert into public.group_transaction_reactions (group_id, target_kind, target_id, user_id, emoji)
  values (v_group_id, p_target_kind, p_target_id, v_actor, p_emoji)
  on conflict (target_kind, target_id, user_id)
  do update set emoji = excluded.emoji, group_id = excluded.group_id, updated_at = now()
  returning id into v_reaction_id;

  return v_reaction_id;
end;
$$;

revoke all on function public.set_group_transaction_reaction(text, uuid, text) from public, anon;
grant execute on function public.set_group_transaction_reaction(text, uuid, text) to authenticated;

-- Real payment history for installments. Financial amounts are not changed by
-- these rows; they only record which installments were paid.
create table public.installment_payments (
  id uuid primary key default gen_random_uuid(),
  installment_id uuid not null references public.installments (id) on delete cascade,
  group_id uuid not null references public.groups (id) on delete cascade,
  installment_number integer not null check (installment_number > 0),
  paid_by uuid not null references public.profiles (id) on delete restrict,
  paid_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint installment_payments_number_key unique (installment_id, installment_number)
);

create table public.installment_milestones (
  id uuid primary key default gen_random_uuid(),
  installment_id uuid not null references public.installments (id) on delete cascade,
  group_id uuid not null references public.groups (id) on delete cascade,
  milestone text not null check (milestone in ('one_remaining', 'completed')),
  triggered_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint installment_milestones_once_key unique (installment_id, milestone)
);

alter table public.installment_payments enable row level security;
alter table public.installment_milestones enable row level security;
revoke all on table public.installment_payments from public, anon, authenticated;
revoke all on table public.installment_milestones from public, anon, authenticated;
grant select on table public.installment_payments to authenticated;
grant select on table public.installment_milestones to authenticated;

create policy "installment_payments_select_members"
on public.installment_payments for select to authenticated
using ((select private.is_group_member(group_id)));

create policy "installment_milestones_select_members"
on public.installment_milestones for select to authenticated
using ((select private.is_group_member(group_id)));

create or replace function private.register_installment_payment(
  p_installment_id uuid,
  p_installment_number integer,
  p_actor uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_installment record;
  v_inserted uuid;
  v_paid_count integer;
  v_remaining integer;
  v_milestone text;
  v_milestone_inserted uuid;
begin
  select id, group_id, total_installments
  into v_installment
  from public.installments
  where id = p_installment_id
  for update;

  if not found then raise exception 'Installment not found'; end if;
  if p_installment_number < 1 or p_installment_number > v_installment.total_installments then
    raise exception 'Invalid installment number';
  end if;

  insert into public.installment_payments (installment_id, group_id, installment_number, paid_by)
  values (v_installment.id, v_installment.group_id, p_installment_number, p_actor)
  on conflict (installment_id, installment_number) do nothing
  returning id into v_inserted;

  select count(*)::integer into v_paid_count
  from public.installment_payments where installment_id = v_installment.id;
  v_remaining := greatest(v_installment.total_installments - v_paid_count, 0);

  update public.installments
  set
    current_installment = least(v_installment.total_installments, greatest(current_installment, p_installment_number + 1)),
    active = v_remaining > 0
  where id = v_installment.id;

  if v_inserted is not null and v_remaining = 1 then v_milestone := 'one_remaining'; end if;
  if v_inserted is not null and v_remaining = 0 then v_milestone := 'completed'; end if;

  if v_milestone is not null then
    insert into public.installment_milestones (installment_id, group_id, milestone, triggered_by)
    values (v_installment.id, v_installment.group_id, v_milestone, p_actor)
    on conflict (installment_id, milestone) do nothing
    returning id into v_milestone_inserted;
    if v_milestone_inserted is null then v_milestone := null; end if;
  end if;

  return jsonb_build_object(
    'installment_id', v_installment.id,
    'installment_number', p_installment_number,
    'paid_count', v_paid_count,
    'remaining_count', v_remaining,
    'milestone', v_milestone,
    'replayed', v_inserted is null
  );
end;
$$;

revoke all on function private.register_installment_payment(uuid, integer, uuid)
  from public, anon, authenticated;

create or replace function public.mark_installment_paid(p_installment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_installment record;
  v_next_number integer;
  v_due_date date;
  v_period_status public.monthly_period_status;
begin
  if v_actor is null then raise exception 'Authentication required'; end if;

  select installment.group_id, installment.paid_by_user_id, target_group.type, target_group.archived_at,
         installment.total_installments, installment.first_due_date
  into v_installment
  from public.installments as installment
  join public.groups as target_group on target_group.id = installment.group_id
  where installment.id = p_installment_id
  for update of installment;

  if not found then raise exception 'Installment not found'; end if;
  if not private.is_group_member(v_installment.group_id) then raise exception 'Active group membership required'; end if;
  if v_installment.archived_at is not null then raise exception 'Archived groups cannot be changed'; end if;
  if v_installment.type = 'balance_control'
    and v_installment.paid_by_user_id <> v_actor
    and not private.is_group_admin(v_installment.group_id) then
    raise exception 'Only admins can change another member installment';
  end if;

  select series.installment_number into v_next_number
  from generate_series(1, v_installment.total_installments) as series(installment_number)
  where not exists (
    select 1 from public.installment_payments as payment
    where payment.installment_id = p_installment_id
      and payment.installment_number = series.installment_number
  )
  order by series.installment_number
  limit 1;

  if v_next_number is null then
    return jsonb_build_object(
      'installment_id', p_installment_id,
      'paid_count', v_installment.total_installments,
      'remaining_count', 0,
      'milestone', null,
      'replayed', true
    );
  end if;

  v_due_date := (v_installment.first_due_date + make_interval(months => v_next_number - 1))::date;
  select period.status into v_period_status
  from public.monthly_periods as period
  where period.group_id = v_installment.group_id
    and period.month = extract(month from v_due_date)::smallint
    and period.year = extract(year from v_due_date)::smallint;
  if v_period_status = 'closed' then raise exception 'Closed periods cannot be changed'; end if;

  return private.register_installment_payment(p_installment_id, v_next_number, v_actor);
end;
$$;

revoke all on function public.mark_installment_paid(uuid) from public, anon;
grant execute on function public.mark_installment_paid(uuid) to authenticated;

create or replace function public.mark_group_expense_paid_v2(p_expense_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_expense record;
  v_installment_number integer;
  v_payment jsonb;
begin
  if v_actor is null then raise exception 'Authentication required'; end if;

  select expense.installment_id, period.month, period.year, installment.first_due_date,
         installment.total_installments
  into v_expense
  from public.expenses as expense
  join public.monthly_periods as period on period.id = expense.monthly_period_id
  left join public.installments as installment on installment.id = expense.installment_id
  where expense.id = p_expense_id;

  if not found then raise exception 'Expense not found'; end if;
  perform public.mark_group_expense_paid(p_expense_id);

  if v_expense.installment_id is null then
    return jsonb_build_object('expense_id', p_expense_id, 'milestone', null);
  end if;

  v_installment_number := 1 +
    ((v_expense.year - extract(year from v_expense.first_due_date)::integer) * 12) +
    (v_expense.month - extract(month from v_expense.first_due_date)::integer);
  v_installment_number := greatest(1, least(v_expense.total_installments, v_installment_number));
  v_payment := private.register_installment_payment(v_expense.installment_id, v_installment_number, v_actor);

  return v_payment || jsonb_build_object('expense_id', p_expense_id);
end;
$$;

revoke all on function public.mark_group_expense_paid_v2(uuid) from public, anon;
grant execute on function public.mark_group_expense_paid_v2(uuid) to authenticated;

-- Personal goals and append-only histories.
create type public.goal_priority as enum ('high', 'medium', 'low');
create type public.goal_status as enum ('active', 'completed');
create type public.goal_contribution_source as enum ('monthly', 'extra');

create table public.financial_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  target_amount numeric(14,2) not null check (target_amount > 0),
  priority public.goal_priority not null,
  start_date date not null,
  desired_date date not null,
  monthly_amount numeric(14,2) not null check (monthly_amount > 0),
  status public.goal_status not null default 'active',
  completed_at timestamptz,
  completion_notified_at timestamptz,
  request_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint financial_goals_dates_check check (desired_date >= start_date),
  constraint financial_goals_user_request_key unique (user_id, request_id)
);

create table public.goal_contributions (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.financial_goals (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  amount numeric(14,2) not null check (amount > 0),
  source public.goal_contribution_source not null,
  competence_month date,
  contributed_on date not null default current_date,
  request_id uuid not null,
  created_at timestamptz not null default now(),
  constraint goal_contributions_month_start_check check (
    competence_month is null or competence_month = date_trunc('month', competence_month)::date
  ),
  constraint goal_contributions_monthly_month_check check (
    (source = 'monthly' and competence_month is not null) or
    (source = 'extra' and competence_month is null)
  ),
  constraint goal_contributions_goal_request_key unique (goal_id, request_id)
);

create unique index goal_contributions_one_monthly_idx
  on public.goal_contributions (goal_id, competence_month)
  where source = 'monthly';

create table public.goal_monthly_amount_history (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.financial_goals (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  previous_amount numeric(14,2) not null check (previous_amount > 0),
  new_amount numeric(14,2) not null check (new_amount > 0),
  changed_at timestamptz not null default now()
);

create index financial_goals_user_priority_idx
  on public.financial_goals (user_id, priority, desired_date);
create index goal_contributions_goal_date_idx
  on public.goal_contributions (goal_id, contributed_on desc);
create index goal_monthly_amount_history_goal_date_idx
  on public.goal_monthly_amount_history (goal_id, changed_at desc);

create trigger financial_goals_set_updated_at
before update on public.financial_goals
for each row execute function private.set_updated_at();

alter table public.financial_goals enable row level security;
alter table public.goal_contributions enable row level security;
alter table public.goal_monthly_amount_history enable row level security;

revoke all on table public.financial_goals from public, anon, authenticated;
revoke all on table public.goal_contributions from public, anon, authenticated;
revoke all on table public.goal_monthly_amount_history from public, anon, authenticated;
grant select on table public.financial_goals to authenticated;
grant select on table public.goal_contributions to authenticated;
grant select on table public.goal_monthly_amount_history to authenticated;

create policy "financial_goals_select_own"
on public.financial_goals for select to authenticated
using (user_id = (select auth.uid()));

create policy "goal_contributions_select_own"
on public.goal_contributions for select to authenticated
using (user_id = (select auth.uid()));

create policy "goal_monthly_amount_history_select_own"
on public.goal_monthly_amount_history for select to authenticated
using (user_id = (select auth.uid()));

create or replace function public.create_financial_goal(
  p_name text,
  p_target_amount numeric,
  p_priority public.goal_priority,
  p_start_date date,
  p_desired_date date,
  p_monthly_amount numeric,
  p_request_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_goal_id uuid;
begin
  if v_actor is null then raise exception 'Authentication required'; end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 1 and 120 then raise exception 'Goal name is required'; end if;
  if p_target_amount is null or p_target_amount <= 0 then raise exception 'Target amount must be positive'; end if;
  if p_priority is null then raise exception 'Priority is required'; end if;
  if p_start_date is null or p_desired_date is null or p_desired_date < p_start_date then raise exception 'Invalid goal dates'; end if;
  if p_monthly_amount is null or p_monthly_amount <= 0 then raise exception 'Monthly amount must be positive'; end if;
  if p_request_id is null then raise exception 'Request id is required'; end if;

  insert into public.financial_goals (
    user_id, name, target_amount, priority, start_date, desired_date, monthly_amount, request_id
  ) values (
    v_actor, btrim(p_name), round(p_target_amount, 2), p_priority,
    p_start_date, p_desired_date, round(p_monthly_amount, 2), p_request_id
  )
  on conflict (user_id, request_id) do nothing
  returning id into v_goal_id;

  if v_goal_id is null then
    select id into v_goal_id from public.financial_goals
    where user_id = v_actor and request_id = p_request_id;
  end if;
  return v_goal_id;
end;
$$;

create or replace function public.update_financial_goal(
  p_goal_id uuid,
  p_name text,
  p_target_amount numeric,
  p_priority public.goal_priority,
  p_start_date date,
  p_desired_date date,
  p_monthly_amount numeric
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_goal public.financial_goals%rowtype;
  v_saved numeric(14,2);
  v_just_completed boolean := false;
begin
  if v_actor is null then raise exception 'Authentication required'; end if;
  select * into v_goal from public.financial_goals
  where id = p_goal_id and user_id = v_actor for update;
  if not found then raise exception 'Goal not found'; end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 1 and 120 then raise exception 'Goal name is required'; end if;
  if p_target_amount is null or p_target_amount <= 0 then raise exception 'Target amount must be positive'; end if;
  if p_priority is null then raise exception 'Priority is required'; end if;
  if p_start_date is null or p_desired_date is null or p_desired_date < p_start_date then raise exception 'Invalid goal dates'; end if;
  if p_monthly_amount is null or p_monthly_amount <= 0 then raise exception 'Monthly amount must be positive'; end if;

  if v_goal.monthly_amount <> round(p_monthly_amount, 2) then
    insert into public.goal_monthly_amount_history (goal_id, user_id, previous_amount, new_amount)
    values (v_goal.id, v_actor, v_goal.monthly_amount, round(p_monthly_amount, 2));
  end if;

  select coalesce(sum(amount), 0) into v_saved
  from public.goal_contributions where goal_id = v_goal.id;

  v_just_completed := v_goal.status = 'active'
    and v_saved >= round(p_target_amount, 2)
    and v_goal.completion_notified_at is null;

  update public.financial_goals
  set name = btrim(p_name), target_amount = round(p_target_amount, 2), priority = p_priority,
      start_date = p_start_date, desired_date = p_desired_date,
      monthly_amount = round(p_monthly_amount, 2),
      status = case when v_saved >= round(p_target_amount, 2) then 'completed' else 'active' end,
      completed_at = case
        when v_saved >= round(p_target_amount, 2) then coalesce(completed_at, now())
        else null
      end,
      completion_notified_at = case
        when v_saved < round(p_target_amount, 2) then null
        when v_just_completed then now()
        else completion_notified_at
      end
  where id = v_goal.id;

  return jsonb_build_object('goal_id', v_goal.id, 'just_completed', v_just_completed);
end;
$$;

create or replace function public.record_goal_contribution(
  p_goal_id uuid,
  p_amount numeric,
  p_source public.goal_contribution_source,
  p_competence_month date,
  p_contributed_on date,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_goal public.financial_goals%rowtype;
  v_contribution_id uuid;
  v_saved_before numeric(14,2);
  v_saved_after numeric(14,2);
  v_just_completed boolean := false;
begin
  if v_actor is null then raise exception 'Authentication required'; end if;
  select * into v_goal from public.financial_goals
  where id = p_goal_id and user_id = v_actor for update;
  if not found then raise exception 'Goal not found'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Contribution amount must be positive'; end if;
  if p_request_id is null then raise exception 'Request id is required'; end if;
  if p_source = 'monthly' and (
    p_competence_month is null or p_competence_month <> date_trunc('month', p_competence_month)::date
  ) then raise exception 'Monthly contribution requires a month'; end if;
  if p_source = 'extra' and p_competence_month is not null then raise exception 'Extra contribution cannot have a month'; end if;

  select coalesce(sum(amount), 0) into v_saved_before
  from public.goal_contributions where goal_id = v_goal.id;

  insert into public.goal_contributions (
    goal_id, user_id, amount, source, competence_month, contributed_on, request_id
  ) values (
    v_goal.id, v_actor, round(p_amount, 2), p_source, p_competence_month,
    coalesce(p_contributed_on, current_date), p_request_id
  )
  on conflict do nothing
  returning id into v_contribution_id;

  if v_contribution_id is null then
    select id into v_contribution_id from public.goal_contributions
    where goal_id = v_goal.id
      and (
        request_id = p_request_id
        or (p_source = 'monthly' and source = 'monthly' and competence_month = p_competence_month)
      )
    order by created_at
    limit 1;
  end if;

  select coalesce(sum(amount), 0) into v_saved_after
  from public.goal_contributions where goal_id = v_goal.id;

  if v_saved_before < v_goal.target_amount and v_saved_after >= v_goal.target_amount
     and v_goal.completion_notified_at is null then
    v_just_completed := true;
  end if;

  update public.financial_goals
  set status = case when v_saved_after >= target_amount then 'completed' else 'active' end,
      completed_at = case when v_saved_after >= target_amount then coalesce(completed_at, now()) else null end,
      completion_notified_at = case when v_just_completed then now() else completion_notified_at end
  where id = v_goal.id;

  return jsonb_build_object(
    'contribution_id', v_contribution_id,
    'saved_amount', v_saved_after,
    'just_completed', v_just_completed,
    'replayed', v_saved_after = v_saved_before
  );
end;
$$;

revoke all on function public.create_financial_goal(text, numeric, public.goal_priority, date, date, numeric, uuid)
  from public, anon;
grant execute on function public.create_financial_goal(text, numeric, public.goal_priority, date, date, numeric, uuid)
  to authenticated;
revoke all on function public.update_financial_goal(uuid, text, numeric, public.goal_priority, date, date, numeric)
  from public, anon;
grant execute on function public.update_financial_goal(uuid, text, numeric, public.goal_priority, date, date, numeric)
  to authenticated;
revoke all on function public.record_goal_contribution(uuid, numeric, public.goal_contribution_source, date, date, uuid)
  from public, anon;
grant execute on function public.record_goal_contribution(uuid, numeric, public.goal_contribution_source, date, date, uuid)
  to authenticated;

-- Preserve the optional nature of notifications while attaching the actor.
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
declare
  v_event_id uuid := gen_random_uuid();
  v_actor uuid := auth.uid();
  v_amount numeric(14,2);
  v_expense_id uuid;
  v_installment_id uuid;
begin
  begin
    if p_type = 'expense_added' then
      select expense.id, expense.amount into v_expense_id, v_amount
      from public.expenses as expense
      where expense.group_id = p_group_id and expense.title = btrim(p_message)
      order by expense.created_at desc, expense.id desc limit 1;
    elsif p_type = 'installment_added' then
      select installment.id, installment.total_amount into v_installment_id, v_amount
      from public.installments as installment
      where installment.group_id = p_group_id and installment.title = btrim(p_message)
      order by installment.created_at desc, installment.id desc limit 1;
    end if;

    insert into public.app_notifications (
      group_id, user_id, event_id, actor_user_id, title, message, type, amount,
      related_expense_id, related_installment_id
    )
    select p_group_id, member.user_id, v_event_id, v_actor, btrim(p_title), btrim(p_message),
           btrim(p_type), v_amount, v_expense_id, v_installment_id
    from public.group_members as member
    where member.group_id = p_group_id and member.status = 'active';
    return true;
  exception when others then
    raise warning 'Optional group notification failed for group %: %', p_group_id, sqlerrm;
    return false;
  end;
end;
$$;

revoke all on function private.try_create_group_notifications(uuid, text, text, text)
  from public, anon, authenticated;

do $$
declare
  v_table text;
begin
  if exists (select 1 from pg_catalog.pg_publication where pubname = 'supabase_realtime') then
    foreach v_table in array array[
      'group_transaction_reactions', 'installment_payments', 'financial_goals',
      'goal_contributions', 'goal_monthly_amount_history'
    ] loop
      if not exists (
        select 1 from pg_catalog.pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = v_table
      ) then
        execute format('alter publication supabase_realtime add table public.%I', v_table);
      end if;
    end loop;
  end if;
end
$$;

commit;
