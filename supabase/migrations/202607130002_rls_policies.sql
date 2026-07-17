begin;

create or replace function private.is_group_member(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1
    from public.group_members as gm
    where gm.group_id = p_group_id
      and gm.user_id = (select auth.uid())
      and gm.status = 'active'
  );
$$;

create or replace function private.is_group_admin(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1
    from public.group_members as gm
    where gm.group_id = p_group_id
      and gm.user_id = (select auth.uid())
      and gm.status = 'active'
      and gm.role = 'admin'
  );
$$;

create or replace function private.is_group_user_active(p_group_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.group_members as gm
    where gm.group_id = p_group_id
      and gm.user_id = p_user_id
      and gm.status = 'active'
  );
$$;

create or replace function private.users_share_group(p_other_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1
    from public.group_members as mine
    join public.group_members as theirs on theirs.group_id = mine.group_id
    where mine.user_id = (select auth.uid())
      and mine.status = 'active'
      and theirs.user_id = p_other_user_id
      and theirs.status = 'active'
  );
$$;

create or replace function private.is_expense_member(p_expense_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1
    from public.expenses as e
    join public.group_members as gm on gm.group_id = e.group_id
    where e.id = p_expense_id
      and gm.user_id = (select auth.uid())
      and gm.status = 'active'
  );
$$;

