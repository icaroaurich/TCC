require('dotenv').config();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');

const arm = require('./src/armazenamento');
const meta = require('./src/meta');
const agendador = require('./src/agendador');
const sessoes = require('./src/sessao');

const app = express();
const PORT = process.env.PORT || 3000;
// Mesma lógica de src/armazenamento.js: UPLOADS_DIR, ou <volume do Railway>/uploads, ou ./uploads.
const VOLUME = process.env.RAILWAY_VOLUME_MOUNT_PATH;
const UPLOADS = process.env.UPLOADS_DIR || (VOLUME ? path.join(VOLUME, 'uploads') : path.join(__dirname, 'uploads'));
fs.mkdirSync(UPLOADS, { recursive: true });

app.set('trust proxy', 1); // o Railway fica atrás de um proxy; sem isso req.secure sai falso e o cookie perde o "Secure"
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOADS)); // público: o Instagram baixa as imagens por aqui

// ---------- Login com o Instagram ----------
// data/contas.json guarda as contas do Instagram conectadas. Cada conta tem "sessoes": os navegadores
// (hash do cookie, veja src/sessao.js) que podem vê-la. Quem abre o site só vê as contas do próprio navegador.

const statesPendentes = new Map(); // state -> { sessao, criadoEm } (proteção contra CSRF no retorno do login)

// Leva o usuário para a tela de login do Instagram.
app.get('/auth/instagram', (req, res) => {
  const falta = ['META_APP_ID', 'META_APP_SECRET', 'META_CONFIG_ID', 'PUBLIC_URL'].filter((v) => !process.env[v]);
  if (falta.length) return res.redirect('/index.html?erro=' + encodeURIComponent(`Configure no .env: ${falta.join(', ')}`));

  const sessao = sessoes.garantirSessao(req, res);
  const state = crypto.randomBytes(16).toString('hex');
  statesPendentes.set(state, { sessao, criadoEm: Date.now() });
  for (const [s, v] of statesPendentes) if (Date.now() - v.criadoEm > 3600e3) statesPendentes.delete(s);
  res.redirect(meta.urlLogin(state));
});

// O Instagram volta para cá com ?code=... depois que o usuário autoriza.
app.get('/auth/instagram/callback', async (req, res) => {
  const voltar = (erro) => res.redirect('/index.html?erro=' + encodeURIComponent(erro));
  const { code, state, error_description, error_message } = req.query;

  if (error_description || error_message) return voltar('Login cancelado: ' + (error_description || error_message));
  const pendente = state && statesPendentes.get(state);
  if (!pendente) return voltar('Login expirado. Tente de novo.');
  statesPendentes.delete(state);
  // O login precisa terminar no mesmo navegador que começou.
  const sessao = sessoes.lerSessao(req);
  if (!sessao || sessao !== pendente.sessao) return voltar('Login iniciado em outro navegador. Tente de novo.');
  if (!code) return voltar('O Instagram não devolveu o código de login.');

  try {
    const { token, expiraEm } = await meta.trocarCodigo(code);
    const igs = await meta.contasInstagram(token);
    if (!igs.length) {
      return voltar('Nenhuma conta do Instagram foi liberada no login. Entre de novo e selecione a conta do Instagram.');
    }

    arm.atualizar('contas', (contas) => {
      for (const ig of igs) {
        const igUserId = String(ig.id);
        const anterior = contas.find((c) => c.igUserId === igUserId);
        const conta = {
          igUserId,
          username: ig.username,
          nome: ig.name || ig.username,
          foto: ig.profile_picture_url || null,
          token,
          tokenExpiraEm: expiraEm,
          conectadaEm: new Date().toISOString(),
          // Mantém os outros navegadores que já administravam a conta e acrescenta este.
          sessoes: [...new Set([...((anterior && anterior.sessoes) || []), sessao])],
        };
        if (anterior) contas[contas.indexOf(anterior)] = conta;
        else contas.push(conta);
      }
    });
    console.log(`conta(s) conectada(s): ${igs.map((ig) => '@' + ig.username).join(', ')}`);
    res.redirect('/painel.html');
  } catch (e) {
    console.error('login falhou:', e.message, JSON.stringify(e.detalhe || ''));
    voltar('Erro no login: ' + e.message);
  }
});

// Daqui para baixo, toda rota /api só responde para quem tem conta conectada neste navegador.
app.use('/api', sessoes.exigirConta);

// Contas deste navegador, sem os tokens e sem as sessões.
app.get('/api/contas', (req, res) => {
  res.json(req.contas.map(({ token, sessoes: _, ...c }) => c));
});

// Tira a conta deste navegador. Se ninguém mais administrar a conta, ela é removida
// (os posts continuam no arquivo, mas não serão publicados).
app.delete('/api/contas/:id', (req, res) => {
  if (!req.idsPermitidos.has(req.params.id)) return res.status(404).json({ erro: 'Conta não encontrada' });
  arm.atualizar('contas', (contas) => {
    const i = contas.findIndex((c) => c.igUserId === req.params.id);
    if (i < 0) return;
    contas[i].sessoes = (contas[i].sessoes || []).filter((s) => s !== req.sessao);
    if (!contas[i].sessoes.length) contas.splice(i, 1);
  });
  res.json({ ok: true });
});

