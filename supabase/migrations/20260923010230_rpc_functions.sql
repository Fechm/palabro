-- ═══════════════════════════════════════════════════════════════════════
--  Funciones RPC
--
--  Toda la logica que necesita SQL de verdad vive aqui y se invoca con
--  supabase-js `.rpc()`. Asi evitamos un ORM y las limitaciones de
--  PostgREST para consultas compuestas, sin abrir conexiones TCP desde
--  el Worker.
--
--  Reciben p_user_id explicito porque el Worker llama con service_role
--  (ya verifico el JWT por su cuenta). Se revoca el acceso directo a
--  anon/authenticated al final del archivo.
-- ═══════════════════════════════════════════════════════════════════════


-- ─── Arma la cola de estudio del dia ──────────────────────────────────
-- Devuelve las tarjetas vencidas + introduce nuevas por frecuencia.
-- Crea las filas de user_cards para las nuevas, de forma atomica, para
-- que todo lo que sale de aqui tenga ya un id estable.
create or replace function public.get_study_session(
  p_user_id   uuid,
  p_due_limit integer default 20,
  p_new_limit integer default 5
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  -- Introduce palabras nuevas: las mas frecuentes que el usuario aun no tiene.
  insert into public.user_cards (user_id, lexeme_id, due)
  select p_user_id, l.id, now()
  from public.lexemes l
  where not exists (
    select 1 from public.user_cards uc
    where uc.user_id = p_user_id and uc.lexeme_id = l.id
  )
  order by l.freq_rank
  limit greatest(p_new_limit, 0)
  on conflict (user_id, lexeme_id) do nothing;

  -- Recoge lo vencido (las nuevas quedan due = now(), asi que entran solas).
  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb)
  into v_result
  from (
    select
      uc.id            as user_card_id,
      uc.mastery_level,
      uc.state,
      uc.reps,
      (uc.reps = 0)    as is_new,
      jsonb_build_object(
        'id',            l.id,
        'lemma',         l.lemma,
        'pos',           l.pos,
        'cefr',          l.cefr,
        'ipa',           l.ipa,
        'definition_en', l.definition_en,
        'definition_es', l.definition_es,
        'usage_note',    l.usage_note,
        'false_friend',  l.false_friend,
        'collocations',  l.collocations,
        'common_errors', l.common_errors
      ) as lexeme,
      case when ctx.id is null then null else
        jsonb_build_object(
          'id',             ctx.id,
          'text',           ctx.text,
          'gloss_es',       ctx.gloss_es,
          'level',          ctx.level,
          'cloze_start',    ctx.cloze_start,
          'cloze_end',      ctx.cloze_end,
          'distractors',    ctx.distractors,
          'native_variant', ctx.native_variant,
          'audio_url',      ctx.audio_url
        )
      end as context
    from public.user_cards uc
    join public.lexemes l on l.id = uc.lexeme_id
    left join lateral (
      -- El contexto cuya dificultad mas se acerca al nivel de dominio.
      select c.*
      from public.contexts c
      where c.lexeme_id = uc.lexeme_id
      order by abs(c.ord - uc.mastery_level), c.ord
      limit 1
    ) ctx on true
    where uc.user_id = p_user_id
      and uc.due <= now()
    order by uc.due
    limit greatest(p_due_limit, 0) + greatest(p_new_limit, 0)
  ) t;

  return v_result;
end;
$$;


