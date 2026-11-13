// Tela de uma conta do Instagram: agendar uma publicação e acompanhar as existentes.
const igUserId = new URLSearchParams(location.search).get('ig');
const form = document.getElementById('formPost');
const inputImagem = document.getElementById('imagem');
const area = document.getElementById('imagemArea');
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

// ---------- Imagens: conversão PNG → JPG e avisos de proporção ----------
// O Instagram só aceita JPEG. PNG é convertido aqui no navegador (fundo branco no lugar da transparência).
const MAX_IMAGENS = 10;
const MAX_BYTES = 8 * 1024 * 1024; // mesmo limite do servidor
const IDEAL = {
  feed: { razao: 4 / 5, tamanho: '1080×1350' },
  story: { razao: 9 / 16, tamanho: '1080×1920' },
};
const TOLERANCIA = 0.01; // diferença de proporção que ainda conta como "igual"

let selecionadas = []; // { blob, nome, url, largura, altura, convertida }

const tipoAtual = () => form.querySelector('input[name="tipo"]:checked').value;

function carregarImagem(url) {
  return new Promise((ok, falha) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => falha(new Error('não foi possível abrir a imagem'));
    img.src = url;
  });
}

async function prepararArquivo(arquivo) {
  const url = URL.createObjectURL(arquivo);
  const img = await carregarImagem(url);
  const item = { blob: arquivo, nome: arquivo.name, url, largura: img.naturalWidth, altura: img.naturalHeight, convertida: false };
  if (arquivo.type === 'image/png') {
    const canvas = document.createElement('canvas');
    canvas.width = item.largura;
    canvas.height = item.altura;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    item.blob = await new Promise((ok) => canvas.toBlob(ok, 'image/jpeg', 0.92));
    item.nome = arquivo.name.replace(/\.png$/i, '') + '.jpg';
    item.convertida = true;
    URL.revokeObjectURL(url);
    item.url = URL.createObjectURL(item.blob);
  }
  return item;
}

async function adicionarArquivos(arquivos) {
  mostrarMensagem('');
  const recusadas = [];
  for (const arquivo of arquivos) {
    if (selecionadas.length >= MAX_IMAGENS) {
      recusadas.push(`limite de ${MAX_IMAGENS} imagens atingido`);
      break;
    }
    if (!['image/jpeg', 'image/png'].includes(arquivo.type)) {
      recusadas.push(`${arquivo.name}: use JPG ou PNG`);
      continue;
    }
    try {
      const item = await prepararArquivo(arquivo);
      if (item.blob.size > MAX_BYTES) {
        URL.revokeObjectURL(item.url);
        recusadas.push(`${arquivo.name}: passa de 8 MB`);
        continue;
      }
      selecionadas.push(item);
    } catch (e) {
      recusadas.push(`${arquivo.name}: ${e.message}`);
    }
  }
  if (recusadas.length) mostrarMensagem('Imagens não adicionadas: ' + recusadas.join('; ') + '.', 'erro');
  atualizarImagens();
}

function removerImagem(i) {
  URL.revokeObjectURL(selecionadas[i].url);
  selecionadas.splice(i, 1);
  atualizarImagens();
}

function limparImagens() {
  selecionadas.forEach((s) => URL.revokeObjectURL(s.url));
  selecionadas = [];
  atualizarImagens();
}

// Avisos: conversões, proporção fora do ideal e regras do tipo escolhido.
function calcularAlertas() {
  const tipo = tipoAtual();
  const ideal = IDEAL[tipo];
  const alertas = [];
  const varias = selecionadas.length > 1;

  if (tipo === 'story' && varias) {
    alertas.push({
      nivel: 'erro',
      texto: `O Story aceita uma imagem só. Remova ${selecionadas.length - 1} imagem(ns) ou escolha Feed para fazer um carrossel.`,
    });
  }

  selecionadas.forEach((s, i) => {
    const rotulo = varias ? `A imagem ${i + 1}` : 'A imagem';
    if (s.convertida) alertas.push({ nivel: 'info', texto: `${rotulo} (${s.nome}) foi convertida de PNG para JPG.` });

    const razao = s.largura / s.altura;
    if (Math.abs(razao - ideal.razao) <= TOLERANCIA) return;
    const medida = `${s.largura}×${s.altura}`;
    let texto;
    if (tipo === 'story') {
      texto = `${rotulo} (${medida}) não está em 9:16 e não vai ficar enquadrada no Story: o Instagram corta ou preenche as bordas.`;
    } else if (razao < ideal.razao) {
      texto = `${rotulo} (${medida}) é mais alta que 4:5 e vai ficar cortada em cima e embaixo no feed.`;
    } else if (razao > 1.91) {
      texto = `${rotulo} (${medida}) é mais larga que 1.91:1 e vai ficar cortada nas laterais no feed.`;
    } else {
      texto = `${rotulo} (${medida}) não está em 4:5 e pode aparecer cortada no feed ou na grade do perfil.`;
    }
    alertas.push({ nivel: 'alerta', texto: `${texto} Ideal: ${ideal.tamanho}.` });
  });

  if (tipo === 'feed' && varias) {
    const primeira = selecionadas[0].largura / selecionadas[0].altura;
    if (selecionadas.some((s) => Math.abs(s.largura / s.altura - primeira) > TOLERANCIA)) {
      alertas.push({
        nivel: 'alerta',
        texto: 'No carrossel, o Instagram usa a proporção da primeira imagem e corta as outras para ficarem iguais.',
      });
    }
  }
  return alertas;
}

