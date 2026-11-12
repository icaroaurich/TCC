// Tela de uma conta do Instagram: agendar uma publicação e acompanhar as existentes.
const igUserId = new URLSearchParams(location.search).get('ig');
const form = document.getElementById('formPost');
const inputImagem = document.getElementById('imagem');
const area = document.getElementById('imagemArea');
const previa = document.getElementById('previa');
const legenda = document.getElementById('legenda');
const mensagem = document.getElementById('mensagem');
const lista = document.getElementById('lista');

const FILTROS = {
  proximas: (p) => p.status === 'agendado' || p.status === 'publicando',
  publicadas: (p) => p.status === 'publicado',
  erros: (p) => p.status === 'erro',
};
const VAZIO = {
  proximas: 'Nada agendado. Use o formulário ao lado para criar a primeira publicação.',
  publicadas: 'Nenhuma publicação feita ainda.',
  erros: 'Nenhum erro. 🎉',
};
const STATUS = { agendado: 'Agendado', publicando: 'Publicando…', publicado: 'Publicado', erro: 'Erro' };

let filtro = 'proximas';
let posts = [];

// ---------- Início ----------
carregarContas().then((contas) => {
  const conta = contas.find((c) => c.igUserId === igUserId);
  if (!conta) {
    location.href = 'painel.html';
    return;
  }
  document.title = `@${conta.username} · Aurich's Management`;
  document.getElementById('cabecalho').innerHTML = `
    ${avatar(conta, 'grande')}
    <div>
      <h1>${escapar(conta.nome)}</h1>
      <p class="muted" style="margin:2px 0 0">@${escapar(conta.username)}</p>
    </div>`;
  sugerirHorario();
  carregarPosts();
  setInterval(carregarPosts, 15000); // atualiza o status sozinho
});

// ---------- Formulário ----------
function mostrarMensagem(texto, tipo = '') {
  mensagem.textContent = texto;
  mensagem.className = 'aviso ' + tipo;
}

// Sugere "daqui a 1 hora" e impede escolher horário no passado.
function sugerirHorario() {
  const paraInput = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const campo = document.getElementById('publicarEm');
  const sugestao = new Date(Date.now() + 60 * 60000);
  sugestao.setMinutes(0, 0, 0);
  campo.value = paraInput(sugestao);
  campo.min = paraInput(new Date());
}

function mostrarPrevia(arquivo) {
  if (!arquivo) {
    previa.hidden = true;
    return;
  }
  if (arquivo.type !== 'image/jpeg') {
    inputImagem.value = '';
    previa.hidden = true;
    mostrarMensagem('O Instagram só aceita imagem JPEG (.jpg).', 'erro');
    return;
  }
  previa.src = URL.createObjectURL(arquivo);
  previa.hidden = false;
  mostrarMensagem('');
}

inputImagem.addEventListener('change', () => mostrarPrevia(inputImagem.files[0]));
['dragenter', 'dragover'].forEach((ev) => area.addEventListener(ev, () => area.classList.add('arrastando')));
['dragleave', 'drop'].forEach((ev) => area.addEventListener(ev, () => area.classList.remove('arrastando')));

legenda.addEventListener('input', () => {
  document.getElementById('contador').textContent = `${legenda.value.length} / 2200`;
});

form.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const quando = new Date(document.getElementById('publicarEm').value);
  if (quando < new Date()) return mostrarMensagem('Escolha um horário no futuro.', 'erro');

  const dados = new FormData(form);
  dados.set('igUserId', igUserId);
  dados.set('publicarEm', quando.toISOString()); // datetime-local vem sem fuso

  const botao = document.getElementById('botaoAgendar');
  botao.disabled = true;
  botao.textContent = 'Enviando…';
  try {
    const r = await fetch('/api/posts', { method: 'POST', body: dados });
    const resp = await r.json();
    if (!r.ok) return mostrarMensagem(resp.erro, 'erro');

    mostrarMensagem(`Agendado para ${formatarData(resp.publicarEm)}.`, 'ok');
    form.reset();
    previa.hidden = true;
    document.getElementById('contador').textContent = '0 / 2200';
    sugerirHorario();
    trocarFiltro('proximas');
    carregarPosts();
  } catch (e) {
    mostrarMensagem('Erro ao falar com o servidor: ' + e.message, 'erro');
  } finally {
    botao.disabled = false;
    botao.textContent = 'Agendar publicação';
  }
});

// ---------- Lista ----------
document.getElementById('abas').addEventListener('click', (ev) => {
  const botao = ev.target.closest('[data-filtro]');
  if (botao) trocarFiltro(botao.dataset.filtro);
});

function trocarFiltro(novo) {
  filtro = novo;
  for (const b of document.querySelectorAll('#abas button')) b.classList.toggle('ativa', b.dataset.filtro === filtro);
  desenhar();
}

async function carregarPosts() {
  posts = await (await fetch('/api/posts?ig=' + encodeURIComponent(igUserId))).json();
  desenhar();
}

function desenhar() {
  for (const b of document.querySelectorAll('#abas button')) {
    const n = posts.filter(FILTROS[b.dataset.filtro]).length;
    b.querySelector('.qtd').textContent = n ? `(${n})` : '';
  }

  let itens = posts.filter(FILTROS[filtro]);
  if (filtro !== 'proximas') itens = itens.reverse(); // mais recentes primeiro
  if (!itens.length) {
    lista.innerHTML = `<div class="vazio">${VAZIO[filtro]}</div>`;
    return;
  }

  lista.innerHTML = itens
    .map((p) => {
      const data = p.status === 'publicado' && p.publicadoEm ? p.publicadoEm : p.publicarEm;
      let acoes = '';
      if (p.status === 'agendado') acoes = `<button class="btn btn-texto perigo small" data-acao="cancelar" data-id="${p.id}">Cancelar</button>`;
      if (p.status === 'erro')
        acoes = `<button class="btn btn-texto small" data-acao="tentar" data-id="${p.id}">Tentar de novo</button>
                 <button class="btn btn-texto perigo small" data-acao="cancelar" data-id="${p.id}">Excluir</button>`;
      return `
      <article class="cartao post">
        <img src="/uploads/${encodeURIComponent(p.imagem)}" alt="" loading="lazy">
        <div>
          <div class="quando">${formatarData(data)} <span class="muted small">· ${tempoRelativo(data)}</span></div>
          <p class="legenda">${escapar(p.legenda) || '<em>Sem legenda</em>'}</p>
          <span class="selo ${p.status}">${STATUS[p.status] || escapar(p.status)}</span>
          ${p.erro ? `<p class="erro">${escapar(p.erro)}</p>` : ''}
        </div>
        <div class="acoes">${acoes}</div>
      </article>`;
    })
    .join('');
}

lista.addEventListener('click', async (ev) => {
  const botao = ev.target.closest('[data-acao]');
  if (!botao) return;
  const id = botao.dataset.id;
  if (botao.dataset.acao === 'cancelar') {
    if (!confirm('Remover esta publicação?')) return;
    const r = await fetch('/api/posts/' + id, { method: 'DELETE' });
    if (!r.ok) alert((await r.json()).erro);
  } else {
    await fetch(`/api/posts/${id}/tentar-novamente`, { method: 'POST' });
  }
  carregarPosts();
});
