// Taxa de entrega por bairro. Roda no navegador (window.Bairros) e no servidor (require).
// Loja: { taxa_entrega: 6, bairros: [{ nome: 'Centro', taxa: 5 }, ...] }
//  - sem bairros cadastrados: a taxa é uma só (taxa_entrega), como sempre foi;
//  - com bairros: vale a taxa do bairro escolhido; "Outro bairro" (ou nenhum) usa a taxa_entrega padrão.
// O servidor sempre recalcula: a taxa que vem do navegador é ignorada.
(function (root) {
  const OUTRO = 'Outro bairro';
  const chave = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');
  const valor = (v) => Math.round(Number(String(v ?? '').replace(',', '.')) * 100) / 100;

  // lista arrumada (para salvar a loja): nome 1–60 letras, taxa 0–1000, sem nomes repetidos, até 80 bairros
  function validar(lista) {
    if (!Array.isArray(lista)) return [];
    const vistos = new Set(), saida = [];
    for (const b of lista.slice(0, 80)) {
      const nome = String((b && b.nome) || '').trim().replace(/\s+/g, ' ').slice(0, 60);
      if (!nome || vistos.has(chave(nome)) || chave(nome) === chave(OUTRO)) continue;
      const taxa = valor(b.taxa);
      if (!Number.isFinite(taxa) || taxa < 0 || taxa > 1000) throw new Error('Taxa inválida no bairro ' + nome);
      vistos.add(chave(nome));
      saida.push({ nome, taxa });
    }
    return saida;
  }

  const lista = (loja) => (Array.isArray(loja && loja.bairros) ? loja.bairros : []);
  const padrao = (loja) => Math.max(0, Number(loja && loja.taxa_entrega) || 0);
  // o bairro cadastrado com esse nome (ignora acento e maiúsculas), ou null
  const achar = (loja, nome) => lista(loja).find((b) => chave(b.nome) === chave(nome)) || null;

  function taxa(loja, tipo, bairro) {
    if (tipo !== 'entrega') return 0;
    const b = achar(loja, bairro);
    return b ? Math.max(0, Number(b.taxa) || 0) : padrao(loja);
  }

  // texto do bairro para juntar ao endereço do pedido (vai para o painel, a impressão e o entregador)
  function noEndereco(loja, endereco, bairro) {
    const b = achar(loja, bairro);
    const e = String(endereco || '').trim();
    if (!b || chave(e).includes(chave(b.nome))) return e;
    return e ? e + ' — ' + b.nome : b.nome;
  }

  const Bairros = { OUTRO, validar, lista, taxa, achar, noEndereco };
  if (typeof module !== 'undefined' && module.exports) module.exports = Bairros;
  else root.Bairros = Bairros;
})(this);
