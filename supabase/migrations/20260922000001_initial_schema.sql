-- ═══════════════════════════════════════════════════════════════════════
--  Palabro — esquema inicial
--
--  Dos mitades bien separadas:
--    · CONTENIDO  — generado una vez, compartido por todos, solo lectura
--    · APRENDIZAJE — por usuario, protegido con RLS
--
--  Decision de diseno central: FSRS decide CUANDO aparece una tarjeta;
--  mastery_level decide QUE te pregunta. Son ejes ortogonales.
-- ═══════════════════════════════════════════════════════════════════════


-- ═══ CONTENIDO ════════════════════════════════════════════════════════

create table public.lexemes (
  id            bigserial primary key,
  lemma         text    not null,
  pos           text    not null check (pos in (
                  'noun','verb','adjective','adverb','preposition',
                  'conjunction','pronoun','determiner','phrase')),
  cefr          text    not null check (cefr in ('A1','A2','B1','B2','C1','C2')),
  freq_rank     integer not null,

  -- Aporte marginal de esta palabra a la cobertura del ingles hablado,
  -- en puntos porcentuales. Sumar los dominados da un numero REAL que
  -- mostrar al usuario: "cubres el 61% del ingles conversacional".
  coverage      real    not null default 0,

  ipa           text,
  definition_en text    not null,
  definition_es text    not null,
  usage_note    text,

  -- {"es_word": "actualmente", "warning": "NO significa 'actualmente'..."}
  false_friend  jsonb,

  collocations  text[]  not null default '{}',
  common_errors text[]  not null default '{}',

  created_at    timestamptz not null default now(),

  unique (lemma, pos)
);

comment on column public.lexemes.coverage is
  'Aporte marginal a la cobertura del ingles hablado, en puntos porcentuales.';

create index lexemes_freq_rank_idx on public.lexemes (freq_rank);
create index lexemes_cefr_idx      on public.lexemes (cefr);


create table public.contexts (
  id          bigserial primary key,
  lexeme_id   bigint  not null references public.lexemes(id) on delete cascade,

  text        text    not null,
  gloss_es    text    not null,

  -- CEFR de la FRASE, independiente del CEFR de la palabra: se puede
  -- ensenar una palabra C1 con una frase A2 (input comprensible).
  level       text    not null check (level in ('A1','A2','B1','B2','C1','C2')),

  -- Posicion de la palabra objetivo dentro de `text`, para el hueco (cloze).
  cloze_start integer not null,
  cloze_end   integer not null,

  distractors text[]  not null default '{}',

  -- Version "como lo diria un nativo", alimenta el juego ¿Nativo o no?
  native_variant text,

  audio_url   text,     -- se llena en fase 2 con TTS precomputado

  ord         smallint not null check (ord between 1 and 9),

  unique (lexeme_id, ord),
  check (cloze_end > cloze_start)
);

create index contexts_lexeme_idx on public.contexts (lexeme_id, ord);


-- ═══ APRENDIZAJE (por usuario) ════════════════════════════════════════

create table public.user_cards (
  id        bigserial primary key,
  user_id   uuid   not null references auth.users(id) on delete cascade,
  lexeme_id bigint not null references public.lexemes(id) on delete cascade,

  -- Estado FSRS (espejo exacto de la Card de ts-fsrs)
  due            timestamptz not null default now(),
  stability      real        not null default 0,
  difficulty     real        not null default 0,
  elapsed_days   integer     not null default 0,
  scheduled_days integer     not null default 0,
  reps           integer     not null default 0,
  lapses         integer     not null default 0,
  state          smallint    not null default 0
                   check (state between 0 and 3),  -- new/learning/review/relearning
  last_review    timestamptz,

  -- Capa pedagogica, ortogonal a FSRS
  mastery_level  smallint not null default 1 check (mastery_level between 1 and 5),
  level_streak   smallint not null default 0,

  created_at     timestamptz not null default now(),

  unique (user_id, lexeme_id)
);

create index user_cards_due_idx     on public.user_cards (user_id, due);
create index user_cards_mastery_idx on public.user_cards (user_id, mastery_level);


