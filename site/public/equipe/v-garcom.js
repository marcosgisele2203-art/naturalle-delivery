// Garçom: mapa das mesas, pedidos para servir, confirmar pedidos do QR e lançar pedidos na mesa.
App.views.garcom = {
  montar(el, params) {
    const { esc, brl } = App;
    let mesas = [];
    let modo = params[0] === 'mesa' ? { mesa: Number(params[1]) } : null;
    let ativo = true;

    async function carregarMesas() {
      try { mesas = (await App.api('/api/equipe/mesas')).mesas; } catch (e) { App.toast(e.message, true); }
    }

    function acoesPedido(p) {
      const a = [];
      if (p.status === 'novo') a.push({ rotulo: 'Confirmar', classe: 'principal', acao: 'status', valor: 'preparo' }, { rotulo: 'Recusar', classe: 'fraco', acao: 'status', valor: 'cancelado' });
      if (p.status === 'preparo' && !window.Calc.temCozinha(p.itens)) a.push({ rotulo: 'Pronto (balcão)', classe: 'verde', acao: 'status', valor: 'pronto' });
      if (p.status === 'pronto') a.push({ rotulo: 'Servido', classe: 'verde', acao: 'status', valor: 'entregue' });
      return a;
    }

    function renderInicio(mudaram) {
      if (mudaram && mudaram.some((m) => {
        const p = App.pedidos.find((x) => x.id === m.id);
        return p && p.tipo === 'mesa' && ((m.para === 'pronto') || (m.para === 'novo' && !m.de));
      })) App.bip();
      const doMesa = App.pedidos.filter((p) => p.tipo === 'mesa');
      const aguardando = doMesa.filter((p) => p.status === 'novo');
      const prontos = doMesa.filter((p) => p.status === 'pronto');
      el.innerHTML = `<div class="topo"><div><h1>Mesas</h1><p>Toque numa mesa para ver a conta ou lançar um pedido.</p></div>
          <div class="controles"><button class="btn" data-som aria-pressed="${App.somLigado()}">${App.somLigado() ? 'Som ligado' : 'Ligar som'}</button></div></div>
        ${prontos.length ? `<section class="cartao"><h2>Prontos para servir (${prontos.length})</h2><div class="quadro">${prontos.map((p) => App.cartaoPedido(p, acoesPedido(p), { destaque: true })).join('')}</div></section>` : ''}
        ${aguardando.length ? `<section class="cartao"><h2>Pedidos pelo QR esperando confirmação (${aguardando.length})</h2><div class="quadro">${aguardando.map((p) => App.cartaoPedido(p, acoesPedido(p), { destaque: true })).join('')}</div></section>` : ''}
        <div class="mesas">${mesas.map((m) => {
          const classe = Number(m.aguardando) ? 'alerta' : Number(m.prontos) ? 'pronto' : m.conta_id ? 'ocupada' : '';
          const sinal = Number(m.aguardando) ? 'Pedido para confirmar' : Number(m.prontos) ? 'Pronto para servir' : Number(m.preparando) ? 'Preparando' : m.conta_id ? 'Ocupada' : 'Livre';
          return `<button class="mesa ${classe}" data-mesa="${m.id}"><b>${esc(m.nome)}</b><span class="sinal">${sinal}</span>${m.conta_id ? `<span>${brl(m.total)} · ${App.tempo(m.aberta_em)}</span>` : ''}</button>`;
        }).join('') || '<p class="nota">Nenhuma mesa cadastrada. O administrador cadastra em Administração › Mesas.</p>'}</div>`;
    }

    function renderMesa() {
      const m = mesas.find((x) => x.id === modo.mesa);
      if (!m) { el.innerHTML = '<p class="nota">Carregando…</p>'; return; }
      const pedidos = App.pedidos.filter((p) => m.conta_id && p.conta_id === m.conta_id);
      el.innerHTML = `<button class="btn voltar" data-voltar>← Todas as mesas</button>
        <div class="topo"><div><h1>${esc(m.nome)}</h1><p>${m.conta_id ? 'Conta aberta ' + App.tempo(m.aberta_em) + ' · total ' + brl(m.total) : 'Mesa livre'}</p></div>
          <div class="controles"><button class="btn principal grande" data-novo>+ Novo pedido</button>
          ${m.conta_id && App.pode('caixa') ? '<button class="btn escuro grande" data-fechar>Fechar conta</button>' : ''}</div></div>
        ${pedidos.length ? `<div class="quadro">${pedidos.map((p) => App.cartaoPedido(p, acoesPedido(p))).join('')}</div>` : '<p class="nota">Nenhum pedido nesta mesa ainda.</p>'}`;
    }

    function render(mudaram) {
      if (!ativo) return;
      if (modo && modo.novo) return;
      if (modo) renderMesa(); else renderInicio(mudaram);
    }

    el.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b || b.closest('.novo')) return;
      if (b.dataset.mesa) { location.hash = '#/garcom/mesa/' + b.dataset.mesa; return; }
      if (b.hasAttribute('data-voltar')) { location.hash = '#/garcom'; return; }
      if (b.hasAttribute('data-som')) { App.alternarSom(); render(); return; }
      if (b.hasAttribute('data-novo')) {
        const m = mesas.find((x) => x.id === modo.mesa);
        modo.novo = true;
        el.innerHTML = `<div class="topo"><div><h1>Novo pedido · ${esc(m.nome)}</h1></div></div><div id="novo-mesa"></div>`;
        App.novoPedido(el.querySelector('#novo-mesa'), {
          mesa: m,
          voltar: () => { modo.novo = false; render(); },
          aoEnviar: async () => { modo.novo = false; await carregarMesas(); render(); },
        });
        return;
      }
      if (b.hasAttribute('data-fechar')) {
        const m = mesas.find((x) => x.id === modo.mesa);
        App.fecharConta(m, async () => { await carregarMesas(); render(); });
        return;
      }
      if (b.dataset.acao === 'status') {
        if (b.dataset.valor === 'cancelado' && !confirm('Recusar o pedido #' + b.dataset.id + '?')) return;
        App.mudarStatus(Number(b.dataset.id), b.dataset.valor, b).then(async () => { await carregarMesas(); render(); });
      }
    });

    const parar = App.on(async (mudaram) => { await carregarMesas(); render(mudaram); });
    carregarMesas().then(() => render());
    return () => { ativo = false; parar(); };
  },
};
