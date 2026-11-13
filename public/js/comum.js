// Funções usadas pelo painel e pela tela da conta.

// Busca as contas do Instagram conectadas; se não houver nenhuma, volta para o login.
async function carregarContas() {
  const r = await fetch('/api/contas');
  const contas = r.ok ? await r.json() : []; // 401: este navegador não tem conta conectada
  if (!contas.length) {
    location.href = 'index.html';
    return new Promise(() => {}); // a página está saindo; não continua
  }
  return contas;
}

// Tira este navegador das contas (os posts agendados continuam sendo publicados) e volta ao login.
async function sair() {
  await fetch('/api/sair', { method: 'POST' }).catch(() => {});
  location.href = 'index.html';
}

// Foto da conta, ou as iniciais quando não houver foto.
function avatar(conta, classe = '') {
  if (conta.foto) return `<img class="avatar ${classe}" src="${escapar(conta.foto)}" alt="">`;
  const iniciais = (conta.nome || conta.username || '?').trim().slice(0, 1).toUpperCase();
  return `<span class="avatar ${classe}">${escapar(iniciais)}</span>`;
}

// "qua., 12 de nov. · 18:30"
function formatarData(iso) {
  const d = new Date(iso);
  const dia = d.toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' });
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return `${dia} · ${hora}`;
}

// "em 2 h", "há 5 min"
function tempoRelativo(iso) {
  const min = Math.round((new Date(iso) - Date.now()) / 60000);
  const abs = Math.abs(min);
  let texto;
  if (abs < 1) return 'agora';
  if (abs < 60) texto = `${abs} min`;
  else if (abs < 60 * 24) texto = `${Math.round(abs / 60)} h`;
  else texto = `${Math.round(abs / 1440)} dia(s)`;
  return min > 0 ? `em ${texto}` : `há ${texto}`;
}

function escapar(texto) {
  const div = document.createElement('div');
  div.textContent = texto ?? '';
  return div.innerHTML;
}
