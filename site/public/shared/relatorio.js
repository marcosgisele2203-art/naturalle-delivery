// Monta o relatório de vendas de um período a partir da lista de pedidos.
// Roda no servidor (require) e no navegador (window.Relatorio), igual ao calc.js.
//
// Cada pedido: { id, data: 'AAAA-MM-DD', hora: 'HH:MM', tipo, origem, mesa_nome, cliente_nome,
//   itens: [{ nome, detalhe, qtd, preco }], pagamento, subtotal, taxa_entrega, acrescimo_cartao, total, status }
(function (root) {
  const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const centavos = (v) => Math.round(Number(v || 0) * 100);
  const reais = (c) => c / 100;

  function montar(pedidos, de, ate) {
    const validos = pedidos.filter((p) => p.status !== 'cancelado');
    const cancelados = pedidos.filter((p) => p.status === 'cancelado');
    const soma = (lista, campo) => reais(lista.reduce((s, p) => s + centavos(p[campo]), 0));

    const agrupar = (chave) => {
      const m = new Map();
      for (const p of validos) {
        const k = chave(p);
        const g = m.get(k) || { chave: k, pedidos: 0, total: 0 };
        g.pedidos++; g.total += centavos(p.total);
        m.set(k, g);
      }
      return [...m.values()].map((g) => ({ ...g, total: reais(g.total) }));
    };

    // por dia até 2 meses; por mês em períodos maiores
    const dias = Math.round((new Date(ate) - new Date(de)) / 86400000) + 1;
    const porMes = dias > 62;
    const periodos = agrupar((p) => (porMes ? p.data.slice(0, 7) : p.data))
      .sort((a, b) => a.chave.localeCompare(b.chave))
      .map((g) => ({ ...g, rotulo: porMes ? MESES[Number(g.chave.slice(5, 7)) - 1] + '/' + g.chave.slice(0, 4) : g.chave.slice(8, 10) + '/' + g.chave.slice(5, 7) }));

    const produtos = new Map();
    for (const p of validos) {
      for (const i of p.itens || []) {
        const g = produtos.get(i.nome) || { nome: i.nome, qtd: 0, total: 0 };
        g.qtd += Number(i.qtd) || 1; g.total += centavos(i.preco);
        produtos.set(i.nome, g);
      }
    }

    const total = soma(validos, 'total');
    return {
      de, ate, agrupado: porMes ? 'mês' : 'dia',
      resumo: {
        total, pedidos: validos.length, ticket: validos.length ? Math.round((total / validos.length) * 100) / 100 : 0,
        taxa_entrega: soma(validos, 'taxa_entrega'), acrescimo_cartao: soma(validos, 'acrescimo_cartao'),
        cancelados: { pedidos: cancelados.length, total: soma(cancelados, 'total') },
      },
      pagamentos: agrupar((p) => p.pagamento || 'em aberto').sort((a, b) => b.total - a.total),
      tipos: agrupar((p) => p.tipo).sort((a, b) => b.total - a.total),
      periodos,
      produtos: [...produtos.values()].map((g) => ({ ...g, total: reais(g.total) })).sort((a, b) => b.qtd - a.qtd || b.total - a.total),
      pedidos,
    };
  }

  // Planilha CSV no padrão do Excel em português (ponto e vírgula, vírgula decimal)
  function csv(rel) {
    const NOMES = { pix: 'Pix', cartao: 'Cartão', dinheiro: 'Dinheiro', entrega: 'Entrega', retirada: 'Retirada', mesa: 'Mesa' };
    const num = (v) => Number(v || 0).toFixed(2).replace('.', ',');
    const campo = (v) => { const s = String(v == null ? '' : v); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const linhas = [['Pedido', 'Data', 'Hora', 'Tipo', 'Mesa', 'Cliente', 'Itens', 'Pagamento', 'Subtotal', 'Taxa de entrega', 'Acréscimo cartão', 'Total', 'Entregador', 'Situação']];
    for (const p of rel.pedidos) {
      linhas.push([p.id, p.data.split('-').reverse().join('/'), p.hora, NOMES[p.tipo] || p.tipo, p.mesa_nome || '', p.cliente_nome || '',
        (p.itens || []).map((i) => `${i.qtd}x ${i.nome}${i.detalhe ? ' (' + i.detalhe + ')' : ''}`).join(' | '),
        NOMES[p.pagamento] || (p.pagamento ? p.pagamento : 'Em aberto'), num(p.subtotal), num(p.taxa_entrega), num(p.acrescimo_cartao), num(p.total), p.entregador_nome || '',
        p.status === 'cancelado' ? 'Cancelado' : 'Vendido']);
    }
    return '﻿' + linhas.map((l) => l.map(campo).join(';')).join('\r\n');
  }

  const Relatorio = { montar, csv };
  if (typeof module !== 'undefined' && module.exports) module.exports = Relatorio;
  else root.Relatorio = Relatorio;
})(this);
