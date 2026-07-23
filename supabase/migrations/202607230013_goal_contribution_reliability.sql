-- Restore the personal goal contribution RPC without changing migration 012.
-- The operation is private, idempotent and refreshes the PostgREST schema cache.

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
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_goal public.financial_goals%rowtype;
  v_contribution_id uuid;
  v_saved_before numeric(14,2);
  v_saved_after numeric(14,2);
  v_inserted boolean := false;
  v_just_completed boolean := false;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if p_goal_id is null then
    raise exception using errcode = '22023', message = 'Goal id is required';
  end if;
  if p_amount is null or round(p_amount, 2) <= 0 then
    raise exception using errcode = '22023', message = 'Contribution amount must be positive';
  end if;
  if p_source is null then
    raise exception using errcode = '22023', message = 'Contribution source is required';
  end if;
  if p_request_id is null then
    raise exception using errcode = '22023', message = 'Request id is required';
  end if;
  if p_source = 'monthly' and (
    p_competence_month is null
    or p_competence_month <> date_trunc('month', p_competence_month)::date
  ) then
    raise exception using errcode = '22023', message = 'Monthly contribution requires the first day of its month';
  end if;
  if p_source = 'extra' and p_competence_month is not null then
    raise exception using errcode = '22023', message = 'Extra contribution cannot have a competence month';
  end if;

  select *
  into v_goal
  from public.financial_goals
  where id = p_goal_id
    and user_id = v_actor
  for update;

  if not found then
    raise exception using errcode = '42501', message = 'Goal not found or access denied';
  end if;

  select coalesce(sum(amount), 0)
  into v_saved_before
  from public.goal_contributions
  where goal_id = v_goal.id;

  insert into public.goal_contributions (
    goal_id,
    user_id,
    amount,
    source,
    competence_month,
    contributed_on,
    request_id
  )
  values (
    v_goal.id,
    v_actor,
    round(p_amount, 2),
    p_source,
    p_competence_month,
    coalesce(p_contributed_on, current_date),
    p_request_id
  )
  on conflict do nothing
  returning id into v_contribution_id;

  v_inserted := v_contribution_id is not null;

  if not v_inserted then
    select id
    into v_contribution_id
    from public.goal_contributions
    where goal_id = v_goal.id
      and (
        request_id = p_request_id
        or (
          p_source = 'monthly'
          and source = 'monthly'
          and competence_month = p_competence_month
        )
      )
    order by created_at
    limit 1;
  end if;

  if v_contribution_id is null then
    raise exception using errcode = '23505', message = 'Contribution conflict could not be resolved';
  end if;

  select coalesce(sum(amount), 0)
  into v_saved_after
  from public.goal_contributions
  where goal_id = v_goal.id;

  v_just_completed :=
    v_saved_before < v_goal.target_amount
    and v_saved_after >= v_goal.target_amount
    and v_goal.completion_notified_at is null;

  update public.financial_goals
  set
    status = (
      case
        when v_saved_after >= target_amount then 'completed'
        else 'active'
      end
    )::public.goal_status,
    completed_at = case
      when v_saved_after >= target_amount then coalesce(completed_at, now())
      else null
    end,
    completion_notified_at = case
      when v_just_completed then now()
      else completion_notified_at
    end
  where id = v_goal.id;

  return jsonb_build_object(
    'contribution_id', v_contribution_id,
    'saved_amount', v_saved_after,
    'just_completed', v_just_completed,
    'replayed', not v_inserted
  );
end;
$$;

revoke all on function public.record_goal_contribution(
  uuid,
  numeric,
  public.goal_contribution_source,
  date,
  date,
  uuid
) from public, anon;

grant execute on function public.record_goal_contribution(
  uuid,
  numeric,
  public.goal_contribution_source,
  date,
  date,
  uuid
) to authenticated;

notify pgrst, 'reload schema';

