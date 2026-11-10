-- =====================================================================
--  Chat do site pessoal (ricardosantos1984.github.io) → WhatsApp do Ricardo
--  Colar tudo no SQL Editor do Supabase e carregar em "Run". Pode correr-se
--  mais de uma vez sem problema.
--
--  Como funciona:
--   • Quem visita o site escreve no chat; a mensagem fica nesta tabela.
--   • O n8n (no PC do Ricardo) vê as mensagens novas a cada minuto e envia-as
--     para o WhatsApp do Ricardo com um código (ex: #a1b2).
--   • O Ricardo responde no WhatsApp com "#a1b2 resposta"; o n8n grava a
--     resposta aqui e o site mostra-a ao visitante.
--  Segurança:
--   • Os visitantes NÃO têm acesso à tabela: só às duas funções abaixo.
--     Cada conversa tem um identificador aleatório que só o browser do
--     visitante conhece, por isso ninguém lê conversas dos outros.
--   • Limites contra abusos: 8 mensagens por conversa em 10 minutos e
--     60 mensagens no total por hora; cada mensagem até 1000 caracteres.
--   • Só os adultos da app (incluindo a conta-robô do n8n) gerem a tabela.
--   • O n8n apaga as conversas com mais de 30 dias.
-- =====================================================================

create table if not exists public.chat_site (
  id         bigint generated always as identity primary key,
  conversa   uuid        not null,
  codigo     text        not null,
  de         text        not null check (de in ('visitante', 'ricardo')),
  nome       text,
  texto      text        not null check (char_length(texto) between 1 and 1000),
  criado_em  timestamptz not null default now(),
  avisado    boolean     not null default false
);
create index if not exists chat_site_conversa on public.chat_site (conversa, id);
create index if not exists chat_site_codigo   on public.chat_site (codigo, criado_em desc);
create index if not exists chat_site_novas    on public.chat_site (avisado) where avisado = false;

alter table public.chat_site enable row level security;
revoke all on public.chat_site from anon, authenticated;
grant select, insert, update, delete on public.chat_site to authenticated;

drop policy if exists "adultos gerem chat do site" on public.chat_site;
create policy "adultos gerem chat do site" on public.chat_site for all to authenticated
  using (public.e_adulto()) with check (public.e_adulto());

-- Enviar uma mensagem (visitante)
create or replace function public.chat_enviar(p_conversa uuid, p_texto text, p_nome text default null)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_txt  text := left(btrim(coalesce(p_texto, '')), 1000);
  v_nome text := left(btrim(coalesce(p_nome, '')), 60);
  v_cod  text;
begin
  if p_conversa is null or v_txt = '' then
    raise exception 'A mensagem está vazia.';
  end if;
  if (select count(*) from public.chat_site
        where conversa = p_conversa and de = 'visitante' and criado_em > now() - interval '10 minutes') >= 8 then
    raise exception 'Muitas mensagens seguidas. Espera uns minutos, por favor.';
  end if;
  if (select count(*) from public.chat_site
        where de = 'visitante' and criado_em > now() - interval '1 hour') >= 60 then
    raise exception 'O chat está muito ocupado. Tenta mais tarde, por favor.';
  end if;
  v_cod := substr(md5(p_conversa::text), 1, 4);
  insert into public.chat_site (conversa, codigo, de, nome, texto)
  values (p_conversa, v_cod, 'visitante', nullif(v_nome, ''), v_txt);
  return json_build_object('ok', true);
end;
$$;

-- Ler as mensagens de UMA conversa (só quem tem o identificador)
create or replace function public.chat_ler(p_conversa uuid, p_depois bigint default 0)
returns table (id bigint, de text, texto text, criado_em timestamptz)
language sql stable security definer set search_path = public as $$
  select c.id, c.de, c.texto, c.criado_em
  from public.chat_site c
  where c.conversa = p_conversa and c.id > coalesce(p_depois, 0)
  order by c.id
  limit 200;
$$;

revoke all on function public.chat_enviar(uuid, text, text) from public;
revoke all on function public.chat_ler(uuid, bigint) from public;
grant execute on function public.chat_enviar(uuid, text, text) to anon, authenticated;
grant execute on function public.chat_ler(uuid, bigint) to anon, authenticated;

-- Verificação: deve mostrar 0 linhas e nenhum erro
select count(*) as mensagens from public.chat_site;
