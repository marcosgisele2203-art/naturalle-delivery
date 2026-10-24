// App do cliente: delivery/retirada em "/" e pedido na mesa em "/m/<código da mesa>".
(function () {
  const { esc, brl, linhas } = window.Montador;
  const $ = (s) => document.querySelector(s);
  const tokenMesa = (location.pathname.match(/^\/m\/([\w-]+)$/) || [])[1] || null;
  const chave = (k) => 'nm-' + (tokenMesa ? 'mesa-' + tokenMesa + '-' : '') + k;
  const guardado = (k, padrao) => { try { return JSON.parse(localStorage.getItem(k)) ?? padrao; } catch { return padrao; } };
  const guardar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sem armazenamento */ } };
  const SACOLA = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 7h12l-1 13H7z"/><path d="M9 7a3 3 0 0 1 6 0"/></svg>';
  const ETAPAS = {
    novo: 'Recebido, aguardando confirmação', preparo: 'Em preparo', pronto: 'Pronto',
    saiu: 'Saiu para entrega', entregue: 'Entregue', cancelado: 'Cancelado',
  };

  const st = {
    loja: null, cardapio: null, dia: 0, mesa: null,
    carrinho: guardado(chave('carrinho'), []),
    cliente: guardado('nm-cliente', { nome: '', telefone: '', endereco: '' }),
    tipo: 'entrega', pagamento: 'pix', troco: '', obs: '',
    enviando: false, erro: '', enviado: null,
    meus: guardado(chave('pedidos'), []), // [{ codigo, id }]
    acompanhamento: {},
  };
  let montador;

  async function api(url, corpo) {
    const r = await fetch(url, corpo ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) } : {});
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.erro || 'Não foi possível concluir. Tente de novo.');
    return d;
  }

  const total = () => window.Calc.somar(st.carrinho) + (taxa());
  const taxa = () => (!tokenMesa && st.tipo === 'entrega' ? Number(st.loja.taxa_entrega) || 0 : 0);

  function adicionar(escolha, calc) {
    st.carrinho.push({ escolha, ...calc });
    st.enviado = null;
    guardar(chave('carrinho'), st.carrinho);
    renderBarra();
    avisar('Adicionado ao carrinho');
  }

  // ---------------- render
  function renderTopo() {
    const l = st.loja;
    const [a, ...b] = l.nome.split(' ');
    $('#nome-loja').innerHTML = esc(a) + (b.length ? ' <span>' + esc(b.join(' ')) + '</span>' : '');
    $('#frase').textContent = l.frase || '';
    document.title = l.nome + (tokenMesa ? ' · ' + st.mesa.nome : ' · Peça online');
    const selos = [];
    if (tokenMesa) selos.push(`<span class="selo amarelo">${esc(st.mesa.nome)}</span>`, '<span class="selo">Peça daqui mesmo, sem esperar</span>');
    else {
      if (l.horario) selos.push(`<span class="selo amarelo">${esc(l.horario)}</span>`);
      selos.push('<span class="selo">Pix · Cartão · Dinheiro</span>');
      if (l.delivery && Number(l.taxa_entrega)) selos.push(`<span class="selo">Entrega ${brl(l.taxa_entrega)}</span>`);
    }
    $('#selos').innerHTML = selos.join('');
    if (tokenMesa) $('#balao').textContent = 'Oi! Escolha aí que a gente leva até a sua mesa!';
    const aviso = $('#aviso-topo');
    if (!tokenMesa && !l.aberta) { aviso.hidden = false; aviso.textContent = 'Estamos fechados para pedidos pelo site agora. Você pode olhar o cardápio à vontade.'; }
    $('#rodape').innerHTML = l.whatsapp ? `<p>${esc(l.nome)} · Fale com a gente no WhatsApp <a href="https://wa.me/${esc(l.whatsapp)}">${formatarFone(l.whatsapp)}</a></p>` : '';
  }

  function formatarFone(t) {
    const d = String(t).replace(/^55/, '');
    return d.length >= 10 ? `(${d.slice(0, 2)}) ${d.slice(2, -4)}-${d.slice(-4)}` : t;
  }

  function renderAcompanhar() {
    const ativos = st.meus.map((m) => st.acompanhamento[m.codigo]).filter(Boolean)
      .filter((p) => tokenMesa || !['entregue', 'cancelado'].includes(p.status) || Date.now() - new Date(p.criado_em) < 3 * 3600_000);
    $('#acompanhar').innerHTML = ativos.length ? `<section class="acompanhar" aria-live="polite">
      <h2>${tokenMesa ? 'Pedidos desta mesa' : 'Seus pedidos'}</h2>
      ${ativos.map((p) => `<div class="acomp-linha"><b>#${p.id}</b><span class="etapa etapa-${p.status}">${ETAPAS[p.status] || p.status}</span><span>${brl(p.total)}</span></div>`).join('')}
    </section>` : '';
  }

  function renderBarra() {
    const n = st.carrinho.reduce((s, i) => s + i.qtd, 0);
    $('#barra').innerHTML = n ? `<button class="botao escuro flex" data-acao="abrir">${SACOLA}<span class="flex" style="text-align:left">Ver carrinho <span class="contador">${n}</span></span><span>${brl(window.Calc.somar(st.carrinho))}</span></button>` : '';
  }

  function renderCarrinho() {
    const c = st.cliente, l = st.loja;
    if (st.enviado) {
      const p = st.enviado;
      $('#carrinho-corpo').innerHTML = `<div class="sucesso"><strong>Pedido #${esc(p.id)} enviado!</strong>
        <span>${tokenMesa
          ? (p.status === 'preparo' ? 'Já foi para a cozinha. A gente leva na sua mesa.' : 'O garçom vai confirmar e mandar para a cozinha.') + ' Acompanhe aqui na página.'
          : (p.pix ? 'A chave Pix chegou no seu WhatsApp. Responda lá com a foto do comprovante. ' : 'A confirmação chegou no seu WhatsApp. ') + 'Você também acompanha aqui na página.'}</span></div>
        <button class="botao verde" data-acao="fechar">${tokenMesa ? 'Pedir mais alguma coisa' : 'Voltar ao cardápio'}</button>`;
      return;
    }
    const itens = st.carrinho.length ? linhas(st.carrinho, true) : '<p class="vazio">Seu carrinho está vazio.</p>';
    let campos;
    if (tokenMesa) {
      campos = `<label class="campo">Seu nome (opcional)<input name="nome" autocomplete="given-name" value="${esc(c.nome)}" placeholder="Para o garçom saber de quem é"></label>
        <label class="campo">Observações (opcional)<textarea name="obs">${esc(st.obs)}</textarea></label>`;
    } else {
      const tipos = [l.delivery && ['entrega', 'Entrega'], l.retirada && ['retirada', 'Retirar no balcão']].filter(Boolean);
      if (!tipos.some(([v]) => v === st.tipo) && tipos[0]) st.tipo = tipos[0][0];
      const pags = [['pix', 'Pix'], ['cartao', 'Cartão'], ['dinheiro', 'Dinheiro']].map(([v, n]) =>
        `<button type="button" class="chip" aria-pressed="${st.pagamento === v}" data-acao="pagamento" data-v="${v}">${n}</button>`).join('');
      const ajuda = { pix: 'A chave Pix chega no seu WhatsApp. Responda com o comprovante.', cartao: st.tipo === 'entrega' ? 'O entregador leva a maquininha.' : 'Pague no cartão na retirada.', dinheiro: '' }[st.pagamento];
      campos = `${tipos.length > 1 ? `<div class="campo"><span>Como você quer receber?</span><div class="pagamentos" style="grid-template-columns:repeat(2,minmax(0,1fr))">${tipos.map(([v, n]) =>
          `<button type="button" class="chip" aria-pressed="${st.tipo === v}" data-acao="tipo" data-v="${v}">${n}</button>`).join('')}</div></div>` : ''}
        <label class="campo">Seu nome<input name="nome" autocomplete="name" required value="${esc(c.nome)}"></label>
        <label class="campo">WhatsApp com DDD<input name="telefone" type="tel" inputmode="tel" autocomplete="tel" placeholder="(67) 99999-9999" required value="${esc(c.telefone)}"></label>
        ${st.tipo === 'entrega' ? `<label class="campo">Endereço de entrega<input name="endereco" autocomplete="street-address" placeholder="Rua, número, bairro, referência" required value="${esc(c.endereco)}"></label>` : ''}
        <label class="campo">Observações (opcional)<textarea name="obs">${esc(st.obs)}</textarea></label>
        <div class="campo"><span>Forma de pagamento</span><div class="pagamentos">${pags}</div>
          ${ajuda ? `<small style="font-weight:400;color:var(--cinza)">${ajuda}</small>` : ''}</div>
        ${st.pagamento === 'dinheiro' ? `<label class="campo">Troco para quanto? (opcional)<input name="troco" inputmode="decimal" placeholder="Ex.: 50,00" value="${esc(st.troco)}"></label>` : ''}
        ${taxa() ? `<div class="linha-total"><span>Taxa de entrega</span><span>${brl(taxa())}</span></div>` : ''}`;
    }
    const fechado = !tokenMesa && !l.aberta;
    $('#carrinho-corpo').innerHTML = `<div>${itens}</div>
      <form id="form-pedido" novalidate class="form-pedido">${campos}
        <div class="total"><span>Total</span><span>${brl(total())}</span></div>
        ${fechado ? '<p class="erro">A loja está fechada para pedidos pelo site agora.</p>' : ''}
        ${st.erro ? `<p class="erro" role="alert">${esc(st.erro)}</p>` : ''}
        <button class="botao verde" type="submit"${st.enviando || !st.carrinho.length || fechado ? ' disabled' : ''}>${st.enviando ? 'Enviando…' : tokenMesa ? 'Enviar pedido para a mesa' : 'Enviar pedido'}</button>
      </form>`;
  }

  // ---------------- carrinho / formulário
  function abrir() { $('#carrinho').hidden = false; st.erro = ''; document.body.classList.add('mt-travado'); renderCarrinho(); }
  function fechar() { lerForm(); $('#carrinho').hidden = true; st.enviado = null; document.body.classList.remove('mt-travado'); renderBarra(); }

  function lerForm() {
    const f = $('#form-pedido');
    if (!f) return;
    const d = new FormData(f);
    st.cliente = { ...st.cliente, nome: d.get('nome') ?? st.cliente.nome };
    if (d.has('telefone')) st.cliente.telefone = d.get('telefone');
    if (d.has('endereco')) st.cliente.endereco = d.get('endereco');
    st.obs = d.get('obs') || '';
    if (d.has('troco')) st.troco = d.get('troco') || '';
    guardar('nm-cliente', st.cliente);
  }

  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-acao], [data-remover]');
    if (!b || b.closest('.mt-fundo')) return;
    if (b.dataset.remover != null) {
      lerForm();
      st.carrinho.splice(Number(b.dataset.remover), 1);
      guardar(chave('carrinho'), st.carrinho);
      renderCarrinho(); renderBarra();
      return;
    }
    switch (b.dataset.acao) {
      case 'abrir': abrir(); break;
      case 'fechar': fechar(); break;
      case 'pagamento': lerForm(); st.pagamento = b.dataset.v; renderCarrinho(); break;
      case 'tipo': lerForm(); st.tipo = b.dataset.v; renderCarrinho(); break;
      default: return;
    }
    e.preventDefault();
  });
  $('#carrinho').addEventListener('click', (e) => { if (e.target.id === 'carrinho') fechar(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#carrinho').hidden && !document.querySelector('.mt-fundo')) fechar(); });

  document.addEventListener('submit', async (e) => {
    if (e.target.id !== 'form-pedido') return;
    e.preventDefault();
    lerForm();
    const c = st.cliente;
    st.erro = '';
    if (!tokenMesa) {
      const tel = String(c.telefone || '').replace(/\D/g, '');
      if (!String(c.nome).trim()) st.erro = 'Informe seu nome.';
      else if (tel.length < 10 || tel.length > 13) st.erro = 'Informe seu WhatsApp com DDD.';
      else if (st.tipo === 'entrega' && !String(c.endereco).trim()) st.erro = 'Informe o endereço de entrega.';
    }
    if (st.erro) return renderCarrinho();
    st.enviando = true; renderCarrinho();
    try {
      const itens = st.carrinho.map((i) => i.escolha);
      const d = tokenMesa
        ? await api('/api/publico/mesa/' + tokenMesa + '/pedido', { nome: c.nome, observacoes: st.obs, itens })
        : await api('/api/publico/pedido', {
          tipo: st.tipo, cliente: { nome: c.nome, telefone: c.telefone }, endereco: c.endereco, observacoes: st.obs,
          pagamento: st.pagamento, troco_para: st.pagamento === 'dinheiro' ? st.troco : null, itens,
        });
      st.enviado = { id: d.pedido_id, pix: st.pagamento === 'pix', status: d.status };
      st.meus = [{ codigo: d.codigo, id: d.pedido_id }, ...st.meus].slice(0, 10);
      guardar(chave('pedidos'), st.meus);
      st.carrinho = []; st.obs = ''; st.troco = '';
      guardar(chave('carrinho'), []);
      acompanhar();
    } catch (err) {
      st.erro = err.message;
    }
    st.enviando = false;
    renderCarrinho(); renderBarra();
  });

  // ---------------- acompanhamento
  async function acompanhar() {
    await Promise.all(st.meus.map(async (m) => {
      try { st.acompanhamento[m.codigo] = (await api('/api/publico/acompanhar/' + m.codigo)).pedido; } catch { /* sumiu */ }
    }));
    renderAcompanhar();
  }

  let timer;
  function avisar(msg) {
    let el = $('#aviso');
    if (!el) {
      el = document.createElement('div');
      el.id = 'aviso'; el.className = 'toast'; el.setAttribute('role', 'status');
      document.body.appendChild(el);
    }
    el.textContent = msg; el.style.opacity = '1';
    clearTimeout(timer); timer = setTimeout(() => { el.style.opacity = '0'; }, 1600);
  }

  // ---------------- início
  (async () => {
    try {
      const d = await api('/api/publico/cardapio');
      st.loja = d.loja; st.cardapio = d.cardapio; st.dia = d.dia;
      if (tokenMesa) st.mesa = (await api('/api/publico/mesa/' + tokenMesa)).mesa;
      if (!st.loja.delivery && st.loja.retirada) st.tipo = 'retirada';
    } catch (e) {
      $('#cardapio').innerHTML = `<p class="erro">${esc(e.message)}</p>`;
      return;
    }
    // itens guardados de outro dia podem ter mudado de preço ou acabado
    st.carrinho = st.carrinho.filter((i) => { try { Object.assign(i, window.Calc.calcular(st.cardapio, i.escolha, st.dia)); return true; } catch { return false; } });
    renderTopo();
    montador = window.Montador.criar({ el: $('#cardapio'), cardapio: st.cardapio, dia: st.dia, onAdicionar: adicionar });
    renderBarra();
    acompanhar();
    setInterval(() => { if (st.meus.length && !document.hidden) acompanhar(); }, 15000);
  })();
})();
