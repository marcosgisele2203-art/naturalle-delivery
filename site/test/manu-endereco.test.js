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
  const gravados = [], conversas = new Map();
  const loja = { taxa_entrega: 6, taxa_cartao: 1, delivery: true, retirada: true, bairros: [{ nome: 'Centro', taxa: 5 }] };
  const manu = require('../lib/manu').criar({
    // guarda as conversas da Manu em memória (como a tabela manu_conversas)
    pool: { query: async (sql, p) => {
      if (/^SELECT mensagens, dados/.test(sql)) return { rows: conversas.has(p[1]) ? [conversas.get(p[1])] : [] };
      if (/^\s*INSERT INTO manu_conversas/.test(sql)) conversas.set(p[1], { mensagens: JSON.parse(p[2]), dados: JSON.parse(p[3]), atualizado_em: new Date() });
      return { rows: [] };
    } },
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

  // cliente mandou a localização pelo WhatsApp antes de pedir: vale como endereço e vai junto no pedido
  args = { itens: [{ produto: 'acai', qtd: 1 }], tipo: 'entrega', nome: 'Ana', pagamento: 'dinheiro', bairro: 'Centro' };
  await manu.responder({ canal: 'whatsapp', chave: '5567999990000-3', telefone: '5567999990000', localizacao: { lat: -20.24, lng: -56.37, precisao: 8 } });
  assert.equal(gravados.length, 2);
  assert.deepEqual(gravados[1].localizacao, { lat: -20.24, lng: -56.37, precisao: 8 });
  assert.equal(gravados[1].endereco, 'Localização enviada pelo WhatsApp (ver mapa) — Centro');
  const pergunta = recebidas.at(-2).contents.at(-1).parts.map((x) => x.text || '').join(' ');
  assert.match(pergunta, /mandou a localização/, 'a Manu fica sabendo da localização');

  // na MESMA conversa, um 2º pedido para outro endereço não leva o GPS do 1º
  args = { itens: [{ produto: 'acai', qtd: 1 }], tipo: 'entrega', nome: 'Ana', pagamento: 'dinheiro', endereco: 'Rua Nova, 99' };
  await manu.responder({ canal: 'whatsapp', chave: '5567999990000-3', telefone: '5567999990000', texto: 'agora manda outro para a Rua Nova, 99' });
  assert.equal(gravados.length, 3);
  assert.equal(gravados[2].endereco, 'Rua Nova, 99');
  assert.equal(gravados[2].localizacao, null, 'a localização antiga já foi usada no pedido anterior');
  // e sem endereço nem localização nova, não lança
  args = { ...args, endereco: '' };
  await manu.responder({ canal: 'whatsapp', chave: '5567999990000-3', telefone: '5567999990000', texto: 'mais um' });
  assert.equal(gravados.length, 3);
});
