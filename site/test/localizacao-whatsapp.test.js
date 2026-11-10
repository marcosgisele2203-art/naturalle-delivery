const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');
const Entrega = require('../lib/entrega-whatsapp');

// roda o código do nó "Preparar mensagem" do n8n com uma mensagem da Evolution
async function prepararN8n(data) {
  const fluxo = require('../../n8n/naturalle-completo.json');
  const codigo = fluxo.nodes.find((n) => n.name === 'Preparar mensagem').parameters.jsCode;
  const Async = Object.getPrototypeOf(async function () {}).constructor;
  const ctx = { helpers: { httpRequest: async () => ({}) } };
  const $input = { first: () => ({ json: { rota: 'evolution', body: { event: 'messages.upsert', data } } }) };
  const $ = () => ({ first: () => ({ json: { token: 'tok', evolution_url: 'x', evolution_instance: 'y', evolution_apikey: 'z' } }) });
  return new Async('$input', '$', codigo).call(ctx, $input, $);
}

test('n8n: localização do WhatsApp segue para o app; texto continua igual', async () => {
  const key = { remoteJid: '556799998888@s.whatsapp.net', fromMe: false, id: 'A1' };
  let r = await prepararN8n({ key, pushName: 'Ana', messageType: 'locationMessage', message: { locationMessage: { degreesLatitude: -20.2401, degreesLongitude: -56.3789, accuracyInMeters: 12 } } });
  assert.deepEqual(r[0].json.localizacao, { lat: -20.2401, lng: -56.3789, precisao: 12 });
  assert.equal(r[0].json.telefone, '556799998888');
  r = await prepararN8n({ key, messageType: 'liveLocationMessage', message: { liveLocationMessage: { degreesLatitude: -20.1, degreesLongitude: -56.2 } } });
  assert.equal(r[0].json.localizacao.lat, -20.1, 'localização em tempo real também');
  r = await prepararN8n({ key, message: { conversation: 'oi' } });
  assert.equal(r[0].json.texto, 'oi');
  assert.equal(r[0].json.localizacao, undefined);
  assert.deepEqual(await prepararN8n({ key: { ...key, fromMe: true }, messageType: 'locationMessage', message: { locationMessage: { degreesLatitude: 1, degreesLongitude: 1 } } }), [], 'mensagem da própria loja é ignorada');
});

