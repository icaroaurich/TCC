// Sessão por navegador: cada navegador que entra com o Instagram ganha um cookie "sessao"
// e só enxerga as contas conectadas por ele. Não há cadastro nem senha.
// Nos dados fica só o hash (sha256) do cookie, nunca o valor: quem ler o contas.json não consegue se passar por ninguém.
const crypto = require('crypto');
const arm = require('./armazenamento');

const NOME = 'sessao';
const UM_ANO = 365 * 24 * 3600;

const hash = (valor) => crypto.createHash('sha256').update(valor).digest('hex');

function lerCookie(req, nome) {
  for (const parte of (req.headers.cookie || '').split(';')) {
    const i = parte.indexOf('=');
    if (i > 0 && parte.slice(0, i).trim() === nome) return decodeURIComponent(parte.slice(i + 1).trim());
  }
  return null;
}

function gravarCookie(req, res, valor, maxAge) {
  const partes = [`${NOME}=${valor}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAge}`];
  if (req.secure) partes.push('Secure');
  res.append('Set-Cookie', partes.join('; '));
}

// Hash da sessão deste navegador, ou null se ele ainda não tem.
function lerSessao(req) {
  const valor = lerCookie(req, NOME);
  return valor && /^[0-9a-f]{64}$/.test(valor) ? hash(valor) : null;
}

// Cria a sessão (se ainda não existir) e devolve o hash.
function garantirSessao(req, res) {
  const atual = lerSessao(req);
  if (atual) return atual;
  const valor = crypto.randomBytes(32).toString('hex');
  gravarCookie(req, res, valor, UM_ANO);
  return hash(valor);
}

function apagarSessao(req, res) {
  gravarCookie(req, res, '', 0);
}

const contasDaSessao = (sessao) =>
  sessao ? arm.ler('contas').filter((c) => (c.sessoes || []).includes(sessao)) : [];

// Para as rotas /api que dependem de conta: sem sessão ou sem conta, responde 401.
// Deixa em req.sessao, req.contas e req.idsPermitidos (Set de igUserId) o que este navegador pode ver.
function exigirConta(req, res, next) {
  req.sessao = lerSessao(req);
  req.contas = contasDaSessao(req.sessao);
  if (!req.contas.length) return res.status(401).json({ erro: 'Entre com o Instagram para continuar.' });
  req.idsPermitidos = new Set(req.contas.map((c) => c.igUserId));
  next();
}

module.exports = { lerSessao, garantirSessao, apagarSessao, contasDaSessao, exigirConta };
