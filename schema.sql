-- =====================================================================
--  A Nossa Casa — base de dados (Supabase)
--  Colar tudo no SQL Editor do Supabase e carregar em "Run".
--  ANTES: trocar o email da Carolina na secção 5 (fim do ficheiro).
-- =====================================================================

-- 1) Quem pode entrar na casa
create table if not exists public.membros (
  email text primary key,
  nome  text not null
);

-- 2) Registos de todas as secções (compras, despesas, veículos, ...)
create table if not exists public.itens (
  id            uuid primary key default gen_random_uuid(),
  modulo        text not null,
  dados         jsonb not null default '{}'::jsonb,
  criado_por    text default (auth.jwt() ->> 'email'),
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists itens_modulo_idx on public.itens (modulo);

-- 3) Documentos (ementas de cada semana, ideias de pratos)
create table if not exists public.documentos (
  id            text primary key,
  dados         jsonb not null default '{}'::jsonb,
  atualizado_em timestamptz not null default now()
);

-- Atualiza a data de alteração automaticamente
create or replace function public.tocar_atualizado() returns trigger
language plpgsql as $$
begin
  new.atualizado_em := now();
  return new;
end $$;

drop trigger if exists itens_tocar on public.itens;
create trigger itens_tocar before update on public.itens
  for each row execute function public.tocar_atualizado();

drop trigger if exists documentos_tocar on public.documentos;
create trigger documentos_tocar before insert or update on public.documentos
  for each row execute function public.tocar_atualizado();

-- 4) Segurança: só quem tem login E está na lista de membros vê os dados
create or replace function public.e_membro() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.membros
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

alter table public.membros    enable row level security;
alter table public.itens      enable row level security;
alter table public.documentos enable row level security;

drop policy if exists "membros veem membros" on public.membros;
create policy "membros veem membros" on public.membros
  for select to authenticated using (public.e_membro());

drop policy if exists "membros gerem itens" on public.itens;
create policy "membros gerem itens" on public.itens
  for all to authenticated using (public.e_membro()) with check (public.e_membro());

drop policy if exists "membros gerem documentos" on public.documentos;
create policy "membros gerem documentos" on public.documentos
  for all to authenticated using (public.e_membro()) with check (public.e_membro());

-- Ninguém sem login tem acesso; quem tem login passa pelas regras acima
revoke all on public.membros, public.itens, public.documentos from anon;
grant select on public.membros to authenticated;
grant select, insert, update, delete on public.itens, public.documentos to authenticated;

-- 5) Membros da casa (emails em minúsculas)
--    Troca o email da Carolina pelo verdadeiro.
insert into public.membros (email, nome) values
  ('ricardoklr.iphone@gmail.com', 'Ricardo'),
  ('email.da.carolina@exemplo.com', 'Carolina')
on conflict (email) do update set nome = excluded.nome;

-- Mais tarde, para a Ema (descomentar, trocar o email e correr só esta linha):
-- insert into public.membros (email, nome) values ('email.da.ema@exemplo.com', 'Ema');
