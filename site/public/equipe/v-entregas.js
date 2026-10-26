// Entregador: recebe as entregas liberadas pelo painel de pedidos, vê o que levar (maquininha, troco) e confirma o pagamento na entrega.
(function () {
  const { esc, brl } = App;
  const PAG = { pix: 'Pix', cartao: 'Cartão', dinheiro: 'Dinheiro' };

  // o que o entregador precisa levar para receber
  function levar(p) {
    if (p.pagamento === 'cartao') return `<div class="levar cartao">Levar a <b>maquininha</b> · cobrar ${brl(p.total)} no cartão</div>`;
    if (p.pagamento === 'dinheiro') {
      const troco = p.troco_para ? Number(p.troco_para) - Number(p.total) : 0;
      return troco > 0
        ? `<div class="levar dinheiro">Levar <b>troco de ${brl(troco)}</b> · cliente paga com ${brl(p.troco_para)}</div>`
        : `<div class="levar dinheiro">Receber <b>${brl(p.total)} em dinheiro</b> · sem troco</div>`;
    }
    if (p.pagamento === 'pix') {
      return p.pix_status === 'confirmado'
        ? '<div class="levar pago"><b>Pix já pago</b> · não cobrar</div>'
        : `<div class="levar pix">Pix <b>ainda não confirmado</b> · conferir com o cliente (${brl(p.total)})</div>`;
    }
    return `<div class="levar">Cobrar ${brl(p.total)}</div>`;
  }

  // janela "entregue e pago": confirma como o cliente pagou de fato
  App.confirmarEntrega = async function (p, aoTerminar) {
    if (!App.loja) { try { await App.carregarCardapio(); } catch { /* segue sem o acréscimo */ } }
    const taxa = App.loja ? Number(App.loja.taxa_cartao) || 0 : 0;
    const base = Number(p.total) - Number(p.acrescimo_cartao || 0);
    const valor = (forma) => base + (forma === 'cartao' ? taxa : 0);
    const j = App.janela('Entregar pedido #' + p.id, `<div style="display:flex;flex-direction:column;gap:12px">
      ${levar(p)}
      <div class="campo"><span>Como o cliente pagou?</span><div class="chips" data-formas>
        ${['dinheiro', 'cartao', 'pix'].map((f) => `<button type="button" class="chip" aria-pressed="${p.pagamento === f}" data-forma="${f}">${PAG[f]} · ${brl(valor(f))}</button>`).join('')}
      </div><small>Se o cliente mudou a forma de pagamento na hora, escolha a que ele usou.</small></div>
      <p class="erro" data-msg hidden></p>
      <button type="button" class="btn verde grande" data-ok>Entregue e pagamento recebido</button></div>`);
    let forma = p.pagamento || '';
    j.addEventListener('click', async (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.forma) {
        forma = b.dataset.forma;
        j.querySelectorAll('[data-forma]').forEach((x) => x.setAttribute('aria-pressed', x.dataset.forma === forma));
      } else if (b.hasAttribute('data-ok')) {
        const msg = j.querySelector('[data-msg]');
        if (!forma) { msg.textContent = 'Escolha como o cliente pagou.'; msg.hidden = false; return; }
        b.disabled = true;
        try {
          await App.api('/api/equipe/pedido/' + p.id + '/entregar', { pagamento: forma });
          j.fechar(); App.toast('Pedido #' + p.id + ' entregue e pago'); App.atualizarPedidos();
          aoTerminar && aoTerminar();
        } catch (err) { msg.textContent = err.message; msg.hidden = false; b.disabled = false; }
      }
    });
  };

  // janela "saiu para entrega": escolher quem leva (painel de pedidos)
  App.escolherEntregador = async function (p) {
    let lista = [];
    try { lista = (await App.api('/api/equipe/entregadores')).entregadores; } catch (e) { App.toast(e.message, true); return; }
    const j = App.janela('Quem vai levar o pedido #' + p.id + '?', `<div class="acoes" style="flex-direction:column;align-items:stretch">
      ${lista.map((e) => `<button class="btn verde grande" data-ent="${e.id}">${esc(e.nome)}</button>`).join('')}
      <button class="btn grande" data-ent="">${lista.length ? 'Outra pessoa / sem cadastro' : 'Saiu para entrega'}</button>
      ${lista.length ? '' : '<p class="nota">Cadastre os entregadores em Administração › Equipe com a seção Entregador.</p>'}</div>`);
    j.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-ent]');
      if (!b) return;
      b.disabled = true;
      try { await App.api('/api/equipe/pedido/' + p.id + '/status', { status: 'saiu', entregador_id: b.dataset.ent || null }); j.fechar(); }
      catch (err) { App.toast(err.message, true); b.disabled = false; }
      App.atualizarPedidos();
    });
  };

  App.views.entregas = {
    montar(el) {
      if (!App.loja) App.carregarCardapio().catch(() => {});
      function cartao(p, minha) {
        // com a localização do GPS do cliente o mapa vai no ponto exato; sem ela, procura pelo endereço
        const mapa = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(p.localizacao ? p.localizacao.lat + ',' + p.localizacao.lng : p.endereco || '');
        return `<article class="pedido entrega-card">
          <div class="pedido-topo"><b>#${p.id}</b><span>${App.tempo(p.pronto_em || p.criado_em)}</span></div>
          <div class="cliente"><strong>${esc(p.cliente_nome || 'Cliente')}</strong>
            ${p.endereco ? `<a class="endereco" href="${mapa}" target="_blank" rel="noopener">${esc(p.endereco)}</a>` : ''}
            ${p.localizacao ? '<span class="selo-cliente">📍 Com localização do GPS</span>' : ''}</div>
          ${levar(p)}
          <details><summary>${((n) => n + (n === 1 ? ' item' : ' itens'))((p.itens || []).reduce((s, i) => s + i.qtd, 0))} · ${brl(p.total)}</summary>${window.Montador.linhas(p.itens || [])}</details>
          ${p.observacoes ? `<div class="obs"><b>Obs.:</b> ${esc(p.observacoes)}</div>` : ''}
          <div class="acoes">
            ${minha
              ? `<button class="btn verde grande" data-entregar="${p.id}">Entregue e pago</button>
                 ${p.endereco || p.localizacao ? `<a class="btn" href="${mapa}" target="_blank" rel="noopener">Abrir no mapa</a>` : ''}
                 ${p.cliente_telefone ? `<a class="btn" href="https://wa.me/${esc(p.cliente_telefone)}" target="_blank" rel="noopener">WhatsApp</a>` : ''}`
              : '<p class="nota">Aguardando o atendente liberar a saída pelo painel de pedidos.</p>'}
          </div></article>`;
      }
      function render(mudaram) {
        // toca quando o painel de pedidos manda uma entrega para este entregador
        if (mudaram && mudaram.some((m) => m.para === 'saiu' && App.pedidos.find((p) => p.id === m.id && p.entregador_id === App.usuario.id))) App.bip(2);
        const minhas = App.pedidos.filter((p) => p.tipo === 'entrega' && p.status === 'saiu' && p.entregador_id === App.usuario.id);
        const prontos = App.pedidos.filter((p) => p.tipo === 'entrega' && p.status === 'pronto');
        const feitas = App.pedidos.filter((p) => p.tipo === 'entrega' && p.status === 'entregue' && p.entregador_id === App.usuario.id);
        const recebido = (f) => feitas.filter((p) => p.pagamento === f).reduce((s, p) => s + Number(p.total), 0);
        el.innerHTML = `<div class="topo"><div><h1>Entregas</h1><p>${feitas.length} entregues hoje · dinheiro ${brl(recebido('dinheiro'))} · cartão ${brl(recebido('cartao'))} · Pix ${brl(recebido('pix'))}</p></div>
            <div class="controles"><button class="btn" data-som aria-pressed="${App.somLigado()}">${App.somLigado() ? 'Som ligado' : 'Ligar som'}</button></div></div>
          <section class="cartao"><h2>Minhas entregas (${minhas.length})</h2>
            ${minhas.length ? `<div class="quadro">${minhas.map((p) => cartao(p, true)).join('')}</div>` : '<p class="nota">Nenhuma entrega com você agora.</p>'}</section>
          <section class="cartao"><h2>Prontos na cozinha (${prontos.length})</h2>
            ${prontos.length ? `<div class="quadro">${prontos.map((p) => cartao(p, false)).join('')}</div>` : '<p class="nota">Nenhum pedido pronto agora. Quando o atendente liberar a saída para você, ele aparece em Minhas entregas.</p>'}</section>`;
      }
      el.addEventListener('click', async (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        if (b.hasAttribute('data-som')) { App.alternarSom(); render(); return; }
        if (b.dataset.entregar) {
          const p = App.pedidos.find((x) => x.id === Number(b.dataset.entregar));
          if (p) App.confirmarEntrega(p);
        }
      });
      App.on(render);
      render();
    },
  };
})();
