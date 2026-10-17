-- Observatório EFI · esquema do banco (Supabase / PostgreSQL)
-- Cole este arquivo inteiro no SQL Editor do Supabase e clique em Run.

create extension if not exists pgcrypto;

-- ============ PERFIS DE USUÁRIO ============
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  nome text not null default '',
  papel text not null default 'extensionista' check (papel in ('admin','coordenador','extensionista','parceiro')),
  status text not null default 'pendente' check (status in ('pendente','ativo','bloqueado')),
  created_at timestamptz not null default now()
);

-- ============ CONVITES ============
create table if not exists public.invites (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  papel text not null check (papel in ('coordenador','extensionista','parceiro')),
  token text not null unique default replace(gen_random_uuid()::text, '-', ''),
  created_by uuid default auth.uid(),
  expires_at timestamptz not null default now() + interval '7 days',
  used_at timestamptz,
  created_at timestamptz not null default now()
);

-- Cadastro SOMENTE POR CONVITE. A exceção é o primeiro administrador (e-mail abaixo), enquanto não existir nenhum.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare inv public.invites%rowtype;
begin
  if lower(new.email) = 'danilo.barbosa@ifgoiano.edu.br'
     and not exists (select 1 from public.profiles where papel = 'admin') then
    insert into public.profiles (id, email, nome, papel, status)
    values (new.id, new.email, coalesce(new.raw_user_meta_data->>'nome',''), 'admin', 'ativo');
    return new;
  end if;
  select * into inv from public.invites
   where token = new.raw_user_meta_data->>'invite' and lower(email) = lower(new.email)
     and used_at is null and expires_at > now()
   for update;
  if not found then raise exception 'Cadastro somente por convite'; end if;
  insert into public.profiles (id, email, nome, papel, status)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'nome',''), inv.papel, 'ativo');
  update public.invites set used_at = now() where id = inv.id;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Papel do usuário logado; vazio se não estiver ativo.
create or replace function public.my_papel() returns text
language sql stable security definer set search_path = public as $$
  select papel from public.profiles where id = auth.uid() and status = 'ativo'
$$;

-- ============ TABELAS DO PROJETO ============
create table if not exists public.schools (
  id uuid primary key default gen_random_uuid(),
  name text not null, ciclo int not null default 1 check (ciclo in (1,2)),
  ex boolean not null default false, created_at timestamptz not null default now()
);
create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  name text not null, ano int not null default 4,
  ex boolean not null default false, created_at timestamptz not null default now()
);
create table if not exists public.kids (            -- crianças identificadas apenas por código
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  class_id uuid not null references public.classes(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  consent boolean not null default false,
  pre numeric(4,2) check (pre between 0 and 10), pos numeric(4,2) check (pos between 0 and 10),
  ex boolean not null default false, created_at timestamptz not null default now()
);
create table if not exists public.people (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text not null check (role in ('professor','familia','extensionista','voluntario','gestor')),
  school_id uuid references public.schools(id) on delete set null,
  trained boolean not null default false,
  ex boolean not null default false, created_at timestamptz not null default now()
);
create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  ws int not null check (ws between 1 and 5), date date not null,
  present int not null check (present >= 0), enrolled int not null check (enrolled > 0),
  notes text not null default '', created_by uuid default auth.uid(),
  ex boolean not null default false, created_at timestamptz not null default now()
);
create table if not exists public.surveys (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('crianca','professor','familia')),
  rating int not null check (rating between 1 and 5),
  school_id uuid references public.schools(id) on delete set null,
  ex boolean not null default false, created_at timestamptz not null default now()
);
create table if not exists public.media (
  id uuid primary key default gen_random_uuid(),
  path text not null, kind text not null check (kind in ('image','video')),
  school_id uuid references public.schools(id) on delete set null,
  class_id uuid references public.classes(id) on delete set null,
  ws int, caption text not null default '', authorized boolean not null default false,
  date date, created_by uuid default auth.uid(),
  ex boolean not null default false, created_at timestamptz not null default now()
);
create table if not exists public.config (
  id int primary key default 1 check (id = 1),
  kit boolean not null default false, cartilha boolean not null default false
);
insert into public.config (id) values (1) on conflict do nothing;

-- ============ SEGURANÇA (RLS) ============
alter table public.profiles enable row level security;
drop policy if exists profiles_ler on public.profiles;
drop policy if exists profiles_admin on public.profiles;
create policy profiles_ler   on public.profiles for select using (id = auth.uid() or public.my_papel() = 'admin');
create policy profiles_admin on public.profiles for update using (public.my_papel() = 'admin') with check (public.my_papel() = 'admin');

