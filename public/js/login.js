// Tela de login: o botão leva para /auth/instagram (o servidor cuida do login com o Instagram).
const erro = new URLSearchParams(location.search).get('erro');
if (erro) {
  document.getElementById('mensagem').textContent = erro;
} else {
  // Se este navegador já tem conta conectada, vai direto para o painel.
  fetch('/api/contas')
    .then((r) => (r.ok ? r.json() : [])) // 401: nenhuma conta neste navegador
    .then((contas) => {
      if (contas.length) location.href = 'painel.html';
    })
    .catch(() => {
      document.getElementById('mensagem').textContent = 'Servidor não respondeu. Rode "npm start".';
    });
}
