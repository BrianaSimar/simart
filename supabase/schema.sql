-- =====================================================================
-- Simart · Esquema de base de datos (Supabase / PostgreSQL)
--
-- Cómo usarlo: en Supabase, abre SQL Editor → New query, pega todo este
-- archivo y pulsa Run. Se puede ejecutar varias veces sin romper nada.
--
-- Seguridad: Row Level Security (RLS) activado en todas las tablas.
-- Cada usuario solo puede leer y escribir sus propias filas.
-- Las contraseñas las gestiona Supabase Auth (cifradas); nunca se
-- guardan en estas tablas.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Perfil del usuario: nombre de usuario, idiomas, nivel y progreso
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  username    text not null unique
              check (username ~ '^[A-Za-z0-9_.]{3,24}$'),
  native      text,                                   -- idioma materno (es, en, pt, ...)
  variant     text check (variant in ('ES', 'LA')),   -- variante de español: España o Latinoamérica
  target      text,                                   -- idioma que estudia
  level       smallint not null default 0 check (level between 0 and 5),  -- 0 = A1 … 5 = C2
  xp          integer  not null default 0 check (xp >= 0),
  streak      jsonb    not null default '{"days": 0, "last": null}'::jsonb,
  looked      jsonb    not null default '[]'::jsonb,  -- palabras ya consultadas (para no repetir XP)
  prefs       jsonb    not null default '{}'::jsonb,  -- velocidad de voz, tamaño de letra, etc.
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Búsqueda de nombre de usuario sin distinguir mayúsculas
create unique index if not exists profiles_username_lower_idx
  on public.profiles (lower(username));

-- ---------------------------------------------------------------------
-- 2. Secciones de práctica (mazos del futuro juego de repaso)
-- ---------------------------------------------------------------------
create table if not exists public.decks (
  user_id     uuid not null references auth.users (id) on delete cascade,
  id          text not null,
  name        text not null check (char_length(name) between 1 and 40),
  created_at  timestamptz not null default now(),
  primary key (user_id, id)
);

-- ---------------------------------------------------------------------
-- 3. Vocabulario guardado
-- ---------------------------------------------------------------------
create table if not exists public.vocab_items (
  user_id     uuid not null references auth.users (id) on delete cascade,
  id          text not null,             -- "<idioma>:<palabra>", p. ej. "en:rabbit"
  lang        text not null,
  key         text not null,
  surface     text,
  deck        text not null,
  ipa         text,
  translation text,
  pos         text,
  context     text,
  book        text,
  saved_at    timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists vocab_items_user_deck_idx on public.vocab_items (user_id, deck);

-- ---------------------------------------------------------------------
-- 4. Libros / capítulos terminados
-- ---------------------------------------------------------------------
create table if not exists public.finished_books (
  user_id     uuid not null references auth.users (id) on delete cascade,
  book_id     text not null,
  finished_at timestamptz not null default now(),
  primary key (user_id, book_id)
);

-- ---------------------------------------------------------------------
-- 5. Seguridad por fila (RLS)
-- ---------------------------------------------------------------------
alter table public.profiles       enable row level security;
alter table public.decks          enable row level security;
alter table public.vocab_items    enable row level security;
alter table public.finished_books enable row level security;

drop policy if exists "profiles: own row" on public.profiles;
create policy "profiles: own row" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "decks: own rows" on public.decks;
create policy "decks: own rows" on public.decks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "vocab: own rows" on public.vocab_items;
create policy "vocab: own rows" on public.vocab_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "finished: own rows" on public.finished_books;
create policy "finished: own rows" on public.finished_books
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------
-- 6. Al registrarse: crear el perfil y las secciones por defecto
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, username)
  values (new.id, new.raw_user_meta_data ->> 'username');

  insert into public.decks (user_id, id, name) values
    (new.id, 'unknown', 'No las conozco'),
    (new.id, 'sound',   'Pronunciación difícil'),
    (new.id, 'later',   'Repasar más tarde');

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- 7. Comprobar si un nombre de usuario está libre (antes de registrarse)
-- ---------------------------------------------------------------------
create or replace function public.username_available(candidate text)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select not exists (
    select 1 from public.profiles where lower(username) = lower(candidate)
  );
$$;

grant execute on function public.username_available(text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 8. Mantener updated_at al día
-- ---------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- 9. Caché de audio de las voces naturales (función "tts")
--    Bucket privado: solo la función (con la service role) lee y escribe.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('tts-cache', 'tts-cache', false)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- 10. Que la API de Supabase vea los cambios al momento
-- ---------------------------------------------------------------------
notify pgrst, 'reload schema';
