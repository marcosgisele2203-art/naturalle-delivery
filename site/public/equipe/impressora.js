// Impressora térmica: configuração por aparelho, comanda da cozinha, cupom do cliente e impressão automática.
// A impressão usa a impressora padrão do computador (a térmica). Para imprimir sem a janela de confirmação,
// o Chrome desse computador deve ser aberto com --kiosk-printing (instruções na Administração › Impressora).
(function () {
  const { esc, brl } = App;
  const CHAVE = 'nm-impressora';
  const PADRAO = { papel: 80, comanda: true, cupom: false, autoCozinha: false, autoNovo: false, vias: 1, letra: 'normal', rodape: 'Obrigado pela preferência! Volte sempre.' };
  const ROTULO = { entrega: 'ENTREGA', retirada: 'RETIRADA NO BALCÃO', mesa: 'MESA' };
  const PAG = { pix: 'Pix', cartao: 'Cartão', dinheiro: 'Dinheiro' };

  const ler = () => { try { return { ...PADRAO, ...(JSON.parse(localStorage.getItem(CHAVE)) || {}) }; } catch { return { ...PADRAO }; } };
  const salvar = (c) => { try { localStorage.setItem(CHAVE, JSON.stringify(c)); } catch { /* sem armazenamento */ } };

  // pedidos já impressos automaticamente neste aparelho (não imprime de novo ao recarregar)
  const impressos = () => { try { return JSON.parse(localStorage.getItem(CHAVE + '-feitos')) || []; } catch { return []; } };
  const marcar = (chave) => { try { localStorage.setItem(CHAVE + '-feitos', JSON.stringify([chave, ...impressos()].slice(0, 300))); } catch { /* */ } };

  function dataHora(iso) {
    return new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Campo_Grande', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  function cabecalho(p, titulo) {
    const onde = p.tipo === 'mesa' ? (p.mesa_nome || 'MESA').toUpperCase() : ROTULO[p.tipo] || p.tipo;
    const l = App.loja || {};
    // no cupom do cliente vão os dados da loja; na comanda da cozinha, não
    const dados = /CUPOM/.test(titulo) ? [l.razao_social, l.cnpj ? (String(l.cnpj).replace(/\D/g, '').length > 11 ? 'CNPJ ' : 'CPF ') + l.cnpj : '',
      l.endereco_completo, [l.telefone ? 'Tel ' + App.fone(l.telefone) : '', l.whatsapp ? 'WhatsApp ' + App.fone(l.whatsapp) : ''].filter(Boolean).join(' · '),
      l.instagram ? '@' + l.instagram : ''].filter(Boolean).map((t) => `<div class="c peq">${esc(t)}</div>`).join('') : '';
    return `<div class="c">${esc(l.nome || 'Naturalle Mania')}</div>${dados}
      <div class="c peq">${titulo}</div><hr>
      <div class="g">PEDIDO #${p.id}</div><div class="g">${esc(onde)}</div>
      <div class="peq">${dataHora(p.criado_em)}${p.criado_por_nome ? ' · ' + esc(p.criado_por_nome) : ''}</div>
      ${p.cliente_nome ? `<div>Cliente: ${esc(p.cliente_nome)}</div>` : ''}
      ${p.cliente_telefone ? `<div>Tel: ${App.fone(p.cliente_telefone)}</div>` : ''}
      ${p.endereco ? `<div>End.: ${esc(p.endereco)}</div>` : ''}<hr>`;
  }

  function comanda(p) {
    return `<section>${cabecalho(p, 'COMANDA DA COZINHA')}
      ${(p.itens || []).map((i) => `<div class="item"><b>${i.qtd}x ${esc(i.nome)}</b>${i.detalhe ? `<div>${esc(i.detalhe)}</div>` : ''}${i.obs ? `<div><b>OBS: ${esc(i.obs)}</b></div>` : ''}</div>`).join('')}
      ${p.observacoes ? `<hr><div><b>OBS DO PEDIDO: ${esc(p.observacoes)}</b></div>` : ''}<hr></section>`;
  }

  function cupom(p, cfg) {
    const linha = (a, b) => `<div class="l"><span>${a}</span><span>${b}</span></div>`;
    let pag = p.pagamento ? PAG[p.pagamento] || p.pagamento : p.tipo === 'mesa' ? 'Na conta da mesa' : 'A combinar';
    if (p.pagamento === 'pix') pag += p.pix_status === 'confirmado' ? ' (pago)' : ' (aguardando)';
    return `<section>${cabecalho(p, 'CUPOM DO CLIENTE · NÃO É DOCUMENTO FISCAL')}
      ${(p.itens || []).map((i) => `<div class="item">${linha(`${i.qtd}x ${esc(i.nome)}`, brl(i.preco))}${i.detalhe ? `<div class="peq">${esc(i.detalhe)}</div>` : ''}${i.obs ? `<div class="peq">Obs: ${esc(i.obs)}</div>` : ''}</div>`).join('')}<hr>
      ${linha('Subtotal', brl(p.subtotal ?? p.total))}
      ${Number(p.taxa_entrega) ? linha('Taxa de entrega', brl(p.taxa_entrega)) : ''}
      ${Number(p.acrescimo_cartao) ? linha('Acréscimo cartão', brl(p.acrescimo_cartao)) : ''}
      <div class="g">${linha('TOTAL', brl(p.total))}</div>
      ${linha('Pagamento', pag)}
      ${p.pagamento === 'dinheiro' && p.troco_para ? linha('Paga com', brl(p.troco_para)) + linha('Troco', brl(Number(p.troco_para) - Number(p.total))) : ''}
      ${cfg.rodape ? `<hr><div class="c peq">${esc(cfg.rodape)}</div>` : ''}<hr></section>`;
  }

  // imprime numa moldura escondida, com o tamanho do papel da térmica
  function imprimir(html, cfg) {
    if (window.__demo) { App.toast('Na demonstração a impressão fica bloqueada. No sistema instalado sai na impressora térmica.', true); return; }
    const largura = cfg.papel === 58 ? 48 : 72; // área útil em mm
    const fonte = cfg.letra === 'grande' ? 15 : 12;
    const f = document.createElement('iframe');
    f.setAttribute('aria-hidden', 'true');
    f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    document.body.appendChild(f);
    f.contentDocument.open();
    f.contentDocument.write(`<!doctype html><html><head><meta charset="utf-8"><title>Impressão</title><style>
      @page { size: ${cfg.papel}mm auto; margin: 2mm; }
      * { box-sizing: border-box; }
      body { margin: 0; width: ${largura}mm; font: ${fonte}px/1.3 'Courier New', monospace; color: #000; }
      .c { text-align: center; } .g { font-size: 1.35em; font-weight: bold; } .peq { font-size: 0.85em; }
      .l { display: flex; justify-content: space-between; gap: 6px; } .item { margin: 4px 0; }
      hr { border: 0; border-top: 1px dashed #000; margin: 5px 0; }
      section { break-after: page; page-break-after: always; } section:last-child { break-after: auto; page-break-after: auto; }
    </style></head><body>${html}</body></html>`);
    f.contentDocument.close();
    const pronto = () => { try { f.contentWindow.focus(); f.contentWindow.print(); } catch { App.toast('Não consegui abrir a impressão.', true); } setTimeout(() => f.remove(), 60000); };
    setTimeout(pronto, 250);
  }

  // o que sai no papel, conforme a configuração (e as vias)
  function montar(p, cfg, so) {
    const partes = [];
    for (let v = 0; v < Math.max(1, Math.min(3, Number(cfg.vias) || 1)); v++) {
      if ((so ? so === 'comanda' : cfg.comanda)) partes.push(comanda(p));
      if ((so ? so === 'cupom' : cfg.cupom)) partes.push(cupom(p, cfg));
    }
    return partes.join('');
  }

  App.imprimirPedido = (p, so) => {
    const cfg = ler();
    const html = montar(p, cfg, so);
    if (!html) { App.toast('Marque o que imprimir em Impressora (comanda e/ou cupom).', true); return; }
    imprimir(html, cfg);
  };

  // escolha rápida no botão "Imprimir" de cada pedido
  function escolher(p) {
    const j = App.janela('Imprimir pedido #' + p.id, `<div class="acoes">
      <button class="btn principal grande" data-so="comanda">Comanda da cozinha</button>
      <button class="btn verde grande" data-so="cupom">Cupom do cliente</button></div>`);
    j.addEventListener('click', (e) => { const b = e.target.closest('[data-so]'); if (b) { j.fechar(); App.imprimirPedido(p, b.dataset.so); } });
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-imprimir]');
    if (!b) return;
    const p = App.pedidos.find((x) => x.id === Number(b.dataset.imprimir));
    if (!p) return;
    if (b.closest('.comanda')) App.imprimirPedido(p, 'comanda'); // na cozinha imprime direto a comanda
    else escolher(p);
  });

  // impressão automática neste aparelho
  const original = App.atualizarPedidos;
  App.atualizarPedidos = async function () {
    const antes = new Map(App.pedidos.map((p) => [p.id, p.status]));
    const primeiraVez = !App.__impressoraPronta;
    await original();
    App.__impressoraPronta = true;
    const cfg = ler();
    if (primeiraVez || (!cfg.autoCozinha && !cfg.autoNovo)) return;
    const feitos = impressos();
    for (const p of App.pedidos) {
      const de = antes.get(p.id);
      if (cfg.autoCozinha && p.status === 'preparo' && de !== 'preparo' && de !== 'pronto' && !feitos.includes(p.id + ':cozinha')) {
        marcar(p.id + ':cozinha'); App.imprimirPedido(p);
      } else if (cfg.autoNovo && p.status === 'novo' && !de && !feitos.includes(p.id + ':novo')) {
        marcar(p.id + ':novo'); App.imprimirPedido(p);
      }
    }
  };

  // janela de configuração (por aparelho)
  App.configurarImpressora = () => {
    const c = ler();
    const ch = (k, t, d) => `<label class="check"><input type="checkbox" name="${k}"${c[k] ? ' checked' : ''}> <span>${t}${d ? `<br><small class="nota">${d}</small>` : ''}</span></label>`;
    const j = App.janela('Impressora térmica deste aparelho', `<form style="display:flex;flex-direction:column;gap:12px">
      <p class="nota">Esta configuração vale só para este computador ou tablet, onde a impressora está ligada.</p>
      <div class="campo"><span>Largura do papel</span><div class="chips">${[80, 58].map((n) => `<label class="chip" style="display:inline-flex;align-items:center;gap:6px"><input type="radio" name="papel" value="${n}"${c.papel === n ? ' checked' : ''}> ${n} mm</label>`).join('')}</div></div>
      <div class="campo"><span>O que imprimir</span>
        ${ch('comanda', 'Comanda da cozinha', 'Itens e observações em destaque, sem preços.')}
        ${ch('cupom', 'Cupom do cliente', 'Itens, preços, taxas, total, pagamento e troco.')}</div>
      <div class="campo"><span>Imprimir sozinho</span>
        ${ch('autoCozinha', 'Quando o pedido for para a cozinha (confirmado)', 'Ligue no computador da cozinha.')}
        ${ch('autoNovo', 'Quando chegar pedido novo pelo site ou pela mesa', 'Ligue no computador do caixa, se quiser.')}</div>
      <div class="grade-form">
        <label class="campo">Vias<select name="vias">${[1, 2, 3].map((n) => `<option${Number(c.vias) === n ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
        <label class="campo">Tamanho da letra<select name="letra"><option value="normal"${c.letra !== 'grande' ? ' selected' : ''}>Normal</option><option value="grande"${c.letra === 'grande' ? ' selected' : ''}>Grande</option></select></label>
      </div>
      <label class="campo">Mensagem no fim do cupom<input name="rodape" maxlength="120" value="${esc(c.rodape)}"></label>
      <div class="acoes"><button class="btn verde grande">Salvar</button><button type="button" class="btn grande" data-teste>Imprimir teste</button></div>
    </form>`);
    const form = j.querySelector('form');
    const lerForm = () => ({
      papel: Number(form.papel.value) || 80, comanda: form.comanda.checked, cupom: form.cupom.checked,
      autoCozinha: form.autoCozinha.checked, autoNovo: form.autoNovo.checked, vias: Number(form.vias.value) || 1,
      letra: form.letra.value, rodape: form.rodape.value.trim(),
    });
    form.addEventListener('submit', (e) => { e.preventDefault(); salvar(lerForm()); j.fechar(); App.toast('Impressora configurada neste aparelho'); });
    j.querySelector('[data-teste]').addEventListener('click', () => {
      const cfg = lerForm();
      const exemplo = { id: 123, tipo: 'entrega', criado_em: new Date().toISOString(), cliente_nome: 'Cliente Teste', cliente_telefone: '5567999999999', endereco: 'Rua Exemplo, 100',
        itens: [{ qtd: 1, nome: 'Mac de 10 · 2 hambúrgueres', detalhe: 'Cheddar, Bacon', obs: 'Sem tomate', preco: 22 }, { qtd: 1, nome: 'Açaí 500 ml', detalhe: 'Morango, Nutella', preco: 32 }],
        observacoes: 'Teste de impressão', subtotal: 54, taxa_entrega: 6, acrescimo_cartao: 0, total: 60, pagamento: 'dinheiro', troco_para: 100 };
      const html = montar(exemplo, { ...cfg, vias: 1 }, null) || comanda(exemplo);
      imprimir(html, cfg);
    });
  };
})();
