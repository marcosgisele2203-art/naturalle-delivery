// Mensagens de WhatsApp da entrega: o que o entregador recebe quando o pedido sai, e o aviso de localização nova.
const brl = (v) => 'R$ ' + Number(v || 0).toFixed(2).replace('.', ',');
const fone = (t) => { const d = String(t || '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, ''); return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : d.length === 10 ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}` : d; };

// link do Google Maps: pelo ponto do GPS (mais certo) ou pelo endereço escrito + cidade da loja
function linkMapa(pedido, loja = {}) {
  const l = pedido.localizacao;
  if (l && Number.isFinite(Number(l.lat)) && Number.isFinite(Number(l.lng))) return `https://www.google.com/maps/search/?api=1&query=${Number(l.lat)},${Number(l.lng)}`;
  if (!pedido.endereco) return '';
  const onde = [pedido.endereco, [loja.cidade || 'Miranda', loja.uf || 'MS'].join(' - ')].join(', ');
  return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(onde);
}

function cobrar(p) {
  const pago = p.pagamento_confirmado || p.pago_em || (p.pagamento === 'pix' && p.pix_status === 'confirmado');
  if (pago) return '✅ Já está pago. Não cobrar.';
  if (p.pagamento === 'dinheiro') {
    const troco = Number(p.troco_para) > Number(p.total) ? ` · paga com ${brl(p.troco_para)}, levar *${brl(Number(p.troco_para) - Number(p.total))}* de troco` : ' · sem troco';
    return `💵 Receber *${brl(p.total)}* em dinheiro${troco}`;
  }
  if (p.pagamento === 'cartao') return `💳 Receber *${brl(p.total)}* no cartão (levar a maquininha)`;
  if (p.pagamento === 'pix') return `⚠️ Pix de ${brl(p.total)} ainda não confirmado: confira com a loja antes de entregar`;
  return `Receber *${brl(p.total)}* (forma de pagamento não escolhida)`;
}

function mensagemEntregador(p, loja = {}) {
  const mapa = linkMapa(p, loja);
  const itens = (p.itens || []).map((i) => `• ${i.qtd}x ${i.nome}${i.detalhe ? ' (' + i.detalhe + ')' : ''}`).join('\n');
  return [`🛵 *Entrega #${p.id}*`,
    `Cliente: ${p.cliente_nome || 'Cliente'}${p.cliente_telefone ? ' · ' + fone(p.cliente_telefone) : ''}`,
    p.endereco ? `Endereço: ${p.endereco}` : '',
    mapa ? `📍 ${p.localizacao ? 'Localização do cliente' : 'Mapa'}: ${mapa}` : '📍 Sem endereço: ligue para o cliente',
    '', itens, p.observacoes ? `Obs.: ${p.observacoes}` : '', '', cobrar(p)].filter((l, i, a) => l !== '' || (a[i - 1] !== '' && i > 0)).join('\n').trim();
}

const mensagemLocalizacao = (p) => `📍 O cliente do pedido *#${p.id}* (${p.cliente_nome || 'cliente'}) mandou a localização:\n${linkMapa(p)}`;

// textos colocados no lugar do endereço quando o pedido veio só com o ponto do mapa:
// não são endereço de verdade, então não vão para o cadastro do cliente nem valem num pedido sem as coordenadas
const ENDERECO_WHATSAPP = 'Localização enviada pelo WhatsApp (ver mapa)';
const ENDERECO_SITE = 'Local marcado no mapa (ver localização)';
const ehSoMapa = (t) => { const e = String(t || '').trim(); return e.startsWith(ENDERECO_WHATSAPP) || e.startsWith(ENDERECO_SITE); };

module.exports = { linkMapa, mensagemEntregador, mensagemLocalizacao, cobrar, fone, ENDERECO_WHATSAPP, ENDERECO_SITE, ehSoMapa };
