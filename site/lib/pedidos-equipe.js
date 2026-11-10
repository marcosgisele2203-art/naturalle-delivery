// Consultas e regras dos pedidos usadas pelo painel da equipe (separadas do server.js para poder testar).
const FUSO = 'America/Campo_Grande';

const CAMPOS_PEDIDO = `p.id, p.codigo, p.criado_em, p.confirmado_em, p.pronto_em, p.origem, p.tipo, p.status,
  p.cliente_nome, p.cliente_telefone, p.endereco, p.localizacao, p.observacoes, p.itens, p.subtotal, p.taxa_entrega, p.acrescimo_cartao, p.total,
  p.pagamento, p.troco_para, p.pix_status, p.pix_conferencia, p.pix_qr, p.pix_copia_cola, p.pix_expira, p.mp_pagamento_id, p.mesa_id, p.conta_id, p.criado_por, COALESCE(p.pago_em IS NOT NULL OR (p.pagamento = 'pix' AND p.pix_status = 'confirmado') OR conta.fechada_em IS NOT NULL, false) AS pagamento_confirmado, m.nome AS mesa_nome, u.nome AS criado_por_nome,
  p.entregador_id, e.nome AS entregador_nome, p.saiu_em, p.pago_em,
  CASE WHEN length(p.cliente_telefone) >= 10 THEN (SELECT count(*)::int FROM pedidos q
    WHERE nm_telefone(q.cliente_telefone) = nm_telefone(p.cliente_telefone) AND q.id <= p.id AND q.status <> 'cancelado') END AS n_pedido_cliente`;
const FROM_PEDIDO = `FROM pedidos p LEFT JOIN mesas m ON m.id = p.mesa_id LEFT JOIN usuarios u ON u.id = p.criado_por
  LEFT JOIN usuarios e ON e.id = p.entregador_id LEFT JOIN contas conta ON conta.id = p.conta_id`;

// Pedidos que o painel mostra: em andamento, mesas com conta aberta, entregues ainda sem receber e tudo de hoje.
// Pega os 400 MAIS NOVOS e devolve do mais antigo para o mais novo: se acumularem pendências antigas,
// os pedidos de hoje nunca ficam de fora da tela.
async function pedidosDoPainel(pool) {
  const { rows } = await pool.query(
    `SELECT * FROM (SELECT ${CAMPOS_PEDIDO} ${FROM_PEDIDO}
      WHERE p.status IN ('novo', 'preparo', 'pronto', 'saiu') OR (p.tipo = 'mesa' AND conta.fechada_em IS NULL)
         OR (p.status = 'entregue' AND p.tipo <> 'mesa' AND p.pago_em IS NULL AND (p.pagamento IS DISTINCT FROM 'pix' OR p.pix_status IS DISTINCT FROM 'confirmado'))
         OR (p.criado_em AT TIME ZONE '${FUSO}')::date = (now() AT TIME ZONE '${FUSO}')::date
      ORDER BY p.criado_em DESC, p.id DESC LIMIT 400) ultimos
     ORDER BY criado_em ASC, id ASC`);
  return rows;
}

// Taxa de entrega dos pedidos lançados pela equipe: sempre a da loja (nunca um valor vindo do navegador).
const taxaEntrega = (tipo, loja) => (tipo === 'entrega' ? Math.max(0, Number(loja && loja.taxa_entrega) || 0) : 0);

module.exports = { CAMPOS_PEDIDO, FROM_PEDIDO, pedidosDoPainel, taxaEntrega };
