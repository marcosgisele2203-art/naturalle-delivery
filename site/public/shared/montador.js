// Componente do cardápio: abas de categoria, lista de produtos e a janela de montar o item.
// Usado pelo app do cliente (delivery e mesa), pelo garçom e pelo balcão.
(function () {
  const brl = (v) => window.Calc.brl(v);
  const curto = (v) => brl(v).replace(',00', '');
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const MAIS = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
  const MENOS = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14"/></svg>';
  const X = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';

  function situacao(p, dia) {
    if (p.disponivel === false) return 'Esgotado';
    if (!window.Calc.disponivelHoje(p, dia)) return 'Só ' + window.Calc.diasTexto(p.dias);
    return '';
  }

  // Abre a janela de montar um produto. onOk(escolha, calculo)
  function abrirProduto(p, dia, onOk, inicial) {
    const st = { opcoes: {}, qtd: 1, obs: '', erro: '' };
    if (inicial) { st.opcoes = JSON.parse(JSON.stringify(inicial.opcoes || {})); st.qtd = inicial.qtd || 1; st.obs = inicial.obs || ''; }
    const fundo = document.createElement('div');
    fundo.className = 'mt-fundo';
    const voltarFoco = document.activeElement;
    document.body.appendChild(fundo);
    document.body.classList.add('mt-travado');

    const escolha = () => ({ produto: p.id, opcoes: st.opcoes, qtd: st.qtd, obs: st.obs });
    function calc() { try { return { c: window.Calc.calcular({ produtos: [p] }, escolha(), dia) }; } catch (e) { return { e: e.message }; } }

    function render() {
      const r = calc();
      const grupos = (p.grupos || []).map((g) => {
        const sel = st.opcoes[g.id] || [];
        const regra = g.tipo === 'unica' ? 'Escolha 1' : g.max ? 'Até ' + g.max : 'Quantos quiser';
        return `<fieldset class="mt-grupo"><legend><span>${esc(g.nome)}</span>
            <small>${regra}${g.obrigatorio ? ' · obrigatório' : ''}</small></legend>
          <div class="mt-opcoes">${(g.opcoes || []).map((o) => {
            const on = sel.includes(o.id), off = o.disponivel === false;
            const preco = o.preco_de ? `<s>${curto(o.preco_de)}</s> ${curto(o.preco)}` : o.preco ? (g.tipo === 'unica' && !p.preco ? curto(o.preco) : '+' + curto(o.preco)) : '';
            return `<button type="button" class="mt-op" aria-pressed="${on}" data-g="${esc(g.id)}" data-o="${esc(o.id)}"${off ? ' disabled' : ''}>
              ${esc(o.nome)}${off ? ' <small>acabou</small>' : preco ? ` <small>${preco}</small>` : ''}</button>`;
          }).join('')}</div></fieldset>`;
      }).join('');
      fundo.innerHTML = `<div class="mt-folha" role="dialog" aria-modal="true" aria-labelledby="mt-titulo">
          <div class="mt-topo"><div><h2 id="mt-titulo">${esc(p.nome)}</h2>${p.descricao ? `<p>${esc(p.descricao)}</p>` : ''}</div>
            <button type="button" class="mt-icone" data-acao="fechar" aria-label="Fechar">${X}</button></div>
          <div class="mt-corpo">${grupos}
            <label class="mt-obs">Observação (opcional)<input maxlength="200" value="${esc(st.obs)}" placeholder="Ex.: sem gelo, pouco molho"></label>
          </div>
          <div class="mt-rodape">
            <div class="mt-qtd" role="group" aria-label="Quantidade">
              <button type="button" class="mt-icone" data-acao="menos" aria-label="Diminuir"${st.qtd <= 1 ? ' disabled' : ''}>${MENOS}</button>
              <span aria-live="polite">${st.qtd}</span>
              <button type="button" class="mt-icone" data-acao="mais" aria-label="Aumentar">${MAIS}</button>
            </div>
            <button type="button" class="mt-ok" data-acao="ok"><span>${inicial ? 'Salvar' : 'Adicionar'}</span><span>${r.c ? brl(r.c.preco) : ''}</span></button>
          </div>
          ${st.erro ? `<p class="mt-erro" role="alert">${esc(st.erro)}</p>` : ''}
        </div>`;
    }

    function fechar() {
      fundo.remove();
      document.body.classList.remove('mt-travado');
      document.removeEventListener('keydown', tecla);
      if (voltarFoco && voltarFoco.focus) voltarFoco.focus();
    }
    function tecla(e) { if (e.key === 'Escape') fechar(); }
    document.addEventListener('keydown', tecla);

    fundo.addEventListener('input', (e) => { if (e.target.matches('.mt-obs input')) st.obs = e.target.value; });
    fundo.addEventListener('click', (e) => {
      if (e.target === fundo) return fechar();
      const b = e.target.closest('button');
      if (!b) return;
      const scroll = fundo.querySelector('.mt-corpo').scrollTop;
      if (b.dataset.g) {
        const g = p.grupos.find((x) => x.id === b.dataset.g);
        const sel = st.opcoes[g.id] || [];
        const o = b.dataset.o;
        if (g.tipo === 'unica') st.opcoes[g.id] = sel.includes(o) && !g.obrigatorio ? [] : [o];
        else if (sel.includes(o)) st.opcoes[g.id] = sel.filter((x) => x !== o);
        else if (g.max && sel.length >= g.max) { st.erro = 'Máximo de ' + g.max + ' em ' + g.nome; render(); return; }
        else st.opcoes[g.id] = [...sel, o];
        st.erro = '';
      } else if (b.dataset.acao === 'fechar') return fechar();
      else if (b.dataset.acao === 'menos') st.qtd = Math.max(1, st.qtd - 1);
      else if (b.dataset.acao === 'mais') st.qtd = Math.min(50, st.qtd + 1);
      else if (b.dataset.acao === 'ok') {
        const r = calc();
        if (r.e) { st.erro = r.e; render(); return; }
        fechar();
        onOk(escolha(), r.c);
        return;
      }
      render();
      fundo.querySelector('.mt-corpo').scrollTop = scroll;
    });
    render();
    const primeiro = fundo.querySelector('.mt-op:not([disabled]), .mt-ok');
    if (primeiro) primeiro.focus();
  }

  // Lista do cardápio com abas. opts: { el, cardapio, dia, onAdicionar, busca }
  function criar(opts) {
    const st = { cat: null, busca: '' };
    const el = opts.el;

    function produtosVisiveis() {
      const menu = opts.cardapio;
      if (st.busca) {
        const q = st.busca.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
        return menu.produtos.filter((p) => (p.nome + ' ' + (p.descricao || '')).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(q));
      }
      return menu.produtos.filter((p) => p.categoria === st.cat);
    }

    function render() {
      const menu = opts.cardapio;
      const cats = menu.categorias.filter((c) => menu.produtos.some((p) => p.categoria === c.id));
      if (!st.cat || !cats.some((c) => c.id === st.cat)) st.cat = cats[0] && cats[0].id;
      const lista = produtosVisiveis().map((p) => {
        const sit = situacao(p, opts.dia);
        const min = window.Calc.precoMinimo(p);
        const temOpcoes = (p.grupos || []).some((g) => g.obrigatorio);
        return `<article class="mt-produto${sit ? ' indisponivel' : ''}">
          <button type="button" class="mt-produto-btn" data-produto="${esc(p.id)}"${sit ? ' disabled' : ''}>
            <span class="mt-produto-info"><b>${esc(p.nome)}</b>${p.descricao ? `<small>${esc(p.descricao)}</small>` : ''}
              <span class="mt-preco">${sit ? esc(sit) : (temOpcoes ? 'a partir de ' : '') + brl(min)}</span></span>
            <span class="mt-mais" aria-hidden="true">${MAIS}</span>
          </button></article>`;
      }).join('') || '<p class="mt-vazio">Nada encontrado.</p>';
      el.innerHTML = `
        ${opts.busca ? `<label class="mt-busca"><span class="sr">Buscar no cardápio</span><input type="search" placeholder="Buscar no cardápio" value="${esc(st.busca)}"></label>` : ''}
        <nav class="mt-abas" aria-label="Categorias">${cats.map((c) =>
          `<button type="button" class="mt-aba" aria-pressed="${!st.busca && st.cat === c.id}" data-cat="${esc(c.id)}">${esc(c.nome)}</button>`).join('')}</nav>
        <div class="mt-lista">${lista}</div>`;
    }

    el.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.cat) { st.cat = b.dataset.cat; st.busca = ''; render(); }
      else if (b.dataset.produto) {
        const p = opts.cardapio.produtos.find((x) => x.id === b.dataset.produto);
        const semEscolha = !(p.grupos || []).length;
        if (semEscolha && opts.adicionarDireto) {
          opts.onAdicionar({ produto: p.id, opcoes: {}, qtd: 1, obs: '' }, window.Calc.calcular(opts.cardapio, { produto: p.id, qtd: 1 }, opts.dia));
        } else abrirProduto(p, opts.dia, opts.onAdicionar);
      }
    });
    el.addEventListener('input', (e) => {
      if (!e.target.matches('.mt-busca input')) return;
      st.busca = e.target.value.trim();
      const pos = e.target.selectionStart;
      render();
      const i = el.querySelector('.mt-busca input');
      i.focus(); i.setSelectionRange(pos, pos);
    });

    render();
    return { render, setCardapio(m, dia) { opts.cardapio = m; if (dia != null) opts.dia = dia; render(); } };
  }

  // Linhas de itens (carrinho ou pedido)
  function linhas(itens, remover) {
    return itens.map((i, idx) => `<div class="mt-linha">
        <span class="mt-q">${i.qtd}×</span>
        <div><b>${esc(i.nome)}</b>${i.detalhe ? `<small>${esc(i.detalhe)}</small>` : ''}${i.obs ? `<small class="mt-obs-item">Obs.: ${esc(i.obs)}</small>` : ''}</div>
        <b class="mt-valor">${brl(i.preco)}</b>
        ${remover ? `<button type="button" class="mt-icone mt-remover" data-remover="${idx}" aria-label="Remover ${esc(i.nome)}">${X}</button>` : ''}
      </div>`).join('');
  }

  window.Montador = { criar, abrirProduto, linhas, esc, brl };
})();
