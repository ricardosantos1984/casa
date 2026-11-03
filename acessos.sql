-- =====================================================================
--  A Nossa Casa — acessos limitados para crianças (Ema)
--  Colar tudo no SQL Editor do Supabase e carregar em "Run". Pode correr-se
--  mais de uma vez sem problema.
--
--  Adultos (papel 'adulto', o normal): veem e mudam tudo, como até agora.
--  Crianças (papel 'crianca'): só veem as secções escolhidas pelos pais em
--  Gerir dados → Acessos da Ema. Mesmo nessas secções só podem:
--    • Compras: ver e acrescentar artigos (não riscam nem apagam)
--    • Tarefas: marcar as tarefas feitas
--    • Estudo: guardar o progresso das fichas
--    • a própria foto e as notificações do telemóvel
--  O resto é só de leitura. Estas regras estão na base de dados, por isso
--  valem mesmo que alguém mexa na app.
-- =====================================================================

-- 1) Papel e secções de cada membro
alter table public.membros add column if not exists papel  text   not null default 'adulto';
alter table public.membros add column if not exists secoes text[] not null default '{}';
alter table public.membros drop constraint if exists membros_papel_ok;
alter table public.membros add constraint membros_papel_ok check (papel in ('adulto', 'crianca'));

-- 2) Funções de apoio
create or replace function public.meu_email() returns text
language sql stable as $$ select lower(coalesce(auth.jwt() ->> 'email', '')) $$;

create or replace function public.e_adulto() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.membros where lower(email) = public.meu_email() and papel = 'adulto');
$$;

