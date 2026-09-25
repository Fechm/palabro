alter table public.lexemes add column if not exists audio_url text;
alter table public.user_stats add column if not exists tutorial_done boolean not null default false;

alter table public.game_sessions drop constraint if exists game_sessions_mode_check;
alter table public.game_sessions add constraint game_sessions_mode_check check (mode in (
  'speed_round','native_or_not','false_friend_hunt',
  'sentence_builder','collocation_chain','duel',
  'session_quiz','listening'));

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
  v_new_today integer;
begin
  select count(*) into v_new_today
  from public.user_cards
  where user_id = p_user_id and created_at >= date_trunc('day', now());

  insert into public.user_cards (user_id, lexeme_id, due)
  select p_user_id, l.id, now()
  from public.lexemes l
  where not exists (
    select 1 from public.user_cards uc
    where uc.user_id = p_user_id and uc.lexeme_id = l.id
  )
  order by l.freq_rank
  limit greatest(p_new_limit - v_new_today, 0)
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
        'collocations', l.collocations, 'common_errors', l.common_errors,
        'audio_url', l.audio_url
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

drop function if exists public.get_progress(uuid);

create or replace function public.get_progress(p_user_id uuid, p_tz text default 'America/Santiago')
returns jsonb
language sql
security definer
set search_path = public
as $$
  with today as (
    select date_trunc('day', now() at time zone p_tz) as local_midnight
  )
  select jsonb_build_object(
    'words_seen',     (select count(*) from public.user_cards where user_id = p_user_id and reps > 0),
    'words_usable',   (select count(*) from public.user_cards where user_id = p_user_id and mastery_level >= 4),
    'coverage_pct',   (select coalesce(round(sum(l.coverage)::numeric, 1), 0)
                         from public.user_cards uc
                         join public.lexemes l on l.id = uc.lexeme_id
                        where uc.user_id = p_user_id and uc.mastery_level >= 4),
    'due_now',        (select count(*) from public.user_cards where user_id = p_user_id and due <= now()),
    'due_tomorrow',   (select count(*) from public.user_cards, today
                        where user_id = p_user_id
                          and due >= (local_midnight + interval '1 day') at time zone p_tz
                          and due <  (local_midnight + interval '2 days') at time zone p_tz),
    'levels',         (select coalesce(jsonb_object_agg(mastery_level, n), '{}'::jsonb) from (
                         select mastery_level, count(*) as n from public.user_cards
                          where user_id = p_user_id and reps > 0
                          group by mastery_level
                       ) lv),
    'study_days',     (select coalesce(jsonb_agg(jsonb_build_object('day', to_char(d, 'YYYY-MM-DD'), 'n', n) order by d), '[]'::jsonb)
                         from (
                           select (r.reviewed_at at time zone p_tz)::date as d, count(*) as n
                             from public.reviews r
                             join public.user_cards uc on uc.id = r.user_card_id
                            where uc.user_id = p_user_id and r.reviewed_at >= now() - interval '36 days'
                            group by 1
                         ) sd),
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

create or replace function public.get_vocabulary(p_user_id uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(to_jsonb(v) - 'freq_rank' order by v.freq_rank), '[]'::jsonb)
  from (
    select l.id as lexeme_id, l.lemma, l.pos, l.cefr, l.definition_es, l.audio_url, l.freq_rank,
           uc.mastery_level, uc.due, ctx.text as example, ctx.gloss_es as example_es
      from public.user_cards uc
      join public.lexemes l on l.id = uc.lexeme_id
      left join lateral (
        select c.text, c.gloss_es from public.contexts c
         where c.lexeme_id = l.id
         order by c.ord
         limit 1
      ) ctx on true
     where uc.user_id = p_user_id and uc.reps > 0
  ) v;
$$;

revoke all on function public.get_study_session(uuid, integer, integer) from public, anon, authenticated;
revoke all on function public.get_progress(uuid, text) from public, anon, authenticated;
revoke all on function public.get_vocabulary(uuid) from public, anon, authenticated;