// Sai: tira este navegador de todas as contas e apaga o cookie. As contas continuam no servidor
// (mesmo sem nenhum navegador), então os posts agendados continuam sendo publicados.
// Entrando de novo com o Instagram, a conta volta a aparecer com os posts.
app.post('/api/sair', (req, res) => {
  arm.atualizar('contas', (contas) => {
    for (const c of contas) c.sessoes = (c.sessoes || []).filter((s) => s !== req.sessao);
  });
  sessoes.apagarSessao(req, res);
  res.json({ ok: true });
});

// ---------- Posts ----------
// Cada post tem um tipo: "feed" (1 imagem = post comum; 2 a 10 = carrossel) ou "story" (1 imagem, sem legenda).
// A conversão de PNG para JPEG e os avisos de proporção são feitos no navegador (public/js/empresa.js).

const MAX_CARROSSEL = 10;
const imagensDoPost = (p) => p.imagens || [p.imagem]; // posts antigos tinham uma imagem só, em "imagem"

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOADS,
    filename: (req, file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(4).toString('hex')}.jpg`),
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'image/jpeg') cb(null, true);
    else cb(new Error('O Instagram só aceita imagem JPEG (.jpg).'));
  },
});

app.post('/api/posts', (req, res) => {
  upload.array('imagens', MAX_CARROSSEL)(req, res, (err) => {
    if (err && err.code === 'LIMIT_UNEXPECTED_FILE') err.message = `Escolha no máximo ${MAX_CARROSSEL} imagens.`;
    if (err) return res.status(400).json({ erro: err.message });
    const arquivos = req.files || [];
    const apagarImagens = () => arquivos.forEach((a) => fs.unlink(a.path, () => {}));

    const { igUserId, publicarEm } = req.body;
    const tipo = req.body.tipo === 'story' ? 'story' : 'feed';
    const legenda = tipo === 'story' ? '' : req.body.legenda || '';
    const conta = req.contas.find((c) => c.igUserId === igUserId); // só contas deste navegador
    const quando = new Date(publicarEm);

    let erro = null;
    if (!arquivos.length) erro = 'Escolha uma imagem.';
    else if (tipo === 'story' && arquivos.length > 1) erro = 'O Story aceita uma imagem só. Para várias imagens, use o Feed (carrossel).';
    else if (!conta) erro = 'Conta do Instagram inválida.';
    else if (isNaN(quando)) erro = 'Data/hora inválida.';
    else if (quando.getTime() < Date.now() - 60000) erro = 'A data/hora precisa ser no futuro.';
    else if (legenda.length > 2200) erro = 'A legenda passa de 2200 caracteres (limite do Instagram).';
    if (erro) {
      apagarImagens();
      return res.status(400).json({ erro });
    }

    const post = {
      id: crypto.randomUUID(),
      igUserId,
      igUsername: conta.username,
      tipo,
      legenda,
      imagens: arquivos.map((a) => a.filename),
      nomesOriginais: arquivos.map((a) => a.originalname),
      publicarEm: quando.toISOString(),
      status: 'agendado',
      criadoEm: new Date().toISOString(),
    };
    arm.atualizar('posts', (posts) => {
      posts.push(post);
    });
    res.status(201).json(post);
  });
});

app.get('/api/posts', (req, res) => {
  const posts = arm
    .ler('posts')
    .filter((p) => req.idsPermitidos.has(p.igUserId) && (!req.query.ig || p.igUserId === req.query.ig))
    .sort((a, b) => a.publicarEm.localeCompare(b.publicarEm));
  res.json(posts);
});

// Cancela um post que ainda não foi publicado.
app.delete('/api/posts/:id', (req, res) => {
  const resultado = arm.atualizar('posts', (posts) => {
    // Post de conta de outro navegador responde 404, para não revelar que ele existe.
    const i = posts.findIndex((p) => p.id === req.params.id && req.idsPermitidos.has(p.igUserId));
    if (i < 0) return 404;
    if (!['agendado', 'erro'].includes(posts[i].status)) return 409;
    const [removido] = posts.splice(i, 1);
    for (const nome of imagensDoPost(removido)) fs.unlink(path.join(UPLOADS, nome), () => {});
    return 200;
  });
  if (resultado === 404) return res.status(404).json({ erro: 'Post não encontrado' });
  if (resultado === 409) return res.status(409).json({ erro: 'Post já publicado ou em publicação' });
  res.json({ ok: true });
});

// Tenta de novo um post que deu erro (volta para "agendado" e publica em seguida se já venceu).
app.post('/api/posts/:id/tentar-novamente', (req, res) => {
  const ok = arm.atualizar('posts', (posts) => {
    const p = posts.find((x) => x.id === req.params.id && x.status === 'erro' && req.idsPermitidos.has(x.igUserId));
    if (p) {
      p.status = 'agendado';
      p.erro = null;
    }
    return !!p;
  });
  if (!ok) return res.status(404).json({ erro: 'Post com erro não encontrado' });
  agendador.verificar();
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`Servidor em http://localhost:${PORT}`);
  console.log(`Dados em ${arm.PASTA} | imagens em ${UPLOADS}`);
  if (!process.env.PUBLIC_URL) console.warn('Aviso: PUBLIC_URL vazia. Sem ela o login e a publicação no Instagram não funcionam.');
  else console.log(`Endereço público: ${process.env.PUBLIC_URL}`);
  console.log(`URL de retorno do login (cadastre no painel da Meta): ${meta.urlRetorno()}`);
  agendador.iniciar();
});
