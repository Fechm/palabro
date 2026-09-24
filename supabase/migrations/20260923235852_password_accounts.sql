-- Login con usuario o correo + contraseña, sin enviar correos.
-- Solo el Worker (service_role) lee estas tablas: RLS activa y sin políticas.

create table public.accounts (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  username    text not null,
  question_id smallint not null check (question_id between 1 and 6),
  answer_hash text not null,
  answer_salt text not null,
  created_at  timestamptz not null default now()
);
create unique index accounts_username_lower_idx on public.accounts (lower(username));
alter table public.accounts enable row level security;

create table public.auth_attempts (
  id         bigserial primary key,
  key        text not null,
  created_at timestamptz not null default now()
);
create index auth_attempts_key_idx on public.auth_attempts (key, created_at desc);
alter table public.auth_attempts enable row level security;

revoke all on public.accounts from anon, authenticated;
revoke all on public.auth_attempts from anon, authenticated;
