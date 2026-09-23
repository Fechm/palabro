-- ts-fsrs 5.x añadió `learning_steps` al estado de la tarjeta. Sin esta
-- columna el estado del algoritmo se pierde entre repasos y las tarjetas
-- en aprendizaje se reprograman mal.
alter table public.user_cards
  add column learning_steps integer not null default 0;

-- apply_review persiste el estado FSRS completo, así que hay que
-- recrearla incluyendo el campo nuevo.
create or replace function public.apply_review(
  p_user_id        uuid,
  p_user_card_id   bigint,
  p_grade          smallint,
  p_card_type      smallint,
  p_context_id     bigint,
  p_latency_ms     integer,
  p_state_before   jsonb,
  p_fsrs           jsonb,
  p_mastery_level  smallint,
  p_level_streak   smallint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  select user_id into v_owner from public.user_cards where id = p_user_card_id;
  if v_owner is null or v_owner <> p_user_id then
    raise exception 'card_not_owned' using errcode = '42501';
  end if;

  insert into public.reviews
    (user_card_id, grade, card_type, context_id, latency_ms, state_before)
  values
    (p_user_card_id, p_grade, p_card_type, p_context_id, p_latency_ms, p_state_before);

  update public.user_cards set
    due            = (p_fsrs->>'due')::timestamptz,
    stability      = (p_fsrs->>'stability')::real,
    difficulty     = (p_fsrs->>'difficulty')::real,
    elapsed_days   = (p_fsrs->>'elapsed_days')::integer,
    scheduled_days = (p_fsrs->>'scheduled_days')::integer,
    learning_steps = coalesce((p_fsrs->>'learning_steps')::integer, 0),
    reps           = (p_fsrs->>'reps')::integer,
    lapses         = (p_fsrs->>'lapses')::integer,
    state          = (p_fsrs->>'state')::smallint,
    last_review    = (p_fsrs->>'last_review')::timestamptz,
    mastery_level  = p_mastery_level,
    level_streak   = p_level_streak
  where id = p_user_card_id;

  return jsonb_build_object('due', p_fsrs->>'due', 'mastery_level', p_mastery_level);
end;
$$;

revoke all on function public.apply_review(uuid, bigint, smallint, smallint, bigint, integer, jsonb, jsonb, smallint, smallint) from public, anon, authenticated;
