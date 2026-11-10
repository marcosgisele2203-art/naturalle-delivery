const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');

// Sobe o servidor de verdade contra um banco DESCARTÁVEL: DATABASE_URL=postgres://.../banco_de_teste npm test
test('mesa (QR) não recebe pedido com a loja fechada', { skip: !process.env.DATABASE_URL && 'Defina DATABASE_URL de um banco de teste para rodar.' }, async (t) => {
  const porta = 3100 + Math.floor(Math.random() * 800), U = 'http://127.0.0.1:' + porta;
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env: { ...process.env, PORT: String(porta), MP_ACCESS_TOKEN: '', N8N_URL: '' }, stdio: 'ignore' });
  t.after(() => srv.kill());
  for (let i = 0; i < 60; i++) { try { if ((await fetch(U + '/saude')).ok) break; } catch {} await new Promise((r) => setTimeout(r, 250)); }
  const H = { 'Content-Type': 'application/json' };
  const api = async (metodo, url, corpo) => { const r = await fetch(U + url, { method: metodo, headers: H, body: corpo ? JSON.stringify(corpo) : undefined }); return { status: r.status, d: await r.json(), r }; };
  let r = await api('POST', '/api/equipe/primeiro-admin', { nome: 'Admin', login: 'admin' + Date.now(), senha: 'senha-de-teste-1' });
  if (r.status === 403) { t.skip('Banco de teste já tem usuários; use um banco vazio.'); return; }
  H.Cookie = r.r.headers.get('set-cookie').split(';')[0];
  await api('POST', '/api/admin/mesas', { nome: 'Mesa Teste' });
  const mesa = (await api('GET', '/api/admin/tudo')).d.mesas.find((m) => m.nome === 'Mesa Teste');
  const menu = (await api('GET', '/api/equipe/cardapio')).d.cardapio;
  const prod = menu.produtos.find((p) => p.disponivel !== false && !(p.dias || []).length && !(p.grupos || []).some((g) => g.obrigatorio));
  const pedido = () => fetch(U + '/api/publico/mesa/' + mesa.token + '/pedido', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nome: 'Ana', itens: [{ produto: prod.id, qtd: 1 }] }) });

  assert.equal((await api('PUT', '/api/admin/loja', { loja: { aberta: false, horario_automatico: false } })).status, 200);
  r = await pedido();
  assert.equal(r.status, 403, 'loja fechada: mesa não pede');
  assert.match((await r.json()).erro, /fechados agora/);

  assert.equal((await api('PUT', '/api/admin/loja', { loja: { aberta: true, horario_automatico: false } })).status, 200);
  assert.equal((await pedido()).status, 200, 'loja aberta: mesa pede normalmente');
});
