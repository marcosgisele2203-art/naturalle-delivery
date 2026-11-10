const test = require('node:test');
const assert = require('node:assert/strict');
const Relatorio = require('../public/shared/relatorio');
test('servido ou retirado não significa pagamento recebido no relatório', () => {
 const rows = [
  { id:1, data:'2026-11-07',hora:'12:00',tipo:'mesa',status:'entregue',total:20,pagamento:null,itens:[] },
  { id:2, data:'2026-11-07',hora:'12:00',tipo:'retirada',status:'entregue',total:15,pagamento:'dinheiro',itens:[] },
  { id:3, data:'2026-11-07',hora:'12:00',tipo:'entrega',status:'preparo',total:30,pagamento:'cartao',pago_em:'2026-11-07T12:00Z',itens:[] },
  { id:4, data:'2026-11-07',hora:'12:00',tipo:'mesa',status:'entregue',total:25,pagamento:'pix',pagamento_confirmado:true,itens:[] },
  { id:5, data:'2026-11-07',hora:'12:00',tipo:'retirada',status:'cancelado',total:90,pago_em:'2026-11-07T12:00Z',itens:[] },
 ];
 const rel=Relatorio.montar(rows,'2026-11-07','2026-11-07');
 assert.equal(rel.resumo.recebido,55);
 assert.equal(rel.resumo.a_receber,35);
 assert.equal(rel.pagamentos.find(p=>p.chave==='em aberto').total,35);
 assert(Relatorio.csv(rel).includes('A receber'));
});
test('planilha: nome digitado pelo cliente não vira fórmula no Excel', () => {
  const rows = [
    { id: 1, data: '2026-11-07', hora: '12:00', tipo: 'retirada', status: 'entregue', total: 10, subtotal: 10, pagamento: 'dinheiro', pago_em: '2026-11-07T12:00Z', cliente_nome: '=HYPERLINK("http://x","clique")', itens: [{ qtd: 1, nome: '+Açaí', detalhe: '' }] },
    { id: 2, data: '2026-11-07', hora: '12:05', tipo: 'retirada', status: 'entregue', total: 12, subtotal: 12, pagamento: 'pix', pago_em: '2026-11-07T12:05Z', cliente_nome: 'Maria @silva', itens: [] },
  ];
  const linhas = Relatorio.csv(Relatorio.montar(rows, '2026-11-07', '2026-11-07')).split('\r\n');
  const c1 = linhas[1].split(';');
  assert.equal(c1[5], `"'=HYPERLINK(""http://x"",""clique"")"`, 'fórmula vira texto');
  assert.equal(c1[6], '1x +Açaí', 'itens começam com a quantidade e não mudam');
  assert(!linhas.some((l) => l.split(';').some((c) => /^"?[=+@]/.test(c))), 'nenhuma célula começa com sinal de fórmula');
  assert(linhas[2].includes('Maria @silva'), '@ no meio do nome continua igual');
  assert(linhas[1].includes(';10,00;'), 'valores continuam números');
});
