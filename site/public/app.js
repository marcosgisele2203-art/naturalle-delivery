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
  // frase de cada etapa do pedido: [título, texto]
  function frasesDaEtapa(p) {
    const mesa = p.tipo === 'mesa';
    switch (p.status) {
      case 'novo': return ['Pedido recebido!', mesa ? 'O garçom já vai confirmar.' : (p.pix_status === 'confirmado' ? 'Pix recebido ✅ ' : '') + 'Já já a gente confirma por aqui e no WhatsApp.'];
      case 'preparo': return ['Pedido confirmado!', (p.pix_status === 'confirmado' ? 'Pix recebido ✅ ' : '') + 'Já está sendo preparado com carinho.'];
      case 'pronto':
        if (mesa) return ['Prontinho!', 'Já está indo para a sua mesa.'];
        if (p.tipo === 'retirada') return ['Pronto para retirar!', 'Pode vir buscar no balcão.'];
        return ['Quase saindo!', 'Seu pedido está pronto e já vai sair para entrega.'];
      case 'saiu': return ['Saiu para entrega!', 'Já já chega aí.'];
      case 'entregue': return [mesa ? 'Bom apetite!' : 'Entregue!', 'Obrigado por pedir na Naturalle Mania!'];
      default: return ['Pedido cancelado', 'Qualquer dúvida, fale com a gente no WhatsApp.'];
    }
  }
  const ETAPAS = {
    novo: 'Recebido, aguardando confirmação', preparo: 'Preparando', pronto: 'Pronto',
    saiu: 'Saiu para entrega', entregue: 'Entregue', cancelado: 'Cancelado',
  };

  const st = {
    loja: null, cardapio: null, dia: 0, mesa: null,
    carrinho: guardado(chave('carrinho'), []),
    cliente: guardado('nm-cliente', { nome: '', telefone: '', endereco: '' }),
    tipo: 'entrega', pagamento: 'pix', troco: '', precisaTroco: '', obs: '',
    enviando: false, erro: '', enviado: null,
    meus: guardado(chave('pedidos'), []), // [{ codigo, id }]
    quadro: [],
    acompanhamento: {},
  };
  let montador;

  async function api(url, corpo) {
    const r = await fetch(url, corpo ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) } : {});
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.erro || 'Não foi possível concluir. Tente de novo.');
    return d;
  }

  const total = () => window.Calc.somar(st.carrinho) + taxa() + acrescimoCartao();
  // acréscimo da maquininha quando o pagamento é no cartão
  const acrescimoCartao = () => (!tokenMesa && st.pagamento === 'cartao' ? Number(st.loja.taxa_cartao) || 0 : 0);
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
    const aviso = $('#aviso-topo');
    if (!tokenMesa && !l.aberta) { aviso.hidden = false; aviso.textContent = 'Estamos fechados para pedidos pelo site agora' + (l.horario && l.horario !== 'Fechado agora' ? ' (' + l.horario.toLowerCase() + ')' : '') + '. Você pode olhar o cardápio à vontade.'; }
    $('#rodape').innerHTML = (l.endereco_completo ? `<p>📍 ${esc(l.endereco_completo)}${l.referencia ? ' (' + esc(l.referencia) + ')' : ''}</p>` : '')
      + (l.instagram ? `<p>Instagram <a href="https://instagram.com/${esc(l.instagram)}" target="_blank" rel="noopener">@${esc(l.instagram)}</a></p>` : '')
      + (l.whatsapp ? `<p>${esc(l.nome)} · Fale com a gente no WhatsApp <a href="https://wa.me/${esc(l.whatsapp)}">${formatarFone(l.whatsapp)}</a></p>` : '')
      + (tokenMesa ? '' : '<p><a class="link-equipe" href="/equipe/">Painel administrativo</a></p>');
  }

  function formatarFone(t) {
    const d = String(t).replace(/^55/, '');
    return d.length >= 10 ? `(${d.slice(0, 2)}) ${d.slice(2, -4)}-${d.slice(-4)}` : t;
  }

  function renderAcompanhar() {
    const ativos = st.meus.map((m) => st.acompanhamento[m.codigo]).filter(Boolean)
      .filter((p) => tokenMesa || !['entregue', 'cancelado'].includes(p.status) || Date.now() - new Date(p.criado_em) < 3 * 3600_000);
    if (!ativos.length) { $('#acompanhar').innerHTML = ''; return; }
    const [titulo, texto] = frasesDaEtapa(ativos[0]);
    $('#acompanhar').innerHTML = `<section class="acompanhar" aria-live="polite">
      <div class="manu-card"><div><span class="nota">Pedido #${ativos[0].id}</span><h2>${titulo}</h2><p>${texto}</p></div></div>
      ${ativos.filter((p) => p.pix_copia_cola && p.status !== 'cancelado').map((p) => `<div class="pix-box"><b>Falta pagar o Pix do pedido #${p.id}</b>
        ${p.pix_qr ? `<img class="pix-qr" src="data:image/png;base64,${esc(p.pix_qr)}" alt="QR Code do Pix">` : ''}
        <small>Pix copia e cola · ${brl(p.total)}</small><code class="pix-codigo">${esc(p.pix_copia_cola)}</code>
        <button type="button" class="botao verde" data-acao="copiar-pix" data-v="${esc(p.pix_copia_cola)}">Copiar código Pix</button></div>`).join('')}
      ${ativos.length > 1 ? `<h3>${tokenMesa ? 'Pedidos desta mesa' : 'Seus pedidos'}</h3>` : ''}
      ${ativos.length > 1 ? ativos.map((p) => `<div class="acomp-linha"><b>#${p.id}</b><span class="etapa etapa-${p.status}">${ETAPAS[p.status] || p.status}</span><span>${brl(p.total)}</span></div>`).join('') : ''}
    </section>`;
  }

  // quadro-negro da Manu: combos do dia + promoções e novidades da Administração, passando sozinhos
  let timerQuadro;
  function renderDestaques() {
    clearInterval(timerQuadro);
    const disponivel = (id) => st.cardapio.produtos.find((p) => p.id === id && p.disponivel !== false && window.Calc.disponivelHoje(p, st.dia));
    const botao = (id) => (disponivel(id) ? `<button class="giz-botao" data-acao="destaque" data-v="${esc(id)}">Quero!</button>` : '');
    // aviso com foto: a foto ocupa o quadro inteiro e um toque já abre o produto para pedir
    const cartaz = (src, titulo, produto) => {
      const pede = produto && disponivel(produto);
      return `<button type="button" class="giz-cartaz" data-acao="${pede ? 'destaque' : 'ampliar'}" data-v="${esc(pede ? produto : src)}"
        aria-label="${esc(titulo)}${pede ? ': toque para pedir' : ': ver a foto'}"><img src="${esc(src)}" alt="">${pede ? '<span>Toque para pedir</span>' : ''}</button>`;
    };
    const slides = [];
    if (!tokenMesa && !st.loja.aberta) {
      slides.push(`<span class="giz-titulo">Fechados agora</span><span class="giz-texto">${esc(st.loja.horario || 'Volte mais tarde!')}</span>`);
    } else {
      for (const p of st.cardapio.produtos.filter((x) => Array.isArray(x.dias) && x.dias.includes(st.dia) && x.disponivel !== false)) {
        slides.push(p.foto ? cartaz(p.foto, p.nome, p.id) : `<span class="giz-pequeno">Hoje é dia de</span><span class="giz-titulo">${esc(p.nome)}</span>
          <span class="giz-texto">${esc(p.descricao || '')}</span><span class="giz-preco">a partir de ${brl(window.Calc.precoMinimo(p))}</span>${botao(p.id)}`);
      }
      for (const a of st.quadro) {
        slides.push(a.foto ? cartaz(a.foto, a.titulo, a.produto) : `<span class="giz-pequeno">${a.tipo === 'novidade' ? 'Novidade!' : 'Promoção!'}</span>
          <span class="giz-titulo">${esc(a.titulo)}</span>${a.texto ? `<span class="giz-texto">${esc(a.texto)}</span>` : ''}
          ${a.preco ? `<span class="giz-preco">${esc(a.preco)}</span>` : ''}${a.produto ? botao(a.produto) : ''}`);
      }
      if (!slides.length) {
        if (st.loja.recado) slides.push(`<span class="giz-titulo">${esc(st.loja.recado)}</span>`);
        else if (tokenMesa) slides.push('<span class="giz-pequeno">Oi!</span><span class="giz-titulo">Escolha aí que a gente leva até a sua mesa!</span>');
        else slides.push('<span class="giz-pequeno">Oi, pessoal!</span><span class="giz-titulo">Bateu a fome?</span><span class="giz-texto">Faça seu pedido aqui embaixo!</span>');
      }
    }
    // o quadro da Manu é a primeira imagem do app
    $('#giz').innerHTML = slides.map((h, i) => `<div class="giz-slide${h.includes('giz-cartaz') ? ' com-cartaz' : ''}"${i ? ' hidden' : ''}>${h}</div>`).join('')
      + (slides.length > 1 ? `<div class="giz-pontos">${slides.map((_, i) => `<button type="button" data-acao="slide" data-v="${i}" aria-label="Aviso ${i + 1}"${i ? '' : ' aria-current="true"'}></button>`).join('')}</div>` : '');
    if (slides.length > 1) timerQuadro = setInterval(() => { if (!document.hidden) mostrarSlide(slideAtual + 1); }, 6000);
    slideAtual = 0;
  }
  let slideAtual = 0;
  function mostrarSlide(n) {
    const lista = document.querySelectorAll('#giz .giz-slide');
    if (!lista.length) return;
    slideAtual = (n + lista.length) % lista.length;
    lista.forEach((el, i) => { el.hidden = i !== slideAtual; });
    document.querySelectorAll('#giz .giz-pontos button').forEach((b, i) => { if (i === slideAtual) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current'); });
  }

  function renderBarra() {
    const n = st.carrinho.reduce((s, i) => s + i.qtd, 0);
    const manu = st.loja && st.loja.manu && !tokenMesa
      ? `<button class="botao-manu${n ? ' so-icone' : ''}" data-acao="manu" aria-label="Pedir com a Manu"><img src="${MANU('acenando')}" alt="" width="44" height="44">${n ? '' : '<span>Pedir com a Manu</span>'}</button>` : '';
    $('#barra').innerHTML = (n ? `<button class="botao escuro flex" data-acao="abrir">${SACOLA}<span class="flex" style="text-align:left">Ver carrinho <span class="contador">${n}</span></span><span>${brl(window.Calc.somar(st.carrinho))}</span></button>` : '<span class="flex"></span>') + manu;
  }

  // dinheiro: o cliente diz com quanto vai pagar e o troco aparece na hora
  const valorDigitado = (v) => Number(String(v || '').replace(/[^\d,.]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'));
  function textoTroco() {
    const pago = valorDigitado(st.troco), t = total();
    if (!st.troco || !pago) return `Total do pedido: ${brl(t)}.`;
    if (pago < t) return `Falta ${brl(t - pago)}: o valor é menor que o total (${brl(t)}).`;
    if (pago === t) return 'Esse é o valor certo do pedido: então não precisa de troco.';
    return `Seu troco: <b>${brl(pago - t)}</b>. O entregador já leva.`;
  }

  function renderCarrinho() {
    const c = st.cliente, l = st.loja;
    if (st.enviado) {
      const p = st.enviado;
      const qr = p.chavePix && p.chavePix.copia_cola ? p.chavePix : null;
      const situacao = (st.acompanhamento[p.codigo] || {}).pix_status;
      const pago = situacao === 'confirmado', vencido = situacao === 'vencido';
      $('#carrinho-corpo').innerHTML = `<div class="sucesso"><strong>Pedido #${esc(p.id)} enviado!</strong>
        <span>${tokenMesa
          ? (p.status === 'preparo' ? 'Já foi para a cozinha. A gente leva na sua mesa.' : 'O garçom vai confirmar e mandar para a cozinha.') + ' Acompanhe aqui na página.'
          : (p.pix ? (qr ? (pago ? '' : 'Pague com o Pix abaixo: a confirmação é automática, não precisa mandar comprovante. ') : p.chavePix ? 'Pague pelo Pix abaixo e mande a foto do comprovante no nosso WhatsApp. ' : 'A chave Pix chegou no seu WhatsApp. Responda lá com a foto do comprovante. ') : 'A confirmação chegou no seu WhatsApp. ') + 'Você também acompanha aqui na página.'}</span>
        ${qr ? (pago ? '<div class="pix-box pix-pago"><b>Pagamento confirmado ✅</b><span>Recebemos o seu Pix. Obrigado!</span></div>'
          : vencido ? '<div class="pix-box"><b>O Pix venceu</b><span>Fale com a gente no WhatsApp para pagar de outro jeito.</span></div>'
          : `<div class="pix-box">${qr.qr ? `<img class="pix-qr" src="data:image/png;base64,${esc(qr.qr)}" alt="QR Code do Pix">` : ''}
          <small>Pix copia e cola · ${brl(p.total)}${qr.nome ? ' · ' + esc(qr.nome) : ''}</small><code class="pix-codigo">${esc(qr.copia_cola)}</code>
          <button type="button" class="botao verde" data-acao="copiar-pix" data-v="${esc(qr.copia_cola)}">Copiar código Pix</button>
          <span class="pix-espera">Aguardando o pagamento… vale por 30 minutos.</span></div>`) : ''}
        ${!qr && p.chavePix ? `<div class="pix-box"><small>Chave Pix${p.chavePix.nome ? ' · ' + esc(p.chavePix.nome) : ''}</small><b>${esc(p.chavePix.chave)}</b>
          <span>Valor: ${brl(p.total)}</span><button type="button" class="botao verde" data-acao="copiar-pix" data-v="${esc(p.chavePix.chave)}">Copiar chave Pix</button></div>` : ''}</div>
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
      const ajuda = { pix: l.pix_auto ? 'Você recebe o QR Code e o código Pix na hora. A confirmação é automática.' : 'A chave Pix chega no seu WhatsApp. Responda com o comprovante.', cartao: st.tipo === 'entrega' ? 'O entregador leva a maquininha.' : 'Pague no cartão na retirada.', dinheiro: '' }[st.pagamento];
      campos = `${tipos.length > 1 ? `<div class="campo"><span>Como você quer receber?</span><div class="pagamentos" style="grid-template-columns:repeat(2,minmax(0,1fr))">${tipos.map(([v, n]) =>
          `<button type="button" class="chip" aria-pressed="${st.tipo === v}" data-acao="tipo" data-v="${v}">${n}</button>`).join('')}</div></div>` : ''}
        <label class="campo">Seu nome<input name="nome" autocomplete="name" required value="${esc(c.nome)}"></label>
        <label class="campo">WhatsApp com DDD<input name="telefone" type="tel" inputmode="tel" autocomplete="tel" placeholder="(67) 99999-9999" required value="${esc(c.telefone)}"></label>
        ${st.tipo === 'entrega' ? `<label class="campo">Endereço de entrega<input name="endereco" autocomplete="street-address" placeholder="Rua, número, bairro, referência" required value="${esc(c.endereco)}"></label>
          <div class="campo local">${st.local
            ? `<span class="local-ok">📍 Local marcado no mapa</span><button type="button" class="link" data-acao="local">ver / ajustar</button><button type="button" class="link" data-acao="local-tirar">tirar</button>`
            : `<button type="button" class="chip" data-acao="local"${st.buscandoLocal ? ' disabled' : ''}>${st.buscandoLocal ? 'Buscando sua localização…' : '📍 Marcar minha casa no mapa (ajuda o entregador)'}</button>`}</div>` : ''}
        <label class="campo">Observações (opcional)<textarea name="obs">${esc(st.obs)}</textarea></label>
        <div class="campo"><span>Forma de pagamento</span><div class="pagamentos">${pags}</div>
          ${ajuda ? `<small style="font-weight:400;color:var(--cinza)">${ajuda}</small>` : ''}</div>
        ${st.pagamento === 'dinheiro' ? `<div class="campo"><span>${st.tipo === 'entrega' ? 'O entregador precisa levar troco?' : 'Vai precisar de troco?'}</span>
          <div class="pagamentos" style="grid-template-columns:repeat(2,minmax(0,1fr))">${[['sim', 'Sim, preciso de troco'], ['nao', 'Não, tenho o valor certo']].map(([v, n]) =>
            `<button type="button" class="chip" aria-pressed="${st.precisaTroco === v}" data-acao="troco" data-v="${v}">${n}</button>`).join('')}</div></div>
          ${st.precisaTroco === 'sim' ? `<label class="campo">Vai pagar com quanto?<input name="troco" inputmode="decimal" placeholder="Ex.: 50,00" value="${esc(st.troco)}">
            <small class="troco-calc" data-troco>${textoTroco()}</small></label>` : ''}` : ''}
        ${taxa() ? `<div class="linha-total"><span>Taxa de entrega</span><span>${brl(taxa())}</span></div>` : ''}
        ${acrescimoCartao() ? `<div class="linha-total"><span>Acréscimo da maquininha</span><span>${brl(acrescimoCartao())}</span></div>` : ''}`;
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
      case 'local': lerForm(); marcarLocal(); break;
      case 'local-tirar': lerForm(); st.local = null; renderCarrinho(); break;
      case 'tipo': lerForm(); st.tipo = b.dataset.v; renderCarrinho(); break;
      case 'troco': {
        lerForm(); st.precisaTroco = b.dataset.v; if (st.precisaTroco === 'nao') st.troco = ''; st.erro = '';
        renderCarrinho();
        const campo = $('[name=troco]'); if (campo) campo.focus();
        break;
      }
      case 'manu': abrirManu(); break;
      case 'copiar-pix':
        navigator.clipboard.writeText(b.dataset.v).then(() => avisar('Copiado! Agora cole no app do seu banco.'), () => avisar('Copie: ' + b.dataset.v));
        break;
      case 'slide': clearInterval(timerQuadro); mostrarSlide(Number(b.dataset.v)); break;
      case 'ampliar': {
        const z = document.createElement('div');
        z.className = 'giz-zoom'; z.setAttribute('role', 'dialog'); z.setAttribute('aria-label', 'Foto da promoção');
        z.innerHTML = `<img src="${esc(b.dataset.v)}" alt=""><button type="button" class="botao escuro">Fechar</button>`;
        z.addEventListener('click', () => z.remove());
        document.body.appendChild(z);
        break;
      }
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
  $('#carrinho').addEventListener('input', (e) => {
    if (e.target.name !== 'troco') return;
    st.troco = e.target.value;
    const el = $('[data-troco]'); if (el) el.innerHTML = textoTroco();
    if (st.erro) { st.erro = ''; const x = $('#form-pedido .erro[role=alert]'); if (x) x.remove(); }
  });
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
      else if (st.tipo === 'entrega' && !String(c.endereco).trim()) st.erro = 'Informe o endereço de entrega (rua e número).';
      else if (st.pagamento === 'dinheiro' && !st.precisaTroco) st.erro = st.tipo === 'entrega' ? 'Diga se o entregador precisa levar troco.' : 'Diga se vai precisar de troco.';
      else if (st.pagamento === 'dinheiro' && st.precisaTroco === 'sim' && !(valorDigitado(st.troco) > total())) st.erro = 'Diga com quanto vai pagar: precisa ser mais que o total (' + brl(total()) + ').';
    }
    if (st.erro) return renderCarrinho();
    st.enviando = true; renderCarrinho();
    try {
      const itens = st.carrinho.map((i) => i.escolha);
      const d = tokenMesa
        ? await api('/api/publico/mesa/' + tokenMesa + '/pedido', { nome: c.nome, observacoes: st.obs, itens })
        : await api('/api/publico/pedido', {
          tipo: st.tipo, cliente: { nome: c.nome, telefone: c.telefone }, endereco: c.endereco, localizacao: st.tipo === 'entrega' ? st.local : null, observacoes: st.obs,
          pagamento: st.pagamento, troco_para: st.pagamento === 'dinheiro' && st.precisaTroco === 'sim' ? valorDigitado(st.troco) : null, itens,
        });
      st.enviado = { id: d.pedido_id, codigo: d.codigo, pix: st.pagamento === 'pix', chavePix: d.pix || null, total: d.total, status: d.status };
      st.meus = [{ codigo: d.codigo, id: d.pedido_id }, ...st.meus].slice(0, 10);
      guardar(chave('pedidos'), st.meus);
      st.carrinho = []; st.obs = ''; st.troco = ''; st.precisaTroco = '';
      guardar(chave('carrinho'), []);
      acompanhar();
    } catch (err) {
      st.erro = err.message;
    }
    st.enviando = false;
    renderCarrinho(); renderBarra();
  });

  // ---------------- chat com a Manu (garçonete online)
  const manuChat = { sessao: guardado('nm-manu-sessao', ''), msgs: guardado('nm-manu-msgs', []), enviando: false };
  if (!manuChat.sessao) { manuChat.sessao = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join(''); guardar('nm-manu-sessao', manuChat.sessao); }
  function abrirManu() {
    let el = $('#manu-chat');
    if (!el) {
      el = document.createElement('div');
      el.className = 'fundo'; el.id = 'manu-chat';
      el.innerHTML = `<section class="folha manu-folha" role="dialog" aria-modal="true" aria-labelledby="manu-titulo">
        <div class="folha-topo"><div class="manu-quem"><img src="${MANU('acenando')}" alt="" width="44" height="44"><div><h2 id="manu-titulo">Manu</h2><small>Garçonete online da Naturalle</small></div></div>
          <button class="icone" data-manu-fechar aria-label="Fechar">✕</button></div>
        <div class="manu-msgs" aria-live="polite"></div>
        <form class="manu-form"><input name="msg" autocomplete="off" maxlength="1000" placeholder="Escreva para a Manu…" aria-label="Mensagem para a Manu">
          <button class="botao verde" type="submit">Enviar</button></form></section>`;
      document.body.appendChild(el);
      el.addEventListener('click', (e) => { if (e.target === el || e.target.closest('[data-manu-fechar]')) { el.hidden = true; document.body.classList.remove('mt-travado'); } });
      el.querySelector('form').addEventListener('submit', (e) => { e.preventDefault(); const i = e.target.msg; enviarManu(i.value); i.value = ''; });
    }
    el.hidden = false; document.body.classList.add('mt-travado');
    desenharManu();
    el.querySelector('input').focus();
  }
  function desenharManu() {
    const box = $('#manu-chat .manu-msgs');
    if (!box) return;
    const msgs = [{ de: 'manu', texto: 'Oi! Eu sou a Manu 😊 Me diga o que você quer pedir que eu monto tudo para você. Pode perguntar dos sabores, tamanhos e preços!' }, ...manuChat.msgs];
    box.innerHTML = msgs.map((m) => (m.pix
      ? `<p class="manu-msg manu"><code class="pix-codigo">${esc(m.texto)}</code><button type="button" class="botao verde" data-acao="copiar-pix" data-v="${esc(m.texto)}">Copiar código Pix</button></p>`
      : `<p class="manu-msg ${m.de}">${esc(m.texto).replace(/\n/g, '<br>').replace(/\*([^*\n]+)\*/g, '<b>$1</b>')}</p>`)).join('')
      + (manuChat.enviando ? '<p class="manu-msg manu digitando">Manu está digitando…</p>' : '');
    box.scrollTop = box.scrollHeight;
  }
  async function enviarManu(texto) {
    texto = String(texto || '').trim();
    if (!texto || manuChat.enviando) return;
    manuChat.msgs.push({ de: 'cliente', texto }); manuChat.enviando = true; desenharManu();
    try {
      const d = await api('/api/publico/manu', { sessao: manuChat.sessao, texto });
      manuChat.msgs.push({ de: 'manu', texto: d.resposta });
      if (d.pix) manuChat.msgs.push({ de: 'manu', texto: d.pix, pix: true });
      if (d.pedido) { st.meus = [{ codigo: d.pedido.codigo, id: d.pedido.id }, ...st.meus].slice(0, 10); guardar(chave('pedidos'), st.meus); acompanhar(); }
    } catch (err) {
      manuChat.msgs.push({ de: 'manu', texto: err.message });
    }
    manuChat.enviando = false;
    manuChat.msgs = manuChat.msgs.slice(-40); guardar('nm-manu-msgs', manuChat.msgs);
    desenharManu();
  }

  // ---------------- localização da entrega: GPS + mapa para o cliente conferir e arrastar o alfinete
  const CENTRO_LOJA = [-20.2410, -56.3790]; // centro de Miranda/MS, quando o GPS não responde
  let leaflet;
  function carregarMapa() {
    if (window.L) return Promise.resolve();
    if (leaflet) return leaflet;
    leaflet = new Promise((ok, erro) => {
      const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = '/vendor/leaflet/leaflet.css'; document.head.append(css);
      const js = document.createElement('script'); js.src = '/vendor/leaflet/leaflet.js'; js.onload = ok; js.onerror = erro; document.head.append(js);
    });
    return leaflet;
  }
  // o primeiro ponto do GPS costuma ser grosseiro: escuta por alguns segundos e fica com o mais preciso
  // devolve { pos } ou { erro: 'permissao' | 'desligado' }
  function melhorPosicao() {
    return new Promise((ok) => {
      if (!navigator.geolocation) return ok({ erro: 'desligado' });
      let melhor = null, falha = null, fim;
      const terminar = () => { clearTimeout(fim); navigator.geolocation.clearWatch(id); ok(melhor ? { pos: melhor } : { erro: falha || 'desligado' }); };
      const id = navigator.geolocation.watchPosition((pos) => {
        if (!melhor || pos.coords.accuracy < melhor.coords.accuracy) melhor = pos;
        if (pos.coords.accuracy <= 25) terminar();
      }, (e) => { falha = e.code === 1 ? 'permissao' : 'desligado'; if (e.code === 1 || !melhor) terminar(); },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
      fim = setTimeout(terminar, 12000);
    });
  }
  const AJUDA_GPS = {
    permissao: '📵 O site está sem permissão de localização. Toque no ícone ao lado do endereço do site (lá em cima) › <b>Permissões</b> › <b>Localização</b> › <b>Permitir</b>, e depois em “Usar meu GPS”. Ou arraste o alfinete até a sua casa.',
    desligado: '📍 Não conseguimos o GPS. Ligue a <b>Localização</b> do celular (puxe a barra de cima) e toque em “Usar meu GPS”. Ou arraste o alfinete até a sua casa.',
  };
  // procura no mapa o endereço que o cliente digitou (OpenStreetMap), na cidade da loja
  async function acharEndereco(endereco) {
    const l = st.loja || {};
    const busca = [endereco, l.cidade || 'Miranda', l.uf || 'MS', 'Brasil'].filter(Boolean).join(', ');
    try {
      const r = await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&accept-language=pt-BR&q=' + encodeURIComponent(busca),
        { signal: AbortSignal.timeout(8000) });
      const d = await r.json();
      return d[0] ? [Number(d[0].lat), Number(d[0].lon)] : null;
    } catch { return null; }
  }
  // acima de ~1 km quase sempre é o Android dando só a "localização aproximada" para o Chrome
  const textoGps = (r, precisao) => (!r.pos ? AJUDA_GPS[r.erro]
    : precisao >= 1000 ? `⚠️ O celular só deu a localização <b>aproximada</b> (${(precisao / 1000).toFixed(1).replace('.', ',')} km). Para o ponto exato: Configurações › Apps › Chrome › Permissões › Localização › ligue <b>“Usar local exato”</b>. Ou arraste o alfinete até a sua casa.`
    : precisao > 50 ? `📍 Precisão do GPS: ${precisao} m (o círculo azul). Ficando parado uns segundos ele melhora sozinho. Confira e arraste o alfinete até a sua casa, se precisar.`
    : `✅ GPS preciso (${precisao} m). Confira e confirme.`);
  async function marcarLocal() {
    st.buscandoLocal = true; renderCarrinho();
    const enderecoDigitado = String(st.cliente.endereco || '').trim();
    const [r, porEndereco] = await Promise.all([st.local ? {} : melhorPosicao(), st.local || !enderecoDigitado ? null : acharEndereco(enderecoDigitado),
      carregarMapa().catch(() => null)]);
    const pos = r.pos;
    st.buscandoLocal = false; renderCarrinho();
    if (!window.L) { avisar('Não deu para abrir o mapa agora. Escreva o endereço com um ponto de referência.'); return; }
    // ordem: o que já foi marcado › GPS preciso › endereço digitado › GPS aproximado › centro da cidade
    const gpsBom = pos && pos.coords.accuracy <= 150;
    const inicio = st.local ? [st.local.lat, st.local.lng] : gpsBom ? [pos.coords.latitude, pos.coords.longitude]
      : porEndereco || (pos ? [pos.coords.latitude, pos.coords.longitude] : CENTRO_LOJA);
    const pelaRua = !st.local && !gpsBom && !!porEndereco;
    const precisao = st.local ? st.local.precisao : pos ? Math.round(pos.coords.accuracy) : 0;
    const z = document.createElement('div');
    z.className = 'mapa-local'; z.setAttribute('role', 'dialog'); z.setAttribute('aria-label', 'Confirme o local da entrega');
    z.innerHTML = `<div class="mapa-caixa"><h2>Onde entregar?</h2>
      <p data-ajuda>${st.local ? 'Arraste o alfinete até a sua casa, se precisar.' : pelaRua ? '🔎 Achamos a sua rua pelo endereço. Arraste o alfinete até a sua casa e confirme.' : textoGps(r, precisao)}</p>
      <div class="mapa" id="mapa-entrega"></div>
      <button type="button" class="chip" data-m="gps">📍 Usar meu GPS</button>
      <div class="mapa-botoes"><button type="button" class="botao" data-m="cancelar">Cancelar</button><button type="button" class="botao verde" data-m="ok">Confirmar este local</button></div></div>`;
    document.body.append(z);
    const mapa = L.map('mapa-entrega', { zoomControl: true }).setView(inicio, st.local || gpsBom ? 18 : pelaRua ? 17 : pos ? 16 : 13);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(mapa);
    L.Icon.Default.imagePath = '/vendor/leaflet/images/';
    const alfinete = L.marker(inicio, { draggable: true, autoPan: true }).addTo(mapa);
    let mexeu = false, precisaoAtual = precisao, temGps = !!(st.local || gpsBom);
    // círculo azul = margem de erro do GPS
    const circulo = L.circle(inicio, { radius: pos && !pelaRua ? precisao : 0, color: '#2b6cb0', weight: 1, fillOpacity: 0.12, interactive: false }).addTo(mapa);
    const ajuda = (html) => { z.querySelector('[data-ajuda]').innerHTML = html; };
    const usarLeitura = (p) => {
      const ll = [p.coords.latitude, p.coords.longitude];
      precisaoAtual = Math.round(p.coords.accuracy); temGps = precisaoAtual <= 150;
      alfinete.setLatLng(ll); circulo.setLatLng(ll).setRadius(precisaoAtual);
      mapa.setView(ll, precisaoAtual <= 50 ? 18 : precisaoAtual <= 300 ? 17 : 15);
      ajuda(textoGps({ pos: p }, precisaoAtual));
    };
    // com o mapa aberto o GPS continua ouvindo: se achar um ponto melhor e o cliente não mexeu, o alfinete vai sozinho
    let vigia = null;
    if (!st.local && navigator.geolocation && !r.erro) {
      vigia = navigator.geolocation.watchPosition((p) => {
        if (mexeu || p.coords.accuracy >= precisaoAtual - 5 && temGps) return;
        if (!temGps && p.coords.accuracy > 150 && pelaRua) return; // não troca a rua achada por um GPS ruim
        usarLeitura(p);
      }, () => {}, { enableHighAccuracy: true, maximumAge: 0, timeout: 60000 });
    }
    alfinete.on('dragend', () => { mexeu = true; circulo.setRadius(0); });
    mapa.on('click', (e) => { alfinete.setLatLng(e.latlng); mexeu = true; circulo.setRadius(0); }); // tocar no mapa também move o alfinete
    z.addEventListener('click', (e) => {
      const m = e.target.closest('[data-m]'); if (!m) return;
      if (m.dataset.m === 'gps') {
        m.disabled = true; m.textContent = 'Buscando o GPS…';
        melhorPosicao().then((r2) => {
          m.disabled = false; m.textContent = '📍 Usar meu GPS';
          if (r2.pos) { mexeu = false; usarLeitura(r2.pos); } else ajuda(textoGps(r2, precisaoAtual));
        });
        return;
      }
      if (m.dataset.m === 'ok') {
        const { lat, lng } = alfinete.getLatLng();
        // o cliente conferiu no mapa: vale mais que a precisão do GPS
        st.local = { lat, lng, precisao: mexeu || !temGps ? 0 : precisaoAtual, conferido: true };
        renderCarrinho();
        // o nome da rua o cliente escreve: perto de esquina o mapa pode pegar a rua do lado
        if (!String(st.cliente.endereco || '').trim()) {
          const campo = $('[name=endereco]'); if (campo) campo.focus();
          avisar('Agora escreva a rua e o número da casa.');
        }
      }
      if (vigia != null) navigator.geolocation.clearWatch(vigia);
      mapa.remove(); z.remove();
    });
  }

  // ---------------- acompanhamento
  async function acompanhar() {
    await Promise.all(st.meus.map(async (m) => {
      try { st.acompanhamento[m.codigo] = (await api('/api/publico/acompanhar/' + m.codigo)).pedido; } catch { /* sumiu */ }
    }));
    renderAcompanhar();
    if (st.enviado && st.enviado.chavePix && st.enviado.chavePix.copia_cola) {
      const s = (st.acompanhamento[st.enviado.codigo] || {}).pix_status;
      if (s !== st.enviado.pixVisto) { st.enviado.pixVisto = s; renderCarrinho(); }
      // Pix em aberto na tela: confere mais rápido para mostrar o "pago" logo
      clearTimeout(st.timerPix);
      if (s === 'aguardando') st.timerPix = setTimeout(acompanhar, 5000);
    }
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
      st.loja = d.loja; st.cardapio = d.cardapio; st.dia = d.dia; st.quadro = d.quadro || [];
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
        <div><h2>Aqui é Mac de 10!</h2><p>Escolha com 1, 2 ou 3 hambúrgueres. Vem com alface, tomate, cheddar ou mussarela e molho da casa. E tem porção de batata para acompanhar!</p></div></div>`,
        bebidas: `<div class="manu-card manu-bebidas"><img src="${MANU('bebidas')}" alt="" width="104" height="130">
        <div><h2>Bebidas geladinhas</h2><p>Suco de polpa e vitamina feitos na hora, para acompanhar o seu lanche ou o seu açaí.</p></div></div>` },
    });
    renderBarra();
    acompanhar();
    setInterval(() => { if (st.meus.length && !document.hidden) acompanhar(); }, 15000);
  })();
})();
