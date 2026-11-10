const test = require('node:test');
const assert = require('node:assert/strict');
const Calc = require('../public/shared/calc.js');

const menu = {
  categorias: [{ id: 'acai', nome: 'Açaí' }, { id: 'mac', nome: 'Mac', cozinha: true }],
  produtos: [
    { id: 'acai-500', categoria: 'acai', nome: 'Açaí 500 ml', preco: 18, grupos: [{ id: 'frutas', nome: 'Frutas', tipo: 'multipla', opcoes: [{ id: 'morango', nome: 'Morango', preco: 2 }, { id: 'kiwi', nome: 'Kiwi', preco: 3, disponivel: false }] }] },
    { id: 'mac-1', categoria: 'mac', nome: 'Mac de 10', preco: 10, grupos: [] },
    { id: 'panqueca', categoria: 'mac', nome: 'Panqueca', preco: 20, dias: [3], grupos: [] },
    { id: 'suco', categoria: 'acai', nome: 'Suco', preco: 7, disponivel: false, grupos: [] },
  ],
};

test('pedir de novo: itens do último pedido voltam com o preço de hoje; o que acabou fica de fora', () => {
  const guardados = [
    { nome: 'Açaí 500 ml', qtd: 2, escolha: { produto: 'acai-500', qtd: 2, opcoes: { frutas: ['morango'] } } },
    { nome: 'Mac de 10', qtd: 1, escolha: { produto: 'mac-1', qtd: 1 } },
    { nome: 'Açaí 500 ml', qtd: 1, escolha: { produto: 'acai-500', qtd: 1, opcoes: { frutas: ['kiwi'] } } }, // kiwi acabou
    { nome: 'Panqueca', qtd: 1, escolha: { produto: 'panqueca', qtd: 1 } }, // só às quartas
    { nome: 'Suco', qtd: 1, escolha: { produto: 'suco', qtd: 1 } }, // indisponível
    { nome: 'Lanche antigo', qtd: 1, escolha: { produto: 'nao-existe-mais', qtd: 1 } },
  ];
  const r = Calc.revalidar(menu, guardados, 1); // segunda-feira
  assert.deepEqual(r.ok.map((i) => [i.produto, i.qtd, i.preco]), [['acai-500', 2, 40], ['mac-1', 1, 10]], 'preço de hoje (açaí 18 + morango 2, vezes 2)');
  assert.deepEqual(r.fora, ['Açaí 500 ml', 'Panqueca', 'Suco', 'Lanche antigo']);
  assert.equal(r.ok[0].escolha.produto, 'acai-500', 'guarda a escolha para o servidor recalcular');
  assert.equal(Calc.revalidar(menu, guardados, 3).ok.some((i) => i.produto === 'panqueca'), true, 'na quarta a panqueca volta');
  assert.deepEqual(Calc.revalidar(menu, null, 1), { ok: [], fora: [] });
  // preço mudou depois do pedido: vale o de hoje
  const caro = { ...menu, produtos: menu.produtos.map((p) => (p.id === 'mac-1' ? { ...p, preco: 12 } : p)) };
  assert.equal(Calc.revalidar(caro, guardados, 1).ok[1].preco, 12);
  // a loja apagou o grupo "Frutas" do açaí: o açaí com morango não volta como açaí puro
  const semFrutas = { ...menu, produtos: menu.produtos.map((p) => (p.id === 'acai-500' ? { ...p, grupos: [] } : p)) };
  const r2 = Calc.revalidar(semFrutas, guardados.slice(0, 2), 1);
  assert.deepEqual(r2.ok.map((i) => i.produto), ['mac-1']);
  assert.deepEqual(r2.fora, ['Açaí 500 ml'], 'item com escolha num grupo que não existe mais fica de fora');
  // escolha vazia num grupo que sumiu não atrapalha
  assert.equal(Calc.revalidar(semFrutas, [{ nome: 'Açaí', escolha: { produto: 'acai-500', qtd: 1, opcoes: { frutas: [] } } }], 1).ok.length, 1);
});
