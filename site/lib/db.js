// Banco: conexão, criação/atualização das tabelas e configurações.
const { Pool } = require('pg');
const cardapioInicial = require('./cardapio-inicial');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 8 });

const LOJA_PADRAO = {
  nome: 'Naturalle Mania',
  frase: 'O que tem de melhor você encontra aqui!',
  horario: 'Desde 18h30',
  whatsapp: '5567996421751',
  aberta: true,            // aceitando pedidos pelo site
  horario_automatico: false, // abre e fecha sozinho pelos horários abaixo
  horarios: require('../public/shared/horario.js').PADRAO,
  delivery: true,          // aceita entrega
  retirada: true,          // aceita retirar no balcão
  taxa_entrega: 6,
  taxa_cartao: 1,          // acréscimo da maquininha quando paga no cartão
  mesa_auto_confirmar: false, // pedido da mesa (QR) vai direto pra cozinha
};

const QUADRO_MAC = [
  { id: 'q-mac-1', tipo: 'promocao', titulo: 'Mac de 10 · 1 hambúrguer', texto: '', preco: 'R$ 10', foto: '/img/quadro/mac-1.webp', produto: 'mac-de-10-1', dias: [], ativo: true },
  { id: 'q-mac-2', tipo: 'promocao', titulo: 'Mac de 10 · 2 hambúrgueres', texto: '', preco: 'R$ 16', foto: '/img/quadro/mac-2.webp', produto: 'mac-de-10-2', dias: [], ativo: true },
  { id: 'q-mac-3', tipo: 'promocao', titulo: 'Mac de 10 · 3 hambúrgueres', texto: '', preco: 'R$ 22', foto: '/img/quadro/mac-3.webp', produto: 'mac-de-10-3', dias: [], ativo: true },
];
const QUADRO_INICIAL = [
  { id: 'q-marmita', tipo: 'novidade', titulo: 'Marmita Trufada', texto: 'Açaí + 5 adicionais à sua escolha.', preco: 'R$ 40,00', foto: '/img/quadro/marmita-trufada.webp', produto: 'marmita-trufada', dias: [], ativo: true },
  { id: 'q-batata', tipo: 'novidade', titulo: 'Porção de batata no Mac de 10', texto: 'Cheddar ou catupiry, com bacon ou calabresa (média 300 g).', preco: 'R$ 25,00', foto: '/img/quadro/batata.webp', produto: 'porcao-batata', dias: [], ativo: true },
  ...QUADRO_MAC,
];