test('mensagem do entregador: mapa, itens e quanto cobrar', () => {
  const base = { id: 7, cliente_nome: 'Ana', cliente_telefone: '5567999998888', endereco: 'Rua A, 10 — Centro', itens: [{ qtd: 2, nome: 'Mac de 10', detalhe: 'Cheddar' }], total: 32 };
  let m = Entrega.mensagemEntregador({ ...base, localizacao: { lat: -20.24, lng: -56.37 }, pagamento: 'dinheiro', troco_para: 50 });
  assert.match(m, /Entrega #7/);
  assert.match(m, /\(67\) 99999-8888/);
  assert.match(m, /maps\/search\/\?api=1&query=-20\.24,-56\.37/, 'usa o ponto do GPS');
  assert.match(m, /2x Mac de 10 \(Cheddar\)/);
  assert.match(m, /Receber \*R\$ 32,00\* em dinheiro · paga com R\$ 50,00, levar \*R\$ 18,00\* de troco/);
  m = Entrega.mensagemEntregador({ ...base, pagamento: 'pix', pix_status: 'confirmado' }, { cidade: 'Miranda', uf: 'MS' });
  assert.match(m, /query=Rua%20A%2C%2010%20%E2%80%94%20Centro%2C%20Miranda%20-%20MS/, 'sem GPS: busca pelo endereço e a cidade');
  assert.match(m, /Já está pago\. Não cobrar/);
  assert.match(Entrega.mensagemEntregador({ ...base, pagamento: 'pix', pix_status: 'aguardando' }), /ainda não confirmado/);
  assert.match(Entrega.mensagemEntregador({ ...base, pagamento: 'cartao' }), /no cartão \(levar a maquininha\)/);
});

// Sobe o servidor de verdade contra um banco DESCARTÁVEL: DATABASE_URL=postgres://.../banco_de_teste npm test
test('localização pelo WhatsApp vai para o pedido e o entregador recebe tudo no WhatsApp', { skip: !process.env.DATABASE_URL && 'Defina DATABASE_URL de um banco de teste para rodar.' }, async (t) => {
  const enviadas = [];
  const evo = http.createServer((req, res) => { let c = ''; req.on('data', (x) => (c += x)); req.on('end', () => { enviadas.push({ url: req.url, apikey: req.headers.apikey, ...JSON.parse(c || '{}') }); res.end('{}'); }); });
  await new Promise((ok) => evo.listen(0, '127.0.0.1', ok));
  const porta = 4300 + Math.floor(Math.random() * 300), U = 'http://127.0.0.1:' + porta;
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env: { ...process.env, PORT: String(porta), MP_ACCESS_TOKEN: '', N8N_URL: '', GEMINI_API_KEY: '',
    N8N_TOKEN: 'token-teste', EVOLUTION_URL: 'http://127.0.0.1:' + evo.address().port, EVOLUTION_INSTANCE: 'loja', EVOLUTION_APIKEY: 'chave' }, stdio: 'ignore' });
  const aoFim = [];
  t.after(async () => { for (const f of aoFim) await f().catch(() => {}); srv.kill(); evo.close(); });
  for (let i = 0; i < 60; i++) { try { if ((await fetch(U + '/saude')).ok) break; } catch {} await new Promise((r) => setTimeout(r, 250)); }
  const H = { 'Content-Type': 'application/json' };
  const ADMIN = { nome: 'Admin de teste', login: 'admin-teste', senha: 'senha-de-teste-1' };
  let r = await fetch(U + '/api/equipe/primeiro-admin', { method: 'POST', headers: H, body: JSON.stringify(ADMIN) });
  if (r.status === 403) r = await fetch(U + '/api/equipe/entrar', { method: 'POST', headers: H, body: JSON.stringify(ADMIN) });
  if (!r.ok) { t.skip('Banco de teste já tem outros usuários; use um banco vazio.'); return; }
  H.Cookie = r.headers.get('set-cookie').split(';')[0];
  const api = async (m, url, corpo) => { const x = await fetch(U + url, { method: m, headers: H, body: corpo ? JSON.stringify(corpo) : undefined }); return { status: x.status, d: await x.json() }; };
  const lojaAntes = (await api('GET', '/api/admin/tudo')).d.loja;
  aoFim.push(() => api('PUT', '/api/admin/loja', { loja: { ...lojaAntes, bairros: lojaAntes.bairros || [] } }));
  await api('PUT', '/api/admin/loja', { loja: { aberta: true, horario_automatico: false, delivery: true, bairros: [] } });
  const login = 'entregador-' + Date.now();
  await api('POST', '/api/admin/usuarios', { nome: 'Zé Entregas', login, senha: 'senha-de-teste-1', permissoes: ['entregador'], telefone: '67988887777' });
  const ze = (await api('GET', '/api/admin/tudo')).d.usuarios.find((u) => u.login === login);
  const menu = (await api('GET', '/api/equipe/cardapio')).d.cardapio;
  const prod = menu.produtos.find((p) => p.disponivel !== false && !(p.dias || []).length && !(p.grupos || []).some((g) => g.obrigatorio));
  const fone = '6799' + String(Date.now()).slice(-7);
  r = await fetch(U + '/api/publico/pedido', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '10.1.2.' + Math.floor(Math.random() * 250) },
    body: JSON.stringify({ tipo: 'entrega', cliente: { nome: 'Ana', telefone: fone }, endereco: 'Rua A, 10', pagamento: 'dinheiro', troco_para: 100, itens: [{ produto: prod.id, qtd: 1 }] }) });
  assert.equal(r.status, 200);
  const id = (await r.json()).pedido_id;
  const zap = (corpo) => fetch(U + '/api/manu/whatsapp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: 'token-teste', ...corpo }) }).then((x) => x.json());

  // o WhatsApp manda o número sem o 9: mesmo assim acha o pedido
  const semNove = '55' + fone.slice(0, 2) + fone.slice(3);
  let resp = await zap({ telefone: semNove, nome: 'Ana', localizacao: { lat: -20.2401, lng: -56.3789, precisao: 10 } });
  assert.match(resp.mensagens[0].texto, new RegExp(`Localização recebida! Já está no pedido \\*#${id}\\*`));
  let ped = (await api('GET', '/api/equipe/pedidos')).d.pedidos.find((p) => p.id === id);
  assert.deepEqual(ped.localizacao, { lat: -20.2401, lng: -56.3789, precisao: 10 });

  // saiu para entrega com o Zé: ele recebe o WhatsApp com o mapa e o troco
  for (const st of ['preparo', 'pronto']) assert.equal((await api('POST', `/api/equipe/pedido/${id}/status`, { status: st })).status, 200);
  assert.equal((await api('POST', `/api/equipe/pedido/${id}/status`, { status: 'saiu', entregador_id: ze.id })).status, 200);
  let msg;
  for (let i = 0; i < 40 && !msg; i++) { msg = enviadas.find((e) => e.number === '5567988887777' && /Entrega #/.test(e.text)); if (!msg) await new Promise((ok) => setTimeout(ok, 50)); }
  assert(msg, 'entregador recebeu o WhatsApp');
  assert.equal(msg.url, '/message/sendText/loja');
  assert.equal(msg.apikey, 'chave');
  assert.match(msg.text, /query=-20\.2401,-56\.3789/);
  assert.match(msg.text, /levar \*R\$ [\d,]+\* de troco/);

  // nova localização com o pedido na rua: o entregador recebe a atualização
  resp = await zap({ telefone: semNove, localizacao: { lat: -20.25, lng: -56.38 } });
  assert.match(resp.mensagens[0].texto, /Localização recebida/);
  let nova;
  for (let i = 0; i < 40 && !nova; i++) { nova = enviadas.find((e) => e.number === '5567988887777' && /mandou a localização/.test(e.text)); if (!nova) await new Promise((ok) => setTimeout(ok, 50)); }
  assert(nova && /query=-20\.25,-56\.38/.test(nova.text), 'entregador recebeu a localização nova');

  // pedido do site só com o ponto do mapa: o texto "Local marcado no mapa" não vira endereço do cliente
  const fone2 = '6798' + String(Date.now()).slice(-7);
  r = await fetch(U + '/api/publico/pedido', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '10.1.3.' + Math.floor(Math.random() * 250) },
    body: JSON.stringify({ tipo: 'entrega', cliente: { nome: 'Bia', telefone: fone2 }, endereco: '', localizacao: { lat: -20.3, lng: -56.4 }, pagamento: 'cartao', itens: [{ produto: prod.id, qtd: 1 }] }) });
  assert.equal(r.status, 200);
  const cli = (await api('GET', '/api/admin/clientes?busca=' + fone2)).d.clientes[0];
  assert.equal(cli.nome, 'Bia');
  assert.equal(cli.endereco, '', 'cadastro do cliente sem o texto do mapa');

  // localização sem pedido em andamento e sem a Manu IA: manda o link do cardápio
  resp = await zap({ telefone: '5567977776666', localizacao: { lat: -20.2, lng: -56.3 } });
  assert.match(resp.mensagens[0].texto, /Recebi sua localização! Para pedir, use o nosso cardápio/);
  assert.equal((await zap({ token: 'errado', telefone: semNove, localizacao: { lat: 1, lng: 1 } })).erro, 'Token inválido');
});
