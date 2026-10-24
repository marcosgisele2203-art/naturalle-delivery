// Cálculo de preço de um item do cardápio.
// Roda no navegador (window.Calc) e no servidor (require). O servidor sempre recalcula:
// o preço que vem do navegador é ignorado.
//
// Cardápio: { categorias: [{ id, nome }], produtos: [{ id, categoria, nome, descricao, preco,
//   disponivel, dias: [0-6] | [], grupos: [{ id, nome, tipo: 'unica'|'multipla', obrigatorio, max,
//   opcoes: [{ id, nome, preco, preco_de, disponivel }] }] }] }
//
// Escolha do cliente: { produto, opcoes: { [grupoId]: [opcaoId, ...] }, qtd, obs }
(function (root) {
  const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  const centavos = (v) => Math.round(Number(v || 0) * 100);
  const reais = (c) => c / 100;

  function diasTexto(dias) {
    const nomes = dias.map((d) => DIAS[d]);
    return nomes.length > 1 ? nomes.slice(0, -1).join(', ') + ' e ' + nomes[nomes.length - 1] : nomes[0];
  }

  function disponivelHoje(p, weekday) {
    return !(Array.isArray(p.dias) && p.dias.length && !p.dias.includes(weekday));
  }

  function calcular(menu, escolha, weekday) {
    if (!escolha || typeof escolha !== 'object') throw new Error('Item inválido');
    const p = (menu.produtos || []).find((x) => x.id === escolha.produto);
    if (!p) throw new Error('Produto não encontrado');
    if (p.disponivel === false) throw new Error(p.nome + ' está indisponível no momento');
    if (!disponivelHoje(p, weekday)) throw new Error(p.nome + ' só está disponível: ' + diasTexto(p.dias));

    const qtd = Math.trunc(Number(escolha.qtd) || 1);
    if (qtd < 1 || qtd > 50) throw new Error('Quantidade inválida');

    let unit = centavos(p.preco);
    const partes = [];
    const sel = escolha.opcoes && typeof escolha.opcoes === 'object' ? escolha.opcoes : {};
    for (const g of p.grupos || []) {
      const ids = [...new Set((Array.isArray(sel[g.id]) ? sel[g.id] : []).map(String))];
      if (g.tipo === 'unica' && ids.length > 1) throw new Error('Escolha só uma opção em ' + g.nome);
      if (g.obrigatorio && !ids.length) throw new Error('Escolha ' + g.nome.toLowerCase() + ' de ' + p.nome);
      if (g.max && ids.length > g.max) throw new Error('Máximo de ' + g.max + ' em ' + g.nome);
      for (const id of ids) {
        const o = (g.opcoes || []).find((x) => x.id === id);
        if (!o) throw new Error('Opção inválida em ' + g.nome);
        if (o.disponivel === false) throw new Error(o.nome + ' acabou');
        unit += centavos(o.preco);
        partes.push(o.nome);
      }
    }
    const obs = String(escolha.obs || '').trim().slice(0, 200);
    return {
      produto: p.id,
      nome: p.nome,
      detalhe: partes.join(', '),
      obs,
      qtd,
      preco_unit: reais(unit),
      preco: reais(unit * qtd),
    };
  }

  // Menor preço possível (para "a partir de")
  function precoMinimo(p) {
    let c = centavos(p.preco);
    for (const g of p.grupos || []) {
      if (!g.obrigatorio) continue;
      const ops = (g.opcoes || []).filter((o) => o.disponivel !== false).map((o) => centavos(o.preco));
      if (ops.length) c += Math.min(...ops);
    }
    return reais(c);
  }

  function somar(itens) {
    return reais(itens.reduce((s, i) => s + centavos(i.preco), 0));
  }

  const brl = (v) => 'R$ ' + Number(v || 0).toFixed(2).replace('.', ',');

  const Calc = { calcular, precoMinimo, somar, brl, disponivelHoje, diasTexto, DIAS };
  if (typeof module !== 'undefined' && module.exports) module.exports = Calc;
  else root.Calc = Calc;
})(this);
