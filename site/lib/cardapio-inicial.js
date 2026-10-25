// Cardápio carregado no banco na primeira vez que o sistema sobe.
// Depois disso, tudo é editado pela área do administrador.
const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const ops = (lista) => lista.map(([nome, preco, preco_de]) => ({ id: slug(nome), nome, preco, ...(preco_de ? { preco_de } : {}) }));
const grupo = (nome, tipo, obrigatorio, opcoes, extra = {}) => ({ id: slug(nome), nome, tipo, obrigatorio, opcoes: ops(opcoes), ...extra });

const frutas = [['Banana', 0], ['Cereja', 5], ['Morango', 6], ['Uva', 6], ['Kiwi', 6], ['Abacaxi', 6], ['Ameixa', 6], ['Maçã', 5]];
const cremes = [['Leite Ninho', 6], ['Paçoca', 6], ['Maracujá', 6], ['Morango', 6], ['Cupuaçu', 6], ['Choco Cookies', 7], ['Choco Bis', 7], ['Ovomaltine', 7]];
const diversos = [['Leite condensado', 5], ['Granola', 4], ['Negresco', 5], ['Paçoca', 4], ['Coco flocos', 5], ['Sucrilhos', 4], ['Doce de leite', 6], ['Leite Ninho', 6], ['Chantilly', 6], ['Castanha de caju', 6]];
const chocolates = [['Bis', 5], ['Sonho de Valsa', 5], ['Ouro Branco', 5], ['Confete', 5], ['Ovomaltine', 6], ['Kit Kat', 6], ['Prestígio', 6], ['Nutella', 8], ['Kinder Bueno', 8], ['Brigadeiro', 6], ['Beijinho', 6], ['Gotas de chocolate', 5]];
const caldas = [['Chocolate', 4], ['Morango', 4], ['Açaí', 4], ['Caramelo', 4], ['Mel', 5]];
const tresTamanhos = (a, b, c) => [['300 ml', a], ['500 ml', b], ['700 ml', c]];
const combo = (dia, weekday, desc, promo, normal) => ({
  id: 'combo-' + slug(dia), categoria: 'combos', nome: 'Combo de ' + dia, descricao: desc, preco: 0, dias: [weekday],
  grupos: [grupo('Tamanho', 'unica', true, ['300 ml', '400 ml', '500 ml', '700 ml'].map((t, i) => [t, promo[i], normal[i]]))],
});

