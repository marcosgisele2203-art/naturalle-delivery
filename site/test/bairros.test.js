const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const Bairros = require('../public/shared/bairros.js');

test('taxa por bairro: regra compartilhada entre site, equipe e Manu', () => {
  const loja = { taxa_entrega: 6, bairros: Bairros.validar([{ nome: 'Centro', taxa: '5' }, { nome: '  São  José ', taxa: '8,50' }, { nome: 'centro', taxa: 1 }, { nome: '', taxa: 3 }, { nome: 'Outro bairro', taxa: 0 }]) };
  assert.deepEqual(loja.bairros, [{ nome: 'Centro', taxa: 5 }, { nome: 'São José', taxa: 8.5 }], 'arruma nomes, tira repetidos, vazios e o "Outro bairro"');
  assert.equal(Bairros.taxa(loja, 'entrega', 'Centro'), 5);
  assert.equal(Bairros.taxa(loja, 'entrega', 'sao jose'), 8.5, 'sem acento e minúsculo também acha');
  assert.equal(Bairros.taxa(loja, 'entrega', 'Outro bairro'), 6, 'outro bairro usa a taxa padrão');
  assert.equal(Bairros.taxa(loja, 'entrega', ''), 6);
  assert.equal(Bairros.taxa(loja, 'retirada', 'Centro'), 0);
  assert.equal(Bairros.taxa({ taxa_entrega: 7 }, 'entrega', 'Centro'), 7, 'sem bairros cadastrados: taxa única, como antes');
  assert.equal(Bairros.noEndereco(loja, 'Rua A, 10', 'São José'), 'Rua A, 10 — São José');
  assert.equal(Bairros.noEndereco(loja, 'Rua A, 10, Sao Jose', 'São José'), 'Rua A, 10, Sao Jose', 'não repete o bairro');
  assert.equal(Bairros.noEndereco(loja, 'Rua A, 10', 'Outro bairro'), 'Rua A, 10');
  assert.throws(() => Bairros.validar([{ nome: 'Longe', taxa: -2 }]));
  assert.throws(() => Bairros.validar([{ nome: 'Longe', taxa: 'abc' }]));
});

// Sobe o servidor de verdade contra um banco DESCARTÁVEL: DATABASE_URL=postgres://.../banco_de_teste npm test
test('taxa por bairro no site e no pedido da equipe (servidor)', { skip: !process.env.DATABASE_URL && 'Defina DATABASE_URL de um banco de teste para rodar.' }, async (t) => {
  const porta = 3700 + Math.floor(Math.random() * 300), U = 'http://127.0.0.1:' + porta;
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env: { ...process.env, PORT: String(porta), MP_ACCESS_TOKEN: '', N8N_URL: '' }, stdio: 'ignore' });
  t.after(() => srv.kill());
  for (let i = 0; i < 60; i++) { try { if ((await fetch(U + '/saude')).ok) break; } catch {} await new Promise((r) => setTimeout(r, 250)); }
  const H = { 'Content-Type': 'application/json' };
  const ADMIN = { nome: 'Admin de teste', login: 'admin-teste', senha: 'senha-de-teste-1' };
  let r = await fetch(U + '/api/equipe/primeiro-admin', { method: 'POST', headers: H, body: JSON.stringify(ADMIN) });
  if (r.status === 403) r = await fetch(U + '/api/equipe/entrar', { method: 'POST', headers: H, body: JSON.stringify(ADMIN) });
  if (!r.ok) { t.skip('Banco de teste já tem outros usuários; use um banco vazio.'); return; }
  H.Cookie = r.headers.get('set-cookie').split(';')[0];
  const put = (loja) => fetch(U + '/api/admin/loja', { method: 'PUT', headers: H, body: JSON.stringify({ loja }) });
  assert.equal((await put({ bairros: [{ nome: 'Longe', taxa: -1 }] })).status, 400, 'taxa negativa é recusada');
  assert.equal((await put({ aberta: true, horario_automatico: false, delivery: true, taxa_entrega: 6, bairros: [{ nome: 'Centro', taxa: 5 }, { nome: 'Vila Nova', taxa: 9 }] })).status, 200);
  const pub = await (await fetch(U + '/api/publico/cardapio')).json();
  assert.deepEqual(pub.loja.bairros, [{ nome: 'Centro', taxa: 5 }, { nome: 'Vila Nova', taxa: 9 }], 'o cardápio mostra os bairros');
  const prod = pub.cardapio.produtos.find((p) => p.disponivel !== false && !(p.dias || []).length && !(p.grupos || []).some((g) => g.obrigatorio));
  const site = (extra) => fetch(U + '/api/publico/pedido', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '10.0.0.' + Math.floor(Math.random() * 250) },
    body: JSON.stringify({ tipo: 'entrega', cliente: { nome: 'Ana', telefone: '67999998888' }, endereco: 'Rua A, 10', pagamento: 'dinheiro', itens: [{ produto: prod.id, qtd: 1 }], ...extra }) });
  r = await site({});
  assert.equal(r.status, 400, 'com bairros cadastrados, o site pede o bairro');
  const pedidoDe = async (res) => { assert.equal(res.status, 200); const d = await res.json(); return (await (await fetch(U + '/api/equipe/pedidos', { headers: H })).json()).pedidos.find((p) => p.id === d.pedido_id); };
  let p = await pedidoDe(await site({ bairro: 'vila nova', taxa_entrega: 0 }));
  assert.equal(Number(p.taxa_entrega), 9, 'taxa do bairro, ignorando a que veio do navegador');
  assert.equal(p.endereco, 'Rua A, 10 — Vila Nova', 'o bairro vai junto do endereço para o entregador');
  p = await pedidoDe(await site({ bairro: 'Outro bairro' }));
  assert.equal(Number(p.taxa_entrega), 6, 'outro bairro paga a taxa padrão');
  r = await fetch(U + '/api/equipe/pedido', { method: 'POST', headers: H, body: JSON.stringify({ tipo: 'entrega', cliente_nome: 'Balcão', endereco: 'Rua B, 5', bairro: 'Centro', itens: [{ produto: prod.id, qtd: 1 }] }) });
  assert.equal(r.status, 200);
  const eq = (await r.json()).pedido;
  assert.equal(Number(eq.taxa_entrega), 5);
  assert.equal(eq.endereco, 'Rua B, 5 — Centro');
});

test('taxa por bairro: leitura do campo da Administração', () => {
  assert.deepEqual(Bairros.lerTexto('Centro = 5\n\n  Vila Nova: R$ 9,50 \nJardim 2 8\nSão José - 7\nCentro=4.5\nBela Vista – 6'), [
    { nome: 'Centro', taxa: 5 }, { nome: 'Vila Nova', taxa: 9.5 }, { nome: 'Jardim 2', taxa: 8 }, { nome: 'São José', taxa: 7 }, { nome: 'Centro', taxa: 4.5 }, { nome: 'Bela Vista', taxa: 6 }]);
  assert.throws(() => Bairros.lerTexto('Centro = -5'), /negativa/, 'sinal de menos não vira separador');
  assert.throws(() => Bairros.lerTexto('Centro: R$ -5'), /negativa/);
  assert.throws(() => Bairros.lerTexto('Centro -5'), /negativa/);
  assert.throws(() => Bairros.lerTexto('Centro'), /sem valor/);
  assert.throws(() => Bairros.lerTexto('= 5'), /Falta o nome/);
  assert.deepEqual(Bairros.lerTexto(''), []);
});
