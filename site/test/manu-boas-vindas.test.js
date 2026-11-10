const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

// Gemini falso: guarda o que a Manu mandou e responde só com texto
test('Manu: no começo da conversa do WhatsApp, boas-vindas e a escolha entre cardápio e pedir com ela', async (t) => {
  const recebidas = [];
  const fake = http.createServer((req, res) => {
    let corpo = ''; req.on('data', (c) => (corpo += c)); req.on('end', () => {
      recebidas.push(JSON.parse(corpo));
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: 'Oi! 😊' }] } }] }));
    });
  });
  await new Promise((ok) => fake.listen(0, '127.0.0.1', ok));
  t.after(() => fake.close());
  process.env.GEMINI_API_KEY = 'teste';
  process.env.GEMINI_BASE = 'http://127.0.0.1:' + fake.address().port;
  const conversas = new Map();
  const manu = require('../lib/manu').criar({
    pool: { query: async (sql, p) => {
      if (/^SELECT mensagens, dados/.test(sql)) return { rows: conversas.has(p[1]) ? [conversas.get(p[1])] : [] };
      if (/^\s*INSERT INTO manu_conversas/.test(sql)) conversas.set(p[1], { mensagens: JSON.parse(p[2]), dados: JSON.parse(p[3]), atualizado_em: new Date() });
      return { rows: [] };
    } },
    lerConfig: async (k) => (k === 'cardapio' ? { categorias: [], produtos: [] } : k === 'loja' ? {} : []),
    diaDaSemana: () => 1, estadoLoja: () => ({ aberta: true, texto: '' }),
    clienteDoTelefone: async () => null, texto: (v, n) => String(v ?? '').trim().slice(0, n),
  });
  const ultimaPergunta = () => recebidas.at(-1).contents.at(-1).parts.map((p) => p.text || '').join('\n');
  const URL = 'https://pedidos.exemplo.com.br';

  await manu.responder({ canal: 'whatsapp', chave: '5567999990000', telefone: '5567999990000', texto: 'oi', urlSite: URL });
  let p = ultimaPergunta();
  assert.match(p, /boas-vindas bem alegre, educada e simpática/);
  assert.match(p, /dois ou três emojis/);
  assert.match(p, /prefere ver o cardápio ou fazer o pedido aqui mesmo com você/);
  assert.ok(p.includes(URL), 'manda o link do cardápio');

  // segunda mensagem da mesma conversa: não repete as boas-vindas
  await manu.responder({ canal: 'whatsapp', chave: '5567999990000', telefone: '5567999990000', texto: 'quero pedir com você', urlSite: URL });
  assert.doesNotMatch(ultimaPergunta(), /boas-vindas/);

  // chat dentro do cardápio do site: o cliente já está no cardápio, então não pergunta
  await manu.responder({ canal: 'site', chave: 'sessao-de-teste-123456', texto: 'oi' });
  assert.doesNotMatch(ultimaPergunta(), /boas-vindas/);

  // a regra de emojis libera a mensagem de boas-vindas
  assert.match(JSON.stringify(recebidas[0]), /só a mensagem de boas-vindas pode ter até três/);
});
