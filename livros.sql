-- =====================================================================
--  Livros (ebooks) na app A Nossa Casa
--  Colar tudo no SQL Editor do Supabase e carregar em "Run".
--  Junta o tipo de registo "livros" à secção "livros", para que a Ema
--  (se tiver a secção Livros ligada nos acessos) possa ver e ler os livros.
--  Só os adultos carregam ou apagam livros. Pode correr-se mais de uma vez.
-- =====================================================================
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
    when m = 'livros' then 'livros'
    else null end;
$$;

-- Verificação: deve mostrar "livros"
select public.secao_do_modulo('livros') as secao;
