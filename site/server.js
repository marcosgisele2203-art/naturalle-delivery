// Naturalle Mania · servidor do app de pedidos, da área da equipe e da API.
//
// Variáveis de ambiente:
//   PORT            porta HTTP (padrão 3000)
//   DATABASE_URL    postgres://usuario:senha@host:5432/banco
//   N8N_URL         base dos webhooks do n8n, ex.: https://n8n.seudominio.com/webhook (opcional)
//   N8N_TOKEN       mesmo valor de "token" no nó Config dos fluxos 1 e 2
//   SESSION_SECRET  opcional; se faltar, um segredo é gerado e guardado no banco

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const QRCode = require('qrcode');
const Calc = require('./public/shared/calc.js');
const Relatorio = require('./public/shared/relatorio.js');
const { pool, migrar, lerConfig, salvarConfig } = require('./lib/db');
const auth = require('./lib/auth');
const { slug } = require('./lib/cardapio-inicial');

const PORT = Number(process.env.PORT) || 3000;
const N8N_URL = (process.env.N8N_URL || '').replace(/\/+$/, '');
const N8N_TOKEN = process.env.N8N_TOKEN || process.env.APP_TOKEN || '';
const FUSO = 'America/Campo_Grande';
const PUBLIC = path.join(__dirname, 'public');

// ---------------------------------------------------------------- utilidades

class Erro extends Error { constructor(status, msg) { super(msg); this.status = status; } }

function diaDaSemana() {
  const nome = new Intl.DateTimeFormat('en-US', { timeZone: FUSO, weekday: 'short' }).format(new Date());
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(nome);
}

function json(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(body));
}

function lerCorpo(req, limite = 200_000) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > limite) { reject(new Erro(413, 'Dados grandes demais')); req.destroy(); }
    });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch { reject(new Erro(400, 'JSON inválido')); } });
    req.on('error', reject);
  });
}

const texto = (v, max) => String(v == null ? '' : v).trim().slice(0, max);
const soDigitos = (v) => String(v || '').replace(/\D/g, '');
const codigoAleatorio = (n = 9) => crypto.randomBytes(n).toString('base64url');

function telefoneBR(v) {
  let t = soDigitos(v);
  if (!t) return '';
  if (t.length < 10 || t.length > 13) throw new Erro(400, 'WhatsApp inválido. Use DDD + número.');
  if (!t.startsWith('55')) t = '55' + t;
  return t;
}

const ipDe = (req) => (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();

// Limite simples por IP para pedidos públicos e tentativas de login.
const tentativas = new Map();
function limitar(chave, max, janelaMs) {
  const agora = Date.now();
  const lista = (tentativas.get(chave) || []).filter((t) => agora - t < janelaMs);
  lista.push(agora);
  tentativas.set(chave, lista);
  if (lista.length > max) throw new Erro(429, 'Muitas tentativas seguidas. Espere alguns minutos.');
}
setInterval(() => { const agora = Date.now(); for (const [k, l] of tentativas) if (!l.some((t) => agora - t < 3600_000)) tentativas.delete(k); }, 600_000).unref();

// ---------------------------------------------------------------- n8n (WhatsApp)

function notificar(caminho, pedido) {
  if (!N8N_URL || !pedido.cliente_telefone || pedido.tipo === 'mesa') return;
  fetch(N8N_URL + caminho, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: N8N_TOKEN, pedido }),
    signal: AbortSignal.timeout(15000),
  }).then((r) => { if (!r.ok) console.error('n8n', caminho, 'respondeu', r.status); })
    .catch((e) => console.error('n8n', caminho, e.message));
}

// ---------------------------------------------------------------- pedidos

const CAMPOS_PEDIDO = `p.id, p.codigo, p.criado_em, p.confirmado_em, p.pronto_em, p.origem, p.tipo, p.status,
  p.cliente_nome, p.cliente_telefone, p.endereco, p.observacoes, p.itens, p.subtotal, p.taxa_entrega, p.acrescimo_cartao, p.total,
  p.pagamento, p.troco_para, p.pix_status, p.mesa_id, p.conta_id, m.nome AS mesa_nome, u.nome AS criado_por_nome,
  p.entregador_id, e.nome AS entregador_nome, p.saiu_em, p.pago_em`;
const FROM_PEDIDO = `FROM pedidos p LEFT JOIN mesas m ON m.id = p.mesa_id LEFT JOIN usuarios u ON u.id = p.criado_por
  LEFT JOIN usuarios e ON e.id = p.entregador_id`;

async function calcularItens(escolhas) {
  if (!Array.isArray(escolhas) || !escolhas.length) throw new Erro(400, 'O pedido está vazio.');
  if (escolhas.length > 40) throw new Erro(400, 'Itens demais em um pedido.');
  const menu = await lerConfig('cardapio');
  const dia = diaDaSemana();
  try {
    return escolhas.map((e) => Calc.calcular(menu, e, dia));
  } catch (e) {
    throw new Erro(400, e.message);
  }
}

async function gravarPedido(d) {
  const cli = await pool.connect();
  try {
    await cli.query('BEGIN');
    let contaId = null;
    if (d.mesa_id) {
      await cli.query(
        `INSERT INTO contas (mesa_id) VALUES ($1) ON CONFLICT (mesa_id) WHERE fechada_em IS NULL DO NOTHING`, [d.mesa_id]);
      const { rows } = await cli.query('SELECT id FROM contas WHERE mesa_id = $1 AND fechada_em IS NULL', [d.mesa_id]);
      contaId = rows[0].id;
    }
    const subtotal = Calc.somar(d.itens);
    const acrescimo = d.pagamento === 'cartao' ? Number(d.taxa_cartao) || 0 : 0;
    const total = Math.round((subtotal + (d.taxa_entrega || 0) + acrescimo) * 100) / 100;
    const { rows } = await cli.query(
      `INSERT INTO pedidos (codigo, origem, tipo, status, mesa_id, conta_id, criado_por, cliente_nome, cliente_telefone,
         endereco, observacoes, itens, subtotal, taxa_entrega, total, pagamento, troco_para, pix_status, confirmado_em, acrescimo_cartao)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18, CASE WHEN $4 = 'preparo' THEN now() END, $19)
       RETURNING id`,
      [codigoAleatorio(), d.origem, d.tipo, d.status, d.mesa_id || null, contaId, d.criado_por || null,
        d.cliente_nome || '', d.cliente_telefone || '', d.endereco || '', d.observacoes || '', JSON.stringify(d.itens),
        subtotal, d.taxa_entrega || 0, total, d.pagamento || null, d.troco_para || null,
        d.pagamento === 'pix' ? 'aguardando' : null, acrescimo]);
    await cli.query('COMMIT');
    return buscarPedido(rows[0].id);
  } catch (e) {
    await cli.query('ROLLBACK');
    throw e;
  } finally {
    cli.release();
  }
}

