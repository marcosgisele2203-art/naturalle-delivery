// Cozinha: comandas dos pedidos confirmados, da mais antiga para a mais nova.
App.views.cozinha = {
  montar(el) {
    const { esc } = App;
    const recentes = []; // prontos nos últimos minutos, para desfazer

    function render(mudaram) {
      const daCozinha = (p) => window.Calc.temCozinha(p.itens);
      if (mudaram && mudaram.some((m) => m.para === 'preparo' && m.de !== 'pronto' && daCozinha(App.pedidos.find((p) => p.id === m.id) || {}))) App.bip(4);
      // só pedidos com lanche; açaí e bebidas saem do balcão
      const fila = App.pedidos.filter((p) => p.status === 'preparo' && daCozinha(p))
        .sort((a, b) => new Date(a.confirmado_em || a.criado_em) - new Date(b.confirmado_em || b.criado_em));
      const prontos = App.pedidos.filter((p) => p.status === 'pronto' && daCozinha(p) && App.minutos(p.pronto_em || p.criado_em) < 10);
      el.innerHTML = `<div class="cozinha-tela">
        <div class="cozinha-topo">
          <h1>Cozinha · ${fila.length} ${fila.length === 1 ? 'pedido' : 'pedidos'}</h1>
          <div class="controles">
            <button class="btn" data-som aria-pressed="${App.somLigado()}">${App.somLigado() ? 'Som ligado' : 'Ligar som'}</button>
            <button class="btn" data-cheia>Tela cheia</button>
            <span class="status-con${App.online === false ? ' off' : ''}">${App.online === false ? 'Sem conexão' : 'Ao vivo'}</span>
          </div>
        </div>
        ${prontos.length ? `<div class="prontos-recentes">Prontos agora há pouco: ${prontos.map((p) =>
          `<button class="btn" data-voltar="${p.id}" title="Voltar para a fila">#${p.id} · desfazer</button>`).join('')}</div>` : ''}
        <div class="comandas">${fila.map((p) => {
          const min = App.minutos(p.confirmado_em || p.criado_em);
          const classe = min >= 25 ? ' atrasada' : min >= 15 ? ' atencao' : '';
          const onde = p.tipo === 'mesa' ? esc(p.mesa_nome || 'Mesa') : p.tipo === 'entrega' ? 'Entrega' : 'Retirada no balcão';
          return `<article class="comanda${classe}">
            <header><b>#${p.id}</b><span class="tempo">${min} min</span></header>
            <div class="onde">${onde}${p.cliente_nome ? ' · ' + esc(p.cliente_nome) : ''}</div>
            <ul>${(p.itens || []).filter((i) => i.cozinha !== false).map((i) => `<li><b>${i.qtd}× ${esc(i.nome)}</b>${i.detalhe ? `<small>${esc(i.detalhe)}</small>` : ''}${i.obs ? `<small class="obs-item">Obs.: ${esc(i.obs)}</small>` : ''}</li>`).join('')}</ul>
            ${((n) => (n ? `<p class="nota" style="color:#C9CBD1">+ ${n} ${n === 1 ? 'item' : 'itens'} do balcão (açaí/bebidas)</p>` : ''))((p.itens || []).filter((i) => i.cozinha === false).reduce((s, i) => s + i.qtd, 0))}
            ${p.observacoes ? `<p class="obs-geral">${esc(p.observacoes)}</p>` : ''}
            <button class="btn verde" data-pronto="${p.id}">Pronto</button>
            <button class="btn fraco" data-imprimir="${p.id}" style="margin-top:-8px;min-height:40px;font-size:14px">Imprimir comanda</button>
          </article>`;
        }).join('') || '<p class="nota" style="color:#C9CBD1;font-size:18px">Nenhum pedido na fila. Os pedidos confirmados aparecem aqui sozinhos.</p>'}</div>
      </div>`;
    }

    el.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.pronto) App.mudarStatus(Number(b.dataset.pronto), 'pronto', b);
      else if (b.dataset.voltar) App.mudarStatus(Number(b.dataset.voltar), 'preparo', b);
      else if (b.hasAttribute('data-som')) { App.alternarSom(); render(); }
      else if (b.hasAttribute('data-cheia')) {
        if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.();
      }
    });

    App.on(render);
    render();
    const relogio = setInterval(() => render(), 30000);
    // tela da cozinha não deve apagar
    let trava = null;
    navigator.wakeLock?.request('screen').then((t) => { trava = t; }).catch(() => {});
    return () => { clearInterval(relogio); trava?.release().catch(() => {}); };
  },
};
