// Caixa: mesas com conta aberta, fechamento de conta e resumo do dia.
App.fecharConta = async function (mesa, aoFechar) {
  if (!App.loja) { try { await App.carregarCardapio(); } catch { /* segue sem o valor */ } }
  const { esc, brl } = App;
  const pedidos = App.pedidos.filter((p) => p.conta_id === mesa.conta_id);
  const pendentes = pedidos.filter((p) => ['novo', 'preparo', 'pronto'].includes(p.status));
  const ativos = pedidos.filter((p) => p.status !== 'cancelado');
  const itens = ativos.flatMap((p) => p.itens);
  const j = App.janela('Fechar conta · ' + mesa.nome, `
    <div>${window.Montador.linhas(itens)}</div>
    <div class="linha-total" data-acrescimo hidden style="font-size:14px;font-weight:600"><span>Acréscimo da maquininha</span><span>${brl(App.loja ? App.loja.taxa_cartao : 0)}</span></div>
    <div class="linha-total"><span>Total</span><span data-total>${brl(mesa.total)}</span></div>
    ${pendentes.length ? `<p class="erro">Atenção: ${pendentes.length} pedido(s) desta mesa ainda não foram servidos.</p>` : ''}
    <div class="campo"><span>Forma de pagamento</span><div class="chips" id="pag-conta">
      ${[['pix', 'Pix'], ['cartao', 'Cartão'], ['dinheiro', 'Dinheiro']].map(([v, n]) => `<button class="chip" aria-pressed="false" data-v="${v}">${n}</button>`).join('')}</div></div>
    <p class="erro" data-msg hidden></p>
    <button class="btn verde grande" data-confirmar disabled>Confirmar pagamento e liberar mesa</button>`);
  let pag = '';
  j.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.v) {
      pag = b.dataset.v;
      j.querySelectorAll('#pag-conta .chip').forEach((c) => c.setAttribute('aria-pressed', c.dataset.v === pag));
      j.querySelector('[data-confirmar]').disabled = false;
      const extra = pag === 'cartao' && App.loja ? Number(App.loja.taxa_cartao) || 0 : 0;
      j.querySelector('[data-acrescimo]').hidden = !extra;
      j.querySelector('[data-total]').textContent = brl(Number(mesa.total) + extra);
    } else if (b.hasAttribute('data-confirmar')) {
      b.disabled = true;
      try {
        const d = await App.api('/api/equipe/conta/' + mesa.conta_id + '/fechar', { pagamento: pag });
        j.fechar();
        App.toast(esc(mesa.nome) + ' fechada: ' + brl(d.total));
        App.atualizarPedidos();
        aoFechar && aoFechar();
      } catch (err) { const p = j.querySelector('[data-msg]'); p.textContent = err.message; p.hidden = false; b.disabled = false; }
    }
  });
};

App.views.caixa = {
  montar(el, params) {
    const { esc, brl } = App;
    const abas = (atual) => `<nav class="abas-admin" aria-label="Partes do caixa">${[['novo', 'Novo pedido'], ['contas', 'Contas e resumo do dia']].map(([a, n]) =>
      `<a class="chip aba-adm" href="#/caixa/${a}" aria-pressed="${atual === a}"${atual === a ? ' aria-current="page"' : ''}>${n}</a>`).join('')}</nav>`;
    if (params[0] !== 'contas') {
      el.innerHTML = `<div class="topo"><div><h1>Caixa</h1><p>Pedido feito no balcão ou por telefone. Vai direto para a cozinha.</p></div>${abas('novo')}</div><div id="balcao"></div>`;
      App.novoPedido(el.querySelector('#balcao'), {});
      return null;
    }
    let mesas = [], resumo = [];
    let ativo = true;
    const NOMES = { pix: 'Pix', cartao: 'Cartão', dinheiro: 'Dinheiro', 'em aberto': 'Em aberto' };

    async function carregar() {
      try {
        const [m, r] = await Promise.all([App.api('/api/equipe/mesas'), App.api('/api/equipe/caixa/resumo')]);
        mesas = m.mesas; resumo = r.hoje;
      } catch (e) { App.toast(e.message, true); }
    }

    function render() {
      if (!ativo) return;
      const abertas = mesas.filter((m) => m.conta_id);
      const totalDia = resumo.reduce((s, r) => s + Number(r.total), 0);
      el.innerHTML = `<div class="topo"><div><h1>Caixa</h1><p>Contas das mesas e movimento de hoje.</p></div>${abas('contas')}</div>
        <section class="cartao"><h2>Hoje</h2>
          <div class="rolagem"><table class="tabela"><thead><tr><th>Pagamento</th><th>Pedidos</th><th>Total</th></tr></thead><tbody>
          ${resumo.map((r) => `<tr><td>${NOMES[r.pagamento] || esc(r.pagamento)}</td><td>${r.pedidos}</td><td>${brl(r.total)}</td></tr>`).join('')}
          <tr><th>Total</th><th>${resumo.reduce((s, r) => s + r.pedidos, 0)}</th><th>${brl(totalDia)}</th></tr></tbody></table></div>
          <p class="nota">"Em aberto" são mesas ainda sem conta fechada e pedidos de balcão sem forma de pagamento marcada.</p>
        </section>
        <section class="cartao"><h2>Mesas com conta aberta (${abertas.length})</h2>
          ${abertas.length ? `<div class="rolagem"><table class="tabela"><thead><tr><th>Mesa</th><th>Aberta</th><th>Total</th><th></th></tr></thead><tbody>
          ${abertas.map((m) => `<tr><td><b>${esc(m.nome)}</b>${Number(m.aguardando) + Number(m.preparando) + Number(m.prontos) ? ' <span class="selo-off">pedido em andamento</span>' : ''}</td>
            <td>${App.tempo(m.aberta_em)}</td><td>${brl(m.total)}</td>
            <td><button class="btn verde" data-fechar="${m.id}">Fechar conta</button></td></tr>`).join('')}</tbody></table></div>` : '<p class="nota">Nenhuma mesa com conta aberta.</p>'}
        </section>`;
    }

    el.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-fechar]');
      if (!b) return;
      const m = mesas.find((x) => x.id === Number(b.dataset.fechar));
      App.fecharConta(m, async () => { await carregar(); render(); });
    });

    const parar = App.on(async () => { await carregar(); render(); });
    carregar().then(render);
    return () => { ativo = false; parar(); };
  },
};
