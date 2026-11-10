const test = require('node:test');
const assert = require('node:assert/strict');
const { taxaEntrega } = require('../lib/pedidos-equipe');

test('pedido da equipe usa a taxa de entrega da loja, nunca negativa', () => {
  assert.equal(taxaEntrega('entrega', { taxa_entrega: 6 }), 6);
  assert.equal(taxaEntrega('retirada', { taxa_entrega: 6 }), 0);
  assert.equal(taxaEntrega('mesa', { taxa_entrega: 6 }), 0);
  assert.equal(taxaEntrega('entrega', { taxa_entrega: -20 }), 0);
  assert.equal(taxaEntrega('entrega', {}), 0);
});

// Precisa de um banco DESCARTÁVEL: DATABASE_URL=postgres://.../banco_de_teste npm test
test('painel: pendências antigas acumuladas não escondem os pedidos de hoje', { skip: !process.env.DATABASE_URL && 'Defina DATABASE_URL de um banco de teste para rodar.' }, async () => {
  const { pool, migrar } = require('../lib/db');
  const { pedidosDoPainel } = require('../lib/pedidos-equipe');
  try {
    await migrar();
    const marca = 'teste-painel-' + Date.now();
    // 420 entregas antigas entregues e ainda sem receber (ficam no painel como pendência)
    await pool.query(`INSERT INTO pedidos (codigo, origem, tipo, status, cliente_nome, itens, subtotal, total, pagamento, criado_em)
      SELECT $1 || '-' || g, 'balcao', 'entrega', 'entregue', 'Antigo', '[]', 10, 10, 'dinheiro', now() - interval '30 days' + g * interval '1 minute'
        FROM generate_series(1, 420) g`, [marca]);
    const { rows } = await pool.query(`INSERT INTO pedidos (codigo, origem, tipo, status, cliente_nome, itens, subtotal, total, pagamento)
      VALUES ($1, 'site', 'entrega', 'novo', 'Cliente de hoje', '[]', 20, 20, 'pix') RETURNING id`, [marca + '-hoje']);
    const lista = await pedidosDoPainel(pool);
    assert(lista.length <= 400);
    assert(lista.some((p) => p.id === rows[0].id), 'o pedido novo de hoje aparece no painel');
    assert.equal(lista.at(-1).id, rows[0].id, 'a lista continua do mais antigo para o mais novo');
    await pool.query(`DELETE FROM pedidos WHERE codigo LIKE $1 || '%'`, [marca]);
  } finally {
    await pool.end();
  }
});
