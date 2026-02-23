-- Migration: introduce FinanceGroup workspaces and dynamic splits
-- Date: 2026-02-23

-- 1) Generalize households as finance groups
alter table public.households
  add column if not exists group_type text not null default 'couple'
    check (group_type in ('personal','couple','family'));

alter table public.households
  add column if not exists color text,
  add column if not exists icon text;


-- 2) Enrich household_members with metadata
alter table public.household_members
  add column if not exists invited_by uuid null,
  add column if not exists created_at timestamptz not null default now();


-- 3) Dynamic per-member splits for transactions
create table if not exists public.transaction_shares (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  share_amount numeric not null,
  share_percent numeric null,
  created_at timestamptz not null default now()
);

create index if not exists idx_transaction_shares_tx
  on public.transaction_shares(transaction_id);

create index if not exists idx_transaction_shares_user
  on public.transaction_shares(user_id);


-- 4) Optional: freeze split mode for recurrences
alter table public.recurrence_rules
  add column if not exists split_mode text
    check (split_mode in ('individual','equal','percentage'));

