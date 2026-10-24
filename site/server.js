// Naturalle Mania · servidor do app de pedidos e do painel.
// Sem framework: serve os arquivos de public/ e uma API pequena.
//
// Variáveis de ambiente:
//   PORT           porta HTTP (padrão 3000)
//   N8N_URL        base dos webhooks do n8n, ex.: https://n8n.seudominio.com/webhook
//   APP_TOKEN      mesmo valor de app_token no nó Config do fluxo 1
//   PAINEL_TOKEN   senha do painel; mesmo valor de painel_token no nó Config do fluxo 2
//   DATABASE_URL   postgres://usuario:senha@host:5432/banco (o mesmo banco do n8n)

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');
const MENU = require('./public/menu.js');

const PORT = Number(process.env.PORT) || 3000;
const N8N_URL = (process.env.N8N_URL || '').replace(/\/+$/, '');
const APP_TOKEN = process.env.APP_TOKEN || '';
const PAINEL_TOKEN = process.env.PAINEL_TOKEN || '';
const FUSO = 'America/Campo_Grande';
const PUBLIC = path.join(__dirname, 'public');

const pool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL, max: 5 }) : null;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json',
};

function diaDaSemana() {
  const nome = new Intl.DateTimeFormat('en-US', { timeZone: FUSO, weekday: 'short' }).format(new Date());
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(nome);
}

function iguais(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function lerCorpo(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > 50_000) { reject(new Error('Pedido grande demais')); req.destroy(); }
    });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch { reject(new Error('JSON inválido')); }
    });
    req.on('error', reject);
  });
}

// Limite simples por IP para não encherem o WhatsApp de pedidos falsos.
const tentativas = new Map();
function limitado(ip) {
  const agora = Date.now();
  const lista = (tentativas.get(ip) || []).filter((t) => agora - t < 10 * 60_000);
  lista.push(agora);
  tentativas.set(ip, lista);
  return lista.length > 8;
}

async function n8n(caminho, corpo) {
  if (!N8N_URL) throw new Error('N8N_URL não configurada');
  const r = await fetch(N8N_URL + caminho, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo),
  });
  const texto = await r.text();
  if (!r.ok) throw new Error('n8n respondeu ' + r.status + ': ' + texto.slice(0, 200));
  try { return JSON.parse(texto); } catch { return {}; }
}

function autorizado(req) {
  const h = req.headers.authorization || '';
  return PAINEL_TOKEN && h.startsWith('Bearer ') && iguais(h.slice(7), PAINEL_TOKEN);
}

const texto = (v, max) => String(v == null ? '' : v).trim().slice(0, max);

async function criarPedido(req, res) {
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  if (limitado(ip)) return json(res, 429, { erro: 'Muitos pedidos seguidos. Tente de novo em alguns minutos.' });

  const b = await lerCorpo(req);
  const nome = texto(b.cliente && b.cliente.nome, 80);
  const telefone = texto(b.cliente && b.cliente.telefone, 30).replace(/\D/g, '');
  const endereco = texto(b.endereco, 300);
  const pagamento = ['pix', 'cartao', 'dinheiro'].includes(b.pagamento) ? b.pagamento : null;
  if (!nome) return json(res, 400, { erro: 'Informe seu nome.' });
  if (telefone.length < 10 || telefone.length > 13) return json(res, 400, { erro: 'Informe um WhatsApp válido com DDD.' });
  if (!endereco) return json(res, 400, { erro: 'Informe o endereço de entrega.' });
  if (!pagamento) return json(res, 400, { erro: 'Escolha a forma de pagamento.' });
  if (!Array.isArray(b.itens) || !b.itens.length) return json(res, 400, { erro: 'Seu carrinho está vazio.' });
  if (b.itens.length > 30) return json(res, 400, { erro: 'Itens demais em um pedido.' });

  const dia = diaDaSemana();
  let itens;
  try {
    itens = b.itens.map((i) => MENU.calcular(i, dia));
  } catch (e) {
    return json(res, 400, { erro: e.message });
  }
  const total = itens.reduce((s, i) => s + i.preco, 0);
  let troco = null;
  if (pagamento === 'dinheiro' && b.troco_para) {
    troco = Number(String(b.troco_para).replace(',', '.'));
    if (!(troco > total)) troco = null;
  }

  const r = await n8n('/pedido', {
    token: APP_TOKEN,
    cliente: { nome, telefone },
    endereco,
    observacoes: texto(b.observacoes, 300),
    pagamento,
    troco_para: troco,
    itens,
  });
  json(res, 200, { ok: true, pedido_id: r.pedido_id, total });
}

