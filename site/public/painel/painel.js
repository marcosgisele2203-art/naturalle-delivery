(function () {
  const $ = (s) => document.querySelector(s);
  const brl = window.MENU.brl;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const COLUNAS = [
    { status: 'novo', nome: 'Novos', cor: '#A3134A', proximo: 'preparo', acao: 'Aceitar e preparar' },
    { status: 'preparo', nome: 'Em preparo', cor: '#8A5A0B', proximo: 'saiu', acao: 'Saiu para entrega' },
    { status: 'saiu', nome: 'Saiu para entrega', cor: '#1D5FA8', proximo: 'entregue', acao: 'Marcar entregue' },
    { status: 'entregue', nome: 'Entregues hoje', cor: '#1E5B2B' },
  ];
  const PAG = { pix: 'Pix', cartao: 'Cartão na entrega', dinheiro: 'Dinheiro' };

  let senha = '';
  try { senha = sessionStorage.getItem('nm-painel') || localStorage.getItem('nm-painel') || ''; } catch { /* sem armazenamento */ }
  let pedidos = [];
  let conhecidos = null;
  let destacados = new Set();
  let ocupado = new Set();
  let somAtivo = false;
  let audio;

  async function api(caminho, corpo) {
    const r = await fetch(caminho, {
      method: corpo ? 'POST' : 'GET',
      headers: { Authorization: 'Bearer ' + senha, ...(corpo ? { 'Content-Type': 'application/json' } : {}) },
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
    const d = await r.json().catch(() => ({}));
    if (r.status === 401) { sair(); throw new Error('Senha incorreta'); }
    if (!r.ok) throw new Error(d.erro || 'Erro ' + r.status);
    return d;
  }

  function hora(iso) {
    const min = Math.round((Date.now() - new Date(iso)) / 60000);
    if (min < 1) return 'agora';
    if (min < 60) return 'há ' + min + ' min';
    return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  function cartao(p, col) {
    const itens = (p.itens || []).map((i) =>
      `<li><span>${esc(i.nome)}<small>${esc(i.detalhe)}</small></span><span>${brl(i.preco)}</span></li>`).join('');
    let pag = `<span class="tag">${PAG[p.pagamento] || esc(p.pagamento)}</span>`;
    if (p.pagamento === 'dinheiro' && p.troco_para) pag = `<span class="tag">Dinheiro · troco p/ ${brl(p.troco_para)}</span>`;
    if (p.pagamento === 'pix') {
      const pix = { aguardando: ['alerta', 'Pix: aguardando comprovante'], comprovante_recebido: ['alerta', 'Pix: comprovante recebido, conferir'], confirmado: ['ok', 'Pix confirmado'] }[p.pix_status];
      if (pix) pag = `<span class="tag ${pix[0]}">${pix[1]}</span>`;
    }
    const tel = String(p.cliente_telefone || '');
    const travado = ocupado.has(p.id) ? ' disabled' : '';
    const acoes = [];
    if (col.proximo) acoes.push(`<button class="btn principal" data-status="${col.proximo}" data-id="${p.id}"${travado}>${col.acao}</button>`);
    if (p.pagamento === 'pix' && p.pix_status !== 'confirmado' && col.status !== 'entregue') acoes.push(`<button class="btn verde" data-pix="${p.id}"${travado}>Confirmar Pix</button>`);
    acoes.push(`<a class="btn" style="display:inline-flex;align-items:center;text-decoration:none;color:inherit" href="https://wa.me/${esc(tel)}" target="_blank" rel="noopener">WhatsApp</a>`);
    if (col.proximo) acoes.push(`<button class="btn fraco" data-status="cancelado" data-id="${p.id}"${travado}>Cancelar</button>`);
    return `<article class="pedido${destacados.has(p.id) ? ' novo-agora' : ''}">
      <div class="pedido-topo"><b>#${p.id}</b><span>${hora(p.criado_em)}</span></div>
      <div class="cliente"><strong>${esc(p.cliente_nome)}</strong><span>${esc(p.endereco)}</span></div>
      <ul class="itens">${itens}</ul>
      ${p.observacoes ? `<div class="obs"><b>Obs.:</b> ${esc(p.observacoes)}</div>` : ''}
      <div class="tags">${pag}<span class="tag total-pedido">${brl(p.total)}</span></div>
      <div class="acoes">${acoes.join('')}</div>
    </article>`;
  }

  function render() {
    const ativos = pedidos.filter((p) => ['novo', 'preparo', 'saiu'].includes(p.status));
    const entregues = pedidos.filter((p) => p.status === 'entregue');
    const fat = entregues.reduce((s, p) => s + Number(p.total), 0);
    $('#resumo').textContent = `${ativos.length} em andamento · ${entregues.length} entregues · ${brl(fat)} entregue hoje`;
    $('#quadro').innerHTML = COLUNAS.map((col) => {
      let lista = pedidos.filter((p) => p.status === col.status);
      if (col.status === 'entregue') lista = lista.slice().reverse();
      return `<section class="coluna" aria-label="${col.nome}">
        <header><h2><span class="ponto" style="background:${col.cor}" aria-hidden="true"></span>${col.nome}</h2><span class="qtd">${lista.length}</span></header>
        ${lista.length ? lista.map((p) => cartao(p, col)).join('') : '<p class="vazio">Nenhum pedido</p>'}
      </section>`;
    }).join('');
  }

  function bip() {
    if (!somAtivo) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      [0, 0.25, 0.5].forEach((t) => {
        const o = audio.createOscillator(), g = audio.createGain();
        o.frequency.value = 880; o.connect(g); g.connect(audio.destination);
        g.gain.setValueAtTime(0.25, audio.currentTime + t);
        g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + t + 0.2);
        o.start(audio.currentTime + t); o.stop(audio.currentTime + t + 0.2);
      });
    } catch { /* sem áudio */ }
  }

  async function carregar() {
    try {
      const d = await api('/api/pedidos');
      pedidos = d.pedidos;
      const ids = new Set(pedidos.map((p) => p.id));
      if (conhecidos) {
        const novos = pedidos.filter((p) => !conhecidos.has(p.id) && p.status === 'novo');
        if (novos.length) {
          novos.forEach((p) => destacados.add(p.id));
          bip();
          document.title = `(${novos.length}) Novo pedido · Naturalle Mania`;
          setTimeout(() => { novos.forEach((p) => destacados.delete(p.id)); }, 60000);
        }
      }
      conhecidos = ids;
      $('#conexao').textContent = 'Atualizado ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      $('#conexao').classList.remove('off');
      $('#erro-geral').hidden = true;
      render();
    } catch (e) {
      $('#conexao').textContent = 'Sem conexão';
      $('#conexao').classList.add('off');
    }
  }

  async function acao(id, fn) {
    ocupado.add(id); render();
    try { await fn(); await carregar(); }
    catch (e) { $('#erro-geral').textContent = 'Pedido #' + id + ': ' + e.message; $('#erro-geral').hidden = false; }
    ocupado.delete(id); render();
  }

  $('#quadro').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.status) {
      const id = +b.dataset.id;
      if (b.dataset.status === 'cancelado' && !confirm('Cancelar o pedido #' + id + '? O cliente será avisado no WhatsApp.')) return;
      acao(id, () => api('/api/status', { pedido_id: id, status: b.dataset.status }));
    } else if (b.dataset.pix) {
      const id = +b.dataset.pix;
      acao(id, () => api('/api/pix', { pedido_id: id }));
    }
  });

  $('#som').addEventListener('click', () => {
    somAtivo = !somAtivo;
    $('#som').setAttribute('aria-pressed', somAtivo);
    $('#som').textContent = somAtivo ? 'Som ligado' : 'Ativar som de novo pedido';
    if (somAtivo) bip();
  });
  window.addEventListener('focus', () => { document.title = 'Painel · Naturalle Mania'; });

  let intervalo;
  function entrar() {
    $('#login').hidden = true; $('#app').hidden = false;
    carregar();
    clearInterval(intervalo);
    intervalo = setInterval(carregar, 8000);
  }
  function sair() {
    senha = '';
    try { sessionStorage.removeItem('nm-painel'); localStorage.removeItem('nm-painel'); } catch { /* */ }
    clearInterval(intervalo);
    $('#app').hidden = true; $('#login').hidden = false;
  }
  $('#sair').addEventListener('click', sair);

  $('#form-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    senha = new FormData(e.target).get('senha');
    try {
      await api('/api/pedidos');
      try { localStorage.setItem('nm-painel', senha); } catch { /* */ }
      entrar();
    } catch (err) {
      $('#erro-login').textContent = 'Senha incorreta ou servidor fora do ar.';
      $('#erro-login').hidden = false;
    }
  });

  if (senha) entrar(); else $('#login').hidden = false;
})();