-- ─── Aplica un repaso de forma atomica ────────────────────────────────
-- El calculo FSRS se hace en el Worker con ts-fsrs; aqui solo se
-- persiste el resultado junto con el log, en una sola transaccion.
create or replace function public.apply_review(
  p_user_id        uuid,
  p_user_card_id   bigint,
  p_grade          smallint,
  p_card_type      smallint,
  p_context_id     bigint,
  p_latency_ms     integer,
  p_state_before   jsonb,
  p_fsrs           jsonb,      -- {due,stability,difficulty,elapsed_days,scheduled_days,reps,lapses,state,last_review}
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


-- ─── Progreso del usuario ─────────────────────────────────────────────
-- La metrica que se muestra NO son puntos inventados: es la cobertura
-- real del ingles conversacional, sumando el aporte de cada palabra
-- que el usuario ya puede USAR (mastery_level >= 4).
create or replace function public.get_progress(p_user_id uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'words_seen',     (select count(*) from public.user_cards where user_id = p_user_id and reps > 0),
    'words_usable',   (select count(*) from public.user_cards where user_id = p_user_id and mastery_level >= 4),
    'coverage_pct',   (select coalesce(round(sum(l.coverage)::numeric, 1), 0)
                         from public.user_cards uc
                         join public.lexemes l on l.id = uc.lexeme_id
                        where uc.user_id = p_user_id and uc.mastery_level >= 4),
    'due_now',        (select count(*) from public.user_cards where user_id = p_user_id and due <= now()),
    'current_streak', (select current_streak from public.user_stats where user_id = p_user_id),
    'longest_streak', (select longest_streak from public.user_stats where user_id = p_user_id),
    'freezes_left',   (select freezes_left   from public.user_stats where user_id = p_user_id),
    'top_errors',     (select coalesce(jsonb_agg(e), '[]'::jsonb) from (
                         select tag, count(*) as n
                           from public.productions p,
                                jsonb_array_elements_text(p.verdict->'error_tags') as tag
                          where p.user_id = p_user_id
                          group by tag order by n desc limit 5
                       ) e)
  );
$$;


-- ─── Racha ────────────────────────────────────────────────────────────
-- Se llama solo al COMPLETAR la sesion diaria. Los juegos no la tocan:
-- si la racha se pudiera farmear con minijuegos, mediria adherencia en
-- vez de aprendizaje.
create or replace function public.record_study_day(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s        public.user_stats%rowtype;
  v_gap    integer;
  v_used   boolean := false;
begin
  select * into s from public.user_stats where user_id = p_user_id for update;
  if not found then
    insert into public.user_stats (user_id, current_streak, longest_streak, last_study_date)
    values (p_user_id, 1, 1, current_date)
    returning * into s;
    return jsonb_build_object('current_streak', 1, 'freeze_used', false);
  end if;

  -- Los congeladores se reponen cada mes.
  if date_trunc('month', s.freezes_reset) < date_trunc('month', current_date) then
    s.freezes_left  := 2;
    s.freezes_reset := current_date;
  end if;

  if s.last_study_date = current_date then
    -- Ya estudio hoy, no hay nada que hacer.
    null;
  else
    v_gap := case when s.last_study_date is null
                  then 999
                  else current_date - s.last_study_date end;

    if v_gap = 1 then
      s.current_streak := s.current_streak + 1;
    elsif v_gap > 1 and (v_gap - 1) <= s.freezes_left then
      -- Se gastan congeladores solos, sin pedirlo. Se avisa despues.
      s.freezes_left   := s.freezes_left - (v_gap - 1);
      s.current_streak := s.current_streak + 1;
      v_used := true;
    else
      s.current_streak := 1;
    end if;

    s.last_study_date := current_date;
    s.longest_streak  := greatest(s.longest_streak, s.current_streak);
  end if;

  update public.user_stats set
    current_streak = s.current_streak,
    longest_streak = s.longest_streak,
    freezes_left   = s.freezes_left,
    freezes_reset  = s.freezes_reset,
    last_study_date= s.last_study_date
  where user_id = p_user_id;

  return jsonb_build_object(
    'current_streak', s.current_streak,
    'longest_streak', s.longest_streak,
    'freezes_left',   s.freezes_left,
    'freeze_used',    v_used
  );
end;
$$;


-- ─── Penalizacion desde un juego ──────────────────────────────────────
-- Regla asimetrica que protege a FSRS: fallar en un minijuego ADELANTA
-- el repaso de esa palabra (es senal real de que no la sabes); acertar
-- NUNCA extiende el intervalo. Los juegos solo pueden empeorar tu
-- agenda, jamas mejorarla.
create or replace function public.penalize_from_game(
  p_user_id    uuid,
  p_lexeme_ids bigint[]
)
returns integer
language sql
security definer
set search_path = public
as $$
  with upd as (
    update public.user_cards
       set due = least(due, now() + interval '1 day')
     where user_id = p_user_id
       and lexeme_id = any(p_lexeme_ids)
       and due > now() + interval '1 day'
    returning 1
  )
  select count(*)::integer from upd;
$$;


-- ─── Cierre de permisos ───────────────────────────────────────────────
-- Estas funciones son SECURITY DEFINER y reciben p_user_id: solo el
-- Worker (service_role) puede invocarlas.
revoke all on function public.get_study_session(uuid, integer, integer)                                  from public, anon, authenticated;
revoke all on function public.apply_review(uuid, bigint, smallint, smallint, bigint, integer, jsonb, jsonb, smallint, smallint) from public, anon, authenticated;
revoke all on function public.get_progress(uuid)                                                          from public, anon, authenticated;
revoke all on function public.record_study_day(uuid)                                                      from public, anon, authenticated;
revoke all on function public.penalize_from_game(uuid, bigint[])                                          from public, anon, authenticated;
