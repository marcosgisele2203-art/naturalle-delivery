// Novo pedido feito pela equipe: balcão (retirada, entrega ou mesa) e garçom (mesa).
// App.novoPedido(el, { mesa: {id, nome} | null, somenteMesa, aoEnviar(pedido), voltar })
App.novoPedido = function (el, opts) {
  const { esc, brl } = App;
  const st = {
    itens: [], tipo: opts.mesa || opts.somenteMesa ? 'mesa' : 'retirada', mesa_id: opts.mesa ? opts.mesa.id : '',
    nome: '', telefone: '', endereco: '', obs: '', pagamento: '', troco: '', enviando: false, erro: '', mesas: [],
  };
  let montador;

  const taxa = () => (st.tipo === 'entrega' ? Number(App.loja.taxa_entrega) || 0 : 0);
  const total = () => window.Calc.somar(st.itens) + taxa();

  function renderCarrinho() {
    const c = el.querySelector('#novo-carrinho');
    const tipos = opts.somenteMesa || opts.mesa ? [] : [['retirada', 'Retirada'], ['entrega', 'Entrega'], ['mesa', 'Mesa']];
    c.innerHTML = `<div class="cartao">
      <h2>${opts.mesa ? 'Pedido · ' + esc(opts.mesa.nome) : 'Pedido'}</h2>
      ${tipos.length ? `<div class="chips">${tipos.map(([v, n]) => `<button type="button" class="chip" aria-pressed="${st.tipo === v}" data-tipo="${v}">${n}</button>`).join('')}</div>` : ''}
      ${st.tipo === 'mesa' && !opts.mesa ? `<label class="campo">Mesa<select name="mesa_id"><option value="">Escolha a mesa</option>${st.mesas.map((m) =>
        `<option value="${m.id}"${String(st.mesa_id) === String(m.id) ? ' selected' : ''}>${esc(m.nome)}</option>`).join('')}</select></label>` : ''}
      <div>${st.itens.length ? window.Montador.linhas(st.itens, true) : '<p class="nota">Toque nos itens do cardápio para adicionar.</p>'}</div>
      <label class="campo">${st.tipo === 'mesa' ? 'Nome do cliente (opcional)' : 'Nome do cliente'}<input name="nome" value="${esc(st.nome)}" autocomplete="off"></label>
      ${st.tipo !== 'mesa' ? `<label class="campo">WhatsApp (opcional)<input name="telefone" type="tel" inputmode="tel" value="${esc(st.telefone)}" placeholder="Se preencher, o cliente recebe as mensagens"></label>` : ''}
      ${st.tipo === 'entrega' ? `<label class="campo">Endereço<input name="endereco" value="${esc(st.endereco)}"></label>` : ''}
      <label class="campo">Observações<input name="obs" value="${esc(st.obs)}" autocomplete="off"></label>
      ${st.tipo !== 'mesa' ? `<div class="campo"><span>Pagamento${st.tipo === 'entrega' ? '' : ' (opcional)'}</span><div class="chips">${[['pix', 'Pix'], ['cartao', 'Cartão'], ['dinheiro', 'Dinheiro']].map(([v, n]) =>
        `<button type="button" class="chip" aria-pressed="${st.pagamento === v}" data-pag="${v}">${n}</button>`).join('')}</div></div>` : ''}
      ${st.pagamento === 'dinheiro' && st.tipo !== 'mesa' ? `<label class="campo">Troco para<input name="troco" inputmode="decimal" value="${esc(st.troco)}"></label>` : ''}
      ${taxa() ? `<div class="linha-total" style="font-size:14px;font-weight:600"><span>Taxa de entrega</span><span>${brl(taxa())}</span></div>` : ''}
      <div class="linha-total"><span>Total</span><span>${brl(total())}</span></div>
      ${st.erro ? `<p class="erro" role="alert">${esc(st.erro)}</p>` : ''}
      <button type="button" class="btn principal grande" data-enviar${st.enviando || !st.itens.length ? ' disabled' : ''}>${st.enviando ? 'Enviando…' : 'Enviar para a cozinha'}</button>
      ${opts.voltar ? '<button type="button" class="btn" data-voltar>Voltar</button>' : ''}
    </div>`;
  }

  function lerCampos() {
    el.querySelectorAll('#novo-carrinho input, #novo-carrinho select').forEach((i) => {
      if (i.name === 'mesa_id') st.mesa_id = i.value; else if (i.name in st) st[i.name] = i.value;
    });
  }

  el.innerHTML = `<div class="novo"><div class="cartao"><div id="novo-cardapio"><p class="nota">Carregando cardápio…</p></div></div><div class="novo-carrinho" id="novo-carrinho"></div></div>`;

  el.addEventListener('input', (e) => { if (e.target.closest('#novo-carrinho')) lerCampos(); });
  el.addEventListener('change', (e) => { if (e.target.name === 'mesa_id') st.mesa_id = e.target.value; });
  el.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b || !b.closest('#novo-carrinho')) return;
    lerCampos();
    if (b.dataset.tipo) { st.tipo = b.dataset.tipo; if (st.tipo === 'mesa') st.pagamento = ''; }
    else if (b.dataset.pag) st.pagamento = st.pagamento === b.dataset.pag ? '' : b.dataset.pag;
    else if (b.dataset.remover != null) st.itens.splice(Number(b.dataset.remover), 1);
    else if (b.hasAttribute('data-voltar')) return opts.voltar();
    else if (b.hasAttribute('data-enviar')) {
      st.erro = '';
      if (st.tipo === 'mesa' && !st.mesa_id) st.erro = 'Escolha a mesa.';
      else if (st.tipo !== 'mesa' && !st.nome.trim()) st.erro = 'Informe o nome do cliente.';
      else if (st.tipo === 'entrega' && !st.endereco.trim()) st.erro = 'Informe o endereço.';
      else if (st.tipo === 'entrega' && !st.pagamento) st.erro = 'Escolha a forma de pagamento.';
      if (!st.erro) {
        st.enviando = true; renderCarrinho();
        try {
          const d = await App.api('/api/equipe/pedido', {
            tipo: st.tipo, mesa_id: st.mesa_id, cliente_nome: st.nome, cliente_telefone: st.telefone, endereco: st.endereco,
            observacoes: st.obs, pagamento: st.pagamento || null, troco_para: st.troco, itens: st.itens.map((i) => i.escolha),
          });
          App.toast('Pedido #' + d.pedido.id + ' enviado para a cozinha');
          Object.assign(st, { itens: [], nome: '', telefone: '', endereco: '', obs: '', pagamento: '', troco: '' });
          App.atualizarPedidos();
          if (opts.aoEnviar) { st.enviando = false; return opts.aoEnviar(d.pedido); }
        } catch (err) { st.erro = err.message; }
        st.enviando = false;
      }
    }
    renderCarrinho();
  });

  renderCarrinho();
  (async () => {
    try {
      await App.carregarCardapio();
      if (!opts.mesa && (App.pode('caixa', 'pedidos', 'garcom'))) st.mesas = (await App.api('/api/equipe/mesas')).mesas;
    } catch (e) { el.querySelector('#novo-cardapio').innerHTML = `<p class="erro">${esc(e.message)}</p>`; return; }
    montador = window.Montador.criar({
      el: el.querySelector('#novo-cardapio'), cardapio: App.cardapio, dia: App.dia, busca: true, adicionarDireto: true,
      onAdicionar(escolha, calc) { lerCampos(); st.itens.push({ escolha, ...calc }); renderCarrinho(); App.toast(calc.nome + ' adicionado'); },
    });
    renderCarrinho();
  })();
};

App.views.balcao = {
  montar(el) {
    el.innerHTML = `<div class="topo"><div><h1>Novo pedido</h1><p>Pedido feito no balcão ou por telefone. Vai direto para a cozinha.</p></div></div><div id="balcao"></div>`;
    App.novoPedido(el.querySelector('#balcao'), { somenteMesa: !App.pode('caixa', 'pedidos') });
  },
};
