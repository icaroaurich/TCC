// Um cartão por conta do Instagram conectada, com o resumo dos posts, e um cartão para conectar outra.
async function montar() {
  const [contas, posts] = await Promise.all([
    carregarContas(),
    fetch('/api/posts').then((r) => r.json()),
  ]);

  const contar = (id, status) => posts.filter((p) => p.igUserId === id && p.status === status).length;

  document.getElementById('contas').innerHTML =
    contas
      .map((c) => {
        const erros = contar(c.igUserId, 'erro');
        return `
      <div class="cartao conta" data-href="empresa.html?ig=${encodeURIComponent(c.igUserId)}">
        <div class="topo">
          ${avatar(c)}
          <div style="min-width:0">
            <div class="nome">${escapar(c.nome)}</div>
            <div class="muted small">@${escapar(c.username)}</div>
          </div>
        </div>
        <div class="numeros">
          <div><strong>${contar(c.igUserId, 'agendado')}</strong><span class="muted small">agendados</span></div>
          <div><strong>${contar(c.igUserId, 'publicado')}</strong><span class="muted small">publicados</span></div>
          ${erros ? `<div><strong style="color:var(--danger)">${erros}</strong><span class="muted small">com erro</span></div>` : ''}
        </div>
        <div class="rodape">
          <span class="small muted">${c.tokenExpiraEm ? 'Acesso até ' + new Date(c.tokenExpiraEm).toLocaleDateString('pt-BR') : 'Acesso sem vencimento'}</span>
          <button class="btn btn-texto perigo small" data-desconectar="${escapar(c.igUserId)}" data-nome="${escapar(c.username)}">Desconectar</button>
        </div>
      </div>`;
      })
      .join('') +
    `
      <a class="conta-nova" href="/auth/instagram">
        <div><div class="mais">+</div><div>Conectar outra conta</div></div>
      </a>`;
}

// Clique no cartão abre a conta; clique em "Desconectar" desconecta.
document.getElementById('contas').addEventListener('click', async (ev) => {
  const botao = ev.target.closest('[data-desconectar]');
  if (!botao) {
    const cartao = ev.target.closest('[data-href]');
    if (cartao) location.href = cartao.dataset.href;
    return;
  }
  if (!confirm(`Remover @${botao.dataset.nome} deste navegador?
Se ninguém mais administrar esta conta aqui, os posts agendados dela não serão publicados.`)) return;
  await fetch('/api/contas/' + encodeURIComponent(botao.dataset.desconectar), { method: 'DELETE' });
  montar();
});

montar();