-- Log append-only. NUNCA se actualiza ni se borra.
-- `state_before` permite recalcular toda la historia si algun dia
-- cambiamos de version de FSRS u optimizamos parametros.
create table public.reviews (
  id           bigserial primary key,
  user_card_id bigint      not null references public.user_cards(id) on delete cascade,
  reviewed_at  timestamptz not null default now(),
  grade        smallint    not null check (grade between 1 and 4), -- again/hard/good/easy
  card_type    smallint    not null check (card_type between 1 and 5),
  context_id   bigint      references public.contexts(id) on delete set null,
  latency_ms   integer,
  state_before jsonb       not null
);

create index reviews_card_idx on public.reviews (user_card_id, reviewed_at desc);


-- Frases escritas por el usuario + veredicto del modelo.
-- Separada de `reviews` a proposito: es el corpus de errores reales.
create table public.productions (
  id         bigserial primary key,
  user_id    uuid   not null references auth.users(id) on delete cascade,
  lexeme_id  bigint not null references public.lexemes(id) on delete cascade,
  sentence   text   not null,
  verdict    jsonb  not null,
  model_used text   not null,
  created_at timestamptz not null default now()
);

create index productions_user_idx on public.productions (user_id, created_at desc);


-- ═══ JUEGO ════════════════════════════════════════════════════════════

-- Los juegos NO escriben en `reviews` ni alteran el schedule de FSRS.
-- Regla asimetrica: fallar en un juego puede ADELANTAR el `due` de una
-- palabra; acertar nunca lo extiende.
create table public.game_sessions (
  id          bigserial primary key,
  user_id     uuid     not null references auth.users(id) on delete cascade,
  mode        text     not null check (mode in (
                'speed_round','native_or_not','false_friend_hunt',
                'sentence_builder','collocation_chain','duel')),
  score       integer  not null,
  max_score   integer  not null,
  duration_ms integer,
  lexeme_ids  bigint[] not null default '{}',
  played_at   timestamptz not null default now()
);

create index game_sessions_user_idx on public.game_sessions (user_id, played_at desc);


create table public.user_stats (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  current_streak integer  not null default 0,
  longest_streak integer  not null default 0,
  -- Perder una racha de 60 dias por un viaje es la causa #1 de abandono.
  freezes_left   smallint not null default 2,
  freezes_reset  date     not null default current_date,
  last_study_date date,
  display_name   text
);


create table public.challenges (
  id         bigserial primary key,
  from_user  uuid     not null references auth.users(id) on delete cascade,
  to_user    uuid     not null references auth.users(id) on delete cascade,
  lexeme_ids bigint[] not null,
  from_score integer,
  to_score   integer,
  status     text     not null default 'pending'
               check (status in ('pending','accepted','completed','expired')),
  created_at timestamptz not null default now(),
  check (from_user <> to_user)
);

create index challenges_to_idx on public.challenges (to_user, status);


-- ═══ ROW LEVEL SECURITY ═══════════════════════════════════════════════
-- El repo es publico: cualquiera ve el esquema y la URL de Supabase.
-- La RLS es lo unico que separa eso de una filtracion.

alter table public.lexemes       enable row level security;
alter table public.contexts      enable row level security;
alter table public.user_cards    enable row level security;
alter table public.reviews       enable row level security;
alter table public.productions   enable row level security;
alter table public.game_sessions enable row level security;
alter table public.user_stats    enable row level security;
alter table public.challenges    enable row level security;

-- Contenido: lectura para usuarios autenticados, escritura solo service_role.
create policy "contenido legible por autenticados" on public.lexemes
  for select to authenticated using (true);
create policy "contenido legible por autenticados" on public.contexts
  for select to authenticated using (true);

-- Datos de usuario: cada quien ve y toca lo suyo, nada mas.
create policy "propias tarjetas" on public.user_cards
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "propios reviews" on public.reviews
  for select to authenticated
  using (exists (
    select 1 from public.user_cards c
    where c.id = reviews.user_card_id and c.user_id = auth.uid()
  ));

create policy "propias producciones" on public.productions
  for select to authenticated using (user_id = auth.uid());

create policy "propias partidas" on public.game_sessions
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "propias stats" on public.user_stats
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Los duelos los ven ambos lados.
create policy "duelos propios" on public.challenges
  for select to authenticated using (from_user = auth.uid() or to_user = auth.uid());
create policy "crear duelos" on public.challenges
  for insert to authenticated with check (from_user = auth.uid());
create policy "responder duelos" on public.challenges
  for update to authenticated using (to_user = auth.uid() or from_user = auth.uid());


-- ═══ TRIGGER: crear stats al registrarse ══════════════════════════════

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_stats (user_id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)))
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
