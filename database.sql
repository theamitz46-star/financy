-- Run this script in Supabase Dashboard > SQL Editor.

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('income', 'expense')),
  amount numeric(12, 2) not null check (amount > 0),
  category text not null,
  note text,
  transaction_date date not null,
  created_at timestamptz not null default now()
);

alter table public.transactions enable row level security;

grant select, insert, update, delete
on public.transactions
to authenticated;

drop policy if exists "Users can view own transactions"
on public.transactions;
create policy "Users can view own transactions"
on public.transactions
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can insert own transactions"
on public.transactions;
create policy "Users can insert own transactions"
on public.transactions
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update own transactions"
on public.transactions;
create policy "Users can update own transactions"
on public.transactions
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own transactions"
on public.transactions;
create policy "Users can delete own transactions"
on public.transactions
for delete
to authenticated
using (auth.uid() = user_id);

create table if not exists public.user_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('income', 'expense')),
  name text not null check (length(trim(name)) between 1 and 40),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, type, name)
);

create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  theme text not null default 'light' check (theme in ('light', 'dark')),
  accent_color text not null default '#23876c' check (accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  updated_at timestamptz not null default now()
);

create table if not exists public.recurring_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('income', 'expense')),
  amount numeric(12, 2) not null check (amount > 0),
  category text not null,
  note text,
  frequency text not null check (frequency in ('monthly', 'yearly')),
  start_date date not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.recurring_occurrences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  recurring_id uuid not null references public.recurring_transactions(id) on delete cascade,
  due_date date not null,
  status text not null default 'pending' check (status in ('pending', 'paid')),
  paid_on date,
  transaction_id uuid references public.transactions(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (recurring_id, due_date),
  check ((status = 'paid' and paid_on is not null) or (status = 'pending' and paid_on is null))
);

create index if not exists recurring_occurrences_user_due_idx
on public.recurring_occurrences (user_id, due_date, status);

alter table public.user_categories enable row level security;
alter table public.user_preferences enable row level security;
alter table public.recurring_transactions enable row level security;
alter table public.recurring_occurrences enable row level security;

grant select, insert, update, delete on public.user_categories to authenticated;
grant select, insert, update, delete on public.user_preferences to authenticated;
grant select, insert, update, delete on public.recurring_transactions to authenticated;
grant select, insert, update, delete on public.recurring_occurrences to authenticated;

drop policy if exists "Users manage own categories" on public.user_categories;
create policy "Users manage own categories" on public.user_categories
for all to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users manage own preferences" on public.user_preferences;
create policy "Users manage own preferences" on public.user_preferences
for all to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users manage own recurring transactions" on public.recurring_transactions;
create policy "Users manage own recurring transactions" on public.recurring_transactions
for all to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users manage own recurring occurrences" on public.recurring_occurrences;
create policy "Users manage own recurring occurrences" on public.recurring_occurrences
for all to authenticated
using (auth.uid() = user_id)
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.recurring_transactions
    where recurring_transactions.id = recurring_occurrences.recurring_id
      and recurring_transactions.user_id = auth.uid()
  )
);

create or replace function public.settle_recurring_occurrence(
  p_occurrence_id uuid,
  p_paid_on date default current_date
)
returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_occurrence public.recurring_occurrences%rowtype;
  v_recurring public.recurring_transactions%rowtype;
  v_transaction_id uuid;
begin
  select *
  into v_occurrence
  from public.recurring_occurrences
  where id = p_occurrence_id
    and user_id = auth.uid()
  for update;

  if not found then
    raise exception 'Recurring occurrence not found';
  end if;

  if v_occurrence.status = 'paid' then
    return v_occurrence.transaction_id;
  end if;

  select *
  into v_recurring
  from public.recurring_transactions
  where id = v_occurrence.recurring_id
    and user_id = auth.uid();

  if not found then
    raise exception 'Recurring transaction not found';
  end if;

  insert into public.transactions (user_id, type, amount, category, note, transaction_date)
  values (
    auth.uid(),
    v_recurring.type,
    v_recurring.amount,
    v_recurring.category,
    v_recurring.note,
    p_paid_on
  )
  returning id into v_transaction_id;

  update public.recurring_occurrences
  set status = 'paid',
      paid_on = p_paid_on,
      transaction_id = v_transaction_id
  where id = p_occurrence_id
    and user_id = auth.uid();

  return v_transaction_id;
end;
$$;

revoke all on function public.settle_recurring_occurrence(uuid, date) from public;
grant execute on function public.settle_recurring_occurrence(uuid, date) to authenticated;
