// Relatórios: vendas do dia, da semana, do mês, do ano ou de um período escolhido.
App.views.relatorios = {
  montar(el) {
    const { esc, brl } = App;
    const FUSO = 'America/Campo_Grande';
    const NOMES = { pix: 'Pix', cartao: 'Cartão', dinheiro: 'Dinheiro', 'em aberto': 'Em aberto (mesa sem conta fechada)', entrega: 'Entrega', retirada: 'Retirada', mesa: 'Mesa' };
    const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO }).format(new Date());
    const somarDias = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
    const diaSemana = new Date(hoje + 'T12:00:00Z').getUTCDay();
    const PERIODOS = {
      dia: ['Hoje', hoje, hoje],
      semana: ['Esta semana', somarDias(hoje, -((diaSemana + 6) % 7)), hoje], // de segunda até hoje
      mes: ['Este mês', hoje.slice(0, 8) + '01', hoje],
      ano: ['Este ano', hoje.slice(0, 4) + '-01-01', hoje],
    };
    const br = (iso) => iso.split('-').reverse().join('/');
    let periodo = 'dia', de = hoje, ate = hoje, rel = null, carregando = false, erro = '';

    async function carregar() {
      carregando = true; erro = ''; render();
      try { rel = await App.api(`/api/equipe/relatorio?de=${de}&ate=${ate}`); } catch (e) { erro = e.message; rel = null; }
      carregando = false; render();
    }

    function tabela(titulo, linhas, colunas) {
      return `<section class="cartao rel-bloco"><h2>${titulo}</h2>${linhas.length ? `<div class="rolagem"><table class="tabela">
        <thead><tr>${colunas.map((c) => `<th${c.num ? ' class="num"' : ''}>${c.t}</th>`).join('')}</tr></thead>
        <tbody>${linhas.map((l) => `<tr>${colunas.map((c) => `<td${c.num ? ' class="num"' : ''}>${c.v(l)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`
        : '<p class="nota">Nada neste período.</p>'}</section>`;
    }

    function render() {
      const r = rel && rel.resumo;
      const maior = rel ? Math.max(1, ...rel.periodos.map((p) => p.total)) : 1;
      el.innerHTML = `<div class="topo"><div><h1>Relatórios</h1><p>Vendas por período. Pedidos cancelados não entram no total.</p></div>
          <div class="controles nao-imprimir">
            <button class="btn" data-baixar ${rel && rel.pedidos.length ? '' : 'disabled'}>Baixar planilha (Excel)</button>
            <button class="btn escuro" data-imprimir ${rel ? '' : 'disabled'}>Imprimir / salvar PDF</button>
          </div></div>
        <section class="cartao nao-imprimir">
          <div class="chips">${Object.entries(PERIODOS).map(([k, [n]]) => `<button class="chip" aria-pressed="${periodo === k}" data-periodo="${k}">${n}</button>`).join('')}
            <button class="chip" aria-pressed="${periodo === 'outro'}" data-periodo="outro">Escolher datas</button></div>
          ${periodo === 'outro' ? `<form class="acoes" data-datas>
            <label class="campo">De<input type="date" name="de" value="${de}" max="${hoje}"></label>
            <label class="campo">Até<input type="date" name="ate" value="${ate}" max="${hoje}"></label>
            <button class="btn verde" style="align-self:flex-end">Ver relatório</button></form>` : ''}
        </section>
        <p class="rel-titulo">Relatório de vendas · Naturalle Mania · ${de === ate ? br(de) : br(de) + ' a ' + br(ate)}</p>
        ${erro ? `<p class="erro">${esc(erro)}</p>` : ''}
        ${carregando && !rel ? '<p class="nota">Carregando…</p>' : ''}
        ${r ? `<div class="rel-numeros">
            <div class="cartao"><span class="nota">Total vendido</span><b>${brl(r.total)}</b></div>
            <div class="cartao"><span class="nota">Pedidos</span><b>${r.pedidos}</b></div>
            <div class="cartao"><span class="nota">Ticket médio</span><b>${brl(r.ticket)}</b></div>
            <div class="cartao"><span class="nota">Cancelados</span><b>${r.cancelados.pedidos}</b><small>${brl(r.cancelados.total)}</small></div>
          </div>
          <p class="nota">Dentro do total: ${brl(r.taxa_entrega)} de taxas de entrega e ${brl(r.acrescimo_cartao)} de acréscimo da maquininha.</p>
          <div class="rel-grade">
            ${tabela('Por forma de pagamento', rel.pagamentos, [{ t: 'Pagamento', v: (l) => esc(NOMES[l.chave] || l.chave) }, { t: 'Pedidos', num: 1, v: (l) => l.pedidos }, { t: 'Total', num: 1, v: (l) => brl(l.total) }])}
            ${tabela('Por tipo de pedido', rel.tipos, [{ t: 'Tipo', v: (l) => esc(NOMES[l.chave] || l.chave) }, { t: 'Pedidos', num: 1, v: (l) => l.pedidos }, { t: 'Total', num: 1, v: (l) => brl(l.total) }])}
          </div>
          ${tabela(rel.agrupado === 'mês' ? 'Vendas por mês' : 'Vendas por dia', rel.periodos, [
            { t: rel.agrupado === 'mês' ? 'Mês' : 'Dia', v: (l) => l.rotulo },
            { t: 'Pedidos', num: 1, v: (l) => l.pedidos },
            { t: 'Total', num: 1, v: (l) => brl(l.total) },
            { t: '', v: (l) => `<span class="rel-barra" style="width:${Math.max(2, Math.round((l.total / maior) * 100))}%" aria-hidden="true"></span>` }])}
          ${tabela('Produtos mais vendidos', rel.produtos.slice(0, 30), [{ t: 'Produto', v: (l) => esc(l.nome) }, { t: 'Quantidade', num: 1, v: (l) => l.qtd }, { t: 'Total', num: 1, v: (l) => brl(l.total) }])}
        ` : ''}`;
    }

    el.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.periodo) {
        periodo = b.dataset.periodo;
        if (PERIODOS[periodo]) { [, de, ate] = PERIODOS[periodo]; carregar(); } else render();
      } else if (b.hasAttribute('data-baixar')) {
        if (window.__demo) return App.toast('Na demonstração o navegador bloqueia downloads. No sistema instalado a planilha baixa normalmente.', true);
        const url = URL.createObjectURL(new Blob([window.Relatorio.csv(rel)], { type: 'text/csv;charset=utf-8' }));
        const a = document.createElement('a');
        a.href = url; a.download = `relatorio-naturalle-${de}${de === ate ? '' : '-a-' + ate}.csv`;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      } else if (b.hasAttribute('data-imprimir')) {
        if (window.__demo) return App.toast('Na demonstração a impressão fica bloqueada. No sistema instalado abre a tela de imprimir / salvar PDF.', true);
        window.print();
      }
    });
    el.addEventListener('submit', (e) => {
      e.preventDefault();
      const f = e.target;
      if (!f.de.value || !f.ate.value || f.ate.value < f.de.value) { App.toast('Escolha a data inicial e a final.', true); return; }
      de = f.de.value; ate = f.ate.value; carregar();
    });

    carregar();
  },
};
