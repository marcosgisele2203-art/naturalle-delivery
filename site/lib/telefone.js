// Identidade completa: país + DDD + número. Unifica o 9 de celulares antigos do WhatsApp.
function normalizarTelefone(valor) {
  let t = String(valor || '').replace(/\D/g, '');
  if ((t.length === 12 || t.length === 13) && t.startsWith('55')) t = t.slice(2);
  if (!/^\d{10,11}$/.test(t)) return '';
  if (t.length === 10 && /^[6-9]/.test(t.slice(2))) t = t.slice(0, 2) + '9' + t.slice(2);
  return '55' + t;
}
module.exports = { normalizarTelefone };