module.exports = {
  categorias: [
    { id: 'acai', nome: 'Açaí' },
    { id: 'mac', nome: 'Mac de 10' },
    { id: 'combos', nome: 'Combos do dia' },
    { id: 'bebidas', nome: 'Bebidas e shakes' },
    { id: 'sobremesas', nome: 'Sobremesas e mais' },
  ],
  produtos: [
    {
      id: 'monte-seu-acai', categoria: 'acai', nome: 'Monte seu açaí', descricao: 'Escolha o copo e os adicionais do seu jeito.', preco: 0,
      grupos: [
        grupo('Copo', 'unica', true, [['300 ml', 12], ['400 ml', 14], ['500 ml', 18], ['700 ml', 26], ['1 litro', 36]]),
        grupo('Frutas', 'multipla', false, frutas),
        grupo('Cremes', 'multipla', false, cremes),
        grupo('Diversos', 'multipla', false, diversos),
        grupo('Chocolates', 'multipla', false, chocolates),
        grupo('Caldas', 'multipla', false, caldas),
      ],
    },
    {
      id: 'marmita-trufada', categoria: 'acai', nome: 'Marmita Trufada', descricao: 'Açaí + 5 adicionais à sua escolha.', preco: 40,
      grupos: [grupo('Seus 5 adicionais', 'multipla', true,
        [...new Map([...frutas, ...cremes, ...diversos, ...chocolates].map(([n]) => [slug(n), [n, 0]])).values()], { max: 5 })],
    },
    ...[[1, 'Mac de 10 · 1 hambúrguer', 10], [2, 'Mac de 10 · 2 hambúrgueres', 16], [3, 'Mac de 10 · 3 hambúrgueres', 22]].map(([n, nome, preco]) => ({
      id: 'mac-de-10-' + n, categoria: 'mac', nome, preco, foto: '/img/lanches/mac-' + n + '.webp',
      descricao: `Pão, ${n === 1 ? '1 hambúrguer' : n + ' hambúrgueres'}, alface, tomate, queijo cheddar ou mussarela e molho da casa.`,
      grupos: [
        grupo('Queijo', 'unica', true, [['Cheddar', 0], ['Mussarela', 0]]),
        grupo('Adicionais', 'multipla', false, [['Bacon', 6], ['Calabresa', 6], ['Catupiry', 6], ['Molho da casa', 2]]),
      ],
    })),
    combo('Terça', 2, 'Açaí, morango, banana, leite condensado e leite Ninho', [26, 28, 32, 39], [30, 32, 36, 43]),
    combo('Quarta', 3, 'Açaí, morango, leite condensado e leite Ninho', [22, 24, 28, 35], [26, 28, 32, 39]),
    combo('Quinta', 4, 'Açaí, Ovomaltine, banana e leite condensado', [21, 23, 27, 34], [25, 27, 31, 38]),
    {
      id: 'porcao-batata', categoria: 'mac', nome: 'Porção de batata', descricao: 'Média de 300 g, com cheddar ou catupiry e bacon ou calabresa.', preco: 25, foto: '/img/lanches/batata.webp',
      grupos: [
        grupo('Cobertura', 'unica', true, [['Cheddar', 0], ['Catupiry', 0]]),
        grupo('Complemento', 'unica', true, [['Bacon', 0], ['Calabresa', 0]]),
      ],
    },
    {
      id: 'suco-de-polpa', categoria: 'bebidas', nome: 'Suco de polpa 500 ml', descricao: 'No copo.', preco: 12,
      grupos: [grupo('Sabor', 'unica', true, ['Acerola', 'Abacaxi', 'Abacaxi c/ hortelã', 'Maracujá', 'Tamarindo', 'Goiaba', 'Suco verde', 'Laranja'].map((n) => [n, 0]))],
    },
    {
      id: 'vitamina', categoria: 'bebidas', nome: 'Vitamina 500 ml', descricao: 'Batida com leite e frutas.', preco: 18,
      grupos: [grupo('Sabor', 'unica', true, ['Açaí', 'Morango', 'Banana', 'Mista'].map((n) => [n, 0]))],
    },
    { id: 'milk-shake-de-acai', categoria: 'bebidas', nome: 'Milk shake de açaí', descricao: '', preco: 0, grupos: [grupo('Tamanho', 'unica', true, tresTamanhos(15, 20, 25))] },
    { id: 'milk-shake-de-sorvete', categoria: 'bebidas', nome: 'Milk shake de sorvete', descricao: '', preco: 0, grupos: [grupo('Tamanho', 'unica', true, tresTamanhos(15, 20, 25))] },
    {
      id: 'salada-de-frutas', categoria: 'sobremesas', nome: 'Salada de frutas', descricao: 'Morango, maçã, banana, mamão, uva, leite condensado e iogurte.', preco: 0,
      grupos: [grupo('Tamanho', 'unica', true, [['200 ml', 12], ['400 ml', 20]])],
    },
    {
      id: 'fondue', categoria: 'sobremesas', nome: 'Fondue', descricao: 'Frutas frescas com ganache de chocolate.', preco: 0,
      grupos: [grupo('Tamanho', 'unica', true, [['M', 26.9], ['G', 30.9]])],
    },
    { id: 'salgadinho-no-copo', categoria: 'sobremesas', nome: 'Salgadinho no copo (100 un)', descricao: 'Sob encomenda.', preco: 70 },
  ],
};
module.exports.slug = slug;
