// Pix pelo Mercado Pago: gera o QR Code com o valor do pedido e confirma sozinho quando o dinheiro cai.
// A confirmação sempre é conferida direto na API do Mercado Pago (o aviso que chega no webhook não é confiável sozinho).
//
//   MP_ACCESS_TOKEN   Access Token de PRODUÇÃO da aplicação no Mercado Pago (APP_USR-...)

const TOKEN = process.env.MP_ACCESS_TOKEN || '';
const BASE = process.env.MP_BASE || 'https://api.mercadopago.com'; // trocado só em teste
const VALIDADE_MIN = 30;

const configurado = () => !!TOKEN;

async function chamar(metodo, caminho, corpo, idempotencia) {
  const r = await fetch(BASE + caminho, {
    method: metodo,
    headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json', ...(idempotencia ? { 'X-Idempotency-Key': idempotencia } : {}) },
    body: corpo ? JSON.stringify(corpo) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('Mercado Pago ' + r.status + ': ' + (d.message || d.error || ''));
  return d;
}

// cria o Pix do pedido; devolve o copia e cola, a imagem do QR e quando vence
async function criarPix(pedido, { email, notificacao }) {
  const expira = new Date(Date.now() + VALIDADE_MIN * 60_000);
  const nome = String(pedido.cliente_nome || 'Cliente').trim().split(/\s+/);
  const d = await chamar('POST', '/v1/payments', {
    transaction_amount: Number(pedido.total),
    description: `Naturalle Mania - pedido #${pedido.id}`,
    payment_method_id: 'pix',
    external_reference: String(pedido.id),
    date_of_expiration: expira.toISOString().replace('Z', '-00:00'),
    payer: { email, first_name: nome[0], last_name: nome.slice(1).join(' ') || undefined },
    ...(notificacao ? { notification_url: notificacao } : {}),
  }, 'pedido-' + pedido.id + '-' + pedido.codigo);
  const t = (d.point_of_interaction && d.point_of_interaction.transaction_data) || {};
  if (!t.qr_code) throw new Error('Mercado Pago não devolveu o QR Code');
  return { id: String(d.id), copia_cola: t.qr_code, qr_base64: t.qr_code_base64 || '', expira };
}

// situação do pagamento direto no Mercado Pago
async function consultar(id) {
  const d = await chamar('GET', '/v1/payments/' + encodeURIComponent(id));
  return { id: String(d.id), status: d.status, pedido: Number(d.external_reference), valor: Number(d.transaction_amount) };
}

module.exports = { configurado, criarPix, consultar, VALIDADE_MIN };