-- nome simplificado (ex: "Ema" → "ema"), igual ao que a app usa em foto-… e estudo-…
create or replace function public.meu_slug() returns text
language sql stable security definer set search_path = public as $$
  select regexp_replace(lower(translate(nome, 'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'aaaaaeeeeiiiiooooouuuucaaaaaeeeeiiiiooooouuuuc')), '[^a-z0-9]', '', 'g')
  from public.membros where lower(email) = public.meu_email();
$$;

-- a que secção da app pertence cada tipo de registo
create or replace function public.secao_do_modulo(m text) returns text
language sql immutable as $$
  select case
    when m = 'push' then 'todos'
    when m = 'compras' then 'compras'
    when m = 'despesas' then 'despesas'
    when m in ('veiculos', 'manutencoes') then 'veiculos'
    when m in ('contas', 'garantias', 'tarefas') then 'casa'
    when m in ('datas', 'documentos') then 'familia'
    when m like 'escola\_%' then 'escola'
    when m = 'fichas_carregadas' then 'estudo'
    when m in ('viagens', 'reservas', 'mala') then 'viagens'
    when m in ('ferias', 'aniversarios') then 'ferias'
    when m in ('consultas', 'contactos', 'saude') then 'medicos'
    when m in ('tarefas_familia', 'mealheiro') then 'tarefas'
    when m = 'despensa' then 'despensa'
    when m = 'contactos_uteis' then 'contactos'
    when m = 'leituras' then 'contadores'
    else null end;
$$;

create or replace function public.secao_do_documento(d text) returns text
language sql immutable as $$
  select case
    when d like 'foto-%' or d = 'push-config' then 'todos'
    when d like 'ementa-%' or d = 'ingredientes' then 'ementas'
    when d = 'horario-ema' then 'escola'
    when d like 'estudo-%' then 'estudo'
    when d like 'tarefas-%' or d = 'mesada' then 'tarefas'
    when d = 'orcamento' then 'despesas'
    else null end;
$$;

create or replace function public.pode_secao(s text) returns boolean
language sql stable security definer set search_path = public as $$
  select s is not null and exists (
    select 1 from public.membros
    where lower(email) = public.meu_email()
      and (papel = 'adulto' or s = 'todos' or s = any(secoes))
  );
$$;

-- 3) Regras dos registos (itens)
drop policy if exists "membros gerem itens" on public.itens;
drop policy if exists "itens ver" on public.itens;
drop policy if exists "itens criar" on public.itens;
drop policy if exists "itens mudar" on public.itens;
drop policy if exists "itens apagar" on public.itens;
create policy "itens ver" on public.itens for select to authenticated
  using (public.e_adulto() or public.pode_secao(public.secao_do_modulo(modulo)));
create policy "itens criar" on public.itens for insert to authenticated
  with check (public.e_adulto() or modulo = 'push' and public.e_membro()
              or modulo = 'compras' and public.pode_secao('compras'));
create policy "itens mudar" on public.itens for update to authenticated
  using (public.e_adulto() or modulo = 'push' and lower(criado_por) = public.meu_email())
  with check (public.e_adulto() or modulo = 'push' and lower(criado_por) = public.meu_email());
create policy "itens apagar" on public.itens for delete to authenticated
  using (public.e_adulto() or modulo = 'push' and lower(criado_por) = public.meu_email());

-- 4) Regras dos documentos (ementas, horário, progresso do estudo, …)
create or replace function public.crianca_pode_escrever(d text) returns boolean
language sql stable as $$
  select (d like 'tarefas-%' and public.pode_secao('tarefas'))
      or (d = 'estudo-' || public.meu_slug() and public.pode_secao('estudo'))
      or (d = 'foto-' || public.meu_slug() and public.e_membro());
$$;

drop policy if exists "membros gerem documentos" on public.documentos;
drop policy if exists "documentos ver" on public.documentos;
drop policy if exists "documentos criar" on public.documentos;
drop policy if exists "documentos mudar" on public.documentos;
drop policy if exists "documentos apagar" on public.documentos;
create policy "documentos ver" on public.documentos for select to authenticated
  using (public.e_adulto() or public.pode_secao(public.secao_do_documento(id)));
create policy "documentos criar" on public.documentos for insert to authenticated
  with check (public.e_adulto() or public.crianca_pode_escrever(id));
create policy "documentos mudar" on public.documentos for update to authenticated
  using (public.e_adulto() or public.crianca_pode_escrever(id))
  with check (public.e_adulto() or public.crianca_pode_escrever(id));
create policy "documentos apagar" on public.documentos for delete to authenticated
  using (public.e_adulto());

-- 5) Ficheiros anexos: crianças só abrem os das secções que podem ver; só adultos carregam/apagam
drop policy if exists "membros veem anexos" on storage.objects;
create policy "membros veem anexos" on storage.objects for select to authenticated
  using (bucket_id = 'anexos' and (public.e_adulto() or public.pode_secao(public.secao_do_modulo(split_part(name, '/', 1)))));
drop policy if exists "membros carregam anexos" on storage.objects;
create policy "membros carregam anexos" on storage.objects for insert to authenticated with check (bucket_id = 'anexos' and public.e_adulto());
drop policy if exists "membros alteram anexos" on storage.objects;
create policy "membros alteram anexos" on storage.objects for update to authenticated using (bucket_id = 'anexos' and public.e_adulto());
drop policy if exists "membros apagam anexos" on storage.objects;
create policy "membros apagam anexos" on storage.objects for delete to authenticated using (bucket_id = 'anexos' and public.e_adulto());

-- 6) Os pais podem mudar as secções das crianças a partir da app
drop policy if exists "adultos mudam acessos" on public.membros;
create policy "adultos mudam acessos" on public.membros for update to authenticated
  using (public.e_adulto() and papel = 'crianca') with check (public.e_adulto() and papel = 'crianca');
revoke update on public.membros from authenticated;
grant update (secoes) on public.membros to authenticated;

-- 7) A Ema passa a criança, com as secções combinadas
insert into public.membros (email, nome, papel, secoes)
values ('emasantoscardoso@gmail.com', 'Ema', 'crianca', array['ementas', 'compras', 'escola', 'estudo', 'tarefas', 'ferias'])
on conflict (email) do update set papel = 'crianca', secoes = excluded.secoes;

-- Verificação: deve mostrar a Ema como 'crianca' e os outros como 'adulto'
select nome, email, papel, secoes from public.membros order by papel, nome;