async function buscarPedido(id) {
  const { rows } = await pool.query(`SELECT ${CAMPOS_PEDIDO} ${FROM_PEDIDO} WHERE p.id = $1`, [id]);
  return rows[0];
}

function lerPagamento(b, total, obrigatorio) {
  const pagamento = ['pix', 'cartao', 'dinheiro'].includes(b.pagamento) ? b.pagamento : null;
  if (obrigatorio && !pagamento) throw new Erro(400, 'Escolha a forma de pagamento.');
  let troco = null;
  if (pagamento === 'dinheiro' && b.troco_para) {
    troco = Number(String(b.troco_para).replace(',', '.'));
    if (!(troco > total)) troco = null;
  }
  return { pagamento, troco_para: troco };
}

// quem pode mover um pedido de um status para outro
const TRANSICOES = {
  'novo>preparo': ['pedidos', 'garcom', 'caixa'],
  'novo>cancelado': ['pedidos', 'garcom', 'caixa'],
  'preparo>pronto': ['cozinha'],
  'pronto>preparo': ['cozinha'],
  'preparo>cancelado': ['pedidos', 'caixa'],
  'pronto>saiu': ['pedidos', 'caixa'],
  'pronto>entregue': ['pedidos', 'caixa', 'garcom'],
  'saiu>entregue': ['pedidos', 'caixa'],
  'pronto>cancelado': ['pedidos', 'caixa'],
  'saiu>cancelado': ['pedidos', 'caixa'],
};

// ---------------------------------------------------------------- cardápio (validação do admin)

function validarCardapio(m) {
  if (!m || !Array.isArray(m.categorias) || !Array.isArray(m.produtos)) throw new Erro(400, 'Cardápio inválido');
  const num = (v, campo) => {
    const n = Math.round(Number(String(v ?? 0).replace(',', '.')) * 100) / 100;
    if (!Number.isFinite(n) || n < 0 || n > 100000) throw new Erro(400, 'Preço inválido em ' + campo);
    return n;
  };
  const nomeOk = (v, campo) => { const t = texto(v, 120); if (!t) throw new Erro(400, 'Falta o nome em ' + campo); return t; };
  const idUnico = (usados, base) => { let id = slug(base) || 'item'; let n = 2; const b = id; while (usados.has(id)) id = b + '-' + n++; usados.add(id); return id; };

  const catIds = new Set();
  const categorias = m.categorias.slice(0, 50).map((c) => {
    const nome = nomeOk(c.nome, 'categoria');
    const id = c.id && !catIds.has(c.id) && /^[a-z0-9-]{1,60}$/.test(c.id) ? (catIds.add(c.id), c.id) : idUnico(catIds, nome);
    return { id, nome };
  });
  const prodIds = new Set();
  const produtos = m.produtos.slice(0, 500).map((p) => {
    const nome = nomeOk(p.nome, 'produto');
    const id = p.id && !prodIds.has(p.id) && /^[a-z0-9-]{1,80}$/.test(p.id) ? (prodIds.add(p.id), p.id) : idUnico(prodIds, nome);
    if (!catIds.has(p.categoria)) throw new Erro(400, nome + ': escolha uma categoria');
    const grupoIds = new Set();
    const grupos = (Array.isArray(p.grupos) ? p.grupos : []).slice(0, 20).map((g) => {
      const gnome = nomeOk(g.nome, 'grupo de ' + nome);
      const gid = g.id && !grupoIds.has(g.id) && /^[a-z0-9-]{1,60}$/.test(g.id) ? (grupoIds.add(g.id), g.id) : idUnico(grupoIds, gnome);
      const opIds = new Set();
      const opcoes = (Array.isArray(g.opcoes) ? g.opcoes : []).slice(0, 100).map((o) => {
        const onome = nomeOk(o.nome, gnome);
        const oid = o.id && !opIds.has(o.id) && /^[a-z0-9-]{1,60}$/.test(o.id) ? (opIds.add(o.id), o.id) : idUnico(opIds, onome);
        const op = { id: oid, nome: onome, preco: num(o.preco, onome) };
        if (o.preco_de) op.preco_de = num(o.preco_de, onome);
        if (o.disponivel === false) op.disponivel = false;
        return op;
      });
      if (!opcoes.length) throw new Erro(400, `${nome} › ${gnome}: adicione pelo menos uma opção`);
      const max = Math.trunc(Number(g.max) || 0);
      return { id: gid, nome: gnome, tipo: g.tipo === 'unica' ? 'unica' : 'multipla', obrigatorio: !!g.obrigatorio, ...(max > 0 && g.tipo !== 'unica' ? { max } : {}), opcoes };
    });
    const dias = Array.isArray(p.dias) ? [...new Set(p.dias.map(Number).filter((d) => d >= 0 && d <= 6))].sort() : [];
    const foto = /^\/(fotos|img)\/[\w./-]+$/.test(p.foto || '') && !String(p.foto).includes('..') ? p.foto : '';
    return {
      id, categoria: p.categoria, nome, descricao: texto(p.descricao, 300), preco: num(p.preco, nome), ...(foto ? { foto } : {}),
      ...(p.disponivel === false ? { disponivel: false } : {}), ...(dias.length ? { dias } : {}), grupos,
    };
  });
  return { categorias, produtos };
}