function atualizarImagens() {
  const tipo = tipoAtual();
  document.getElementById('campoLegenda').hidden = tipo === 'story';
  document.getElementById('dicaFormato').textContent =
    tipo === 'story'
      ? 'Clique ou arraste aqui · JPG ou PNG · 1 imagem'
      : `Clique ou arraste aqui · JPG ou PNG · até ${MAX_IMAGENS} (carrossel)`;
  area.classList.toggle('compacta', selecionadas.length > 0);

  document.getElementById('miniaturas').innerHTML = selecionadas
    .map(
      (s, i) => `
      <figure class="miniatura">
        <img src="${s.url}" alt="">
        ${selecionadas.length > 1 ? `<span class="ordem">${i + 1}</span>` : ''}
        <button type="button" class="remover" data-remover="${i}" aria-label="Remover imagem ${i + 1}">×</button>
      </figure>`
    )
    .join('');

  document.getElementById('alertas').innerHTML = calcularAlertas()
    .map((a) => `<li class="${a.nivel}">${escapar(a.texto)}</li>`)
    .join('');
}

inputImagem.addEventListener('change', () => {
  adicionarArquivos([...inputImagem.files]);
  inputImagem.value = ''; // permite escolher o mesmo arquivo de novo
});
document.getElementById('miniaturas').addEventListener('click', (ev) => {
  const botao = ev.target.closest('[data-remover]');
  if (botao) removerImagem(Number(botao.dataset.remover));
});
document.getElementById('tipos').addEventListener('change', atualizarImagens);
['dragenter', 'dragover'].forEach((ev) => area.addEventListener(ev, () => area.classList.add('arrastando')));
['dragleave', 'drop'].forEach((ev) => area.addEventListener(ev, () => area.classList.remove('arrastando')));

legenda.addEventListener('input', () => {
  document.getElementById('contador').textContent = `${legenda.value.length} / 2200`;
});

form.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const tipo = tipoAtual();
  if (!selecionadas.length) return mostrarMensagem('Escolha uma imagem.', 'erro');
  if (tipo === 'story' && selecionadas.length > 1) return mostrarMensagem('O Story aceita uma imagem só.', 'erro');
  const quando = new Date(document.getElementById('publicarEm').value);
  if (quando < new Date()) return mostrarMensagem('Escolha um horário no futuro.', 'erro');

  const dados = new FormData(form);
  dados.set('igUserId', igUserId);
  dados.set('publicarEm', quando.toISOString()); // datetime-local vem sem fuso
  if (tipo === 'story') dados.delete('legenda');
  for (const s of selecionadas) dados.append('imagens', s.blob, s.nome);

  const botao = document.getElementById('botaoAgendar');
  botao.disabled = true;
  botao.textContent = 'Enviando…';
  try {
    const r = await fetch('/api/posts', { method: 'POST', body: dados });
    const resp = await r.json();
    if (!r.ok) return mostrarMensagem(resp.erro, 'erro');

    const convertidas = selecionadas.filter((s) => s.convertida).length;
    const extra = convertidas ? ` ${convertidas} imagem(ns) convertida(s) de PNG para JPG.` : '';
    mostrarMensagem(`${rotuloTipo(resp)} agendado para ${formatarData(resp.publicarEm)}.${extra}`, 'ok');
    form.reset();
    limparImagens();
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

// "Story", "Carrossel (3)" ou "Post".
function rotuloTipo(p) {
  if (p.tipo === 'story') return 'Story';
  const n = (p.imagens || [p.imagem]).length;
  return n > 1 ? `Carrossel (${n})` : 'Post';
}

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
  const r = await fetch('/api/posts?ig=' + encodeURIComponent(igUserId));
  if (r.status === 401) return (location.href = 'index.html'); // saiu em outra aba
  posts = await r.json();
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
        <img src="/uploads/${encodeURIComponent((p.imagens || [p.imagem])[0])}" alt="" loading="lazy">
        <div>
          <div class="quando">${formatarData(data)} <span class="muted small">· ${tempoRelativo(data)}</span></div>
          ${p.tipo === 'story' ? '' : `<p class="legenda">${escapar(p.legenda) || '<em>Sem legenda</em>'}</p>`}
          <span class="selo tipo">${rotuloTipo(p)}</span>
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
