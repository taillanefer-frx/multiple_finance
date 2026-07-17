begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create type public.group_type as enum ('house_split', 'balance_control');
create type public.group_member_role as enum ('admin', 'member');
create type public.group_member_status as enum ('active', 'invited', 'removed');
create type public.monthly_period_status as enum ('open', 'closed');
create type public.expense_type as enum ('fixed', 'variable', 'one_time', 'installment');
create type public.expense_status as enum ('open', 'paid', 'overdue', 'review', 'cancelled');
create type public.receipt_status as enum ('uploaded', 'processing', 'review', 'confirmed', 'failed');
create type public.balance_movement_type as enum ('income', 'expense');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 120),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  type public.group_type not null,
  owner_id uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create table public.group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.group_member_role not null default 'member',
  status public.group_member_status not null default 'invited',
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  constraint group_members_group_user_key unique (group_id, user_id),
  constraint group_members_active_joined_check check (status <> 'active' or joined_at is not null)
);

create table public.group_invites (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  invite_token uuid not null default gen_random_uuid() unique,
  created_by uuid not null,
  expires_at timestamptz,
  max_uses integer check (max_uses is null or max_uses > 0),
  used_count integer not null default 0 check (used_count >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint group_invites_creator_member_fk foreign key (group_id, created_by)
    references public.group_members (group_id, user_id) on delete restrict,
  constraint group_invites_usage_check check (max_uses is null or used_count <= max_uses)
);

create table public.monthly_periods (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  month smallint not null check (month between 1 and 12),
  year smallint not null check (year between 2000 and 2200),
  status public.monthly_period_status not null default 'open',
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  constraint monthly_periods_group_month_year_key unique (group_id, month, year),
  constraint monthly_periods_id_group_key unique (id, group_id),
  constraint monthly_periods_closed_check check (
    (status = 'open' and closed_at is null) or
    (status = 'closed' and closed_at is not null)
  )
);

create table public.recurring_rules (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 180),
  amount numeric(14,2) not null check (amount > 0),
  category text not null check (char_length(btrim(category)) between 1 and 80),
  due_day smallint not null check (due_day between 1 and 31),
  paid_by_user_id uuid,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recurring_rules_id_group_key unique (id, group_id),
  constraint recurring_rules_payer_member_fk foreign key (group_id, paid_by_user_id)
    references public.group_members (group_id, user_id) on delete restrict
);

create table public.installments (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 180),
  total_amount numeric(14,2) not null check (total_amount > 0),
  installment_amount numeric(14,2) not null check (installment_amount > 0),
  total_installments integer not null check (total_installments > 0),
  current_installment integer not null default 1 check (current_installment > 0),
  due_day smallint not null check (due_day between 1 and 31),
  card_label text check (card_label is null or char_length(btrim(card_label)) between 1 and 80),
  paid_by_user_id uuid,
  shared boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint installments_number_check check (current_installment <= total_installments),
  constraint installments_id_group_key unique (id, group_id),
  constraint installments_payer_member_fk foreign key (group_id, paid_by_user_id)
    references public.group_members (group_id, user_id) on delete restrict
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  monthly_period_id uuid not null,
  title text not null check (char_length(btrim(title)) between 1 and 180),
  amount numeric(14,2) not null check (amount > 0),
  category text not null check (char_length(btrim(category)) between 1 and 80),
  type public.expense_type not null,
  purchase_date date not null,
  due_date date,
  paid_by_user_id uuid,
  created_by uuid not null,
  status public.expense_status not null default 'open',
  notify_group boolean not null default false,
  notes text check (notes is null or char_length(notes) <= 4000),
  receipt_id uuid,
  recurring_rule_id uuid,
  installment_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint expenses_id_group_key unique (id, group_id),
  constraint expenses_period_group_fk foreign key (monthly_period_id, group_id)
    references public.monthly_periods (id, group_id) on delete restrict,
  constraint expenses_payer_member_fk foreign key (group_id, paid_by_user_id)
    references public.group_members (group_id, user_id) on delete restrict,
  constraint expenses_creator_member_fk foreign key (group_id, created_by)
    references public.group_members (group_id, user_id) on delete restrict,
  constraint expenses_recurring_group_fk foreign key (recurring_rule_id, group_id)
    references public.recurring_rules (id, group_id) on delete set null (recurring_rule_id),
  constraint expenses_installment_group_fk foreign key (installment_id, group_id)
    references public.installments (id, group_id) on delete set null (installment_id)
);