revoke all on function private.is_group_member(uuid) from public, anon;
revoke all on function private.is_group_admin(uuid) from public, anon;
revoke all on function private.is_group_user_active(uuid, uuid) from public, anon;
revoke all on function private.users_share_group(uuid) from public, anon;
revoke all on function private.is_expense_member(uuid) from public, anon;
grant execute on function private.is_group_member(uuid) to authenticated;
grant execute on function private.is_group_admin(uuid) to authenticated;
grant execute on function private.is_group_user_active(uuid, uuid) to authenticated;
grant execute on function private.users_share_group(uuid) to authenticated;
grant execute on function private.is_expense_member(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.group_invites enable row level security;
alter table public.monthly_periods enable row level security;
alter table public.expenses enable row level security;
alter table public.expense_participants enable row level security;
alter table public.recurring_rules enable row level security;
alter table public.installments enable row level security;
alter table public.receipts enable row level security;
alter table public.balance_accounts enable row level security;
alter table public.balance_movements enable row level security;
alter table public.app_notifications enable row level security;

revoke all on table
  public.profiles,
  public.groups,
  public.group_members,
  public.group_invites,
  public.monthly_periods,
  public.expenses,
  public.expense_participants,
  public.recurring_rules,
  public.installments,
  public.receipts,
  public.balance_accounts,
  public.balance_movements,
  public.app_notifications
from anon;

grant select, insert, update, delete on table
  public.profiles,
  public.groups,
  public.group_members,
  public.group_invites,
  public.monthly_periods,
  public.expenses,
  public.expense_participants,
  public.recurring_rules,
  public.installments,
  public.receipts,
  public.balance_accounts,
  public.balance_movements,
  public.app_notifications
to authenticated;

create policy "profiles_select_self_or_shared_group"
on public.profiles for select to authenticated
using (
  id = (select auth.uid())
  or (select private.users_share_group(id))
);

create policy "profiles_insert_self"
on public.profiles for insert to authenticated
with check (id = (select auth.uid()));

create policy "profiles_update_self"
on public.profiles for update to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

create policy "groups_select_active_members"
on public.groups for select to authenticated
using ((select private.is_group_member(id)));

create policy "groups_insert_owner"
on public.groups for insert to authenticated
with check (owner_id = (select auth.uid()));

create policy "groups_update_admins"
on public.groups for update to authenticated
using ((select private.is_group_admin(id)))
with check ((select private.is_group_admin(id)));

create policy "group_members_select_group_members"
on public.group_members for select to authenticated
using ((select private.is_group_member(group_id)));

create policy "group_members_insert_admins"
on public.group_members for insert to authenticated
with check ((select private.is_group_admin(group_id)));

create policy "group_members_update_admins"
on public.group_members for update to authenticated
using ((select private.is_group_admin(group_id)))
with check ((select private.is_group_admin(group_id)));

create policy "group_members_delete_admins"
on public.group_members for delete to authenticated
using ((select private.is_group_admin(group_id)));

create policy "group_invites_select_admins"
on public.group_invites for select to authenticated
using ((select private.is_group_admin(group_id)));

create policy "group_invites_insert_admins"
on public.group_invites for insert to authenticated
with check (
  (select private.is_group_admin(group_id))
  and created_by = (select auth.uid())
);

create policy "group_invites_update_admins"
on public.group_invites for update to authenticated
using ((select private.is_group_admin(group_id)))
with check ((select private.is_group_admin(group_id)));

create policy "group_invites_delete_admins"
on public.group_invites for delete to authenticated
using ((select private.is_group_admin(group_id)));

create policy "monthly_periods_select_members"
on public.monthly_periods for select to authenticated
using ((select private.is_group_member(group_id)));

create policy "monthly_periods_insert_members"
on public.monthly_periods for insert to authenticated
with check ((select private.is_group_member(group_id)));

create policy "monthly_periods_update_admins"
on public.monthly_periods for update to authenticated
using ((select private.is_group_admin(group_id)))
with check ((select private.is_group_admin(group_id)));

create policy "monthly_periods_delete_admins"
on public.monthly_periods for delete to authenticated
using ((select private.is_group_admin(group_id)));

create policy "expenses_select_members"
on public.expenses for select to authenticated
using ((select private.is_group_member(group_id)));

create policy "expenses_insert_members"
on public.expenses for insert to authenticated
with check (
  (select private.is_group_member(group_id))
  and created_by = (select auth.uid())
);

create policy "expenses_update_members"
on public.expenses for update to authenticated
using ((select private.is_group_member(group_id)))
with check ((select private.is_group_member(group_id)));

create policy "expenses_delete_members"
on public.expenses for delete to authenticated
using ((select private.is_group_member(group_id)));

create policy "expense_participants_select_members"
on public.expense_participants for select to authenticated
using ((select private.is_expense_member(expense_id)));

create policy "expense_participants_insert_members"
on public.expense_participants for insert to authenticated
with check ((select private.is_expense_member(expense_id)));

create policy "expense_participants_update_members"
on public.expense_participants for update to authenticated
using ((select private.is_expense_member(expense_id)))
with check ((select private.is_expense_member(expense_id)));

create policy "expense_participants_delete_members"
on public.expense_participants for delete to authenticated
using ((select private.is_expense_member(expense_id)));

create policy "recurring_rules_select_members"
on public.recurring_rules for select to authenticated
using ((select private.is_group_member(group_id)));

create policy "recurring_rules_insert_members"
on public.recurring_rules for insert to authenticated
with check ((select private.is_group_member(group_id)));

create policy "recurring_rules_update_members"
on public.recurring_rules for update to authenticated
using ((select private.is_group_member(group_id)))
with check ((select private.is_group_member(group_id)));

create policy "recurring_rules_delete_members"
on public.recurring_rules for delete to authenticated
using ((select private.is_group_member(group_id)));

create policy "installments_select_members"
on public.installments for select to authenticated
using ((select private.is_group_member(group_id)));

create policy "installments_insert_members"
on public.installments for insert to authenticated
with check ((select private.is_group_member(group_id)));

create policy "installments_update_members"
on public.installments for update to authenticated
using ((select private.is_group_member(group_id)))
with check ((select private.is_group_member(group_id)));

create policy "installments_delete_members"
on public.installments for delete to authenticated
using ((select private.is_group_member(group_id)));

create policy "receipts_select_members"
on public.receipts for select to authenticated
using ((select private.is_group_member(group_id)));

create policy "receipts_insert_members"
on public.receipts for insert to authenticated
with check (
  (select private.is_group_member(group_id))
  and created_by = (select auth.uid())
);

create policy "receipts_update_members"
on public.receipts for update to authenticated
using ((select private.is_group_member(group_id)))
with check ((select private.is_group_member(group_id)));

create policy "receipts_delete_members"
on public.receipts for delete to authenticated
using ((select private.is_group_member(group_id)));

create policy "balance_accounts_select_members"
on public.balance_accounts for select to authenticated
using ((select private.is_group_member(group_id)));

create policy "balance_accounts_insert_members"
on public.balance_accounts for insert to authenticated
with check ((select private.is_group_member(group_id)));

create policy "balance_accounts_update_members"
on public.balance_accounts for update to authenticated
using ((select private.is_group_member(group_id)))
with check ((select private.is_group_member(group_id)));

create policy "balance_accounts_delete_admins"
on public.balance_accounts for delete to authenticated
using ((select private.is_group_admin(group_id)));

create policy "balance_movements_select_members"
on public.balance_movements for select to authenticated
using ((select private.is_group_member(group_id)));

create policy "balance_movements_insert_members"
on public.balance_movements for insert to authenticated
with check ((select private.is_group_member(group_id)));

create policy "balance_movements_update_members"
on public.balance_movements for update to authenticated
using ((select private.is_group_member(group_id)))
with check ((select private.is_group_member(group_id)));

create policy "balance_movements_delete_members"
on public.balance_movements for delete to authenticated
using ((select private.is_group_member(group_id)));

create policy "app_notifications_select_recipient"
on public.app_notifications for select to authenticated
using (user_id = (select auth.uid()));

create policy "app_notifications_insert_group_members"
on public.app_notifications for insert to authenticated
with check (
  (select private.is_group_member(group_id))
  and (select private.is_group_user_active(group_id, user_id))
);

create policy "app_notifications_update_recipient"
on public.app_notifications for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy "app_notifications_delete_recipient"
on public.app_notifications for delete to authenticated
using (user_id = (select auth.uid()));

create or replace function public.accept_group_invite(p_token uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_group_id uuid;
  v_max_uses integer;
  v_used_count integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select invite.group_id, invite.max_uses, invite.used_count
    into v_group_id, v_max_uses, v_used_count
  from public.group_invites as invite
  join public.groups as target_group on target_group.id = invite.group_id
  where invite.invite_token = p_token
    and invite.active = true
    and (invite.expires_at is null or invite.expires_at > now())
    and (invite.max_uses is null or invite.used_count < invite.max_uses)
    and target_group.archived_at is null
  for update of invite;

  if v_group_id is null then
    raise exception 'Invite is invalid, expired, inactive, or fully used';
  end if;

  if exists (
    select 1 from public.group_members
    where group_id = v_group_id
      and user_id = v_user_id
      and status = 'active'
  ) then
    return v_group_id;
  end if;

  insert into public.group_members (group_id, user_id, role, status, joined_at)
  values (v_group_id, v_user_id, 'member', 'active', now())
  on conflict (group_id, user_id) do update
    set role = 'member',
        status = 'active',
        joined_at = coalesce(public.group_members.joined_at, excluded.joined_at);

  update public.group_invites
  set used_count = used_count + 1,
      active = case
        when max_uses is null then active
        else used_count + 1 < max_uses
      end
  where invite_token = p_token;

  return v_group_id;
end;
$$;

revoke all on function public.accept_group_invite(uuid) from public, anon;
grant execute on function public.accept_group_invite(uuid) to authenticated;

commit;
