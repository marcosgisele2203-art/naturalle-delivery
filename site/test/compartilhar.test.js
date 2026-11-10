const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const PUB = path.join(__dirname, '..', 'public');

// largura x altura de PNG e JPEG, sem biblioteca
function tamanho(arquivo) {
  const d = fs.readFileSync(arquivo);
  if (d.toString('ascii', 1, 4) === 'PNG') return [d.readUInt32BE(16), d.readUInt32BE(20)];
  for (let i = 2; i < d.length;) { const m = d[i + 1], len = d.readUInt16BE(i + 2); if (m >= 0xc0 && m <= 0xc3) return [d.readUInt16BE(i + 7), d.readUInt16BE(i + 5)]; i += 2 + len; }
  return null;
}

test('app instalável: manifestos válidos e ícones no tamanho certo', () => {
  for (const [arq, inicio] of [['manifest.webmanifest', '/'], ['equipe/manifest.webmanifest', '/equipe/']]) {
    const m = JSON.parse(fs.readFileSync(path.join(PUB, arq), 'utf8'));
    assert.equal(m.start_url, inicio);
    assert.equal(m.display, 'standalone');
    assert(m.name && m.short_name && m.short_name.length <= 16, arq + ': nome curto até 16 letras');
    for (const ic of m.icons) {
      const [w, h] = tamanho(path.join(PUB, ic.src));
      assert.equal(`${w}x${h}`, ic.sizes, ic.src);
    }
    assert(m.icons.some((i) => i.sizes === '512x512') && m.icons.some((i) => i.sizes === '192x192'));
  }
  assert.deepEqual(tamanho(path.join(PUB, 'img/compartilhar.jpg')), [1200, 630], 'foto do link no tamanho que o WhatsApp usa');
  assert(fs.statSync(path.join(PUB, 'img/compartilhar.jpg')).size < 300 * 1024, 'foto do link leve (o WhatsApp ignora imagens grandes)');
  assert.deepEqual(tamanho(path.join(PUB, 'img/icone-apple.png')), [180, 180]);
});

// Sobe o servidor de verdade contra um banco DESCARTÁVEL: DATABASE_URL=postgres://.../banco_de_teste npm test
test('link do cardápio no WhatsApp: título, frase e foto com endereço completo', { skip: !process.env.DATABASE_URL && 'Defina DATABASE_URL de um banco de teste para rodar.' }, async (t) => {
  const porta = 4000 + Math.floor(Math.random() * 300), U = 'http://127.0.0.1:' + porta;
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env: { ...process.env, PORT: String(porta), MP_ACCESS_TOKEN: '', N8N_URL: '' }, stdio: 'ignore' });
  t.after(() => srv.kill());
  for (let i = 0; i < 60; i++) { try { if ((await fetch(U + '/saude')).ok) break; } catch {} await new Promise((r) => setTimeout(r, 250)); }
  const proxy = { 'X-Forwarded-Proto': 'https', 'X-Forwarded-Host': 'pedidos.exemplo.com.br' };
  const meta = (html, prop) => (new RegExp(`<meta (?:property|name)="${prop}" content="([^"]*)"`).exec(html) || [])[1];
  for (const caminho of ['/', '/m/qualquer-mesa', '/index.html']) {
    const r = await fetch(U + caminho, { headers: proxy });
    assert.equal(r.status, 200, caminho);
    const html = await r.text();
    assert(!html.includes('{{'), caminho + ': nada sem preencher');
    assert.equal(meta(html, 'og:image'), 'https://pedidos.exemplo.com.br/img/compartilhar.jpg', caminho);
    assert.equal(meta(html, 'og:url'), 'https://pedidos.exemplo.com.br/');
    assert.match(meta(html, 'og:title'), /Naturalle Mania/);
    assert.match(html, /<link rel="manifest" href="\/manifest\.webmanifest">/);
  }
  // nome e frase vêm da loja e são protegidos contra HTML
  const { pool, salvarConfig, lerConfig } = require('../lib/db');
  const antes = await lerConfig('loja');
  t.after(async () => { await salvarConfig('loja', antes); await pool.end(); });
  await salvarConfig('loja', { ...antes, nome: 'Loja "Teste" <b>', frase: 'O melhor & mais gostoso', url_publica: 'https://cardapio.exemplo.com' });
  const html = await (await fetch(U + '/', { headers: proxy })).text();
  assert.equal(meta(html, 'og:site_name'), 'Loja &quot;Teste&quot; &lt;b&gt;');
  assert.match(meta(html, 'og:description'), /^O melhor &amp; mais gostoso /);
  assert.equal(meta(html, 'og:image'), 'https://cardapio.exemplo.com/img/compartilhar.jpg', 'usa o endereço público cadastrado');
  const man = await fetch(U + '/manifest.webmanifest');
  assert.match(man.headers.get('content-type'), /application\/manifest\+json/);
  assert.equal((await fetch(U + '/img/compartilhar.jpg')).headers.get('content-type'), 'image/jpeg');
});