create table public.expense_participants (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.expenses (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete restrict,
  share_amount numeric(14,2) not null default 0 check (share_amount >= 0),
  share_percent numeric(7,4) check (share_percent is null or share_percent between 0 and 100),
  included boolean not null default true,
  created_at timestamptz not null default now(),
  constraint expense_participants_expense_user_key unique (expense_id, user_id)
);

create table public.receipts (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  expense_id uuid,
  storage_path text not null unique check (storage_path ~ '^[0-9a-fA-F-]{36}/[0-9a-fA-F-]{36}\.(jpg|jpeg|png|webp|pdf)$'),
  original_filename text not null check (char_length(btrim(original_filename)) between 1 and 255),
  ocr_raw_text text,
  ocr_detected_total numeric(14,2) check (ocr_detected_total is null or ocr_detected_total >= 0),
  confirmed_total numeric(14,2) check (confirmed_total is null or confirmed_total >= 0),
  status public.receipt_status not null default 'uploaded',
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint receipts_expense_key unique (expense_id),
  constraint receipts_id_group_key unique (id, group_id),
  constraint receipts_expense_group_fk foreign key (expense_id, group_id)
    references public.expenses (id, group_id) on delete set null (expense_id),
  constraint receipts_creator_member_fk foreign key (group_id, created_by)
    references public.group_members (group_id, user_id) on delete restrict
);

alter table public.expenses
  add constraint expenses_receipt_group_fk foreign key (receipt_id, group_id)
  references public.receipts (id, group_id) on delete set null (receipt_id);

create table public.balance_accounts (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null,
  monthly_period_id uuid not null,
  starting_balance numeric(14,2) not null default 0,
  current_balance numeric(14,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint balance_accounts_group_user_period_key unique (group_id, user_id, monthly_period_id),
  constraint balance_accounts_member_fk foreign key (group_id, user_id)
    references public.group_members (group_id, user_id) on delete restrict,
  constraint balance_accounts_period_group_fk foreign key (monthly_period_id, group_id)
    references public.monthly_periods (id, group_id) on delete restrict
);

create table public.balance_movements (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  monthly_period_id uuid not null,
  user_id uuid not null,
  type public.balance_movement_type not null,
  amount numeric(14,2) not null check (amount > 0),
  description text not null check (char_length(btrim(description)) between 1 and 255),
  related_expense_id uuid,
  created_at timestamptz not null default now(),
  constraint balance_movements_member_fk foreign key (group_id, user_id)
    references public.group_members (group_id, user_id) on delete restrict,
  constraint balance_movements_period_group_fk foreign key (monthly_period_id, group_id)
    references public.monthly_periods (id, group_id) on delete restrict,
  constraint balance_movements_expense_group_fk foreign key (related_expense_id, group_id)
    references public.expenses (id, group_id) on delete set null (related_expense_id)
);

create table public.app_notifications (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null,
  title text not null check (char_length(btrim(title)) between 1 and 160),
  message text not null check (char_length(btrim(message)) between 1 and 1000),
  type text not null check (char_length(btrim(type)) between 1 and 80),
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint app_notifications_member_fk foreign key (group_id, user_id)
    references public.group_members (group_id, user_id) on delete cascade
);

create index groups_owner_id_idx on public.groups (owner_id);
create index group_members_user_active_idx on public.group_members (user_id, group_id) where status = 'active';
create index group_members_group_active_idx on public.group_members (group_id, user_id) where status = 'active';
create index group_invites_group_active_idx on public.group_invites (group_id, active);
create index monthly_periods_group_status_idx on public.monthly_periods (group_id, status);
create index expenses_group_period_idx on public.expenses (group_id, monthly_period_id);
create index expenses_group_status_idx on public.expenses (group_id, status);
create index expenses_paid_by_idx on public.expenses (paid_by_user_id);
create index expense_participants_user_idx on public.expense_participants (user_id);
create index recurring_rules_group_active_idx on public.recurring_rules (group_id, active);
create index installments_group_active_idx on public.installments (group_id, active);
create index receipts_group_idx on public.receipts (group_id);
create index balance_accounts_user_period_idx on public.balance_accounts (user_id, monthly_period_id);
create index balance_movements_group_period_idx on public.balance_movements (group_id, monthly_period_id);
create index app_notifications_user_unread_idx on public.app_notifications (user_id, created_at desc) where read_at is null;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles
for each row execute function private.set_updated_at();
create trigger groups_set_updated_at before update on public.groups
for each row execute function private.set_updated_at();
create trigger expenses_set_updated_at before update on public.expenses
for each row execute function private.set_updated_at();
create trigger recurring_rules_set_updated_at before update on public.recurring_rules
for each row execute function private.set_updated_at();
create trigger installments_set_updated_at before update on public.installments
for each row execute function private.set_updated_at();
create trigger receipts_set_updated_at before update on public.receipts
for each row execute function private.set_updated_at();
create trigger balance_accounts_set_updated_at before update on public.balance_accounts
for each row execute function private.set_updated_at();

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Usuário'
    ),
    nullif(btrim(new.raw_user_meta_data ->> 'avatar_url'), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

insert into public.profiles (id, display_name, avatar_url, created_at, updated_at)
select
  users.id,
  coalesce(
    nullif(btrim(users.raw_user_meta_data ->> 'display_name'), ''),
    nullif(split_part(coalesce(users.email, ''), '@', 1), ''),
    'Usuário'
  ),
  nullif(btrim(users.raw_user_meta_data ->> 'avatar_url'), ''),
  users.created_at,
  now()
from auth.users as users
on conflict (id) do nothing;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user();

create or replace function private.handle_new_group()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.group_members (group_id, user_id, role, status, joined_at)
  values (new.id, new.owner_id, 'admin', 'active', now());
  return new;
end;
$$;

create trigger on_group_created
after insert on public.groups
for each row execute function private.handle_new_group();

create or replace function private.ensure_balance_control_group()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.groups
    where id = new.group_id and type = 'balance_control'
  ) then
    raise exception 'Balance records require a balance_control group';
  end if;
  return new;
end;
$$;

create trigger balance_accounts_require_balance_group
before insert or update of group_id on public.balance_accounts
for each row execute function private.ensure_balance_control_group();
create trigger balance_movements_require_balance_group
before insert or update of group_id on public.balance_movements
for each row execute function private.ensure_balance_control_group();

create or replace function private.validate_expense_participant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.expenses as e
    join public.group_members as gm
      on gm.group_id = e.group_id
     and gm.user_id = new.user_id
     and gm.status = 'active'
    where e.id = new.expense_id
  ) then
    raise exception 'Expense participant must be an active group member';
  end if;
  return new;
