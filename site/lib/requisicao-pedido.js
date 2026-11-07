const crypto = require('crypto');
const ordenar = valor => Array.isArray(valor) ? valor.map(ordenar) : valor && typeof valor === 'object'
  ? Object.fromEntries(Object.keys(valor).sort().map(chave => [chave, ordenar(valor[chave])])) : valor;
function requisicaoPedido(corpo, escopo) {
  // Compatibilidade com telas antigas: pedidos novos usam identificador persistido no navegador.
  if (!corpo.idempotencia) return null;
  if (!/^[a-zA-Z0-9_-]{16,100}$/.test(corpo.idempotencia)) throw new Error('Identificador de pedido inválido. Atualize a página.');
  const { idempotencia, ...dados } = corpo;
  return { chave: escopo + ':' + idempotencia, hash: crypto.createHash('sha256').update(JSON.stringify(ordenar(dados))).digest('hex') };
}
module.exports = { requisicaoPedido };
