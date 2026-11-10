const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const http = require('node:http');

// pedido HTTP "cru" (o fetch do Node descompacta sozinho e esconde o tamanho real)
const cru = (url, headers = {}) => new Promise((ok, falha) => http.get(url, { headers }, (r) => {
  const partes = []; r.on('data', (c) => partes.push(c)); r.on('end', () => ok({ status: r.statusCode, headers: r.headers, corpo: Buffer.concat(partes) }));
}).on('error', falha));

// Sobe o servidor de verdade contra um banco DESCARTÁVEL: DATABASE_URL=postgres://.../banco_de_teste npm test
test('app leve: respostas comprimidas e "nada mudou" (304) no painel e nos arquivos', { skip: !process.env.DATABASE_URL && 'Defina DATABASE_URL de um banco de teste para rodar.' }, async (t) => {
  const porta = 3100 + Math.floor(Math.random() * 800), U = 'http://127.0.0.1:' + porta;
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env: { ...process.env, PORT: String(porta), MP_ACCESS_TOKEN: '', N8N_URL: '' }, stdio: 'ignore' });
  t.after(() => srv.kill());
  for (let i = 0; i < 60; i++) { try { if ((await fetch(U + '/saude')).ok) break; } catch {} await new Promise((r) => setTimeout(r, 250)); }
  const H = { 'Content-Type': 'application/json' };
  const ADMIN = { nome: 'Admin de teste', login: 'admin-teste', senha: 'senha-de-teste-1' };
  let r = await fetch(U + '/api/equipe/primeiro-admin', { method: 'POST', headers: H, body: JSON.stringify(ADMIN) });
  if (r.status === 403) r = await fetch(U + '/api/equipe/entrar', { method: 'POST', headers: H, body: JSON.stringify(ADMIN) });
  if (!r.ok) { t.skip('Banco de teste já tem outros usuários; use um banco vazio.'); return; }
  H.Cookie = r.headers.get('set-cookie').split(';')[0];
  const menu = (await (await fetch(U + '/api/equipe/cardapio', { headers: H })).json()).cardapio;
  const prod = menu.produtos.find((p) => p.disponivel !== false && !(p.dias || []).length && !(p.grupos || []).some((g) => g.obrigatorio));
  const novo = (n) => fetch(U + '/api/equipe/pedido', { method: 'POST', headers: H, body: JSON.stringify({ tipo: 'retirada', cliente_nome: 'Cliente ' + n, observacoes: 'sem cebola, por favor', itens: [{ produto: prod.id, qtd: 1 }] }) });
  for (let i = 0; i < 20; i++) await novo(i);

  // lista de pedidos: comprimida e com carimbo
  const a = await cru(U + '/api/equipe/pedidos', { Cookie: H.Cookie, 'Accept-Encoding': 'gzip' });
  assert.equal(a.status, 200);
  assert.equal(a.headers['content-encoding'], 'gzip');
  assert(a.headers.etag, 'tem carimbo');
  const inteiro = require('node:zlib').gunzipSync(a.corpo);
  assert(a.corpo.length * 3 < inteiro.length, `comprimido ${a.corpo.length} B de ${inteiro.length} B`);
  // nada mudou: 304 sem corpo
  const b = await cru(U + '/api/equipe/pedidos', { Cookie: H.Cookie, 'Accept-Encoding': 'gzip', 'If-None-Match': a.headers.etag });
  assert.equal(b.status, 304);
  assert.equal(b.corpo.length, 0);
  // entrou pedido novo: carimbo muda e a lista vem inteira
  await novo('novo');
  const c = await cru(U + '/api/equipe/pedidos', { Cookie: H.Cookie, 'If-None-Match': a.headers.etag });
  assert.equal(c.status, 200);
  assert.notEqual(c.headers.etag, a.headers.etag);
  assert(JSON.parse(c.corpo).pedidos.some((p) => p.cliente_nome === 'Cliente novo'));
  // sem login continua 401 (o carimbo não pula a permissão)
  assert.equal((await cru(U + '/api/equipe/pedidos', { 'If-None-Match': a.headers.etag })).status, 401);

  // arquivos do site: comprimidos e 304 quando o navegador já tem
  const js = await cru(U + '/app.js', { 'Accept-Encoding': 'gzip' });
  assert.equal(js.status, 200);
  assert.equal(js.headers['content-encoding'], 'gzip');
  assert.equal((await cru(U + '/app.js', { 'If-None-Match': js.headers.etag })).status, 304);
  // quem recusa gzip (q=0) recebe sem compressão; "*" e q>0 aceitam
  const enc = async (ae) => (await cru(U + '/app.js', { 'Accept-Encoding': ae })).headers['content-encoding'] || 'nenhuma';
  assert.equal(await enc('identity, gzip;q=0'), 'nenhuma');
  assert.equal(await enc('gzip; q=0.0'), 'nenhuma');
  assert.equal(await enc('*;q=0'), 'nenhuma');
  assert.equal(await enc('identity'), 'nenhuma');
  assert.equal(await enc('gzip;q=0.5'), 'gzip');
  assert.equal(await enc('*'), 'gzip');
  assert.equal(await enc('br, gzip, deflate'), 'gzip');
  const recusa = await cru(U + '/api/equipe/pedidos', { Cookie: H.Cookie, 'Accept-Encoding': 'identity, gzip;q=0' });
  assert.equal(recusa.headers['content-encoding'], undefined, 'a API também respeita a recusa');
  assert(JSON.parse(recusa.corpo).pedidos.length > 0);
});