function validarLoja(b, atual) {
  const bool = (v, padrao) => (typeof v === 'boolean' ? v : padrao);
  const taxa = Math.round(Number(String(b.taxa_entrega ?? atual.taxa_entrega).replace(',', '.')) * 100) / 100;
  if (!Number.isFinite(taxa) || taxa < 0 || taxa > 1000) throw new Erro(400, 'Taxa de entrega inválida');
  const cartao = Math.round(Number(String(b.taxa_cartao ?? atual.taxa_cartao).replace(',', '.')) * 100) / 100;
  if (!Number.isFinite(cartao) || cartao < 0 || cartao > 100) throw new Erro(400, 'Acréscimo do cartão inválido');
  return {
    nome: texto(b.nome, 80) || atual.nome,
    frase: texto(b.frase, 160),
    horario: texto(b.horario, 80),
    whatsapp: soDigitos(b.whatsapp).slice(0, 13),
    aberta: bool(b.aberta, atual.aberta),
    delivery: bool(b.delivery, atual.delivery),
    retirada: bool(b.retirada, atual.retirada),
    taxa_entrega: taxa,
    taxa_cartao: cartao,
    mesa_auto_confirmar: bool(b.mesa_auto_confirmar, atual.mesa_auto_confirmar),
    url_publica: texto(b.url_publica, 200).replace(/\/+$/, ''),
    recado: texto(b.recado, 140),
  };
}

