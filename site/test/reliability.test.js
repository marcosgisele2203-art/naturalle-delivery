const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizarTelefone } = require('../lib/telefone');
const { requisicaoPedido } = require('../lib/requisicao-pedido');

test('telefone mantém país e DDD e reconhece o DDD 55 sem código do país', () => {
  assert.equal(normalizarTelefone('(55) 99999-1234'), '5555999991234');
  assert.equal(normalizarTelefone('+55 55 99999-1234'), '5555999991234');
  assert.notEqual(normalizarTelefone('(67) 99999-1234'), normalizarTelefone('(11) 99999-1234'));
});
test('nono dígito móvel do WhatsApp é normalizado sem alterar telefones fixos', () => {
  assert.equal(normalizarTelefone('556799991234'), normalizarTelefone('5567999991234'));
  assert.equal(normalizarTelefone('(67) 3333-4444'), '556733334444');
  assert.equal(normalizarTelefone('99991234'), '');
  assert.equal(normalizarTelefone('inválido'), '');
});
test('reenvio tem a mesma identidade apesar da ordem dos campos JSON', () => {
  const idempotencia = 'test-request-123456';
  const a = requisicaoPedido({ idempotencia, itens: [{ produto: 'x', qtd: 2 }], pagamento: 'pix' }, 'site');
  const b = requisicaoPedido({ pagamento: 'pix', itens: [{ qtd: 2, produto: 'x' }], idempotencia }, 'site');
  assert.deepEqual(a, b);
  assert.notEqual(a.hash, requisicaoPedido({ idempotencia, itens: [{ produto: 'x', qtd: 3 }], pagamento: 'pix' }, 'site').hash);
  assert.notEqual(a.chave, requisicaoPedido({ idempotencia }, 'mesa-1').chave);
});
test('identificadores inválidos são rejeitados e clientes antigos continuam compatíveis', () => {
  assert.throws(() => requisicaoPedido({ idempotencia: 'curto' }, 'site'));
  assert.equal(requisicaoPedido({}, 'site'), null);
});
