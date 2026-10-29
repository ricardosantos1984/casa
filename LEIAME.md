# A Nossa Casa: guia de instalação

Aplicação da família com secções para ementas, compras, despesas, veículos, casa, família e médicos.

- **Páginas:** alojadas no GitHub Pages (grátis).
- **Login e dados:** guardados no Supabase (grátis).

Só quem tem conta **e** está na lista de membros consegue ver os dados.

> Os nomes dos menus do Supabase e do GitHub podem variar um pouco. Se algum botão não estiver exatamente onde o guia diz, procura um nome parecido.

---

## Antes de começar: experimentar sem instalar nada

Abre o `index.html` no browser. Com o `config.js` vazio, a aplicação arranca em **modo demonstração**. Tudo funciona, mas os dados ficam só nesse browser.

---

## Passo 1. Criar a conta e o projeto no Supabase

1. Vai a **supabase.com**, carrega em **Start your project** e entra com **Continue with GitHub**, usando a tua conta do GitHub.
2. Carrega em **New project**:
   - Nome: `casa`
   - Database Password: carrega em *Generate* e **guarda a senha num sítio seguro** (não vais precisar dela no dia a dia).
   - Region: uma região europeia, por exemplo *West EU (Ireland)* ou *Central EU (Frankfurt)*.
3. Carrega em **Create new project** e espera 1 a 2 minutos.

## Passo 2. Criar as tabelas e as regras de segurança

1. Abre o ficheiro `schema.sql` e, no fim, **troca `email.da.carolina@exemplo.com` pelo email verdadeiro da Carolina**. O do Ricardo já está preenchido com `ricardoklr.iphone@gmail.com`; troca-o se preferires usar outro.
2. No Supabase, abre **SQL Editor** no menu da esquerda e depois **New query**.
3. Cola o conteúdo todo do `schema.sql` e carrega em **Run**. Deve aparecer *Success*.

## Passo 3. Criar os utilizadores e fechar o registo

1. Vai a **Authentication → Sign In / Providers** (ou *Providers → Email*) e **desliga "Allow new users to sign up"**. Assim ninguém consegue criar conta sozinho.
2. Vai a **Authentication → Users → Add user → Create new user**:
   - Email: o teu (o mesmo que está no `schema.sql`)
   - Password: a tua senha
   - Marca **Auto Confirm User**
3. Repete para a Carolina, com uma senha provisória. Ela pode mudá-la depois no botão **Mudar senha**.

## Passo 4. Ligar a aplicação ao Supabase

1. No Supabase, carrega no botão **Connect** no topo do projeto, ou vai a **Project Settings → API Keys / Data API**.
2. Copia:
   - o **Project URL** (algo como `https://abcdefgh.supabase.co`);
   - a chave **publishable** (`sb_publishable_...`) ou, se só aparecer essa, a **anon public**.
3. Abre o `config.js` e cola os dois valores:
   ```js
   SUPABASE_URL: "https://abcdefgh.supabase.co",
   SUPABASE_KEY: "sb_publishable_xxxxxxxx",
   ```

> ⚠️ Usa **só** a chave publishable/anon. **Nunca** coloques a chave `service_role` nem a `secret`. Esta chave pública pode estar no site sem problema, porque quem protege os dados são as regras de segurança do passo 2 e o login.

## Passo 5. Publicar no GitHub Pages

1. Em **github.com**, cria um repositório novo (**New**):
   - Nome: `casa`
   - Visibilidade: **Public**. É o que o GitHub Pages grátis exige. O código não contém dados da família: os dados estão no Supabase, protegidos por login.
2. No repositório, carrega em **Add file → Upload files** e arrasta estes ficheiros: `index.html`, `styles.css`, `app.js` e `config.js`. Carrega em **Commit changes**.
   (O `schema.sql` e este `LEIAME.md` não são precisos no site.)
3. Vai a **Settings → Pages**:
   - Source: *Deploy from a branch*
   - Branch: `main`, pasta `/ (root)`
   - Carrega em **Save**.
4. Ao fim de 1 a 2 minutos, o site fica em **https://ricardosantos1984.github.io/casa/**

## Passo 6. Último acerto no Supabase (para o "Esqueci-me da senha")

Em **Authentication → URL Configuration**:

- **Site URL:** `https://ricardosantos1984.github.io/casa/`
- **Redirect URLs:** acrescenta o mesmo endereço.

## Passo 7. Trazer a ementa da página antiga

1. Na página antiga do menu, abre **Cópia de segurança (ideias e escolhas)** e copia o texto.
2. No site novo, vai a **Ementas → Importar da página antiga do menu**, cola o texto e carrega em **Importar**.

---

## Mais tarde: dar acesso à Ema

1. No **SQL Editor**, corre esta linha (com o email dela):
   ```sql
   insert into public.membros (email, nome) values ('email.da.ema@exemplo.com', 'Ema');
   ```
2. Em **Authentication → Users → Add user**, cria a conta dela com **Auto Confirm User**.

## Para tirar o acesso a alguém

Apaga a pessoa em **Authentication → Users** e corre:

```sql
delete from public.membros where email = 'email@exemplo.com';
```

## Atualizar o site

Sempre que houver ficheiros novos, faz **Add file → Upload files** no repositório e substitui os antigos. **Não substituas o `config.js`**, senão perdes a ligação ao Supabase.

## Coisas a saber

- **Plano gratuito do Supabase:** um projeto sem nenhuma utilização durante cerca de uma semana pode ser pausado. Basta entrar no painel do Supabase e carregar em *Restore*. Com uso normal da aplicação, isto não acontece.
- **Cópias de segurança:** no Supabase, em **Table Editor → itens / documentos**, podes exportar para CSV.
- **No telemóvel:** abre o site e escolhe **Adicionar ao ecrã principal**. Fica como uma app.
