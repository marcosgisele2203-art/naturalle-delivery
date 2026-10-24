-- Naturalle Mania · banco do delivery (Postgres)
-- Rode uma vez no Postgres da Easypanel antes de ativar os fluxos do n8n.

CREATE TABLE IF NOT EXISTS pedidos (
  id               SERIAL PRIMARY KEY,
  criado_em        TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em    TIMESTAMPTZ NOT NULL DEFAULT now(),
  cliente_nome     TEXT NOT NULL,
  cliente_telefone TEXT NOT NULL,              -- só dígitos, com 55 (ex.: 5567999999999)
  endereco         TEXT NOT NULL DEFAULT '',
  observacoes      TEXT NOT NULL DEFAULT '',
  itens            JSONB NOT NULL,             -- [{ "nome", "detalhe", "preco" }]
  total            NUMERIC(10, 2) NOT NULL,
  pagamento        TEXT NOT NULL CHECK (pagamento IN ('pix', 'cartao', 'dinheiro')),
  troco_para       NUMERIC(10, 2),
  pix_status       TEXT CHECK (pix_status IN ('aguardando', 'comprovante_recebido', 'confirmado')),
  status           TEXT NOT NULL DEFAULT 'novo'
                   CHECK (status IN ('novo', 'preparo', 'saiu', 'entregue', 'cancelado'))
);

CREATE INDEX IF NOT EXISTS pedidos_status_idx   ON pedidos (status, criado_em DESC);
CREATE INDEX IF NOT EXISTS pedidos_telefone_idx ON pedidos (right(cliente_telefone, 8));
