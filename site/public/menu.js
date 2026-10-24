// Cardápio da Naturalle Mania + cálculo de preço.
// O mesmo arquivo roda no navegador (window.MENU) e no servidor (require),
// então o preço que o cliente vê é o mesmo que o servidor cobra.
(function (root) {
  const MENU = {
    copos: [
      { nome: '300 ml', preco: 12 },
      { nome: '400 ml', preco: 14 },
      { nome: '500 ml', preco: 18 },
      { nome: '700 ml', preco: 26 },
      { nome: '1 litro', preco: 36 },
    ],
    adicionais: [
      { grupo: 'Frutas', itens: [['Banana', 0], ['Cereja', 5], ['Morango', 6], ['Uva', 6], ['Kiwi', 6], ['Abacaxi', 6], ['Ameixa', 6], ['Maçã', 5]] },
      { grupo: 'Cremes', itens: [['Leite Ninho', 6], ['Paçoca', 6], ['Maracujá', 6], ['Morango', 6], ['Cupuaçu', 6], ['Choco Cookies', 7], ['Choco Bis', 7], ['Ovomaltine', 7]] },
      { grupo: 'Diversos', itens: [['Leite condensado', 5], ['Granola', 4], ['Negresco', 5], ['Paçoca', 4], ['Coco flocos', 5], ['Sucrilhos', 4], ['Doce de leite', 6], ['Leite Ninho', 6], ['Chantilly', 6], ['Castanha de caju', 6]] },
      { grupo: 'Chocolates', itens: [['Bis', 5], ['Sonho de Valsa', 5], ['Ouro Branco', 5], ['Confete', 5], ['Ovomaltine', 6], ['Kit Kat', 6], ['Prestígio', 6], ['Nutella', 8], ['Kinder Bueno', 8], ['Brigadeiro', 6], ['Beijinho', 6], ['Gotas de chocolate', 5]] },
      { grupo: 'Caldas', itens: [['Chocolate', 4], ['Morango', 4], ['Açaí', 4], ['Caramelo', 4], ['Mel', 5]] },
    ],
    mac: {
      descricao: 'Hambúrguer, alface, tomate, cheddar ou mussarela e molho da casa.',
      opcoes: [['1 hambúrguer', 10], ['2 hambúrgueres', 16], ['3 hambúrgueres', 22]],
      queijos: ['Cheddar', 'Mussarela'],
      adicionais: [['Bacon', 6], ['Calabresa', 6], ['Catupiry', 6], ['Molho da casa', 2]],
    },
    tamanhosCombo: ['300 ml', '400 ml', '500 ml', '700 ml'],
    combos: [
      { dia: 'Terça', weekday: 2, cor: '#1D5FA8', desc: 'Açaí, morango, banana, leite condensado e leite Ninho', normal: [30, 32, 36, 43], promo: [26, 28, 32, 39] },
      { dia: 'Quarta', weekday: 3, cor: '#1E5B2B', desc: 'Açaí, morango, leite condensado e leite Ninho', normal: [26, 28, 32, 39], promo: [22, 24, 28, 35] },
      { dia: 'Quinta', weekday: 4, cor: '#A3134A', desc: 'Açaí, Ovomaltine, banana e leite condensado', normal: [25, 27, 31, 38], promo: [21, 23, 27, 34] },
    ],
    // preco: null = ainda sem preço definido (aparece como "Consulte" e não pode ser pedido)
    produtos: [
      { id: 'batata-cheddar-bacon', cat: 'lanches', nome: 'Batata com cheddar e bacon', desc: 'Porção média de 300 g', preco: null },
      { id: 'batata-cheddar-calabresa', cat: 'lanches', nome: 'Batata com cheddar e calabresa', desc: 'Porção média de 300 g', preco: null },
      { id: 'batata-catupiry-bacon', cat: 'lanches', nome: 'Batata com catupiry e bacon', desc: 'Porção média de 300 g', preco: null },
      { id: 'batata-catupiry-calabresa', cat: 'lanches', nome: 'Batata com catupiry e calabresa', desc: 'Porção média de 300 g', preco: null },
      { id: 'suco-polpa', cat: 'bebidas', nome: 'Suco de polpa 500 ml', desc: 'Acerola, abacaxi, abacaxi c/ hortelã, maracujá, tamarindo, goiaba, suco verde ou laranja', preco: 12, sabores: ['Acerola', 'Abacaxi', 'Abacaxi c/ hortelã', 'Maracujá', 'Tamarindo', 'Goiaba', 'Suco verde', 'Laranja'] },
      { id: 'vitamina', cat: 'bebidas', nome: 'Vitamina 500 ml', desc: 'Batida com leite e frutas', preco: 18, sabores: ['Açaí', 'Morango', 'Banana', 'Mista'] },
      { id: 'shake-acai-300', cat: 'bebidas', nome: 'Milk shake de açaí 300 ml', desc: '', preco: 15 },
      { id: 'shake-acai-500', cat: 'bebidas', nome: 'Milk shake de açaí 500 ml', desc: '', preco: 20 },
      { id: 'shake-acai-700', cat: 'bebidas', nome: 'Milk shake de açaí 700 ml', desc: '', preco: 25 },
      { id: 'shake-sorvete-300', cat: 'bebidas', nome: 'Milk shake de sorvete 300 ml', desc: '', preco: 15 },
      { id: 'shake-sorvete-500', cat: 'bebidas', nome: 'Milk shake de sorvete 500 ml', desc: '', preco: 20 },
      { id: 'shake-sorvete-700', cat: 'bebidas', nome: 'Milk shake de sorvete 700 ml', desc: '', preco: 25 },
      { id: 'salada-200', cat: 'bebidas', nome: 'Salada de frutas 200 ml', desc: 'Morango, maçã, banana, mamão, uva, leite condensado e iogurte', preco: 12 },
      { id: 'salada-400', cat: 'bebidas', nome: 'Salada de frutas 400 ml', desc: 'Morango, maçã, banana, mamão, uva, leite condensado e iogurte', preco: 20 },
      { id: 'fondue-m', cat: 'bebidas', nome: 'Fondue M', desc: 'Frutas frescas com ganache de chocolate', preco: 26.9 },
      { id: 'fondue-g', cat: 'bebidas', nome: 'Fondue G', desc: 'Frutas frescas com ganache de chocolate', preco: 30.9 },
      { id: 'marmita-trufada', cat: 'bebidas', nome: 'Marmita Trufada', desc: 'Açaí + 5 adicionais (diga quais nas observações)', preco: 40 },
      { id: 'salgadinho-copo', cat: 'bebidas', nome: 'Salgadinho no copo (100 un)', desc: 'Sob encomenda', preco: 70 },
    ],
  };

  const achaAdicional = (chave) => {
    const [grupo, nome] = String(chave).split(':');
    const g = MENU.adicionais.find((x) => x.grupo === grupo);
    const it = g && g.itens.find((x) => x[0] === nome);
    if (!it) throw new Error('Adicional inválido: ' + chave);
    return { nome, preco: it[1] };
  };

  // Recebe a escolha do cliente (sem preço) e devolve { nome, detalhe, preco }.
  // weekday: 0 = domingo ... 6 = sábado, no fuso da loja.
  MENU.calcular = function (item, weekday) {
    if (!item || typeof item !== 'object') throw new Error('Item inválido');
    const unicos = (lista, max) => {
      if (!Array.isArray(lista)) return [];
      if (lista.length > max) throw new Error('Adicionais demais');
      return [...new Set(lista.map(String))];
    };

    if (item.tipo === 'acai') {
      const copo = MENU.copos[item.copo];
      if (!copo) throw new Error('Copo inválido');
      const ads = unicos(item.adicionais, 25).map(achaAdicional);
      return {
        nome: 'Açaí ' + copo.nome,
        detalhe: ads.map((a) => a.nome).join(', ') || 'Sem adicionais',
        preco: copo.preco + ads.reduce((s, a) => s + a.preco, 0),
      };
    }

    if (item.tipo === 'mac') {
      const op = MENU.mac.opcoes[item.opcao];
      if (!op) throw new Error('Opção do Mac inválida');
      const queijo = MENU.mac.queijos.includes(item.queijo) ? item.queijo : MENU.mac.queijos[0];
      const ads = unicos(item.adicionais, 4).map((n) => {
        const a = MENU.mac.adicionais.find((x) => x[0] === n);
        if (!a) throw new Error('Adicional inválido: ' + n);
        return { nome: a[0], preco: a[1] };
      });
      return {
        nome: 'Mac de 10 · ' + op[0],
        detalhe: [queijo, ...ads.map((a) => a.nome)].join(', '),
        preco: op[1] + ads.reduce((s, a) => s + a.preco, 0),
      };
    }

    if (item.tipo === 'combo') {
      const c = MENU.combos.find((x) => x.dia === item.dia);
      const t = MENU.tamanhosCombo[item.tamanho];
      if (!c || !t) throw new Error('Combo inválido');
      const hoje = c.weekday === weekday;
      return {
        nome: 'Combo ' + c.dia + ' ' + t,
        detalhe: c.desc + (hoje ? ' (promoção do dia)' : ''),
        preco: (hoje ? c.promo : c.normal)[item.tamanho],
      };
    }

    if (item.tipo === 'produto') {
      const p = MENU.produtos.find((x) => x.id === item.id);
      if (!p) throw new Error('Produto inválido');
      if (p.preco == null) throw new Error(p.nome + ' ainda está sem preço');
      let detalhe = p.desc;
      if (p.sabores) {
        if (!p.sabores.includes(item.sabor)) throw new Error('Escolha o sabor de ' + p.nome);
        detalhe = item.sabor;
      }
      return { nome: p.nome, detalhe, preco: p.preco };
    }

    throw new Error('Tipo de item inválido');
  };

  MENU.brl = (v) => 'R$ ' + Number(v).toFixed(2).replace('.', ',');

  if (typeof module !== 'undefined' && module.exports) module.exports = MENU;
  else root.MENU = MENU;
})(this);
