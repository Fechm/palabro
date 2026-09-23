-- El Worker calcula FSRS con ts-fsrs, así que necesita el estado actual
-- de la tarjeta, no solo su contenido.
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
        'due',            uc.due,
        'stability',      uc.stability,
        'difficulty',     uc.difficulty,
        'elapsed_days',   uc.elapsed_days,
        'scheduled_days', uc.scheduled_days,
        'learning_steps', uc.learning_steps,
        'reps',           uc.reps,
        'lapses',         uc.lapses,
        'state',          uc.state,
        'last_review',    uc.last_review,
        'level_streak',   uc.level_streak
      ) as fsrs,
      jsonb_build_object(
        'id', l.id, 'lemma', l.lemma, 'pos', l.pos, 'cefr', l.cefr, 'ipa', l.ipa,
        'definition_en', l.definition_en, 'definition_es', l.definition_es,
        'usage_note', l.usage_note, 'false_friend', l.false_friend,
        'collocations', l.collocations, 'common_errors', l.common_errors
      ) as lexeme,
      case when ctx.id is null then null else
        jsonb_build_object(
          'id', ctx.id, 'text', ctx.text, 'gloss_es', ctx.gloss_es,
          'level', ctx.level, 'cloze_start', ctx.cloze_start, 'cloze_end', ctx.cloze_end,
          'distractors', ctx.distractors, 'native_variant', ctx.native_variant,
          'audio_url', ctx.audio_url
        )
      end as context
    from public.user_cards uc
    join public.lexemes l on l.id = uc.lexeme_id
    left join lateral (
      select c.* from public.contexts c
      where c.lexeme_id = uc.lexeme_id
      order by abs(c.ord - uc.mastery_level), c.ord
      limit 1
    ) ctx on true
    where uc.user_id = p_user_id and uc.due <= now()
    order by uc.due
    limit greatest(p_due_limit, 0) + greatest(p_new_limit, 0)
  ) t;

  return v_result;
end;
$$;

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

revoke all on function public.get_study_session(uuid, integer, integer) from public, anon, authenticated;
revoke all on function public.get_card_state(uuid, bigint)              from public, anon, authenticated;
revoke all on function public.productions_today(uuid)                   from public, anon, authenticated;
