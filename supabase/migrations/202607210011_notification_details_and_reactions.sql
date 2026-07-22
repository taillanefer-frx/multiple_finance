begin;

alter table public.app_notifications
  add column event_id uuid,
  add column amount numeric(14,2) check (amount is null or amount >= 0),
  add column related_expense_id uuid references public.expenses (id) on delete set null,
  add column related_installment_id uuid references public.installments (id) on delete set null;

with grouped_notifications as (
  select
    id,
    first_value(id) over (
      partition by group_id, title, message, type, created_at
      order by id
    ) as shared_event_id
  from public.app_notifications
)
update public.app_notifications as notification
set event_id = grouped.shared_event_id
from grouped_notifications as grouped
where grouped.id = notification.id;

update public.app_notifications as notification
set
  (related_expense_id, amount) = (
    select expense.id, expense.amount
    from public.expenses as expense
    where expense.group_id = notification.group_id
      and expense.title = notification.message
      and expense.created_at <= notification.created_at
    order by expense.created_at desc, expense.id desc
    limit 1
  )
where notification.type = 'expense_added';

update public.app_notifications as notification
set
  (related_installment_id, amount) = (
    select installment.id, installment.total_amount
    from public.installments as installment
    where installment.group_id = notification.group_id
      and installment.title = notification.message
      and installment.created_at <= notification.created_at
    order by installment.created_at desc, installment.id desc
    limit 1
  )
where notification.type = 'installment_added';

alter table public.app_notifications
  alter column event_id set default gen_random_uuid(),
  alter column event_id set not null;

alter table public.app_notifications
  add constraint app_notifications_event_recipient_group_key
  unique (event_id, user_id, group_id);

create table public.notification_reactions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null,
  group_id uuid not null,
  user_id uuid not null,
  emoji text not null check (emoji in ('👍', '❤️', '🎉', '👀', '🙌')),
  created_at timestamptz not null default now(),
  constraint notification_reactions_event_user_emoji_key unique (event_id, user_id, emoji),
  constraint notification_reactions_recipient_fk
    foreign key (event_id, user_id, group_id)
    references public.app_notifications (event_id, user_id, group_id)
    on delete cascade
);

create index notification_reactions_event_idx
  on public.notification_reactions (event_id, created_at);

alter table public.notification_reactions enable row level security;

revoke all on table public.notification_reactions from public, anon;
grant select, insert, delete on table public.notification_reactions to authenticated;

create policy "notification_reactions_select_event_members"
on public.notification_reactions for select to authenticated
using (
  (select private.is_group_member(group_id))
  and exists (
    select 1
    from public.app_notifications as own_notification
    where own_notification.event_id = notification_reactions.event_id
      and own_notification.group_id = notification_reactions.group_id
      and own_notification.user_id = (select auth.uid())
  )
);

create policy "notification_reactions_insert_own"
on public.notification_reactions for insert to authenticated
with check (
  user_id = (select auth.uid())
  and (select private.is_group_member(group_id))
  and exists (
    select 1
    from public.app_notifications as own_notification
    where own_notification.event_id = notification_reactions.event_id
      and own_notification.group_id = notification_reactions.group_id
      and own_notification.user_id = (select auth.uid())
  )
);

create policy "notification_reactions_delete_own"
on public.notification_reactions for delete to authenticated
using (user_id = (select auth.uid()));

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
  v_amount numeric(14,2);
  v_expense_id uuid;
  v_installment_id uuid;
begin
  begin
    if p_type = 'expense_added' then
      select expense.id, expense.amount
      into v_expense_id, v_amount
      from public.expenses as expense
      where expense.group_id = p_group_id
        and expense.title = btrim(p_message)
        and expense.created_at = now()
      order by expense.id desc
      limit 1;
    elsif p_type = 'installment_added' then
      select installment.id, installment.total_amount
      into v_installment_id, v_amount
      from public.installments as installment
      where installment.group_id = p_group_id
        and installment.title = btrim(p_message)
        and installment.created_at = now()
      order by installment.id desc
      limit 1;
    end if;

    insert into public.app_notifications (
      group_id,
      user_id,
      event_id,
      title,
      message,
      type,
      amount,
      related_expense_id,
      related_installment_id
    )
    select
      p_group_id,
      member.user_id,
      v_event_id,
      btrim(p_title),
      btrim(p_message),
      btrim(p_type),
      v_amount,
      v_expense_id,
      v_installment_id
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

do $$
begin
  if exists (
    select 1 from pg_catalog.pg_publication where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notification_reactions'
  ) then
    execute 'alter publication supabase_realtime add table public.notification_reactions';
  end if;
end
$$;

comment on table public.notification_reactions is
  'Reações compartilhadas somente entre destinatários ativos do mesmo aviso privado.';

commit;
