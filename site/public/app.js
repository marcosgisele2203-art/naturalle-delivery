(function () {
  const M = window.MENU;
  const brl = M.brl;
  const curto = (v) => brl(v).replace(',00', '');
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const MAIS = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
  const X = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  const SACOLA = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 7h12l-1 13H7z"/><path d="M9 7a3 3 0 0 1 6 0"/></svg>';

  function diaDaSemana() {
    const nome = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Campo_Grande', weekday: 'short' }).format(new Date());
    return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(nome);
  }

  const guardado = (k, padrao) => { try { return JSON.parse(localStorage.getItem(k)) ?? padrao; } catch { return padrao; } };
  const guardar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sem armazenamento */ } };

  const st = {
    aba: 'acai',
    copo: 2, acaiAds: [],
    macOp: 0, queijo: 'Cheddar', macAds: [],
    sabores: {},
    carrinho: guardado('nm-carrinho', []),
    cliente: guardado('nm-cliente', { nome: '', telefone: '', endereco: '' }),
    pagamento: 'pix', troco: '', obs: '',
    enviando: false, erro: '', enviado: null,
  };
  const dia = diaDaSemana();

  const ABAS = [['acai', 'Monte seu açaí'], ['mac', 'Mac de 10'], ['combos', 'Combos do dia'], ['bebidas', 'Bebidas e mais']];

  function calcAtual() {
    if (st.aba === 'acai') return { tipo: 'acai', copo: st.copo, adicionais: st.acaiAds };
    if (st.aba === 'mac') return { tipo: 'mac', opcao: st.macOp, queijo: st.queijo, adicionais: st.macAds };
    return null;
  }

  function adicionar(escolha) {
    const calc = M.calcular(escolha, dia);
    st.carrinho.push({ escolha, ...calc, k: Date.now() + Math.random() });
    st.enviado = null;
    guardar('nm-carrinho', st.carrinho);
  }

  const total = () => st.carrinho.reduce((s, i) => s + i.preco, 0);

  // ---------- render ----------
  function renderAbas() {
    $('#abas').innerHTML = ABAS.map(([id, nome]) =>
      `<button class="aba" role="tab" aria-selected="${st.aba === id}" data-acao="aba" data-v="${id}">${nome}</button>`).join('');
  }

  function renderAcai() {
    const copos = M.copos.map((c, i) =>
      `<button class="caixa" aria-pressed="${st.copo === i}" data-acao="copo" data-v="${i}"><b>${c.nome}</b><span>${curto(c.preco)}</span></button>`).join('');
    const grupos = M.adicionais.map((g) => `
      <div class="grupo"><h3>${g.grupo}</h3><div class="chips">
        ${g.itens.map(([n, p]) => {
          const k = g.grupo + ':' + n;
          return `<button class="chip" aria-pressed="${st.acaiAds.includes(k)}" data-acao="acai-ad" data-v="${esc(k)}">${esc(n)} <small>${p ? '+' + curto(p) : 'grátis'}</small></button>`;
        }).join('')}
      </div></div>`).join('');
    return `<h2 class="passo">1º passo · Escolha seu copo</h2><div class="copos">${copos}</div>
      <h2 class="passo">2º passo · Adicionais</h2>${grupos}`;
  }

  function renderMac() {
    const m = M.mac;
    const ops = m.opcoes.map(([n, p], i) =>
      `<button class="caixa" aria-pressed="${st.macOp === i}" data-acao="mac-op" data-v="${i}"><b>${n}</b><span>R$ ${p}</span></button>`).join('');
    const qs = m.queijos.map((q) => `<button class="chip" aria-pressed="${st.queijo === q}" data-acao="queijo" data-v="${q}">${q}</button>`).join('');
    const ads = m.adicionais.map(([n, p]) =>
      `<button class="chip" aria-pressed="${st.macAds.includes(n)}" data-acao="mac-ad" data-v="${esc(n)}">${esc(n)} <small>+R$ ${p}</small></button>`).join('');
    return `<section class="mac"><h2>Mac de 10</h2><p>${m.descricao}</p>
        <div class="opcoes">${ops}</div>
        <span class="rotulo">Queijo</span><div class="chips">${qs}</div>
        <span class="rotulo">Adicionais</span><div class="chips">${ads}</div></section>
      ${listaProdutos('lanches')}`;
  }

  function listaProdutos(cat) {
    return M.produtos.filter((p) => p.cat === cat).map((p) => {
      const sabor = p.sabores ? `<label class="sr"><select data-acao="sabor" data-v="${p.id}" aria-label="Sabor de ${esc(p.nome)}">
          <option value="">Escolha o sabor</option>${p.sabores.map((s) => `<option${st.sabores[p.id] === s ? ' selected' : ''}>${esc(s)}</option>`).join('')}
        </select></label>` : '';
      const semPreco = p.preco == null;
      return `<article class="produto"><div class="produto-info">
          <h3>${esc(p.nome)}</h3>${p.desc && !p.sabores ? `<span class="desc">${esc(p.desc)}</span>` : ''}
          ${p.sabores ? `<span class="desc">${esc(p.desc)}</span>` : ''}
          <span class="preco">${semPreco ? 'Consulte no WhatsApp' : brl(p.preco)}</span>${sabor}
        </div>
        <button class="mais" data-acao="produto" data-v="${p.id}" aria-label="Adicionar ${esc(p.nome)}"${semPreco ? ' disabled' : ''}>${MAIS}</button></article>`;
    }).join('');
  }

  function renderCombos() {
    return `<p class="nota">Preço promocional só no dia do combo.</p>` + M.combos.map((c) => {
      const hoje = c.weekday === dia;
      const tams = M.tamanhosCombo.map((t, i) => `
        <button class="tamanho" data-acao="combo" data-dia="${c.dia}" data-v="${i}" aria-label="Adicionar combo ${c.dia} ${t}">
          <small>${t}</small>${hoje ? `<s>${curto(c.normal[i])}</s>` : ''}<b>${curto(hoje ? c.promo[i] : c.normal[i])}</b>
        </button>`).join('');
      return `<article class="combo" style="background:${c.cor}"><div class="combo-topo"><h3>${c.dia}</h3>${hoje ? '<span class="hoje">Hoje</span>' : ''}</div>
        <p>${c.desc}</p><div class="tamanhos">${tams}</div></article>`;
    }).join('');
  }

  function renderConteudo() {
    const html = { acai: renderAcai, mac: renderMac, combos: renderCombos, bebidas: () => listaProdutos('bebidas') }[st.aba]();
    $('#conteudo').innerHTML = html;
  }

  function renderBarra() {
    const n = st.carrinho.length;
    const atual = calcAtual();
    let html = '';
    if (atual) {
      const preco = M.calcular(atual, dia).preco;
      html = `<button class="botao rosa flex" data-acao="montar"><span>Adicionar</span><span>${brl(preco)}</span></button>
        <button class="botao escuro" data-acao="abrir" aria-label="Abrir carrinho, ${n} itens">${SACOLA}<span class="contador">${n}</span></button>`;
    } else if (n) {
      html = `<button class="botao escuro flex" data-acao="abrir"><span>Ver carrinho <span class="contador">${n}</span></span><span>${brl(total())}</span></button>`;
    }
    $('#barra').innerHTML = html;
  }

  function renderCarrinho() {
    const c = st.cliente;
    if (st.enviado) {
      $('#carrinho-corpo').innerHTML = `<div class="sucesso"><strong>Pedido #${esc(st.enviado.id)} enviado!</strong>
        <span>${st.enviado.pix ? 'A chave Pix chegou no seu WhatsApp. Responda lá com a foto do comprovante.' : 'A confirmação chegou no seu WhatsApp.'}
        Vamos avisando cada etapa pelo número (67) 9715-5502.</span></div>
        <button class="botao verde" data-acao="fechar">Fazer outro pedido</button>`;
      return;
    }
    const itens = st.carrinho.length
      ? st.carrinho.map((i) => `<div class="linha-item"><div><b>${esc(i.nome)}</b><small>${esc(i.detalhe)}</small></div>
          <b>${brl(i.preco)}</b><button class="icone" data-acao="remover" data-v="${i.k}" aria-label="Remover ${esc(i.nome)}">${X}</button></div>`).join('')
      : '<p class="vazio">Seu carrinho está vazio.</p>';
    const pags = [['pix', 'Pix'], ['cartao', 'Cartão'], ['dinheiro', 'Dinheiro']].map(([v, n]) =>
      `<button class="chip" aria-pressed="${st.pagamento === v}" data-acao="pagamento" data-v="${v}">${n}</button>`).join('');
    const ajuda = { pix: 'A chave Pix chega no seu WhatsApp. Responda com o comprovante.', cartao: 'O entregador leva a maquininha.', dinheiro: '' }[st.pagamento];
    $('#carrinho-corpo').innerHTML = `
      <div>${itens}</div>
      <form id="form-pedido" novalidate style="display:flex;flex-direction:column;gap:12px">
        <label class="campo">Seu nome<input name="nome" autocomplete="name" required value="${esc(c.nome)}"></label>
        <label class="campo">WhatsApp com DDD<input name="telefone" type="tel" inputmode="tel" autocomplete="tel" placeholder="(67) 99999-9999" required value="${esc(c.telefone)}"></label>
        <label class="campo">Endereço de entrega<input name="endereco" autocomplete="street-address" placeholder="Rua, número, bairro, referência" required value="${esc(c.endereco)}"></label>
        <label class="campo">Observações (opcional)<textarea name="obs" placeholder="Ex.: sem cebola, adicionais da Marmita Trufada...">${esc(st.obs)}</textarea></label>
        <div class="campo"><span>Forma de pagamento</span><div class="pagamentos">${pags}</div>
          ${ajuda ? `<small style="font-weight:400;color:var(--cinza)">${ajuda}</small>` : ''}</div>
        ${st.pagamento === 'dinheiro' ? `<label class="campo">Troco para quanto? (opcional)<input name="troco" inputmode="decimal" placeholder="Ex.: 50,00" value="${esc(st.troco)}"></label>` : ''}
        <div class="total"><span>Total</span><span>${brl(total())}</span></div>
        ${st.erro ? `<p class="erro" role="alert">${esc(st.erro)}</p>` : ''}
        <button class="botao verde" type="submit"${st.enviando || !st.carrinho.length ? ' disabled' : ''}>${st.enviando ? 'Enviando…' : 'Enviar pedido'}</button>
      </form>`;
  }

  function render() { renderAbas(); renderConteudo(); renderBarra(); if (!$('#carrinho').hidden) renderCarrinho(); }

  // ---------- eventos ----------
  const alterna = (lista, v) => (lista.includes(v) ? lista.filter((x) => x !== v) : [...lista, v]);

  function lerForm() {
    const f = $('#form-pedido');
    if (!f) return;
    const d = new FormData(f);
    st.cliente = { nome: d.get('nome') || '', telefone: d.get('telefone') || '', endereco: d.get('endereco') || '' };
    st.obs = d.get('obs') || '';
    if (d.has('troco')) st.troco = d.get('troco') || '';
    guardar('nm-cliente', st.cliente);
  }

  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-acao]');
    if (!b || b.tagName === 'SELECT') return;
    const v = b.dataset.v;
    switch (b.dataset.acao) {
      case 'aba': st.aba = v; break;
      case 'copo': st.copo = +v; break;
      case 'acai-ad': st.acaiAds = alterna(st.acaiAds, v); break;
      case 'mac-op': st.macOp = +v; break;
      case 'queijo': st.queijo = v; break;
      case 'mac-ad': st.macAds = alterna(st.macAds, v); break;
      case 'montar':
        adicionar(calcAtual());
        if (st.aba === 'acai') st.acaiAds = []; else st.macAds = [];
        avisar('Adicionado ao carrinho');
        break;
      case 'combo': adicionar({ tipo: 'combo', dia: b.dataset.dia, tamanho: +v }); avisar('Combo adicionado'); break;
      case 'produto': {
        const p = M.produtos.find((x) => x.id === v);
        if (p.sabores && !st.sabores[v]) { avisar('Escolha o sabor primeiro'); return; }
        adicionar({ tipo: 'produto', id: v, sabor: st.sabores[v] });
        avisar('Adicionado ao carrinho');
        break;
      }
      case 'abrir': $('#carrinho').hidden = false; st.erro = ''; document.body.style.overflow = 'hidden'; break;
      case 'fechar': lerForm(); $('#carrinho').hidden = true; st.enviado = null; document.body.style.overflow = ''; break;
      case 'remover': lerForm(); st.carrinho = st.carrinho.filter((i) => String(i.k) !== v); guardar('nm-carrinho', st.carrinho); break;
      case 'pagamento': lerForm(); st.pagamento = v; break;
      default: return;
    }
    e.preventDefault();
    render();
  });

  document.addEventListener('change', (e) => {
    if (e.target.dataset.acao === 'sabor') st.sabores[e.target.dataset.v] = e.target.value;
  });

  $('#carrinho').addEventListener('click', (e) => { if (e.target.id === 'carrinho') { lerForm(); $('#carrinho').hidden = true; document.body.style.overflow = ''; render(); } });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#carrinho').hidden) { lerForm(); $('#carrinho').hidden = true; document.body.style.overflow = ''; render(); } });

  document.addEventListener('submit', async (e) => {
    if (e.target.id !== 'form-pedido') return;
    e.preventDefault();
    lerForm();
    const c = st.cliente;
    const tel = c.telefone.replace(/\D/g, '');
    if (!c.nome.trim()) st.erro = 'Informe seu nome.';
    else if (tel.length < 10 || tel.length > 13) st.erro = 'Informe seu WhatsApp com DDD.';
    else if (!c.endereco.trim()) st.erro = 'Informe o endereço de entrega.';
    else st.erro = '';
    if (st.erro) return renderCarrinho();

    st.enviando = true; renderCarrinho();
    try {
      const r = await fetch('/api/pedido', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cliente: { nome: c.nome, telefone: tel }, endereco: c.endereco, observacoes: st.obs,
          pagamento: st.pagamento, troco_para: st.pagamento === 'dinheiro' ? st.troco : null,
          itens: st.carrinho.map((i) => i.escolha),
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.erro || 'Não foi possível enviar. Tente de novo.');
      st.enviado = { id: d.pedido_id || '', pix: st.pagamento === 'pix' };
      st.carrinho = []; st.obs = ''; st.troco = '';
      guardar('nm-carrinho', []);
    } catch (err) {
      st.erro = err.message;
    }
    st.enviando = false;
    render();
  });

  // aviso rápido acessível
  let timer;
  function avisar(msg) {
    let el = $('#aviso');
    if (!el) {
      el = document.createElement('div');
      el.id = 'aviso'; el.setAttribute('role', 'status');
      el.style.cssText = 'position:fixed;left:50%;bottom:92px;transform:translateX(-50%);z-index:20;background:#17201A;color:#fff;padding:10px 16px;border-radius:12px;font-weight:600;font-size:14px;transition:opacity .2s';
      document.body.appendChild(el);
    }
    el.textContent = msg; el.style.opacity = '1';
    clearTimeout(timer); timer = setTimeout(() => { el.style.opacity = '0'; }, 1600);
  }

  // recalcula preços de itens salvos (o cardápio pode ter mudado)
  st.carrinho = st.carrinho.filter((i) => { try { Object.assign(i, M.calcular(i.escolha, dia)); return true; } catch { return false; } });
  render();
})();