// quadro da Manu: promoções e novidades que o admin coloca, com foto opcional
function validarQuadro(lista) {
  if (!Array.isArray(lista)) throw new Erro(400, 'Quadro inválido');
  if (lista.length > 15) throw new Erro(400, 'No máximo 15 avisos no quadro.');
  return lista.map((a, i) => {
    const titulo = texto(a.titulo, 50);
    if (!titulo) throw new Erro(400, `Aviso ${i + 1}: escreva o título.`);
    const foto = /^\/(fotos|img)\/[\w./-]+$/.test(a.foto || '') && !String(a.foto).includes('..') ? a.foto : '';
    const dias = Array.isArray(a.dias) ? [...new Set(a.dias.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort() : [];
    return {
      id: texto(a.id, 40) || 'q' + Date.now().toString(36) + i, tipo: a.tipo === 'novidade' ? 'novidade' : 'promocao',
      titulo, texto: texto(a.texto, 140), preco: texto(a.preco, 30), foto, produto: texto(a.produto, 60), dias, ativo: a.ativo !== false,
    };
  });
}
const quadroDeHoje = (lista, dia) => (lista || []).filter((a) => a.ativo && (!a.dias.length || a.dias.includes(dia)))
  .map(({ id, tipo, titulo, texto: t, preco, foto, produto }) => ({ id, tipo, titulo, texto: t, preco, foto, produto }));

const lojaPublica = (l) => ({ nome: l.nome, frase: l.frase, horario: l.horario, whatsapp: l.whatsapp, aberta: l.aberta,
  delivery: l.delivery, retirada: l.retirada, taxa_entrega: l.taxa_entrega, taxa_cartao: Number(l.taxa_cartao) || 0, recado: l.recado || '' });

function urlBase(req, loja) {
  if (loja.url_publica) return loja.url_publica;
  const proto = (req.headers['x-forwarded-proto'] || 'http').split(',')[0];
  return proto + '://' + (req.headers['x-forwarded-host'] || req.headers.host);
}

// ---------------------------------------------------------------- rotas

const rotas = [];
const rota = (metodo, padrao, perms, fn) => rotas.push({ metodo, re: new RegExp('^' + padrao.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'), perms, fn });

// --- público

rota('GET', '/api/publico/cardapio', null, async () => {
  const [menu, loja, quadro] = await Promise.all([lerConfig('cardapio'), lerConfig('loja'), lerConfig('quadro')]);
  const dia = diaDaSemana();
  return { loja: lojaPublica(loja), cardapio: menu, dia, quadro: quadroDeHoje(quadro, dia) };
});

rota('GET', '/api/publico/mesa/:token', null, async ({ p }) => {
  const { rows } = await pool.query('SELECT id, nome FROM mesas WHERE token = $1 AND ativa', [p.token]);
  if (!rows[0]) throw new Erro(404, 'Mesa não encontrada. Peça ajuda ao garçom.');
  return { mesa: rows[0] };
});

rota('POST', '/api/publico/pedido', null, async ({ req, b }) => {
  limitar('pedido:' + ipDe(req), 8, 10 * 60_000);
  const loja = await lerConfig('loja');
  if (!loja.aberta) throw new Erro(403, 'A loja não está recebendo pedidos pelo site agora.');
  const tipo = b.tipo === 'retirada' ? 'retirada' : 'entrega';
  if (tipo === 'entrega' && !loja.delivery) throw new Erro(403, 'Hoje não estamos fazendo entregas. Escolha retirar no balcão.');
  if (tipo === 'retirada' && !loja.retirada) throw new Erro(403, 'Retirada no balcão indisponível agora.');
  const nome = texto(b.cliente && b.cliente.nome, 80);
  if (!nome) throw new Erro(400, 'Informe seu nome.');
  const tel = telefoneBR(b.cliente && b.cliente.telefone);
  if (!tel) throw new Erro(400, 'Informe seu WhatsApp com DDD.');
  const endereco = texto(b.endereco, 300);
  if (tipo === 'entrega' && !endereco) throw new Erro(400, 'Informe o endereço de entrega.');
  const itens = await calcularItens(b.itens);
  const taxa = tipo === 'entrega' ? Number(loja.taxa_entrega) || 0 : 0;
  const pag = lerPagamento(b, Calc.somar(itens) + taxa, true);
  const pedido = await gravarPedido({ origem: 'site', tipo, status: 'novo', cliente_nome: nome, cliente_telefone: tel,
    endereco: tipo === 'entrega' ? endereco : '', observacoes: texto(b.observacoes, 300), itens, taxa_entrega: taxa, taxa_cartao: loja.taxa_cartao, ...pag });
  notificar('/pedido', pedido);
  return { ok: true, pedido_id: pedido.id, codigo: pedido.codigo, total: Number(pedido.total) };
});

rota('POST', '/api/publico/mesa/:token/pedido', null, async ({ req, p, b }) => {
  limitar('mesa:' + ipDe(req), 10, 10 * 60_000);
  const { rows } = await pool.query('SELECT id, nome FROM mesas WHERE token = $1 AND ativa', [p.token]);
  if (!rows[0]) throw new Erro(404, 'Mesa não encontrada. Peça ajuda ao garçom.');
  const loja = await lerConfig('loja');
  const itens = await calcularItens(b.itens);
  const pedido = await gravarPedido({ origem: 'mesa', tipo: 'mesa', mesa_id: rows[0].id,
    status: loja.mesa_auto_confirmar ? 'preparo' : 'novo', cliente_nome: texto(b.nome, 60),
    observacoes: texto(b.observacoes, 300), itens });
  return { ok: true, pedido_id: pedido.id, codigo: pedido.codigo, status: pedido.status };
});

rota('GET', '/api/publico/acompanhar/:codigo', null, async ({ p }) => {
  const { rows } = await pool.query(
    `SELECT p.id, p.status, p.tipo, p.itens, p.total, p.criado_em, m.nome AS mesa_nome
       FROM pedidos p LEFT JOIN mesas m ON m.id = p.mesa_id WHERE p.codigo = $1`, [p.codigo]);
  if (!rows[0]) throw new Erro(404, 'Pedido não encontrado');
  return { pedido: rows[0] };
});

// --- login da equipe

rota('GET', '/api/equipe/eu', null, async ({ req }) => {
  const u = await auth.usuarioDaRequisicao(req);
  if (u) return { usuario: u, permissoes: auth.PERMISSOES };
  const { rows } = await pool.query('SELECT count(*)::int AS n FROM usuarios');
  return { usuario: null, primeiro_acesso: rows[0].n === 0 };
});

rota('POST', '/api/equipe/primeiro-admin', null, async ({ req, b, res }) => {
  const nome = texto(b.nome, 80), login = texto(b.login, 40).toLowerCase();
  if (!nome || !/^[a-z0-9._-]{3,40}$/.test(login)) throw new Erro(400, 'Informe nome e um login (letras, números, ponto).');
  if (String(b.senha || '').length < 8) throw new Erro(400, 'A senha precisa ter pelo menos 8 caracteres.');
  // só funciona enquanto não existe nenhum usuário
  const { rows } = await pool.query(
    `INSERT INTO usuarios (nome, login, senha_hash, permissoes)
     SELECT $1, $2, $3, '{admin}' WHERE NOT EXISTS (SELECT 1 FROM usuarios) RETURNING id, versao`,
    [nome, login, auth.hashSenha(b.senha)]);
  if (!rows[0]) throw new Erro(403, 'O administrador já foi criado. Faça login.');
  res.setHeader('Set-Cookie', auth.criarCookie(rows[0], req));
  return { ok: true };
});

rota('POST', '/api/equipe/entrar', null, async ({ req, b, res }) => {
  const login = texto(b.login, 40).toLowerCase();
  limitar('login:' + ipDe(req), 10, 15 * 60_000);
  const { rows } = await pool.query('SELECT id, senha_hash, ativo, versao FROM usuarios WHERE login = $1', [login]);
  const u = rows[0];
  if (!u || !u.ativo || !auth.confereSenha(b.senha || '', u.senha_hash)) throw new Erro(401, 'Login ou senha incorretos.');
  res.setHeader('Set-Cookie', auth.criarCookie(u, req));
  return { ok: true };
});

rota('POST', '/api/equipe/sair', null, async ({ res }) => { res.setHeader('Set-Cookie', auth.cookieSair); return { ok: true }; });

rota('POST', '/api/equipe/minha-senha', [], async ({ u, b }) => {
  const { rows } = await pool.query('SELECT senha_hash FROM usuarios WHERE id = $1', [u.id]);
  if (!auth.confereSenha(b.atual || '', rows[0].senha_hash)) throw new Erro(400, 'A senha atual está errada.');
  if (String(b.nova || '').length < 8) throw new Erro(400, 'A nova senha precisa ter pelo menos 8 caracteres.');
  await pool.query('UPDATE usuarios SET senha_hash = $1, versao = versao + 1 WHERE id = $2', [auth.hashSenha(b.nova), u.id]);
  return { ok: true, sair: true };
});

// --- operação

rota('GET', '/api/equipe/cardapio', ['pedidos', 'garcom', 'caixa', 'cozinha', 'entregador'], async () => {
  const [menu, loja] = await Promise.all([lerConfig('cardapio'), lerConfig('loja')]);
  return { cardapio: menu, loja: lojaPublica(loja), dia: diaDaSemana() };
});

rota('GET', '/api/equipe/pedidos', ['pedidos', 'garcom', 'caixa', 'cozinha', 'entregador'], async () => {
  const { rows } = await pool.query(
    `SELECT ${CAMPOS_PEDIDO} ${FROM_PEDIDO}
      WHERE p.status IN ('novo', 'preparo', 'pronto', 'saiu') OR p.atualizado_em > now() - interval '14 hours'
      ORDER BY p.criado_em ASC LIMIT 400`);
  return { pedidos: rows, agora: new Date().toISOString() };
});

rota('POST', '/api/equipe/pedido', ['garcom', 'caixa', 'pedidos'], async ({ u, b }) => {
  const tipo = ['entrega', 'retirada', 'mesa'].includes(b.tipo) ? b.tipo : null;
  if (!tipo) throw new Erro(400, 'Escolha mesa, retirada ou entrega.');
  if (tipo !== 'mesa' && !auth.pode(u, 'caixa', 'pedidos')) throw new Erro(403, 'Seu usuário só lança pedidos de mesa.');
  let mesaId = null;
  if (tipo === 'mesa') {
    const { rows } = await pool.query('SELECT id FROM mesas WHERE id = $1 AND ativa', [Number(b.mesa_id)]);
    if (!rows[0]) throw new Erro(400, 'Escolha a mesa.');
    mesaId = rows[0].id;
  }
  const nome = texto(b.cliente_nome, 80);
  if (tipo !== 'mesa' && !nome) throw new Erro(400, 'Informe o nome do cliente.');
  const endereco = texto(b.endereco, 300);
  if (tipo === 'entrega' && !endereco) throw new Erro(400, 'Informe o endereço de entrega.');
  const itens = await calcularItens(b.itens);
  const loja = await lerConfig('loja');
  const taxa = tipo === 'entrega' ? Number(b.taxa_entrega ?? loja.taxa_entrega) || 0 : 0;
  const pag = tipo === 'mesa' ? {} : lerPagamento(b, Calc.somar(itens) + taxa, tipo === 'entrega');
  const pedido = await gravarPedido({ origem: tipo === 'mesa' ? 'garcom' : 'balcao', tipo, status: 'preparo', mesa_id: mesaId,
    criado_por: u.id, cliente_nome: nome, cliente_telefone: telefoneBR(b.cliente_telefone), endereco: tipo === 'entrega' ? endereco : '',
    observacoes: texto(b.observacoes, 300), itens, taxa_entrega: taxa, taxa_cartao: loja.taxa_cartao, ...pag });
  notificar('/pedido', pedido);
  return { ok: true, pedido };
});

rota('POST', '/api/equipe/pedido/:id/status', ['pedidos', 'garcom', 'caixa', 'cozinha'], async ({ u, p, b }) => {
  const id = Number(p.id);
  const atual = await buscarPedido(id);
  if (!atual) throw new Erro(404, 'Pedido não encontrado');
  const chave = atual.status + '>' + b.status;
  const perms = TRANSICOES[chave];
  if (!perms) throw new Erro(409, 'O pedido já mudou de etapa. A tela foi atualizada.');
  if (!auth.pode(u, ...perms)) throw new Erro(403, 'Seu usuário não pode fazer isso.');
  if (b.status === 'saiu' && atual.tipo !== 'entrega') throw new Erro(400, 'Só pedidos de entrega saem para entrega.');
  // ao sair para entrega, o painel pode dizer qual entregador levou
  let entregador = null;
  if (b.status === 'saiu' && b.entregador_id) {
    const { rows } = await pool.query(`SELECT id FROM usuarios WHERE id = $1 AND ativo AND 'entregador' = ANY(permissoes)`, [Number(b.entregador_id)]);
    if (!rows[0]) throw new Erro(400, 'Entregador não encontrado.');
    entregador = rows[0].id;
  }
  const { rowCount } = await pool.query(
    `UPDATE pedidos SET status = $1, atualizado_em = now(),
        confirmado_em = CASE WHEN $1 = 'preparo' AND confirmado_em IS NULL THEN now() ELSE confirmado_em END,
        pronto_em = CASE WHEN $1 = 'pronto' THEN now() WHEN $1 = 'preparo' THEN NULL ELSE pronto_em END,
        saiu_em = CASE WHEN $1 = 'saiu' THEN now() ELSE saiu_em END,
        entregador_id = COALESCE($4, entregador_id)
      WHERE id = $2 AND status = $3`, [b.status, id, atual.status, entregador]);
  if (!rowCount) throw new Erro(409, 'O pedido já mudou de etapa. A tela foi atualizada.');
  const pedido = await buscarPedido(id);
  // pronto só interessa ao cliente quando ele vai buscar; na entrega ele recebe "saiu"
  const avisa = !(b.status === 'pronto' && atual.tipo === 'entrega') && !(chave === 'pronto>preparo');
  if (avisa) notificar('/status', pedido);
  return { ok: true, pedido };
});

// --- entregador

rota('GET', '/api/equipe/entregadores', ['pedidos', 'caixa'], async () => {
  const { rows } = await pool.query(`SELECT id, nome FROM usuarios WHERE ativo AND 'entregador' = ANY(permissoes) ORDER BY nome`);
  return { entregadores: rows };
});

// o entregador pega um pedido pronto: sai para entrega com ele
rota('POST', '/api/equipe/pedido/:id/pegar', ['entregador'], async ({ u, p }) => {
  const { rowCount } = await pool.query(
    `UPDATE pedidos SET status = 'saiu', entregador_id = $2, saiu_em = now(), atualizado_em = now()
      WHERE id = $1 AND tipo = 'entrega' AND status = 'pronto'`, [Number(p.id), u.id]);
  if (!rowCount) throw new Erro(409, 'Esse pedido já saiu com outro entregador ou ainda não está pronto.');
  const pedido = await buscarPedido(Number(p.id));
  notificar('/status', pedido);
  return { ok: true, pedido };
});

// entregue e pago: confirma como o cliente pagou de verdade (pode ter mudado na porta)
rota('POST', '/api/equipe/pedido/:id/entregar', ['entregador', 'pedidos', 'caixa'], async ({ u, p, b }) => {
  const id = Number(p.id);
  const atual = await buscarPedido(id);
  if (!atual || atual.status !== 'saiu') throw new Erro(409, 'Esse pedido não está em entrega.');
  if (!auth.pode(u, 'pedidos', 'caixa') && atual.entregador_id !== u.id) throw new Erro(403, 'Essa entrega está com outro entregador.');
  const pagamento = ['pix', 'cartao', 'dinheiro'].includes(b.pagamento) ? b.pagamento : null;
  if (!pagamento) throw new Erro(400, 'Diga como o cliente pagou.');
  const loja = await lerConfig('loja');
  const acrescimo = pagamento === 'cartao' ? Number(loja.taxa_cartao) || 0 : 0;
  await pool.query(
    `UPDATE pedidos SET status = 'entregue', atualizado_em = now(), pagamento = $2, acrescimo_cartao = $3,
        total = COALESCE(subtotal, total - taxa_entrega - acrescimo_cartao) + taxa_entrega + $3,
        pix_status = CASE WHEN $2 = 'pix' THEN 'confirmado' ELSE pix_status END,
        troco_para = CASE WHEN $2 = 'dinheiro' THEN troco_para END,
        pago_em = now(), pago_confirmado_por = $4, entregador_id = COALESCE(entregador_id, $5)
      WHERE id = $1 AND status = 'saiu'`, [id, pagamento, acrescimo, u.id, auth.pode(u, 'entregador') ? u.id : null]);
  const pedido = await buscarPedido(id);
  notificar('/status', pedido);
  return { ok: true, pedido };
});

// acerto do dia: quanto cada entregador recebeu
rota('GET', '/api/equipe/caixa/entregadores', ['caixa', 'pedidos'], async () => {
  const { rows } = await pool.query(
    `SELECT COALESCE(e.nome, 'Sem entregador') AS nome, count(*) FILTER (WHERE p.status = 'entregue')::int AS entregas,
            COALESCE(sum(p.total) FILTER (WHERE p.pagamento = 'dinheiro' AND p.status = 'entregue'), 0) AS dinheiro,
            COALESCE(sum(p.total) FILTER (WHERE p.pagamento = 'cartao' AND p.status = 'entregue'), 0) AS cartao,
            COALESCE(sum(p.total) FILTER (WHERE p.pagamento = 'pix' AND p.status = 'entregue'), 0) AS pix,
            count(*) FILTER (WHERE p.status = 'saiu')::int AS na_rua
       FROM pedidos p LEFT JOIN usuarios e ON e.id = p.entregador_id
      WHERE p.tipo = 'entrega' AND p.status IN ('saiu', 'entregue')
        AND (p.criado_em AT TIME ZONE '${FUSO}')::date = (now() AT TIME ZONE '${FUSO}')::date
      GROUP BY 1 ORDER BY 1`);
  return { entregadores: rows };
});

rota('POST', '/api/equipe/pedido/:id/pix', ['pedidos', 'caixa'], async ({ p }) => {
  await pool.query(`UPDATE pedidos SET pix_status = 'confirmado', atualizado_em = now() WHERE id = $1 AND pagamento = 'pix'`, [Number(p.id)]);
  return { ok: true };
});

rota('GET', '/api/equipe/mesas', ['garcom', 'caixa', 'pedidos'], async () => {
  const { rows } = await pool.query(
    `SELECT m.id, m.nome, c.id AS conta_id, c.aberta_em,
            COALESCE(sum(p.total) FILTER (WHERE p.status <> 'cancelado'), 0) AS total,
            count(p.id) FILTER (WHERE p.status = 'novo') AS aguardando,
            count(p.id) FILTER (WHERE p.status = 'preparo') AS preparando,
            count(p.id) FILTER (WHERE p.status = 'pronto') AS prontos
       FROM mesas m
       LEFT JOIN contas c ON c.mesa_id = m.id AND c.fechada_em IS NULL
       LEFT JOIN pedidos p ON p.conta_id = c.id
      WHERE m.ativa
      GROUP BY m.id, c.id
      ORDER BY m.ordem, m.id`);
  return { mesas: rows };
});

rota('GET', '/api/equipe/conta/:id', ['garcom', 'caixa', 'pedidos'], async ({ p }) => {
  const { rows: c } = await pool.query(
    `SELECT c.*, m.nome AS mesa_nome FROM contas c JOIN mesas m ON m.id = c.mesa_id WHERE c.id = $1`, [Number(p.id)]);
  if (!c[0]) throw new Erro(404, 'Conta não encontrada');
  const { rows } = await pool.query(`SELECT ${CAMPOS_PEDIDO} ${FROM_PEDIDO} WHERE p.conta_id = $1 ORDER BY p.criado_em`, [c[0].id]);
  return { conta: c[0], pedidos: rows };
});

rota('POST', '/api/equipe/conta/:id/fechar', ['caixa'], async ({ u, p, b }) => {
  const pagamento = ['pix', 'cartao', 'dinheiro'].includes(b.pagamento) ? b.pagamento : null;
  if (!pagamento) throw new Erro(400, 'Escolha a forma de pagamento.');
  const id = Number(p.id);
  const loja = await lerConfig('loja');
  const cli = await pool.connect();
  try {
    await cli.query('BEGIN');
    const { rows: aberta } = await cli.query('SELECT id FROM contas WHERE id = $1 AND fechada_em IS NULL FOR UPDATE', [id]);
    if (!aberta[0]) throw new Erro(409, 'Essa conta já foi fechada.');
    // conta paga: o que já estava pronto foi servido
    await cli.query(
      `UPDATE pedidos SET pagamento = $2, atualizado_em = now(), status = CASE WHEN status = 'pronto' THEN 'entregue' ELSE status END
        WHERE conta_id = $1 AND status <> 'cancelado'`, [id, pagamento]);
    // acréscimo da maquininha: uma vez por conta, lançado no último pedido
    const acrescimo = pagamento === 'cartao' ? Number(loja.taxa_cartao) || 0 : 0;
    if (acrescimo) {
      await cli.query(
        `UPDATE pedidos SET acrescimo_cartao = acrescimo_cartao + $2, total = total + $2
          WHERE id = (SELECT id FROM pedidos WHERE conta_id = $1 AND status <> 'cancelado' ORDER BY criado_em DESC LIMIT 1)`, [id, acrescimo]);
    }
    const { rows } = await cli.query(
      `UPDATE contas c SET fechada_em = now(), pagamento = $2, fechada_por = $3,
          total = (SELECT COALESCE(sum(total), 0) FROM pedidos WHERE conta_id = c.id AND status <> 'cancelado')
        WHERE c.id = $1 RETURNING c.total`, [id, pagamento, u.id]);
    await cli.query('COMMIT');
    return { ok: true, total: Number(rows[0].total) };
  } catch (e) {
    await cli.query('ROLLBACK');
    throw e;
  } finally {
    cli.release();
  }
});

rota('GET', '/api/equipe/caixa/resumo', ['caixa', 'pedidos'], async () => {
  const { rows } = await pool.query(
    `SELECT COALESCE(pagamento, 'em aberto') AS pagamento, count(*)::int AS pedidos, COALESCE(sum(total), 0) AS total
       FROM pedidos
      WHERE status <> 'cancelado' AND (criado_em AT TIME ZONE '${FUSO}')::date = (now() AT TIME ZONE '${FUSO}')::date
      GROUP BY 1 ORDER BY 1`);
  return { hoje: rows };
});

// relatório de vendas de um período (datas no fuso da loja)
rota('GET', '/api/equipe/relatorio', ['caixa'], async ({ q }) => {
  const de = q.get('de'), ate = q.get('ate');
  const ok = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d || '') && !Number.isNaN(Date.parse(d));
  if (!ok(de) || !ok(ate) || ate < de) throw new Erro(400, 'Escolha as datas do relatório.');
  if ((Date.parse(ate) - Date.parse(de)) / 86400000 > 400) throw new Erro(400, 'Escolha um período de até 1 ano.');
  const { rows } = await pool.query(
    `SELECT p.id, to_char(p.criado_em AT TIME ZONE '${FUSO}', 'YYYY-MM-DD') AS data, to_char(p.criado_em AT TIME ZONE '${FUSO}', 'HH24:MI') AS hora,
            p.tipo, p.origem, m.nome AS mesa_nome, p.cliente_nome, p.itens, p.pagamento, p.subtotal, p.taxa_entrega, p.acrescimo_cartao, p.total, p.status,
            e.nome AS entregador_nome
       FROM pedidos p LEFT JOIN mesas m ON m.id = p.mesa_id LEFT JOIN usuarios e ON e.id = p.entregador_id
      WHERE (p.criado_em AT TIME ZONE '${FUSO}')::date BETWEEN $1 AND $2
      ORDER BY p.criado_em`, [de, ate]);
  return Relatorio.montar(rows, de, ate);
});

// --- administrador

rota('GET', '/api/admin/tudo', ['admin'], async () => {
  const [cardapio, loja, quadro, usuarios, mesas] = await Promise.all([
    lerConfig('cardapio'), lerConfig('loja'), lerConfig('quadro'),
    pool.query('SELECT id, nome, login, telefone, permissoes, ativo, criado_em FROM usuarios ORDER BY ativo DESC, nome').then((r) => r.rows),
    pool.query('SELECT id, nome, token, ativa, ordem FROM mesas ORDER BY ativa DESC, ordem, id').then((r) => r.rows),
  ]);
  return { cardapio, loja, quadro: quadro || [], usuarios, mesas, permissoes: auth.PERMISSOES };
});

rota('PUT', '/api/admin/cardapio', ['admin'], async ({ b }) => {
  const menu = validarCardapio(b.cardapio);
  await salvarConfig('cardapio', menu);
  return { ok: true, cardapio: menu };
});

rota('PUT', '/api/admin/loja', ['admin'], async ({ b }) => {
  const loja = validarLoja(b.loja || {}, await lerConfig('loja'));
  await salvarConfig('loja', loja);
  return { ok: true, loja };
});

rota('PUT', '/api/admin/quadro', ['admin'], async ({ b }) => {
  const quadro = validarQuadro(b.quadro);
  await salvarConfig('quadro', quadro);
  return { ok: true, quadro };
});

rota('POST', '/api/admin/usuarios', ['admin'], async ({ u, b }) => {
  const nome = texto(b.nome, 80), login = texto(b.login, 40).toLowerCase();
  if (!nome) throw new Erro(400, 'Informe o nome.');
  if (!/^[a-z0-9._-]{3,40}$/.test(login)) throw new Erro(400, 'Login: de 3 a 40 letras, números, ponto, hífen.');
  const permissoes = (Array.isArray(b.permissoes) ? b.permissoes : []).filter((x) => auth.PERMISSOES[x]);
  if (!permissoes.length) throw new Erro(400, 'Marque pelo menos uma seção.');
  const ativo = b.ativo !== false;
  const telefone = String(b.telefone || '').replace(/\D/g, '').slice(0, 15);
  const senha = String(b.senha || '');
  if (senha && senha.length < 6) throw new Erro(400, 'A senha precisa ter pelo menos 6 caracteres.');
  try {
    if (b.id) {
      const id = Number(b.id);
      if (id === u.id && (!ativo || !permissoes.includes('admin'))) throw new Erro(400, 'Você não pode tirar seu próprio acesso de administrador.');
      const { rows } = await pool.query(
        `UPDATE usuarios SET nome = $2, login = $3, permissoes = $4, ativo = $5, telefone = $7,
            senha_hash = COALESCE($6, senha_hash),
            versao = versao + CASE WHEN $6 IS NOT NULL OR NOT $5 THEN 1 ELSE 0 END
          WHERE id = $1 RETURNING id`, [id, nome, login, permissoes, ativo, senha ? auth.hashSenha(senha) : null, telefone]);
      if (!rows[0]) throw new Erro(404, 'Usuário não encontrado');
    } else {
      if (!senha) throw new Erro(400, 'Defina uma senha para o novo usuário.');
      await pool.query('INSERT INTO usuarios (nome, login, senha_hash, permissoes, ativo, telefone) VALUES ($1, $2, $3, $4, $5, $6)',
        [nome, login, auth.hashSenha(senha), permissoes, ativo, telefone]);
    }
  } catch (e) {
    if (e.code === '23505') throw new Erro(400, 'Esse login já existe.');
    throw e;
  }
  const { rows } = await pool.query(`SELECT count(*)::int AS n FROM usuarios WHERE ativo AND 'admin' = ANY(permissoes)`);
  if (!rows[0].n) throw new Erro(400, 'Precisa existir pelo menos um administrador ativo.');
  return { ok: true };
});

// foto de produto: chega já reduzida pelo navegador (data URL) e fica no banco
rota('POST', '/api/admin/fotos', ['admin'], async ({ b }) => {
  const m = /^data:(image\/(?:webp|jpeg|png));base64,([A-Za-z0-9+/=]+)$/.exec(String(b.dados || ''));
  if (!m) throw new Erro(400, 'Envie uma imagem JPG, PNG ou WEBP.');
  const dados = Buffer.from(m[2], 'base64');
  if (dados.length > 1_500_000) throw new Erro(400, 'Imagem grande demais (máximo 1,5 MB).');
  const { rows } = await pool.query('INSERT INTO fotos (tipo, dados) VALUES ($1, $2) RETURNING id', [m[1], dados]);
  return { ok: true, url: '/fotos/' + rows[0].id };
});

rota('POST', '/api/admin/mesas', ['admin'], async ({ b }) => {
  const nome = texto(b.nome, 40);
  if (!nome) throw new Erro(400, 'Informe o nome da mesa.');
  if (b.id) {
    await pool.query('UPDATE mesas SET nome = $2, ativa = $3, ordem = $4 WHERE id = $1',
      [Number(b.id), nome, b.ativa !== false, Math.trunc(Number(b.ordem) || 0)]);
  } else {
    await pool.query('INSERT INTO mesas (nome, token, ordem) VALUES ($1, $2, (SELECT COALESCE(max(ordem), 0) + 1 FROM mesas))',
      [nome, codigoAleatorio(8)]);
  }
  return { ok: true };
});

rota('POST', '/api/admin/mesas/varias', ['admin'], async ({ b }) => {
  const de = Math.trunc(Number(b.de)), ate = Math.trunc(Number(b.ate));
  if (!(de >= 1 && ate >= de && ate - de < 100)) throw new Erro(400, 'Intervalo de mesas inválido (até 100 de uma vez).');
  for (let n = de; n <= ate; n++) {
    await pool.query('INSERT INTO mesas (nome, token, ordem) VALUES ($1, $2, $3)', ['Mesa ' + n, codigoAleatorio(8), n]);
  }
  return { ok: true };
});

rota('POST', '/api/admin/mesas/:id/novo-qr', ['admin'], async ({ p }) => {
  await pool.query('UPDATE mesas SET token = $2 WHERE id = $1', [Number(p.id), codigoAleatorio(8)]);
  return { ok: true };
});

rota('GET', '/api/admin/mesas/qr', ['admin'], async ({ req }) => {
  const loja = await lerConfig('loja');
  const base = urlBase(req, loja);
  const { rows } = await pool.query('SELECT id, nome, token FROM mesas WHERE ativa ORDER BY ordem, id');
  const mesas = await Promise.all(rows.map(async (m) => {
    const url = base + '/m/' + m.token;
    const svg = await QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#12301B', light: '#FFFFFF' } });
    return { id: m.id, nome: m.nome, url, svg };
  }));
  return { loja: loja.nome, mesas };
});

// ---------------------------------------------------------------- arquivos

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};

function servirArquivo(req, res, pathname) {
  let rel = pathname;
  if (rel === '/equipe') { res.writeHead(301, { Location: '/equipe/' }); return res.end(); }
  if (rel === '/painel' || rel.startsWith('/painel/')) { res.writeHead(301, { Location: '/equipe/' }); return res.end(); }
  if (/^\/m\/[\w-]+$/.test(rel)) rel = '/index.html';
  if (rel.endsWith('/')) rel += 'index.html';
  const arquivo = path.normalize(path.join(PUBLIC, rel));
  if (!arquivo.startsWith(PUBLIC + path.sep)) { res.writeHead(403); return res.end(); }
  fs.stat(arquivo, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Não encontrado'); }
    const ext = path.extname(arquivo).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': ['.jpg', '.png', '.webp'].includes(ext) ? 'public, max-age=86400' : 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'same-origin',
    });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(arquivo).pipe(res);
  });
}

