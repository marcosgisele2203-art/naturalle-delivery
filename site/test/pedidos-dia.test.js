const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const fonte = fs.readFileSync(require('node:path').join(__dirname, '../public/equipe/v-pedidos.js'), 'utf8');
function renderizar(agora) {
  const Relogio = class extends Date { constructor(...args) { super(...(args.length ? args : [agora])); } };
  const el = { innerHTML: '', addEventListener() {} };
  const App = { views: {}, pedidos: [
    { id: 'antigo', status: 'entregue', pagamento_confirmado: true, criado_em: '2026-11-06T03:00:00Z', atualizado_em: agora, total: 100 },
    { id: 'recente', status: 'entregue', pagamento_confirmado: true, criado_em: '2026-11-07T00:00:00Z', total: 20 },
    { id: 'pendente', status: 'novo', criado_em: '2026-10-01T12:00:00Z', total: 30 },
  ], esc: s => s, brl: n => String(n), somLigado: () => false, on() {},
    estaPago: p => !!p.pagamento_confirmado, pode: () => true, cartaoPedido: p => `<article>${p.id}</article>` };
  const ctx = { App, Date: Relogio, Intl, window: { Calc: { temCozinha: () => false }, scrollY: 0, scrollTo() {} }, setInterval() {}, setTimeout() {}, clearInterval() {} };
  vm.runInNewContext(fonte, ctx);
  App.views.pedidos.montar(el);
  return el.innerHTML;
}
test('finalizados antigos ficam fora mesmo atualizados hoje; pendências são preservadas', () => {
  const html = renderizar('2026-11-07T03:30:00Z'); // 23h30 do dia 6 em Miranda
  assert(!html.includes('<article>antigo</article>'));
  assert(html.includes('<article>recente</article>'));
  assert(html.includes('<article>pendente</article>'));
  assert(html.includes('1 entregues · 20 entregue hoje'));
});
test('ao virar o dia em Miranda, finalizados de ontem deixam a coluna', () => {
  const html = renderizar('2026-11-07T04:01:00Z');
  assert(!html.includes('<article>recente</article>'));
  assert(html.includes('<article>pendente</article>'));
  assert(html.includes('0 entregues · 0 entregue hoje'));
});
