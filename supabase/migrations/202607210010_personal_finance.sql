begin;

create type public.personal_transaction_type as enum ('income', 'expense');

create table public.personal_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type public.personal_transaction_type not null,
  description text not null check (char_length(btrim(description)) between 1 and 180),
  amount numeric(14,2) not null check (amount > 0),
  category text not null check (char_length(btrim(category)) between 1 and 80),
  occurred_on date not null default current_date,
  competence_month date not null,
  notes text check (notes is null or char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint personal_transactions_competence_month_check check (
    competence_month = date_trunc('month', competence_month)::date
  )
);

create index personal_transactions_user_month_idx
on public.personal_transactions (user_id, competence_month, occurred_on desc);

create trigger personal_transactions_set_updated_at
before update on public.personal_transactions
for each row execute function private.set_updated_at();

alter table public.personal_transactions enable row level security;

revoke all on table public.personal_transactions from public, anon;
grant select, insert, update, delete on table public.personal_transactions to authenticated;

create policy "personal_transactions_select_own"
on public.personal_transactions for select to authenticated
using (user_id = auth.uid());

create policy "personal_transactions_insert_own"
on public.personal_transactions for insert to authenticated
with check (user_id = auth.uid());

create policy "personal_transactions_update_own"
on public.personal_transactions for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "personal_transactions_delete_own"
on public.personal_transactions for delete to authenticated
using (user_id = auth.uid());

do $$
begin
  if exists (
    select 1 from pg_catalog.pg_publication where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'personal_transactions'
  ) then
    execute 'alter publication supabase_realtime add table public.personal_transactions';
  end if;
end
$$;

comment on table public.personal_transactions is
  'Lançamentos financeiros pessoais, privados e vinculados ao usuário autenticado.';

commit;