// ---------------------------------------------------------------- servidor

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  let pathname;
  try { pathname = decodeURIComponent(url.pathname); } catch { res.writeHead(400); return res.end(); }
  if (pathname === '/saude') return json(res, 200, { ok: true });

  const foto = /^\/fotos\/(\d+)$/.exec(pathname);
  if (foto && req.method === 'GET') {
    try {
      const { rows } = await pool.query('SELECT tipo, dados FROM fotos WHERE id = $1', [Number(foto[1])]);
      if (!rows[0]) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'Content-Type': rows[0].tipo, 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' });
      return res.end(rows[0].dados);
    } catch (e) { console.error('foto', e.message); res.writeHead(500); return res.end(); }
  }

  if (!pathname.startsWith('/api/')) {
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
    return servirArquivo(req, res, pathname);
  }

  let achada = null, params = {};
  for (const r of rotas) {
    if (r.metodo !== req.method) continue;
    const m = r.re.exec(pathname);
    if (m) { achada = r; params = m.groups || {}; break; }
  }
  if (!achada) return json(res, 404, { erro: 'Rota não encontrada' });

  try {
    // escrita só com JSON: impede formulários de outros sites (CSRF)
    if (req.method !== 'GET' && !(req.headers['content-type'] || '').includes('application/json')) throw new Erro(415, 'Envie JSON');
    let u = null;
    if (achada.perms) {
      u = await auth.usuarioDaRequisicao(req);
      if (!u) throw new Erro(401, 'Faça login novamente.');
      if (achada.perms.length && !auth.pode(u, ...achada.perms)) throw new Erro(403, 'Seu usuário não tem acesso a esta seção.');
    }
    const b = req.method === 'GET' ? {} : await lerCorpo(req, pathname === '/api/admin/fotos' ? 2_500_000 : 200_000);
    const out = await achada.fn({ req, res, u, p: params, b, q: url.searchParams });
    if (!res.headersSent) json(res, 200, out);
  } catch (e) {
    if (e instanceof Erro) return json(res, e.status, { erro: e.message });
    console.error(new Date().toISOString(), req.method, pathname, e);
    if (!res.headersSent) json(res, 500, { erro: 'Erro no servidor. Tente de novo.' });
  }
});

(async () => {
  for (let tentativa = 1; ; tentativa++) {
    try { await migrar(); break; } catch (e) {
      if (tentativa >= 10) { console.error('Não consegui preparar o banco:', e.message); process.exit(1); }
      console.error('Banco ainda não respondeu (' + e.message + '). Tentando de novo em 3 s…');
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  await auth.prepararSegredo();
  server.listen(PORT, () => console.log('Naturalle Mania no ar na porta ' + PORT));
})();
