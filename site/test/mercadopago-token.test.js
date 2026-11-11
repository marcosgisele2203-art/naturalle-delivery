// O token colado no Easypanel às vezes vem com espaço ou quebra de linha no fim.
// Sem limpar, o cabeçalho Authorization fica inválido e todo Pix falha.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');

test('token do Mercado Pago com espaço ou quebra de linha no fim ainda funciona', async (t) => {
  let recebido = null;
  const srv = http.createServer((req, res) => {
    recebido = req.headers.authorization;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ id: 'ORD1', status: 'action_required', transactions: { payments: [{}] } }));
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  t.after(() => srv.close());

  process.env.MP_ACCESS_TOKEN = '  APP_USR-teste-123 \n';
  process.env.MP_BASE = 'http://127.0.0.1:' + srv.address().port;
  const arquivo = path.join(__dirname, '..', 'lib', 'mercadopago.js');
  delete require.cache[arquivo];
  const MP = require(arquivo);

  assert.ok(MP.configurado());
  await MP.cancelar('ORD1');
  assert.equal(recebido, 'Bearer APP_USR-teste-123');
});

test('token só com espaços conta como não configurado', () => {
  process.env.MP_ACCESS_TOKEN = '   \n';
  const arquivo = path.join(__dirname, '..', 'lib', 'mercadopago.js');
  delete require.cache[arquivo];
  assert.equal(require(arquivo).configurado(), false);
});
