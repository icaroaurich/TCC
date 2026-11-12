// Verifica a cada minuto se há posts cujo horário chegou e publica no Instagram.
const cron = require('node-cron');
const arm = require('./armazenamento');
const meta = require('./meta');

let rodando = false; // trava: não roda duas verificações ao mesmo tempo

function log(...args) {
  console.log(`[agendador ${new Date().toLocaleString('pt-BR')}]`, ...args);
}

async function verificar() {
  if (rodando) return;
  rodando = true;
  try {
    const agora = Date.now();
    const vencidos = arm.ler('posts').filter(
      (p) => p.status === 'agendado' && new Date(p.publicarEm).getTime() <= agora
    );
    for (const post of vencidos) await publicar(post);
  } catch (e) {
    log('falha inesperada:', e);
  } finally {
    rodando = false;
  }
}

async function publicar(post) {
  const atraso = Math.round((Date.now() - new Date(post.publicarEm).getTime()) / 60000);
  log(`publicando post ${post.id} (@${post.igUsername})${atraso > 1 ? `, atrasado ${atraso} min` : ''}`);

  // Marca como "publicando" antes de chamar a API, para não publicar duas vezes.
  alterarPost(post.id, { status: 'publicando' });

  try {
    const conta = arm.ler('contas').find((c) => c.igUserId === post.igUserId);
    if (!conta) throw new Error('Conta do Instagram não conectada. Entre com ela de novo.');
    if (conta.tokenExpiraEm && new Date(conta.tokenExpiraEm) < new Date()) {
      throw new Error('O acesso a esta conta venceu. Entre com ela de novo.');
    }

    const base = (process.env.PUBLIC_URL || '').replace(/\/+$/, '');
    if (!base.startsWith('https://')) {
      throw new Error('PUBLIC_URL não configurada (precisa ser https, ex.: túnel do cloudflared).');
    }

    const mediaId = await meta.publicarInstagram({
      igUserId: post.igUserId,
      token: conta.token,
      imageUrl: `${base}/uploads/${encodeURIComponent(post.imagem)}`,
      legenda: post.legenda,
    });
    alterarPost(post.id, { status: 'publicado', publicadoEm: new Date().toISOString(), mediaId, erro: null });
    log(`post ${post.id} publicado (media ${mediaId})`);
  } catch (e) {
    alterarPost(post.id, { status: 'erro', erro: e.message });
    log(`post ${post.id} falhou: ${e.message}`);
  }
}

function alterarPost(id, campos) {
  arm.atualizar('posts', (posts) => {
    const p = posts.find((x) => x.id === id);
    if (p) Object.assign(p, campos);
  });
}

// Avisa no log quando o acesso de alguma conta está perto de vencer
// (com a configuração "nunca expira" isso não acontece).
function avisarVencimentos() {
  for (const c of arm.ler('contas')) {
    if (!c.tokenExpiraEm) continue;
    const dias = Math.floor((new Date(c.tokenExpiraEm) - Date.now()) / 86400e3);
    if (dias <= 7) log(`atenção: o acesso de @${c.username} vence em ${dias} dia(s). Entre com ela de novo.`);
  }
}

function iniciar() {
  // Posts que ficaram "publicando" (servidor caiu no meio) voltam a ser tentados.
  arm.atualizar('posts', (posts) => {
    for (const p of posts) if (p.status === 'publicando') p.status = 'agendado';
  });
  cron.schedule('* * * * *', verificar);
  cron.schedule('0 9 * * *', avisarVencimentos); // todo dia às 9h
  log('iniciado: verificando a cada minuto');
  verificar(); // publica na hora o que venceu com o PC desligado
  avisarVencimentos();
}

module.exports = { iniciar, verificar, publicar };
