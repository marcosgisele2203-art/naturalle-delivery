// Ingredientes e preços transcritos do cartaz fornecido pela loja.
const itens = [
  ['x-salada', 'X Salada', 15, 'Pão, hambúrguer, alface, tomate, presunto e mussarela.'],
  ['x-salada-especial', 'X Salada Especial', 20, 'Pão, hambúrguer, milho, alface, tomate, batata, catupiry, ovo, presunto e mussarela.'],
  ['x-bacon', 'X-Bacon', 24, 'Pão, maionese, alface, tomate, hambúrguer, bacon, presunto e mussarela.'],
  ['x-bacon-especial', 'X-Bacon Especial', 26, 'Pão, maionese, alface, tomate, hambúrguer, bacon, ovo, presunto e mussarela.'],
  ['x-bacon-calabresa', 'X-Bacon Calabresa', 28, 'Pão, maionese, alface, tomate, hambúrguer, bacon, calabresa, presunto e mussarela.'],
  ['x-bacon-salsicha', 'X-Bacon c/ Salsicha', 26, 'Pão, maionese, alface, tomate, bacon, salsicha, hambúrguer, presunto e mussarela.'],
  ['x-calabresa', 'X-Calabresa', 24, 'Pão, maionese, alface, tomate, hambúrguer, calabresa, presunto e mussarela.'],
  ['x-calabresa-especial', 'X-Calabresa Especial', 26, 'Pão, maionese, alface, tomate, hambúrguer, calabresa, ovo, presunto e mussarela.'],
  ['x-calabresa-acebolado', 'X-Calabresa Acebolado', 26, 'Pão, maionese, alface, tomate, calabresa, presunto, mussarela e cebola.'],
];
function incluirLanches(menu) {
  if (!menu || !Array.isArray(menu.categorias) || !Array.isArray(menu.produtos)) throw new Error('Cardápio inválido para incluir lanches');
  const existentes = new Set(menu.produtos.map(p => p.id));
  return {
    ...menu,
    categorias: menu.categorias.some(c => c.id === 'mac') ? menu.categorias : [...menu.categorias, { id: 'mac', nome: 'Mac de 10', cozinha: true }],
    produtos: [...menu.produtos, ...itens.filter(([id]) => !existentes.has(id)).map(([id, nome, preco, descricao]) => ({id, nome, preco, descricao, categoria: 'mac', grupos: []}))],
  };
}
module.exports = { incluirLanches };
