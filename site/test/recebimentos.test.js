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
