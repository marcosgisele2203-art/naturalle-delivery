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
    if (r.status === 401 && !url.includes('/entrar')) { App.usuario = null; telaLogin(painelDaTela(App.atual)); throw new Error(d.erro || 'Faça login'); }
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
    + (p.origem === 'site' ? ' · site' : p.origem === 'mesa' ? ' · QR' : p.origem === 'whatsapp' ? ' · Manu (WhatsApp)' : p.origem === 'manu' ? ' · Manu (chat)' : p.criado_por_nome ? ' · ' + esc(p.criado_por_nome) : '');

  App.cartaoPedido = (p, acoes = [], extra = {}) => {
    const itens = window.Montador.linhas(p.itens || []);
    let pag = '';
    if (p.pagamento === 'pix') {
      const s = { aguardando: ['alerta', 'Pix: aguardando comprovante'], comprovante_recebido: ['alerta', 'Pix: comprovante recebido, conferir'], confirmado: ['ok', p.mp_pagamento_id ? 'Pix pago (Mercado Pago)' : 'Pix confirmado'], vencido: ['alerta', 'Pix venceu sem pagar'] }[p.pix_status] || ['', 'Pix'];
      if (p.pix_status === 'aguardando' && p.mp_pagamento_id) s[1] = 'Pix: aguardando pagamento (automático)';
      pag = `<span class="tag ${s[0]}">${s[1]}</span>`;
      // o que a Manu leu no comprovante (só ajuda: confirmar é no extrato do banco)
      const c = p.pix_conferencia;
      if (c && p.pix_status !== 'confirmado') {
        pag += c.alertas && c.alertas.length
          ? `<div class="pix-conf alerta"><b>⚠️ Conferir com cuidado:</b> ${c.alertas.map(esc).join('; ')}.</div>`
          : `<div class="pix-conf ok">✅ Comprovante lido pela Manu: ${c.valor ? brl(c.valor) : ''}${c.recebedor ? ' para ' + esc(c.recebedor) : ''}. Confira no banco.</div>`;
      }
    } else if (p.pagamento === 'cartao') pag = '<span class="tag">Cartão</span>';
    else if (p.pagamento === 'dinheiro') pag = `<span class="tag">Dinheiro${p.troco_para ? ' · paga com ' + brl(p.troco_para) + ' · troco ' + brl(Number(p.troco_para) - Number(p.total)) : ''}</span>`;
    else if (p.tipo === 'mesa') pag = '<span class="tag">Paga na conta da mesa</span>';
    return `<article class="pedido${extra.destaque ? ' destaque' : ''}" data-id="${p.id}">
      <div class="pedido-topo"><b>#${p.id}</b><span class="origem origem-${p.tipo}">${App.rotuloOrigem(p)}</span><span>${App.tempo(p.criado_em)}</span></div>
      ${p.cliente_nome || p.endereco ? `<div class="cliente">${p.cliente_nome ? `<strong>${esc(p.cliente_nome)}</strong>` : ''}${p.endereco ? `<span>${esc(p.endereco)}</span>` : ''}${p.localizacao ? `<a class="selo-cliente" href="https://www.google.com/maps/search/?api=1&query=${p.localizacao.lat},${p.localizacao.lng}" target="_blank" rel="noopener">📍 Ver no mapa</a>` : ''}${p.cliente_telefone ? `<span>${App.fone(p.cliente_telefone)}</span>` : ''}${p.n_pedido_cliente ? `<span class="selo-cliente${p.n_pedido_cliente === 1 ? ' novo' : ''}">${p.n_pedido_cliente === 1 ? 'Cliente novo' : p.n_pedido_cliente + 'º pedido'}</span>` : ''}</div>` : ''}
      <div>${itens}</div>
      ${p.observacoes ? `<div class="obs"><b>Obs.:</b> ${esc(p.observacoes)}</div>` : ''}
      <div class="tags">${pag}${Number(p.taxa_entrega) ? `<span class="tag">Entrega ${brl(p.taxa_entrega)}</span>` : ''}${Number(p.acrescimo_cartao) ? `<span class="tag">Maquininha ${brl(p.acrescimo_cartao)}</span>` : ''}<span class="tag forte">${brl(p.total)}</span>${p.entregador_nome ? `<span class="tag">Entregador: ${esc(p.entregador_nome)}</span>` : ''}${p.pago_em ? '<span class="tag ok">Pago</span>' : ''}</div>
      ${`<div class="acoes">${acoes.map((a) => a.href
        ? `<a class="btn" href="${esc(a.href)}" target="_blank" rel="noopener">${a.rotulo}</a>`
        : `<button class="btn ${a.classe || ''}" data-acao="${a.acao}" data-id="${p.id}"${a.valor ? ` data-valor="${a.valor}"` : ''}>${a.rotulo}</button>`).join('')}
        <button class="btn fraco" data-imprimir="${p.id}">Imprimir</button></div>`}
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
    if (!App.pode('pedidos', 'garcom', 'caixa', 'cozinha', 'entregador')) return;
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

  // ---------------- entrada: escolha do painel, depois o login
  const ICONES = {
    admin: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
    atendimento: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M9 10h6M9 14h6M9 18h3"/>',
    cozinha: '<path d="M7 14a4 4 0 1 1 2-7.5 4 4 0 0 1 6 0A4 4 0 1 1 17 14v5H7z"/><path d="M7 17h10"/>',
    garcom: '<circle cx="9" cy="8" r="3.5"/><path d="M3 20a6 6 0 0 1 12 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3 6"/>',
    entregador: '<path d="M3 6h11v10H3zM14 9h4l3 3v4h-7"/><circle cx="7" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>',
    cardapio: '<path d="M12 6c-2-1.5-5-2-8-1.5v14c3-.5 6 0 8 1.5 2-1.5 5-2 8-1.5v-14c-3-.5-6 0-8 1.5zM12 6v14"/>',
  };
  const PAINEIS = [
    { id: 'admin', nome: 'Administração', texto: 'Aqui você organiza a loja, os cadastros e os controles.', telas: ['admin'] },
    { id: 'atendimento', nome: 'Atendimento e caixa', texto: 'Receba os pedidos, confira pagamentos e cuide do caixa.', telas: ['pedidos', 'caixa', 'relatorios'] },
    { id: 'cozinha', nome: 'Cozinha', texto: 'Veja o que preparar e avise quando estiver pronto.', telas: ['cozinha'] },
    { id: 'garcom', nome: 'Garçom', texto: 'Anote pedidos, abra mesas e acrescente novas rodadas.', telas: ['garcom'] },
    { id: 'entregador', nome: 'Entregador', texto: 'Confira suas entregas, abra a rota e confirme a entrega.', telas: ['entregas'] },
  ];
  const icone = (id) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONES[id]}</svg>`;
  const cadeado = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>';
  // primeira tela do painel que a pessoa logada pode abrir
  const telaLiberada = (painel) => painel.telas.find((t) => permitidos().some(([id]) => id === t));
  const painelDaTela = (tela) => PAINEIS.find((p) => p.id === tela || p.telas.includes(tela));
  // painel em que a pessoa entrou neste aparelho: cada cartão pede o próprio login
  const lerPainel = () => { try { return localStorage.getItem('nm-painel'); } catch { return null; } };
  const gravarPainel = (id) => { try { if (id) localStorage.setItem('nm-painel', id); else localStorage.removeItem('nm-painel'); } catch { /* sem armazenamento */ } };
  // quem entrou pela Administração (o dono) abre todos os painéis sem digitar a senha de novo
  const jaEntrou = (p) => !!App.usuario && (lerPainel() === p.id || (lerPainel() === 'admin' && App.usuario.permissoes.includes('admin')));
  async function sairDaConta() {
    await App.api('/api/equipe/sair', {}).catch(() => {});
    App.usuario = null; App.permissoes = {}; gravarPainel(null);
  }

  function telaPaineis() {
    pararTudo();
    document.body.classList.remove('modo-cozinha');
    const logado = App.usuario;
    $('#raiz').innerHTML = `<div class="entrada">
      <div class="entrada-manu"><div class="balao"><b>Oi! Eu sou a Manu!</b><span>Seu trabalho começa aqui.<br>Escolha seu painel ao lado!</span></div>
        <img src="/img/manu/manu-recorte.webp" alt="Manu, mascote da Naturalle Mania, apontando para os painéis" width="496" height="650"></div>
      <section class="entrada-quadro" aria-labelledby="titulo-paineis">
        <div class="entrada-topo"><div><small>Escolha sua área</small><h1 id="titulo-paineis">Todos os painéis da sua loja</h1></div>
          <p class="conferido">${cadeado}<span>Permissões conferidas pelo sistema</span></p></div>
        <div class="paineis">
          ${PAINEIS.map((p) => {
            const livre = jaEntrou(p);
            return `<a class="painel-cartao" href="#/painel/${p.id}">
              <span class="painel-icone">${icone(p.id)}</span>
              <span class="painel-selo">${cadeado}${livre ? 'Acesso autorizado' : 'Pede login'}</span>
              <b>${p.nome}</b><span class="painel-texto">${p.texto}</span>
              <span class="painel-abrir">Abrir meu painel<i aria-hidden="true">⟶</i></span></a>`;
          }).join('')}
          <a class="painel-cartao" href="/">
            <span class="painel-icone">${icone('cardapio')}</span><span class="painel-selo">Sem login</span>
            <b>Cardápio</b><span class="painel-texto">Veja os produtos, os preços e as opções para fazer um pedido.</span>
            <span class="painel-abrir">Ver cardápio<i aria-hidden="true">⟶</i></span></a>
        </div>
      </section>
      <footer class="entrada-rodape"><span>${cadeado}A conta de um funcionário não libera o painel de outro. O dono define as funções de cada pessoa.</span>
        ${logado ? `<span>Você entrou como <b>${esc(logado.nome)}</b> · <button type="button" id="sair-entrada">Sair da minha conta</button></span>` : ''}</footer>
    </div>`;
    const b = $('#sair-entrada');
    if (b) b.addEventListener('click', async () => { await sairDaConta(); telaPaineis(); });
  }

  // ---------------- login
  function telaLogin(painel, primeiro, aviso) {
    pararTudo();
    document.body.classList.remove('modo-cozinha');
    $('#raiz').innerHTML = `<div class="entrada entrada-login"><form class="caixa-login" id="form-login">
      ${primeiro ? '' : '<a class="voltar-paineis" href="#/">← Voltar aos painéis</a>'}
      <div class="login-cabeca">${painel ? `<span class="painel-icone">${icone(painel.id)}</span>` : '<img class="manu-login" src="/img/manu/acenando.webp" alt="Manu acenando" width="120" height="150">'}
        <div><h1>${painel ? esc(painel.nome) : 'Naturalle <span>Mania</span>'}</h1>
        <p>${primeiro ? 'Primeiro acesso: crie o usuário administrador.' : 'Entre com o seu login e a sua senha.'}</p></div></div>
      ${aviso ? `<p class="aviso-login" role="alert">${aviso}</p>` : ''}
      ${primeiro ? `<label class="campo">Seu nome<input name="nome" required autocomplete="name"></label>
        <label class="campo">Seu WhatsApp com DDD<input name="telefone" type="tel" inputmode="tel" required placeholder="(67) 99999-9999"><small>Serve para recuperar a senha se você esquecer.</small></label>
        <label class="campo">E-mail (opcional)<input name="email" type="email" autocomplete="email"></label>` : ''}
      <label class="campo">Login<input name="login" required autocomplete="username" autocapitalize="none"></label>
      <label class="campo">Senha<input type="password" name="senha" required autocomplete="${primeiro ? 'new-password' : 'current-password'}"${primeiro ? ' minlength="8"' : ''}>${primeiro ? '<small>Pelo menos 8 caracteres.</small>' : ''}</label>
      <p class="erro" id="erro-login" role="alert" hidden></p>
      <button class="btn principal grande" type="submit">${primeiro ? 'Criar administrador' : 'Entrar'}</button>
      ${primeiro ? '' : '<button type="button" class="link-esqueci" id="esqueci">Esqueci minha senha</button>'}
    </form></div>`;
    const esq = $('#esqueci'); if (esq) esq.addEventListener('click', () => telaRecuperar(painel, $('#form-login [name=login]').value));
    $('#form-login').addEventListener('submit', async (e) => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(e.target));
      try {
        await App.api(primeiro ? '/api/equipe/primeiro-admin' : '/api/equipe/entrar', d);
        gravarPainel(primeiro ? 'admin' : painel && painel.id);
        await App.iniciar();
      } catch (err) {
        $('#erro-login').textContent = err.message; $('#erro-login').hidden = false;
      }
    });
    const i = $('#form-login input'); if (i) i.focus();
  }

  // ---------------- esqueci a senha: código pelo WhatsApp
  function telaRecuperar(painel, loginDigitado) {
    let etapa = 1, login = loginDigitado || '', aviso = '';
    const desenhar = () => {
      $('#raiz').innerHTML = `<div class="entrada entrada-login"><form class="caixa-login" id="form-rec">
        <button type="button" class="voltar-paineis link-esqueci" id="rec-voltar">← Voltar para o login</button>
        <div class="login-cabeca"><img class="manu-login" src="/img/manu/acenando.webp" alt="" width="120" height="150">
          <div><h1>Nova senha</h1><p>${etapa === 1 ? 'Vamos mandar um código para o WhatsApp cadastrado.' : 'Digite o código que chegou no WhatsApp e a nova senha.'}</p></div></div>
        ${aviso ? `<p class="aviso-login" role="status">${esc(aviso)}</p>` : ''}
        <label class="campo">Login ou WhatsApp<input name="login" required autocapitalize="none" value="${esc(login)}"${etapa === 2 ? ' readonly' : ''}></label>
        ${etapa === 2 ? `<label class="campo">Código de 6 números<input name="codigo" required inputmode="numeric" maxlength="6" autocomplete="one-time-code"></label>
          <label class="campo">Nova senha<input type="password" name="nova" required minlength="8" autocomplete="new-password"><small>Pelo menos 8 caracteres.</small></label>` : ''}
        <p class="erro" id="erro-rec" role="alert" hidden></p>
        <button class="btn principal grande" type="submit">${etapa === 1 ? 'Enviar código pelo WhatsApp' : 'Salvar nova senha e entrar'}</button>
        ${etapa === 2 ? '<button type="button" class="link-esqueci" id="rec-reenviar">Não chegou? Enviar outro código</button>' : ''}
        <p class="nota">Sem WhatsApp cadastrado? Peça a um administrador para trocar a sua senha em Administração › Funcionários.</p>
      </form></div>`;
      $('#rec-voltar').addEventListener('click', () => telaLogin(painel));
      const re = $('#rec-reenviar'); if (re) re.addEventListener('click', () => { etapa = 1; aviso = ''; desenhar(); });
      $('#form-rec').addEventListener('submit', async (e) => {
        e.preventDefault();
        const f = e.target, btn = f.querySelector('[type=submit]');
        btn.disabled = true;
        try {
          if (etapa === 1) {
            login = f.login.value.trim();
            aviso = (await App.api('/api/equipe/recuperar/enviar', { login })).mensagem;
            etapa = 2; desenhar(); $('#form-rec [name=codigo]').focus();
          } else {
            await App.api('/api/equipe/recuperar/confirmar', { login, codigo: f.codigo.value, nova: f.nova.value });
            gravarPainel(painel && painel.id);
            App.toast('Senha nova salva. Bem-vindo de volta!');
            await App.iniciar();
          }
        } catch (err) { const p = $('#erro-rec'); p.textContent = err.message; p.hidden = false; btn.disabled = false; }
      });
    };
    desenhar();
  }

  // ---------------- layout e navegação
  const MENU = [
    ['pedidos', 'Pedidos', ['pedidos']],
    ['cozinha', 'Cozinha', ['cozinha']],
    ['garcom', 'Mesas (garçom)', ['garcom']],
    ['entregas', 'Entregas', ['entregador']],
    ['caixa', 'Caixa', ['caixa']],
    ['relatorios', 'Relatórios', ['caixa']],
    ['admin', 'Administração', ['admin']],
  ];
  // fora da Administração, o menu mostra só as telas do painel escolhido na entrada
  const permitidos = () => {
    const painel = PAINEIS.find((p) => p.id === lerPainel());
    return MENU.filter(([id, , perms]) => App.pode(...perms) && (!painel || painel.id === 'admin' || painel.telas.includes(id)));
  };

  function atualizarContagens() {
    const conta = {
      pedidos: App.pedidos.filter((p) => p.status === 'novo').length,
      cozinha: App.pedidos.filter((p) => p.status === 'preparo' && window.Calc.temCozinha(p.itens)).length,
      garcom: App.pedidos.filter((p) => p.tipo === 'mesa' && (p.status === 'novo' || p.status === 'pronto')).length,
      entregas: App.pedidos.filter((p) => p.tipo === 'entrega' && p.status === 'pronto').length,
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
        <a href="#/" class="todos-paineis">← Todos os painéis</a>
        ${permitidos().map(([id, nome]) => `<a href="#/${id}" data-view="${id}">${nome}<span class="contagem" hidden></span></a>`).join('')}
        <div class="quem"><span>${esc(App.usuario.nome)}</span>
          <button id="impressora" type="button">Impressora</button>
          <button id="meu-cadastro" type="button">Meu cadastro</button>
          <button id="minha-senha" type="button">Trocar senha</button>
          <button id="sair" type="button">Sair</button></div>
      </nav>
      <main class="area" id="area"></main>
    </div>`;
    $('#sair').addEventListener('click', async () => { await sairDaConta(); location.hash = '#/'; });
    $('#minha-senha').addEventListener('click', trocarSenha);
    $('#meu-cadastro').addEventListener('click', meuCadastro);
    // sem WhatsApp cadastrado não dá para recuperar a senha sozinho: lembra uma vez por sessão
    if (!App.usuario.telefone && !sessionStorage.getItem('nm-lembrou-fone')) {
      try { sessionStorage.setItem('nm-lembrou-fone', '1'); } catch { /* */ }
      setTimeout(() => App.toast('Cadastre seu WhatsApp em "Meu cadastro" para poder recuperar a senha se esquecer.'), 800);
    }
    $('#impressora').addEventListener('click', () => App.configurarImpressora());
  }

  function meuCadastro() {
    const u = App.usuario;
    const j = App.janela('Meu cadastro', `<form class="grade-form" id="f-cad" style="grid-template-columns:1fr">
      <label class="campo">Nome<input name="nome" required value="${esc(u.nome)}" autocomplete="name"></label>
      ${App.pode('admin')
        ? `<label class="campo">Login<input name="login" required autocapitalize="none" autocomplete="username" value="${esc(u.login)}"><small>É com ele que você entra. Sem espaços nem acentos. Ex.: emilly</small></label>`
        : `<label class="campo">Login<input value="${esc(u.login)}" disabled><small>O login só o administrador muda, em Funcionários.</small></label>`}
      <label class="campo">WhatsApp com DDD<input name="telefone" type="tel" inputmode="tel" value="${esc(App.fone(u.telefone || ''))}" placeholder="(67) 99999-9999"><small>Para receber o código se esquecer a senha.</small></label>
      <label class="campo">E-mail<input name="email" type="email" value="${esc(u.email || '')}" autocomplete="email"></label>
      <p class="erro" hidden></p><button class="btn verde grande">Salvar</button></form>`);
    $('#f-cad', j).addEventListener('submit', async (e) => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(e.target));
      try {
        await App.api('/api/equipe/meu-cadastro', d);
        Object.assign(App.usuario, { nome: d.nome, telefone: d.telefone.replace(/\D/g, ''), email: d.email }, d.login ? { login: d.login.trim().toLowerCase() } : {});
        j.fechar(); App.toast('Cadastro salvo');
        const q = document.querySelector('.lateral .quem span'); if (q) q.textContent = d.nome;
      } catch (err) { const p = $('.erro', j); p.textContent = err.message; p.hidden = false; }
    });
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
        j.fechar(); App.toast('Senha trocada. Entre de novo.'); App.usuario = null; telaLogin(painelDaTela(App.atual));
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

  // decide o que mostrar pelo endereço: entrada, login do painel ou a tela
  function mostrar() {
    const [nome, sub] = location.hash.replace(/^#\/?/, '').split('/');
    if (App.primeiro) return telaLogin(null, true);
    if (!nome) return telaPaineis();
    const semAcesso = (p) => telaLogin(p, false, `Você entrou como <b>${esc(App.usuario.nome)}</b>, que não tem acesso a ${esc(p.nome)}. Entre com a conta deste painel.`);
    // cartão da entrada: sempre pede o login daquele painel, a não ser que já tenha entrado nele
    if (nome === 'painel') {
      const p = PAINEIS.find((x) => x.id === sub);
      if (!p) return telaPaineis();
      if (!jaEntrou(p)) return telaLogin(p);
      const tela = telaLiberada(p);
      if (!tela) return semAcesso(p);
      location.replace('#/' + tela); return;
    }
    // endereço de uma tela (menu ou favorito, ex.: #/cozinha)
    const painel = painelDaTela(nome);
    if (!App.usuario) return telaLogin(painel);
    if (painel && !permitidos().some(([id]) => id === nome)) return lerPainel() === painel.id ? semAcesso(painel) : telaLogin(painel);
    if (!$('#app')) {
      layout();
      timerPedidos = setInterval(() => { if (!document.hidden) App.atualizarPedidos(); }, 5000);
    }
    navegar();
  }

  App.iniciar = async function () {
    pararTudo();
    let d;
    try { d = await App.api('/api/equipe/eu'); } catch (e) {
      $('#raiz').innerHTML = `<p class="erro" style="margin:24px">Servidor fora do ar: ${esc(e.message)}</p>`; return;
    }
    App.primeiro = !!d.primeiro_acesso;
    App.usuario = d.usuario || null; App.permissoes = d.permissoes || {};
    window.onhashchange = mostrar;
    if (App.usuario) await App.atualizarPedidos();
    mostrar();
  };

  // botão 👁 em todo campo de senha: mostra o que foi digitado para conferir
  function colocarOlhos(raiz) {
    for (const campo of raiz.querySelectorAll('input[type=password]:not([data-olho])')) {
      campo.dataset.olho = '1';
      // com a senha à mostra o teclado do celular não pode pôr maiúscula nem corrigir palavras
      campo.setAttribute('autocapitalize', 'off'); campo.setAttribute('autocorrect', 'off'); campo.spellcheck = false;
      const caixa = document.createElement('span');
      caixa.className = 'senha-caixa';
      campo.replaceWith(caixa);
      const botao = document.createElement('button');
      botao.type = 'button'; botao.className = 'olho'; botao.setAttribute('aria-label', 'Mostrar a senha'); botao.textContent = '👁';
      caixa.append(campo, botao);
    }
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('.olho');
    if (!b) return;
    e.preventDefault();
    const campo = b.previousElementSibling, ver = campo.type === 'password';
    campo.type = ver ? 'text' : 'password';
    b.textContent = ver ? '🙈' : '👁';
    b.setAttribute('aria-label', ver ? 'Esconder a senha' : 'Mostrar a senha');
    campo.focus();
  });
  new MutationObserver(() => colocarOlhos(document.body)).observe(document.body, { childList: true, subtree: true });
  colocarOlhos(document.body);
})();