end;
$$;

create trigger expense_participants_require_active_member
before insert or update of expense_id, user_id on public.expense_participants
for each row execute function private.validate_expense_participant();

create or replace function private.validate_receipt_storage_path()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.storage_path not like new.group_id::text || '/' || new.id::text || '.%' then
    raise exception 'Receipt storage_path must match its group and receipt id';
  end if;
  return new;
end;
$$;

create trigger receipts_validate_storage_path
before insert or update of id, group_id, storage_path on public.receipts
for each row execute function private.validate_receipt_storage_path();

create or replace function private.validate_group_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.owner_id <> old.owner_id and not exists (
    select 1 from public.group_members
    where group_id = old.id
      and user_id = new.owner_id
      and role = 'admin'
      and status = 'active'
  ) then
    raise exception 'New group owner must already be an active admin';
  end if;

  if old.type = 'balance_control' and new.type <> old.type and (
    exists (select 1 from public.balance_accounts where group_id = old.id) or
    exists (select 1 from public.balance_movements where group_id = old.id)
  ) then
    raise exception 'Cannot change type while balance records exist';
  end if;

  return new;
end;
$$;

create trigger groups_validate_change
before update of owner_id, type on public.groups
for each row execute function private.validate_group_change();

create or replace function private.validate_group_member_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group_id uuid := old.group_id;
  v_user_id uuid := old.user_id;
  v_removes_active_admin boolean;
begin
  if tg_op = 'UPDATE' and (new.group_id <> old.group_id or new.user_id <> old.user_id) then
    raise exception 'Group membership identity cannot be changed';
  end if;

  if exists (
    select 1 from public.groups
    where id = v_group_id and owner_id = v_user_id
  ) then
    if tg_op = 'DELETE' then
      raise exception 'Transfer group ownership before removing the owner';
    end if;
    if new.status <> 'active' or new.role <> 'admin' then
      raise exception 'Transfer group ownership before removing or demoting the owner';
    end if;
  end if;

  if old.status = 'active' and old.role = 'admin' then
    if tg_op = 'DELETE' then
      v_removes_active_admin := true;
    else
      v_removes_active_admin := new.status <> 'active' or new.role <> 'admin';
    end if;
  else
    v_removes_active_admin := false;
  end if;

  if v_removes_active_admin and not exists (
    select 1 from public.group_members
    where group_id = v_group_id
      and user_id <> v_user_id
      and role = 'admin'
      and status = 'active'
  ) then
    raise exception 'A group must keep at least one active admin';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger group_members_validate_change
before update or delete on public.group_members
for each row execute function private.validate_group_member_change();

revoke all on function private.set_updated_at() from public, anon, authenticated;
revoke all on function private.handle_new_user() from public, anon, authenticated;
revoke all on function private.handle_new_group() from public, anon, authenticated;
revoke all on function private.ensure_balance_control_group() from public, anon, authenticated;
revoke all on function private.validate_expense_participant() from public, anon, authenticated;
revoke all on function private.validate_receipt_storage_path() from public, anon, authenticated;
revoke all on function private.validate_group_change() from public, anon, authenticated;
revoke all on function private.validate_group_member_change() from public, anon, authenticated;

commit;
