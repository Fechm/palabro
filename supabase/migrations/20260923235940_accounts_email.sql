-- Permite entrar con el correo: la API de administración no filtra usuarios por email.
alter table public.accounts add column email text not null;
create unique index accounts_email_lower_idx on public.accounts (lower(email));
