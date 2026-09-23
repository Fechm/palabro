-- Funciones que necesita el Worker y que no existían todavía.

-- Estado completo de una tarjeta, comprobando propiedad. El Worker lo
-- necesita para calcular el siguiente intervalo con ts-fsrs.
create or replace function public.get_card_state(
  p_user_id      uuid,
  p_user_card_id bigint
)
returns setof public.user_cards
language sql
security definer
set search_path = public
as $$
  select * from public.user_cards
   where id = p_user_card_id and user_id = p_user_id;
$$;

-- Producciones evaluadas hoy, para el tope diario de llamadas al modelo.
create or replace function public.productions_today(p_user_id uuid)
returns integer
language sql
security definer
set search_path = public
as $$
  select count(*)::integer
    from public.productions
   where user_id = p_user_id
     and created_at >= date_trunc('day', now());
$$;

revoke all on function public.get_card_state(uuid, bigint)  from public, anon, authenticated;
revoke all on function public.productions_today(uuid)        from public, anon, authenticated;
