require('dotenv').config();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');

const arm = require('./src/armazenamento');
const meta = require('./src/meta');
const agendador = require('./src/agendador');

const app = express();
const PORT = process.env.PORT || 3000;
const UPLOADS = path.join(__dirname, 'uploads');
fs.mkdirSync(UPLOADS, { recursive: true });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOADS));

// ---------- Login com o Instagram ----------
// data/contas.json guarda uma lista de contas do Instagram conectadas (uma por empresa).

const statesPendentes = new Map(); // state -> criado em (proteção contra CSRF no retorno do login)

// Leva o usuário para a tela de login do Instagram.
app.get('/auth/instagram', (req, res) => {
  const falta = ['META_APP_ID', 'META_APP_SECRET', 'META_CONFIG_ID', 'PUBLIC_URL'].filter((v) => !process.env[v]);
  if (falta.length) return res.redirect('/index.html?erro=' + encodeURIComponent(`Configure no .env: ${falta.join(', ')}`));

  const state = crypto.randomBytes(16).toString('hex');
  statesPendentes.set(state, Date.now());
  for (const [s, t] of statesPendentes) if (Date.now() - t > 3600e3) statesPendentes.delete(s);
  res.redirect(meta.urlLogin(state));
});

// O Instagram volta para cá com ?code=... depois que o usuário autoriza.
app.get('/auth/instagram/callback', async (req, res) => {
  const voltar = (erro) => res.redirect('/index.html?erro=' + encodeURIComponent(erro));
  const { code, state, error_description, error_message } = req.query;

  if (error_description || error_message) return voltar('Login cancelado: ' + (error_description || error_message));
  if (!state || !statesPendentes.has(state)) return voltar('Login expirado. Tente de novo.');
  statesPendentes.delete(state);
  if (!code) return voltar('O Instagram não devolveu o código de login.');

  try {
    const { token, expiraEm } = await meta.trocarCodigo(code);
    const igs = await meta.contasInstagram(token);
    if (!igs.length) {
      return voltar('Nenhuma conta do Instagram foi liberada no login. Entre de novo e selecione a conta do Instagram.');
    }

    arm.atualizar('contas', (contas) => {
      for (const ig of igs) {
        const conta = {
          igUserId: String(ig.id),
          username: ig.username,
          nome: ig.name || ig.username,
          foto: ig.profile_picture_url || null,
          token,
          tokenExpiraEm: expiraEm,
          conectadaEm: new Date().toISOString(),
        };
        const i = contas.findIndex((c) => c.igUserId === conta.igUserId);
        if (i >= 0) contas[i] = conta;
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

// Contas conectadas, sem os tokens.
app.get('/api/contas', (req, res) => {
  res.json(arm.ler('contas').map(({ token, ...c }) => c));
});

// Desconecta uma conta (os posts dela continuam no arquivo, mas não serão publicados).
app.delete('/api/contas/:id', (req, res) => {
  arm.atualizar('contas', (contas) => {
    const i = contas.findIndex((c) => c.igUserId === req.params.id);
    if (i >= 0) contas.splice(i, 1);
  });
  res.json({ ok: true });
});

// ---------- Posts ----------

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
  upload.single('imagem')(req, res, (err) => {
    if (err) return res.status(400).json({ erro: err.message });
    const apagarImagem = () => req.file && fs.unlink(req.file.path, () => {});

    const { igUserId, legenda, publicarEm } = req.body;
    const conta = arm.ler('contas').find((c) => c.igUserId === igUserId);
    const quando = new Date(publicarEm);

    let erro = null;
    if (!req.file) erro = 'Escolha uma imagem.';
    else if (!conta) erro = 'Conta do Instagram inválida.';
    else if (isNaN(quando)) erro = 'Data/hora inválida.';
    else if (quando.getTime() < Date.now() - 60000) erro = 'A data/hora precisa ser no futuro.';
    else if ((legenda || '').length > 2200) erro = 'A legenda passa de 2200 caracteres (limite do Instagram).';
    if (erro) {
      apagarImagem();
      return res.status(400).json({ erro });
    }

    const post = {
      id: crypto.randomUUID(),
      igUserId,
      igUsername: conta.username,
      legenda: legenda || '',
      imagem: req.file.filename,
      nomeOriginal: req.file.originalname,
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
    .filter((p) => !req.query.ig || p.igUserId === req.query.ig)
    .sort((a, b) => a.publicarEm.localeCompare(b.publicarEm));
  res.json(posts);
});

// Cancela um post que ainda não foi publicado.
app.delete('/api/posts/:id', (req, res) => {
  const resultado = arm.atualizar('posts', (posts) => {
    const i = posts.findIndex((p) => p.id === req.params.id);
    if (i < 0) return 404;
    if (!['agendado', 'erro'].includes(posts[i].status)) return 409;
    const [removido] = posts.splice(i, 1);
    fs.unlink(path.join(UPLOADS, removido.imagem), () => {});
    return 200;
  });
  if (resultado === 404) return res.status(404).json({ erro: 'Post não encontrado' });
  if (resultado === 409) return res.status(409).json({ erro: 'Post já publicado ou em publicação' });
  res.json({ ok: true });
});

// Tenta de novo um post que deu erro (volta para "agendado" e publica em seguida se já venceu).
app.post('/api/posts/:id/tentar-novamente', (req, res) => {
  const ok = arm.atualizar('posts', (posts) => {
    const p = posts.find((x) => x.id === req.params.id && x.status === 'erro');
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
  if (!process.env.PUBLIC_URL) console.warn('Aviso: PUBLIC_URL vazia. Sem ela o login e a publicação no Instagram não funcionam.');
  else console.log(`Endereço público: ${process.env.PUBLIC_URL}`);
  console.log(`URL de retorno do login (cadastre no painel da Meta): ${meta.urlRetorno()}`);
  agendador.iniciar();
});
