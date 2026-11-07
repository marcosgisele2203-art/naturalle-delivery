// Inclusão inicial solicitada pela loja. Depois, o item é editado na administração.
const categoria = { id: 'refeicoes', nome: 'Refeições / Marmitex', cozinha: true };
const produto = {
  id: 'marmitex-panquecas-carne', categoria: categoria.id,
  nome: 'Marmitex de panquecas de carne',
  descricao: '3 panquecas de carne acompanhadas de arroz.',
  preco: 20, grupos: [],
};
function incluirPanquecas(menu) {
  if (!menu || !Array.isArray(menu.categorias) || !Array.isArray(menu.produtos)) throw new Error('Cardápio inválido para incluir panquecas');
  return {
    ...menu,
    categorias: menu.categorias.some(c => c.id === categoria.id) ? menu.categorias : [...menu.categorias, { ...categoria }],
    produtos: menu.produtos.some(p => p.id === produto.id) ? menu.produtos : [...menu.produtos, { ...produto, grupos: [] }],
  };
}
module.exports = { incluirPanquecas };
