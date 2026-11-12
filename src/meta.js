// Chamadas à API do Instagram com Unified Login (login com Instagram ou Facebook, sem Página).
// Docs: developers.facebook.com/documentation/instagram-platform/instagram-api-with-unified-login
const VERSAO = () => process.env.GRAPH_VERSION || 'v27.0';
const GRAPH = 'https://graph.facebook.com';

class ErroMeta extends Error {
  constructor(mensagem, detalhe) {
    super(mensagem);
    this.detalhe = detalhe;
  }
}

async function graph(metodo, caminho, params = {}) {
  const url = new URL(`${GRAPH}/${VERSAO()}${caminho}`);
  const opcoes = { method: metodo };
  if (metodo === 'GET') {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  } else {
    opcoes.body = new URLSearchParams(params);
  }
  const resp = await fetch(url, opcoes);
  const corpo = await resp.json().catch(() => ({}));
  if (!resp.ok || corpo.error) {
    const e = corpo.error || {};
    throw new ErroMeta(e.error_user_msg || e.message || `HTTP ${resp.status}`, corpo);
  }
  return corpo;
}

function urlRetorno() {
  return (process.env.PUBLIC_URL || '').replace(/\/+$/, '') + '/auth/instagram/callback';
}

// Tela de login da Meta. As permissões vêm da configuração (META_CONFIG_ID), não de "scope".
function urlLogin(state) {
  const url = new URL(`https://www.facebook.com/${VERSAO()}/dialog/oauth`);
  url.searchParams.set('client_id', process.env.META_APP_ID);
  url.searchParams.set('config_id', process.env.META_CONFIG_ID);
  url.searchParams.set('redirect_uri', urlRetorno());
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('state', state);
  return url.toString();
}

// Troca o código do login pelo token da integração (pertence ao portfólio empresarial do cliente).
// A validade depende do que foi escolhido na configuração (pode ser "nunca expira").
async function trocarCodigo(codigo) {
  const r = await graph('GET', '/oauth/access_token', {
    client_id: process.env.META_APP_ID,
    client_secret: process.env.META_APP_SECRET,
    redirect_uri: urlRetorno(),
    code: codigo,
  });
  return {
    token: r.access_token,
    expiraEm: r.expires_in ? new Date(Date.now() + r.expires_in * 1000).toISOString() : null,
  };
}

// Contas do Instagram que o cliente liberou para o app no login.
async function contasInstagram(token) {
  const r = await graph('GET', '/me/assigned_instagram_accounts', {
    fields: 'id,username,name,profile_picture_url',
    access_token: token,
  });
  return r.data || [];
}

// Cria um container (a mídia registrada no Instagram, ainda não publicada) e espera o
// Instagram terminar de baixar e processar. Devolve o id do container.
async function criarContainer(igUserId, token, params) {
  const container = await graph('POST', `/${igUserId}/media`, { ...params, access_token: token });
  for (let i = 0; i < 15; i++) {
    const s = await graph('GET', `/${container.id}`, { fields: 'status_code,status', access_token: token });
    if (s.status_code === 'FINISHED') return container.id;
    if (s.status_code === 'ERROR' || s.status_code === 'EXPIRED') {
      throw new ErroMeta(`Instagram recusou a imagem: ${s.status || s.status_code}`, s);
    }
    await new Promise((ok) => setTimeout(ok, 2000));
  }
  return container.id; // ainda processando: o media_publish devolve o erro, se houver
}

// Publica imagens já prontas. A API exige duas etapas: registrar (container) e publicar.
//  - tipo 'feed' com 1 imagem: post comum;
//  - tipo 'feed' com 2 a 10 imagens: carrossel (um container por imagem + um container CAROUSEL);
//  - tipo 'story': 1 imagem, sem legenda (Stories não têm legenda na API).
async function publicarInstagram({ igUserId, token, tipo = 'feed', imageUrls, legenda }) {
  let creationId;
  if (tipo === 'story') {
    creationId = await criarContainer(igUserId, token, { image_url: imageUrls[0], media_type: 'STORIES' });
  } else if (imageUrls.length === 1) {
    creationId = await criarContainer(igUserId, token, { image_url: imageUrls[0], caption: legenda || '' });
  } else {
    const filhos = [];
    for (const url of imageUrls) {
      filhos.push(await criarContainer(igUserId, token, { image_url: url, is_carousel_item: 'true' }));
    }
    creationId = await criarContainer(igUserId, token, {
      media_type: 'CAROUSEL',
      children: filhos.join(','),
      caption: legenda || '',
    });
  }

  const publicado = await graph('POST', `/${igUserId}/media_publish`, {
    creation_id: creationId,
    access_token: token,
  });
  return publicado.id;
}

module.exports = { urlLogin, urlRetorno, trocarCodigo, contasInstagram, publicarInstagram, ErroMeta };