async function migrar() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS config (
      chave TEXT PRIMARY KEY,
      valor JSONB NOT NULL,
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS usuarios (
      id          SERIAL PRIMARY KEY,
      nome        TEXT NOT NULL,
      login       TEXT NOT NULL UNIQUE,
      senha_hash  TEXT NOT NULL,
      permissoes  TEXT[] NOT NULL DEFAULT '{}',
      ativo       BOOLEAN NOT NULL DEFAULT true,
      versao      INT NOT NULL DEFAULT 1,
      criado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS mesas (
      id        SERIAL PRIMARY KEY,
      nome      TEXT NOT NULL,
      token     TEXT NOT NULL UNIQUE,
      ativa     BOOLEAN NOT NULL DEFAULT true,
      ordem     INT NOT NULL DEFAULT 0,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS contas (
      id          SERIAL PRIMARY KEY,
      mesa_id     INT NOT NULL REFERENCES mesas(id),
      aberta_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
      fechada_em  TIMESTAMPTZ,
      pagamento   TEXT,
      total       NUMERIC(10, 2),
      fechada_por INT REFERENCES usuarios(id)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS contas_uma_aberta ON contas (mesa_id) WHERE fechada_em IS NULL;

    CREATE TABLE IF NOT EXISTS pedidos (
      id               SERIAL PRIMARY KEY,
      criado_em        TIMESTAMPTZ NOT NULL DEFAULT now(),
      atualizado_em    TIMESTAMPTZ NOT NULL DEFAULT now(),
      cliente_nome     TEXT NOT NULL DEFAULT '',
      cliente_telefone TEXT NOT NULL DEFAULT '',
      endereco         TEXT NOT NULL DEFAULT '',
      observacoes      TEXT NOT NULL DEFAULT '',
      itens            JSONB NOT NULL,
      total            NUMERIC(10, 2) NOT NULL,
      pagamento        TEXT,
      troco_para       NUMERIC(10, 2),
      pix_status       TEXT,
      status           TEXT NOT NULL DEFAULT 'novo'
    );

    -- colunas novas (seguro rodar várias vezes)
    ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS origem TEXT NOT NULL DEFAULT 'site';
    ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'entrega';
    ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS mesa_id INT REFERENCES mesas(id);
    ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS conta_id INT REFERENCES contas(id);
    ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS criado_por INT REFERENCES usuarios(id);
    ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS subtotal NUMERIC(10, 2);
    ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS taxa_entrega NUMERIC(10, 2) NOT NULL DEFAULT 0;
    ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS acrescimo_cartao NUMERIC(10, 2) NOT NULL DEFAULT 0;
    ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS entregador_id INT REFERENCES usuarios(id);
    ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS saiu_em TIMESTAMPTZ;
    ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS pago_em TIMESTAMPTZ;
    ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS pago_confirmado_por INT REFERENCES usuarios(id);
    ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS telefone TEXT NOT NULL DEFAULT '';
    ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS email TEXT NOT NULL DEFAULT '';
    CREATE TABLE IF NOT EXISTS senha_codigos (
      usuario_id  INT PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
      codigo_hash TEXT NOT NULL,
      expira_em   TIMESTAMPTZ NOT NULL,
      tentativas  INT NOT NULL DEFAULT 0
    );
    ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS pix_conferencia JSONB;
    ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS mp_pagamento_id TEXT;
    ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS localizacao JSONB;
    ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS pix_copia_cola TEXT;
    ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS pix_qr TEXT;
    ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS pix_expira TIMESTAMPTZ;
    ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS mp_checado_em TIMESTAMPTZ;
    ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS pix_id_transacao TEXT;
    ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS codigo TEXT;
    ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS observacoes TEXT NOT NULL DEFAULT '';
    ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS confirmado_em TIMESTAMPTZ;
    ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS pronto_em TIMESTAMPTZ;
    ALTER TABLE pedidos ALTER COLUMN pagamento DROP NOT NULL;
    ALTER TABLE pedidos ALTER COLUMN cliente_nome SET DEFAULT '';
    ALTER TABLE pedidos ALTER COLUMN cliente_telefone SET DEFAULT '';
    ALTER TABLE pedidos DROP CONSTRAINT IF EXISTS pedidos_status_check;
    ALTER TABLE pedidos DROP CONSTRAINT IF EXISTS pedidos_pagamento_check;
    ALTER TABLE pedidos DROP CONSTRAINT IF EXISTS pedidos_pix_status_check;
    ALTER TABLE pedidos ADD CONSTRAINT pedidos_status_check
      CHECK (status IN ('novo', 'preparo', 'pronto', 'saiu', 'entregue', 'cancelado'));
    ALTER TABLE pedidos ADD CONSTRAINT pedidos_pagamento_check
      CHECK (pagamento IS NULL OR pagamento IN ('pix', 'cartao', 'dinheiro'));
    CREATE UNIQUE INDEX IF NOT EXISTS pedidos_codigo_idx ON pedidos (codigo);
    CREATE INDEX IF NOT EXISTS pedidos_status_idx ON pedidos (status, criado_em DESC);
    CREATE INDEX IF NOT EXISTS pedidos_telefone_idx ON pedidos (right(cliente_telefone, 8));
    CREATE INDEX IF NOT EXISTS pedidos_conta_idx ON pedidos (conta_id);

    -- clientes: um por WhatsApp (chave = 8 últimos dígitos, o WhatsApp às vezes tira o 9 da frente)
    CREATE TABLE IF NOT EXISTS clientes (
      chave         TEXT PRIMARY KEY,
      telefone      TEXT NOT NULL,
      nome          TEXT NOT NULL DEFAULT '',
      endereco      TEXT NOT NULL DEFAULT '',
      criado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS manu_conversas (
      canal         TEXT NOT NULL,
      chave         TEXT NOT NULL,
      mensagens     JSONB NOT NULL DEFAULT '[]',
      dados         JSONB NOT NULL DEFAULT '{}',
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (canal, chave)
    );

    CREATE TABLE IF NOT EXISTS fotos (
      id        SERIAL PRIMARY KEY,
      tipo      TEXT NOT NULL,
      dados     BYTEA NOT NULL,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(
    `INSERT INTO config (chave, valor) VALUES ('cardapio', $1), ('loja', $2) ON CONFLICT (chave) DO NOTHING`,
    [JSON.stringify(cardapioInicial), JSON.stringify(LOJA_PADRAO)]);
  // avisos iniciais do quadro da Manu (só se o quadro nunca foi salvo)
  await pool.query(`INSERT INTO config (chave, valor) VALUES ('quadro', $1) ON CONFLICT (chave) DO NOTHING`, [JSON.stringify(QUADRO_INICIAL)]);
  // pedidos antigos viram clientes (só os que ainda não estão cadastrados)
  await pool.query(`
    INSERT INTO clientes (chave, telefone, nome, endereco, criado_em, atualizado_em)
    SELECT DISTINCT ON (right(cliente_telefone, 8)) right(cliente_telefone, 8), cliente_telefone, cliente_nome,
           COALESCE((SELECT q.endereco FROM pedidos q WHERE right(q.cliente_telefone, 8) = right(p.cliente_telefone, 8) AND q.endereco <> ''
                     ORDER BY q.criado_em DESC LIMIT 1), ''),
           (SELECT min(q.criado_em) FROM pedidos q WHERE right(q.cliente_telefone, 8) = right(p.cliente_telefone, 8)), criado_em
      FROM pedidos p WHERE length(cliente_telefone) >= 10
     ORDER BY right(cliente_telefone, 8), criado_em DESC
    ON CONFLICT (chave) DO NOTHING`);
  await ajustesDoCardapio();
  await combosNoAcai();
  await trocarCartazMac();
}

// mudanças pedidas pela loja no cardápio já salvo; cada uma roda só uma vez
async function ajustesDoCardapio() {
  if (await lerConfig('ajuste_sem_shakes_sobremesas')) return;
  const m = await lerConfig('cardapio');
  if (m) {
    m.produtos = m.produtos.filter((p) => !p.id.startsWith('milk-shake-') && p.categoria !== 'sobremesas');
    m.categorias = m.categorias.filter((c) => c.id !== 'sobremesas');
    const beb = m.categorias.find((c) => c.id === 'bebidas');
    if (beb && beb.nome === 'Bebidas e shakes') beb.nome = 'Bebidas';
    await salvarConfig('cardapio', m);
  }
  await salvarConfig('ajuste_sem_shakes_sobremesas', true);
}

// o cartaz único do Mac de 10 vira os 3 cartazes (1, 2 e 3 hambúrgueres), no mesmo lugar
async function trocarCartazMac() {
  if (await lerConfig('ajuste_quadro_mac_123')) return;
  const q = await lerConfig('quadro');
  const i = Array.isArray(q) ? q.findIndex((a) => a.id === 'q-mac') : -1;
  if (i >= 0) { q.splice(i, 1, ...QUADRO_MAC); await salvarConfig('quadro', q); }
  await salvarConfig('ajuste_quadro_mac_123', true);
}

async function combosNoAcai() {
  if (await lerConfig('ajuste_combos_no_acai')) return;
  const m = await lerConfig('cardapio');
  if (m && m.categorias.some((c) => c.id === 'acai')) {
    for (const p of m.produtos) if (p.categoria === 'combos') p.categoria = 'acai';
    m.categorias = m.categorias.filter((c) => c.id !== 'combos');
    await salvarConfig('cardapio', m);
  }
  await salvarConfig('ajuste_combos_no_acai', true);
}

async function lerConfig(chave) {
  const { rows } = await pool.query('SELECT valor FROM config WHERE chave = $1', [chave]);
  const v = rows[0] ? rows[0].valor : null;
  return chave === 'loja' ? { ...LOJA_PADRAO, ...(v || {}) } : v;
}

async function salvarConfig(chave, valor) {
  await pool.query(
    `INSERT INTO config (chave, valor, atualizado_em) VALUES ($1, $2, now())
     ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, atualizado_em = now()`,
    [chave, JSON.stringify(valor)]);
}

module.exports = { pool, migrar, lerConfig, salvarConfig, LOJA_PADRAO };
