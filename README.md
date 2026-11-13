# Aurich's Management

Agenda publicações no Instagram. Você entra com a conta do Instagram, escolhe uma imagem pronta, a legenda, a data e a hora, e o sistema publica sozinho no horário marcado. Ele usa a **API do Instagram com Unified Login**: o cliente entra com o Instagram (ou com o Facebook) e não precisa de Página do Facebook.

Roda em `localhost` (com o PC ligado) ou hospedado no **Railway** (veja [Hospedagem no Railway](#hospedagem-no-railway)). Os dados ficam em `data/*.json` e as imagens em `uploads/`.

## Pré-requisitos (uma vez só)

1. **Node.js 18+**
   ```bash
   winget install OpenJS.NodeJS.LTS
   ```
2. **Conta do Instagram Profissional** (Empresa ou Criador). No app do Instagram: Configurações > Tipo de conta e ferramentas > Mudar para conta profissional.
3. **cloudflared**, o túnel https que o Instagram usa para voltar do login e baixar as imagens:
   ```bash
   winget install Cloudflare.cloudflared
   ```
4. **App da Meta** em [developers.facebook.com/apps](https://developers.facebook.com/apps). O app precisa pertencer a um **portfólio empresarial** e usar o **Login do Facebook para Empresas**:
   - em **Configurações do app > Básico**, copie o **ID do Aplicativo** e a **Chave Secreta do Aplicativo** para `META_APP_ID` e `META_APP_SECRET` no `.env`;
   - em **Casos de uso > API do Instagram > API setup with Unified login**, siga os passos da tela. Na configuração, use como **Redirect URL** `<PUBLIC_URL>/auth/instagram/callback` (o servidor mostra o endereço exato ao iniciar), inclua as permissões `instagram_basic`, `instagram_content_publish` e `business_management`, e de preferência escolha o token **sem vencimento**. Copie o **ID da configuração** para `META_CONFIG_ID`;
   - convide a conta do Instagram como **Testador do Instagram** (em "Generate access tokens" > "Add account") e aceite o convite no Instagram pela web, em Configurações > Convites de testador. Em modo desenvolvimento, só contas com função no app conseguem entrar.

## Rodando

```bash
npm install
```

```bash
cloudflared tunnel --url http://localhost:3000
```

Cole a URL `https://xxxx.trycloudflare.com` em `PUBLIC_URL` no `.env` (copie de `.env.example` se o `.env` não existir). Depois, em outro terminal:

```bash
npm start
```

Abra http://localhost:3000 e clique em **Entrar com Instagram**. Para conectar outra empresa, use o card **"+ Entrar com Instagram"** no painel.

> A URL do `cloudflared` muda toda vez que ele é reiniciado. Quando isso acontecer, atualize o `PUBLIC_URL` no `.env`, troque a Redirect URL na configuração do Unified login e reinicie o `npm start`.

## Hospedagem no Railway

O Railway mantém o servidor ligado o tempo todo, então o agendador funciona sem o PC. Não precisa de Docker: ele detecta o `package.json` e roda `npm start`.

1. **Serviço:** no painel do Railway, crie um projeto a partir do repositório do GitHub. Cada `git push` na `main` faz um novo deploy.
2. **Volume (obrigatório):** no serviço, clique com o botão direito > **Attach Volume** e use o mount path `/dados`. Sem volume, as contas, os agendamentos e as imagens somem a cada deploy. Com ele, o servidor grava em `/dados/data` e `/dados/uploads` sozinho (pela variável `RAILWAY_VOLUME_MOUNT_PATH`, que o Railway preenche).
3. **Domínio:** em **Settings > Networking**, clique em **Generate Domain**. Vai sair algo como `https://tcc-production.up.railway.app`.
4. **Variáveis:** na aba **Variables**, cadastre `META_APP_ID`, `META_APP_SECRET`, `META_CONFIG_ID`, `GRAPH_VERSION` e `PUBLIC_URL` (o domínio do passo 3, sem barra no final). Não cadastre `PORT`: o Railway define sozinho. Opcional: `TZ=America/Sao_Paulo`, para os logs saírem no horário de Brasília.
5. **Meta:** na configuração do Unified login, troque a Redirect URL para `<PUBLIC_URL>/auth/instagram/callback`. O endereço exato aparece no log do deploy.

Com o domínio fixo do Railway, não precisa mais do `cloudflared`.

## Sessões e acesso de outras pessoas

**Cada navegador vê só as próprias contas.** Ao clicar em **Entrar com Instagram**, o navegador ganha um cookie `sessao` (HttpOnly, válido por 1 ano). As contas conectadas ali ficam ligadas a esse cookie. No servidor, `data/contas.json` guarda só o hash dele, no campo `sessoes`. Não há cadastro nem senha. Em outro navegador ou celular, basta entrar com o Instagram de novo. Duas pessoas podem administrar a mesma conta, cada uma no próprio navegador.

- **Sair** (no topo): tira o navegador das contas. As contas continuam no servidor, e os posts agendados continuam sendo publicados.
- **Desconectar** (no cartão da conta): tira a conta deste navegador. Se nenhum outro navegador administrar a conta, ela é apagada e os posts dela não são mais publicados.
- Toda rota `/api` responde 401 para quem não tem conta conectada no navegador, e 404 para posts de contas de outros navegadores. A pasta `/uploads` continua pública, porque o Instagram baixa as imagens por ela.

**Liberar para outras pessoas.** Enquanto o app da Meta estiver em **modo desenvolvimento**, só quem tem função no app consegue entrar:

- **Para testes e para a banca:** em developers.facebook.com > seu app > **Funções do app**, adicione a pessoa como **Testador do Instagram** (ou Desenvolvedor). Ela aceita o convite e passa a conseguir conectar a própria conta.
- **Para qualquer pessoa (modo Live):**
  - faça a **verificação da empresa** no portfólio empresarial;
  - peça o **App Review** com **acesso avançado** às permissões `instagram_basic`, `instagram_content_publish` e `business_management`, enviando um vídeo do sistema em uso e instruções de teste;
  - em **Configurações do app > Básico**, preencha a **URL da Política de Privacidade** com `<PUBLIC_URL>/privacidade.html` e as **Instruções de exclusão de dados** com `<PUBLIC_URL>/exclusao-de-dados.html`.

  Antes de enviar, troque `[e-mail de contato]` nas duas páginas.

## Como funciona

- **Login:** `/auth/instagram` leva para a tela de login da Meta (Instagram ou Facebook). Na volta (`/auth/instagram/callback`), o servidor troca o código pelo token da integração, busca as contas do Instagram liberadas (`/me/assigned_instagram_accounts`) e guarda em `data/contas.json`.
- **Tipos de publicação:** **Feed** com 1 imagem (post) ou de 2 a 10 (carrossel), e **Story** com 1 imagem (sem legenda, porque a API não aceita legenda em Stories).
- **Imagens:** o Instagram só aceita JPEG. Uma imagem PNG é convertida para JPG no navegador, e a tela avisa. A tela também avisa quando a proporção foge do ideal: **4:5 (1080×1350) no Feed**, que corta imagens mais altas, e **9:16 (1080×1920) no Story**. No carrossel, todas as imagens seguem a proporção da primeira.
- **Disparo:** a cada minuto, `src/agendador.js` publica os posts cujo horário chegou. São duas chamadas: `/{ig-user}/media` registra a imagem e `/{ig-user}/media_publish` publica. No carrossel, cada imagem vira um container (`is_carousel_item`), e um container `CAROUSEL` junta todos antes de publicar. No Story, o container usa `media_type=STORIES`. Se o PC estava desligado no horário, o post sai assim que o servidor subir.
- **Token:** a validade é a escolhida na configuração do Unified login. Com "nunca expira", não precisa renovar. Se tiver vencimento, o log avisa 7 dias antes e é só entrar de novo com a conta.
- **Erros** (túnel desligado, imagem recusada etc.): o status vira **Erro**, com a mensagem na tela e o botão **Tentar de novo**.

## Estrutura

| Caminho | O que é |
|---|---|
| `server.js` | servidor Express, login (Unified Login) e rotas `/api` |
| `src/meta.js` | chamadas à API do Instagram |
| `src/agendador.js` | disparo dos posts na hora certa e aviso de vencimento do acesso |
| `src/armazenamento.js` | leitura e gravação dos arquivos JSON |
| `public/` | telas (login, painel, empresa) |
| `doc/` | texto do TCC |