do $$ declare t text; begin
  foreach t in array array['schools','classes','kids','people','sessions','surveys','config'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists ler on public.%I', t);
    execute format('create policy ler on public.%I for select using (public.my_papel() is not null)', t);
  end loop;
end $$;
alter table public.media enable row level security;

-- escolas, turmas, pessoas, configuração: administrador e coordenador
do $$ declare t text; begin
  foreach t in array array['schools','classes','people'] loop
    execute format('drop policy if exists gerir on public.%I', t);
    execute format($p$create policy gerir on public.%I for all
      using (public.my_papel() in ('admin','coordenador'))
      with check (public.my_papel() in ('admin','coordenador'))$p$, t);
  end loop;
end $$;
drop policy if exists gerir on public.config;
create policy gerir on public.config for all
  using (public.my_papel() in ('admin','coordenador')) with check (public.my_papel() in ('admin','coordenador'));

-- crianças, oficinas, pesquisas: extensionista também grava; só admin e coordenador apagam
do $$ declare t text; begin
  foreach t in array array['kids','sessions','surveys'] loop
    execute format('drop policy if exists gravar on public.%I', t);
    execute format('drop policy if exists editar on public.%I', t);
    execute format('drop policy if exists apagar on public.%I', t);
    execute format($p$create policy gravar on public.%I for insert
      with check (public.my_papel() in ('admin','coordenador','extensionista'))$p$, t);
    execute format($p$create policy editar on public.%I for update
      using (public.my_papel() in ('admin','coordenador','extensionista'))
      with check (public.my_papel() in ('admin','coordenador','extensionista'))$p$, t);
    execute format($p$create policy apagar on public.%I for delete
      using (public.my_papel() in ('admin','coordenador'))$p$, t);
  end loop;
end $$;

-- mídia: o parceiro só enxerga arquivos com autorização de imagem
drop policy if exists media_ler on public.media;
drop policy if exists media_gravar on public.media;
drop policy if exists media_gerir on public.media;
create policy media_ler on public.media for select
  using (public.my_papel() is not null and (public.my_papel() <> 'parceiro' or authorized));
create policy media_gravar on public.media for insert
  with check (public.my_papel() in ('admin','coordenador','extensionista'));
create policy media_gerir on public.media for update
  using (public.my_papel() in ('admin','coordenador')) with check (public.my_papel() in ('admin','coordenador'));
drop policy if exists media_apagar on public.media;
create policy media_apagar on public.media for delete using (public.my_papel() in ('admin','coordenador'));

-- ============ ARMAZENAMENTO DE FOTOS E VÍDEOS (privado) ============
insert into storage.buckets (id, name, public, file_size_limit)
values ('midia', 'midia', false, 52428800)
on conflict (id) do update set file_size_limit = excluded.file_size_limit;

drop policy if exists midia_ler on storage.objects;
drop policy if exists midia_enviar on storage.objects;
drop policy if exists midia_apagar on storage.objects;
create policy midia_ler on storage.objects for select using (
  bucket_id = 'midia' and public.my_papel() is not null and
  (public.my_papel() <> 'parceiro' or exists (select 1 from public.media m where m.path = name and m.authorized)));
create policy midia_enviar on storage.objects for insert with check (
  bucket_id = 'midia' and public.my_papel() in ('admin','coordenador','extensionista'));
create policy midia_apagar on storage.objects for delete using (
  bucket_id = 'midia' and public.my_papel() in ('admin','coordenador'));

-- ============ REGRAS DOS CONVITES ============
alter table public.invites enable row level security;
drop policy if exists inv_criar on public.invites;
drop policy if exists inv_ler on public.invites;
drop policy if exists inv_apagar on public.invites;
create policy inv_criar on public.invites for insert with check (
  public.my_papel() = 'admin' or (public.my_papel() = 'coordenador' and papel in ('extensionista','parceiro')));
create policy inv_ler on public.invites for select using (
  public.my_papel() = 'admin' or (public.my_papel() = 'coordenador' and created_by = auth.uid()));
create policy inv_apagar on public.invites for delete using (
  public.my_papel() = 'admin' or (public.my_papel() = 'coordenador' and created_by = auth.uid()));

-- Permite à página de cadastro mostrar e-mail e categoria do convite, sem expor mais nada.
create or replace function public.invite_info(p_token text) returns table (email text, papel text)
language sql stable security definer set search_path = public as $$
  select i.email, i.papel from public.invites i
   where i.token = p_token and i.used_at is null and i.expires_at > now()
$$;
grant execute on function public.invite_info(text) to anon, authenticated;
