// App do cliente: delivery/retirada em "/" e pedido na mesa em "/m/<código da mesa>".
(function () {
  const { esc, brl, linhas } = window.Montador;
  const $ = (s) => document.querySelector(s);
  const tokenMesa = (location.pathname.match(/^\/m\/([\w-]+)$/) || [])[1] || null;
  const chave = (k) => 'nm-' + (tokenMesa ? 'mesa-' + tokenMesa + '-' : '') + k;
  const guardado = (k, padrao) => { try { return JSON.parse(localStorage.getItem(k)) ?? padrao; } catch { return padrao; } };
  const guardar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sem armazenamento */ } };
  const SACOLA = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 7h12l-1 13H7z"/><path d="M9 7a3 3 0 0 1 6 0"/></svg>';
  const MANU = (nome) => '/img/manu/' + nome + '.webp';
  // Manu de cada etapa do pedido: [imagem, título, texto]
  function manuDaEtapa(p) {
    const mesa = p.tipo === 'mesa';
    switch (p.status) {
      case 'novo': return ['celular', 'Pedido recebido!', mesa ? 'O garçom já vai confirmar.' : 'Já já a gente confirma por aqui e no WhatsApp.'];
      case 'preparo': return ['joinha', 'Pedido confirmado!', 'Já está sendo preparado com carinho.'];
      case 'pronto':
        if (mesa) return ['bandeja', 'Prontinho!', 'Já está indo para a sua mesa.'];
        if (p.tipo === 'retirada') return ['sacola-duas', 'Pronto para retirar!', 'Pode vir buscar no balcão.'];
        return ['joinha', 'Quase saindo!', 'Seu pedido está pronto e já vai sair para entrega.'];
      case 'saiu': return ['sacola', 'Saiu para entrega!', 'Já já chega aí.'];
      case 'entregue': return ['coracao', mesa ? 'Bom apetite!' : 'Entregue!', 'Obrigado por pedir na Naturalle Mania!'];
      default: return ['acenando', 'Pedido cancelado', 'Qualquer dúvida, fale com a gente no WhatsApp.'];
    }
  }
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
    if (tokenMesa) {
      $('#balao').textContent = 'Oi! Escolha aí que a gente leva até a sua mesa!';
      $('#manu-topo').src = MANU('bandeja');
      $('#manu-topo').alt = 'Manu levando uma bandeja com hambúrguer, batata e refrigerante';
    }
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
    if (!ativos.length) { $('#acompanhar').innerHTML = ''; return; }
    const [img, titulo, texto] = manuDaEtapa(ativos[0]);
    $('#acompanhar').innerHTML = `<section class="acompanhar" aria-live="polite">
      <div class="manu-card"><img src="${MANU(img)}" alt="" width="104" height="130">
        <div><span class="nota">Pedido #${ativos[0].id}</span><h2>${titulo}</h2><p>${texto}</p></div></div>
      ${ativos.length > 1 ? `<h3>${tokenMesa ? 'Pedidos desta mesa' : 'Seus pedidos'}</h3>` : ''}
      ${ativos.length > 1 ? ativos.map((p) => `<div class="acomp-linha"><b>#${p.id}</b><span class="etapa etapa-${p.status}">${ETAPAS[p.status] || p.status}</span><span>${brl(p.total)}</span></div>`).join('') : ''}
    </section>`;
  }

  function renderDestaques() {
    const hoje = st.cardapio.produtos.filter((p) => Array.isArray(p.dias) && p.dias.includes(st.dia) && p.disponivel !== false);
    let quadro;
    if (!tokenMesa && !st.loja.aberta) {
      quadro = `<span class="giz-titulo">Fechados agora</span><span class="giz-texto">${esc(st.loja.horario || 'Volte mais tarde!')}</span>`;
    } else if (hoje.length) {
      const p = hoje[0];
      quadro = `<span class="giz-pequeno">Hoje é dia de</span><span class="giz-titulo">${esc(p.nome)}</span>
        <span class="giz-texto">${esc(p.descricao || '')}</span><span class="giz-preco">a partir de ${brl(window.Calc.precoMinimo(p))}</span>
        <button class="giz-botao" data-acao="destaque" data-v="${esc(p.id)}">Quero!</button>`;
    } else {
      quadro = `<span class="giz-titulo">${esc(st.loja.recado || 'Bateu a fome?')}</span><span class="giz-texto">${st.loja.recado ? '' : 'Açaí do seu jeito, Mac de 10 e muito mais!'}</span>`;
    }
    $('#destaques').innerHTML = `
      <section class="quadro-manu" aria-label="Destaque do dia">
        <img src="${MANU('quadro')}" alt="Manu ao lado do quadro-negro" width="900" height="1125">
        <div class="giz">${quadro}</div>
      </section>
      <div class="manu-card manu-aponta"><img src="${MANU('apontando')}" alt="" width="104" height="130">
        <div><h2>Escolha aqui embaixo!</h2><p>Toque no item para montar do seu jeito.</p></div></div>`;
  }

  function renderBarra() {
    const n = st.carrinho.reduce((s, i) => s + i.qtd, 0);
    $('#barra').innerHTML = n ? `<button class="botao escuro flex" data-acao="abrir">${SACOLA}<span class="flex" style="text-align:left">Ver carrinho <span class="contador">${n}</span></span><span>${brl(window.Calc.somar(st.carrinho))}</span></button>` : '';
  }

  function renderCarrinho() {
    const c = st.cliente, l = st.loja;
    if (st.enviado) {
      const p = st.enviado;
      const [img] = manuDaEtapa({ status: p.status || 'novo', tipo: tokenMesa ? 'mesa' : st.tipo });
      $('#carrinho-corpo').innerHTML = `<div class="sucesso"><img src="${MANU(img)}" alt="" width="104" height="130"><strong>Pedido #${esc(p.id)} enviado!</strong>
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
    $('#carrinho-corpo').innerHTML = `${st.carrinho.length ? `<div class="manu-card"><img src="${MANU('celular')}" alt="" width="84" height="105">
        <div><h2>Quase lá!</h2><p>Confira os itens e envie seu pedido.</p></div></div>` : ''}
      <div>${itens}</div>
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
      case 'destaque': {
        const p = st.cardapio.produtos.find((x) => x.id === b.dataset.v);
        if (p) window.Montador.abrirProduto(p, st.dia, adicionar);
        break;
      }
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
      $('#cardapio').innerHTML = `<div class="manu-card"><img src="${MANU('acenando')}" alt="" width="104" height="130">
        <div><h2>Ops!</h2><p>${esc(e.message)}</p></div></div>`;
      return;
    }
    // itens guardados de outro dia podem ter mudado de preço ou acabado
    st.carrinho = st.carrinho.filter((i) => { try { Object.assign(i, window.Calc.calcular(st.cardapio, i.escolha, st.dia)); return true; } catch { return false; } });
    renderTopo();
    renderDestaques();
    montador = window.Montador.criar({
      el: $('#cardapio'), cardapio: st.cardapio, dia: st.dia, onAdicionar: adicionar,
      banners: { acai: `<div class="manu-card manu-acai"><img src="${MANU('acai')}" alt="" width="104" height="130">
        <div><h2>Açaí cremoso</h2><p>Escolha o tamanho do copo e monte com frutas, cremes, chocolates e caldas.</p></div></div>`,
        mac: `<div class="manu-card manu-mac"><img src="${MANU('hamburguer')}" alt="" width="104" height="130">
        <div><h2>Aqui é Mac de 10!</h2><p>Escolha com 1, 2 ou 3 hambúrgueres. Vem com alface, tomate, cheddar ou mussarela e molho da casa. E tem porção de batata para acompanhar!</p></div></div>` },
    });
    renderBarra();
    acompanhar();
    setInterval(() => { if (st.meus.length && !document.hidden) acompanhar(); }, 15000);
  })();
})();
