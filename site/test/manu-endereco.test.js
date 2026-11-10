const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

// Gemini falso: na 1ª chamada pede para lançar o pedido; na 2ª devolve o texto final
test('Manu não lança entrega só com o bairro, sem rua e número', async (t) => {
  const recebidas = [];
  let args = { itens: [{ produto: 'acai', qtd: 1 }], tipo: 'entrega', nome: 'Ana', pagamento: 'dinheiro', bairro: 'Centro' };
  const fake = http.createServer((req, res) => {
    let corpo = ''; req.on('data', (c) => (corpo += c)); req.on('end', () => {
      const d = JSON.parse(corpo); recebidas.push(d);
      const ultima = d.contents.at(-1).parts[0];
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ candidates: [{ content: { role: 'model', parts: ultima.functionResponse ? [{ text: 'ok' }] : [{ functionCall: { name: 'fazer_pedido', args } }] } }] }));
    });
  });
  await new Promise((ok) => fake.listen(0, '127.0.0.1', ok));
  t.after(() => fake.close());
  process.env.GEMINI_API_KEY = 'teste';
  process.env.GEMINI_BASE = 'http://127.0.0.1:' + fake.address().port;
  const Calc = require('../public/shared/calc.js');
  class Erro extends Error { constructor(st, m) { super(m); this.status = st; } }
  const gravados = [];
  const loja = { taxa_entrega: 6, taxa_cartao: 1, delivery: true, retirada: true, bairros: [{ nome: 'Centro', taxa: 5 }] };
  const manu = require('../lib/manu').criar({
    pool: { query: async () => ({ rows: [] }) },
    lerConfig: async (k) => (k === 'loja' ? loja : k === 'cardapio' ? { categorias: [], produtos: [] } : []),
    Calc, diaDaSemana: () => 1, estadoLoja: () => ({ aberta: true, texto: '' }),
    calcularItens: async () => [{ produto: 'acai', nome: 'Açaí', qtd: 1, preco: 10, preco_unit: 10 }],
    gravarPedido: async (d) => { gravados.push(d); return { id: 1, codigo: 'x', total: 15, pagamento: d.pagamento }; },
    lerPagamento: (b) => ({ pagamento: b.pagamento, troco_para: null }),
    telefoneBR: (v) => String(v || '').replace(/\D/g, ''), notificar: () => {}, Erro, texto: (v, n) => String(v ?? '').trim().slice(0, n),
  });
  const conversa = (n) => manu.responder({ canal: 'whatsapp', chave: '5567999990000-' + n, telefone: '5567999990000', texto: 'manda' });

  await conversa(1);
  const resposta = recebidas[1].contents.at(-1).parts[0].functionResponse.response;
  assert.match(resposta.erro || '', /Falta o endereço/, 'a Manu recebe o erro e pede a rua');
  assert.equal(gravados.length, 0, 'nada foi gravado');

  args = { ...args, endereco: 'Rua A, 10' };
  await conversa(2);
  assert.equal(gravados.length, 1);
  assert.equal(gravados[0].endereco, 'Rua A, 10 — Centro');
  assert.equal(gravados[0].taxa_entrega, 5);
});