async function listarPedidos(req, res) {
  if (!pool) return json(res, 500, { erro: 'DATABASE_URL não configurada' });
  const { rows } = await pool.query(
    `SELECT id, criado_em, cliente_nome, cliente_telefone, endereco, observacoes, itens, total,
            pagamento, troco_para, pix_status, status
       FROM pedidos
      WHERE status IN ('novo', 'preparo', 'saiu') OR criado_em > now() - interval '18 hours'
      ORDER BY criado_em ASC
      LIMIT 300`);
  json(res, 200, { pedidos: rows });
}

async function mudarStatus(req, res) {
  const b = await lerCorpo(req);
  const id = parseInt(b.pedido_id, 10);
  if (!id || !['preparo', 'saiu', 'entregue', 'cancelado'].includes(b.status)) return json(res, 400, { erro: 'Dados inválidos' });
  await n8n('/status', { token: PAINEL_TOKEN, pedido_id: id, status: b.status });
  json(res, 200, { ok: true });
}

async function confirmarPix(req, res) {
  if (!pool) return json(res, 500, { erro: 'DATABASE_URL não configurada' });
  const b = await lerCorpo(req);
  const id = parseInt(b.pedido_id, 10);
  if (!id) return json(res, 400, { erro: 'Dados inválidos' });
  await pool.query(`UPDATE pedidos SET pix_status = 'confirmado', atualizado_em = now() WHERE id = $1 AND pagamento = 'pix'`, [id]);
  json(res, 200, { ok: true });
}

function servirArquivo(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/painel') { res.writeHead(301, { Location: '/painel/' }); return res.end(); }
  if (rel.endsWith('/')) rel += 'index.html';
  const arquivo = path.normalize(path.join(PUBLIC, rel));
  if (!arquivo.startsWith(PUBLIC + path.sep)) { res.writeHead(403); return res.end(); }
  fs.stat(arquivo, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Não encontrado'); }
    const ext = path.extname(arquivo).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.jpg' || ext === '.png' || ext === '.webp' ? 'public, max-age=86400' : 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    });
    fs.createReadStream(arquivo).pipe(res);
  });
}

const rotas = {
  'POST /api/pedido': { fn: criarPedido },
  'GET /api/pedidos': { fn: listarPedidos, painel: true },
  'POST /api/status': { fn: mudarStatus, painel: true },
  'POST /api/pix': { fn: confirmarPix, painel: true },
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/saude') return json(res, 200, { ok: true });
  const rota = rotas[req.method + ' ' + url.pathname];
  if (!rota) {
    if (url.pathname.startsWith('/api/')) return json(res, 404, { erro: 'Rota não encontrada' });
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
    return servirArquivo(req, res, url);
  }
  if (rota.painel && !autorizado(req)) return json(res, 401, { erro: 'Senha do painel incorreta' });
  try {
    await rota.fn(req, res);
  } catch (e) {
    console.error(new Date().toISOString(), req.method, url.pathname, e.message);
    if (!res.headersSent) json(res, 502, { erro: 'Não foi possível concluir agora. Tente de novo ou chame no WhatsApp.' });
  }
});

server.listen(PORT, () => console.log('Naturalle Mania no ar na porta ' + PORT));
