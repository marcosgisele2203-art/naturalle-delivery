// Área da equipe: login, menu por permissão, navegação e utilidades comuns às telas.
(function () {
  const { esc, brl } = window.Montador;
  const $ = (s, el = document) => el.querySelector(s);

  const App = {
    esc, brl, views: {}, usuario: null, permissoes: {},
    pedidos: [], cardapio: null, loja: null, dia: 0,
    ouvintes: [], limpar: null, atual: null,
  };
  window.App = App;

  // ---------------- utilidades
  App.api = async function (url, corpo, metodo) {
    const r = await fetch(url, corpo !== undefined
      ? { method: metodo || 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) }
      : {});
    const d = await r.json().catch(() => ({}));
    if (r.status === 401 && !url.includes('/entrar')) { App.usuario = null; telaLogin(); throw new Error(d.erro || 'Faça login'); }
    if (!r.ok) throw new Error(d.erro || 'Erro ' + r.status);
    return d;
  };

  App.pode = (...perms) => !!App.usuario && (App.usuario.permissoes.includes('admin') || perms.some((p) => App.usuario.permissoes.includes(p)));
  App.minutos = (iso) => Math.max(0, Math.floor((Date.now() - new Date(iso)) / 60000));
  App.tempo = (iso) => {
    const m = App.minutos(iso);
    if (m < 1) return 'agora';
    if (m < 60) return 'há ' + m + ' min';
    return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  };
  App.fone = (t) => { const d = String(t || '').replace(/^55/, ''); return d.length >= 10 ? `(${d.slice(0, 2)}) ${d.slice(2, -4)}-${d.slice(-4)}` : t; };

  let timerToast;
  App.toast = (msg, ruim) => {
    let el = $('#toast');
    if (!el) { el = document.createElement('div'); el.id = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    el.className = 'toast' + (ruim ? ' ruim' : '');
    el.textContent = msg; el.style.opacity = '1';
    clearTimeout(timerToast); timerToast = setTimeout(() => { el.style.opacity = '0'; }, ruim ? 4000 : 2000);
  };

  App.janela = (titulo, html) => {
    const j = document.createElement('div');
    j.className = 'janela';
    j.innerHTML = `<div role="dialog" aria-modal="true" aria-label="${esc(titulo)}"><div class="janela-topo"><h2>${esc(titulo)}</h2>
      <button class="btn" data-fechar>Fechar</button></div><div class="janela-corpo">${html}</div></div>`;
    const fechar = () => { j.remove(); document.removeEventListener('keydown', tecla); };
    const tecla = (e) => { if (e.key === 'Escape') fechar(); };
    j.addEventListener('click', (e) => { if (e.target === j || e.target.closest('[data-fechar]')) fechar(); });
    document.addEventListener('keydown', tecla);
    document.body.appendChild(j);
    j.fechar = fechar;
    j.corpo = $('.janela-corpo', j);
    return j;
  };

  // som de aviso (o navegador só deixa tocar depois de um clique na página)
  let audio;
  App.somLigado = () => { try { return localStorage.getItem('nm-som') === '1'; } catch { return false; } };
  App.alternarSom = () => { try { localStorage.setItem('nm-som', App.somLigado() ? '0' : '1'); } catch { /* */ } if (App.somLigado()) App.bip(); };
  App.bip = (vezes = 3) => {
    if (!App.somLigado()) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
      for (let i = 0; i < vezes; i++) {
        const t = audio.currentTime + i * 0.28;
        const o = audio.createOscillator(), g = audio.createGain();
        o.frequency.value = 880; o.connect(g); g.connect(audio.destination);
        g.gain.setValueAtTime(0.3, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
        o.start(t); o.stop(t + 0.22);
      }
    } catch { /* sem áudio */ }
  };
  document.addEventListener('click', () => { if (audio && audio.state === 'suspended') audio.resume(); });

  // ---------------- cartão de pedido (pedidos, garçom, caixa)
  const ROTULO_TIPO = { mesa: 'Mesa', entrega: 'Entrega', retirada: 'Retirada' };
  App.rotuloOrigem = (p) => (p.tipo === 'mesa' ? esc(p.mesa_nome || 'Mesa') : ROTULO_TIPO[p.tipo] || p.tipo)
    + (p.origem === 'site' ? ' · site' : p.origem === 'mesa' ? ' · QR' : p.criado_por_nome ? ' · ' + esc(p.criado_por_nome) : '');

  App.cartaoPedido = (p, acoes = [], extra = {}) => {
    const itens = window.Montador.linhas(p.itens || []);
    let pag = '';
    if (p.pagamento === 'pix') {
      const s = { aguardando: ['alerta', 'Pix: aguardando comprovante'], comprovante_recebido: ['alerta', 'Pix: comprovante recebido, conferir'], confirmado: ['ok', 'Pix confirmado'] }[p.pix_status] || ['', 'Pix'];
      pag = `<span class="tag ${s[0]}">${s[1]}</span>`;
    } else if (p.pagamento === 'cartao') pag = '<span class="tag">Cartão</span>';
    else if (p.pagamento === 'dinheiro') pag = `<span class="tag">Dinheiro${p.troco_para ? ' · troco p/ ' + brl(p.troco_para) : ''}</span>`;
    else if (p.tipo === 'mesa') pag = '<span class="tag">Paga na conta da mesa</span>';
    return `<article class="pedido${extra.destaque ? ' destaque' : ''}" data-id="${p.id}">
      <div class="pedido-topo"><b>#${p.id}</b><span class="origem origem-${p.tipo}">${App.rotuloOrigem(p)}</span><span>${App.tempo(p.criado_em)}</span></div>
      ${p.cliente_nome || p.endereco ? `<div class="cliente">${p.cliente_nome ? `<strong>${esc(p.cliente_nome)}</strong>` : ''}${p.endereco ? `<span>${esc(p.endereco)}</span>` : ''}${p.cliente_telefone ? `<span>${App.fone(p.cliente_telefone)}</span>` : ''}</div>` : ''}
      <div>${itens}</div>
      ${p.observacoes ? `<div class="obs"><b>Obs.:</b> ${esc(p.observacoes)}</div>` : ''}
      <div class="tags">${pag}${Number(p.taxa_entrega) ? `<span class="tag">Entrega ${brl(p.taxa_entrega)}</span>` : ''}${Number(p.acrescimo_cartao) ? `<span class="tag">Maquininha ${brl(p.acrescimo_cartao)}</span>` : ''}<span class="tag forte">${brl(p.total)}</span></div>
      ${acoes.length ? `<div class="acoes">${acoes.map((a) => a.href
        ? `<a class="btn" href="${esc(a.href)}" target="_blank" rel="noopener">${a.rotulo}</a>`
        : `<button class="btn ${a.classe || ''}" data-acao="${a.acao}" data-id="${p.id}"${a.valor ? ` data-valor="${a.valor}"` : ''}>${a.rotulo}</button>`).join('')}</div>` : ''}
    </article>`;
  };

  // muda status com tratamento de erro e atualização
  App.mudarStatus = async (id, status, botao) => {
    if (botao) botao.disabled = true;
    try {
      await App.api('/api/equipe/pedido/' + id + '/status', { status });
    } catch (e) {
      App.toast(e.message, true);
    }
    await App.atualizarPedidos();
  };

  // ---------------- pedidos compartilhados entre as telas (uma consulta a cada 5 s)
  let anteriores = null, timerPedidos;
  App.on = (fn) => { App.ouvintes.push(fn); return () => { App.ouvintes = App.ouvintes.filter((f) => f !== fn); }; };
  App.atualizarPedidos = async () => {
    if (!App.pode('pedidos', 'garcom', 'caixa', 'cozinha')) return;
    try {
      const d = await App.api('/api/equipe/pedidos');
      App.pedidos = d.pedidos;
      const mudaram = [];
      const agora = new Map(d.pedidos.map((p) => [p.id, p.status]));
      if (anteriores) for (const [id, s] of agora) if (anteriores.get(id) !== s) mudaram.push({ id, de: anteriores.get(id), para: s });
      anteriores = agora;
      App.online = true;
      atualizarContagens();
      App.ouvintes.forEach((f) => f(mudaram));
    } catch {
      App.online = false;
      App.ouvintes.forEach((f) => f(null));
    }
  };

  App.carregarCardapio = async () => {
    const d = await App.api('/api/equipe/cardapio');
    App.cardapio = d.cardapio; App.loja = d.loja; App.dia = d.dia;
    return d;
  };

  // ---------------- login
  function telaLogin(primeiro) {
    pararTudo();
    $('#raiz').innerHTML = `<div class="tela-login"><form class="caixa-login" id="form-login">
      <img class="manu-login" src="/img/manu/acenando.webp" alt="Manu acenando" width="120" height="150">
      <h1>Naturalle <span>Mania</span></h1>
      <p>${primeiro ? 'Primeiro acesso: crie o usuário administrador.' : 'Área da equipe'}</p>
      ${primeiro ? '<label class="campo">Seu nome<input name="nome" required autocomplete="name"></label>' : ''}
      <label class="campo">Login<input name="login" required autocomplete="username" autocapitalize="none"></label>
      <label class="campo">Senha<input type="password" name="senha" required autocomplete="${primeiro ? 'new-password' : 'current-password'}"${primeiro ? ' minlength="8"' : ''}>${primeiro ? '<small>Pelo menos 8 caracteres.</small>' : ''}</label>
      <p class="erro" id="erro-login" role="alert" hidden></p>
      <button class="btn principal grande" type="submit">${primeiro ? 'Criar administrador' : 'Entrar'}</button>
    </form></div>`;
    $('#form-login').addEventListener('submit', async (e) => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(e.target));
      try {
        await App.api(primeiro ? '/api/equipe/primeiro-admin' : '/api/equipe/entrar', d);
        await App.iniciar();
      } catch (err) {
        $('#erro-login').textContent = err.message; $('#erro-login').hidden = false;
      }
    });
    const i = $('#form-login input'); if (i) i.focus();
  }

  // ---------------- layout e navegação
  const MENU = [
    ['pedidos', 'Pedidos', ['pedidos']],
    ['cozinha', 'Cozinha', ['cozinha']],
    ['garcom', 'Mesas (garçom)', ['garcom']],
    ['balcao', 'Novo pedido', ['caixa', 'pedidos']],
    ['caixa', 'Caixa', ['caixa']],
    ['admin', 'Administração', ['admin']],
  ];
  const permitidos = () => MENU.filter(([, , perms]) => App.pode(...perms));

  function atualizarContagens() {
    const conta = {
      pedidos: App.pedidos.filter((p) => p.status === 'novo').length,
      cozinha: App.pedidos.filter((p) => p.status === 'preparo').length,
      garcom: App.pedidos.filter((p) => p.tipo === 'mesa' && (p.status === 'novo' || p.status === 'pronto')).length,
    };
    for (const [nome, n] of Object.entries(conta)) {
      const el = document.querySelector(`.lateral a[data-view="${nome}"] .contagem`);
      if (el) { el.textContent = n; el.hidden = !n; }
    }
  }

  function layout() {
    $('#raiz').innerHTML = `<div class="app" id="app">
      <nav class="lateral" aria-label="Seções">
        <span class="marca">Naturalle Mania</span>
        ${permitidos().map(([id, nome]) => `<a href="#/${id}" data-view="${id}">${nome}<span class="contagem" hidden></span></a>`).join('')}
        <div class="quem"><span>${esc(App.usuario.nome)}</span>
          <button id="minha-senha" type="button">Trocar senha</button>
          <button id="sair" type="button">Sair</button></div>
      </nav>
      <main class="area" id="area"></main>
    </div>`;
    $('#sair').addEventListener('click', async () => { await App.api('/api/equipe/sair', {}); App.usuario = null; telaLogin(); });
    $('#minha-senha').addEventListener('click', trocarSenha);
  }

  function trocarSenha() {
    const j = App.janela('Trocar minha senha', `<form class="grade-form" id="f-senha" style="grid-template-columns:1fr">
      <label class="campo">Senha atual<input type="password" name="atual" required autocomplete="current-password"></label>
      <label class="campo">Nova senha<input type="password" name="nova" required minlength="8" autocomplete="new-password"><small>Pelo menos 8 caracteres.</small></label>
      <p class="erro" hidden></p><button class="btn verde grande">Salvar</button></form>`);
    $('#f-senha', j).addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await App.api('/api/equipe/minha-senha', Object.fromEntries(new FormData(e.target)));
        j.fechar(); App.toast('Senha trocada. Entre de novo.'); telaLogin();
      } catch (err) { const p = $('.erro', j); p.textContent = err.message; p.hidden = false; }
    });
  }

  function pararTudo() {
    if (App.limpar) { try { App.limpar(); } catch { /* */ } App.limpar = null; }
    App.ouvintes = [];
    clearInterval(timerPedidos);
  }

  function navegar() {
    const [nome, ...resto] = location.hash.replace(/^#\/?/, '').split('/');
    const lista = permitidos();
    if (!lista.length) { $('#area').innerHTML = '<p class="erro">Seu usuário ainda não tem nenhuma seção liberada. Fale com o administrador.</p>'; return; }
    const item = lista.find(([id]) => id === nome);
    if (!item) { location.replace('#/' + lista[0][0]); return; }
    if (App.limpar) { try { App.limpar(); } catch { /* */ } App.limpar = null; }
    App.ouvintes = [];
    document.querySelectorAll('.lateral a').forEach((a) => { if (a.dataset.view === nome) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    document.body.classList.toggle('modo-cozinha', nome === 'cozinha');
    // elemento novo a cada tela: os eventos da tela anterior não continuam ligados
    const area = document.createElement('main');
    area.className = 'area'; area.id = 'area';
    $('#area').replaceWith(area);
    App.atual = nome;
    App.limpar = App.views[nome].montar(area, resto) || null;
    window.scrollTo(0, 0);
    App.atualizarPedidos();
  }

  // aba voltou a ficar visível: atualiza na hora
  document.addEventListener('visibilitychange', () => { if (!document.hidden && App.usuario) App.atualizarPedidos(); });

  App.iniciar = async function () {
    pararTudo();
    let d;
    try { d = await App.api('/api/equipe/eu'); } catch (e) {
      $('#raiz').innerHTML = `<p class="erro" style="margin:24px">Servidor fora do ar: ${esc(e.message)}</p>`; return;
    }
    if (!d.usuario) return telaLogin(d.primeiro_acesso);
    App.usuario = d.usuario; App.permissoes = d.permissoes;
    layout();
    window.onhashchange = navegar;
    await App.atualizarPedidos();
    timerPedidos = setInterval(() => { if (!document.hidden) App.atualizarPedidos(); }, 5000);
    navegar();
  };
})();
