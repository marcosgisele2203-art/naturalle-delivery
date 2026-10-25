// Horário de funcionamento: diz se a loja está aberta agora e o que mostrar ao cliente.
// Usado pelo servidor (que decide de verdade) e pela tela da administração.
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.Horario = fabrica();
})(typeof self !== 'undefined' ? self : this, function () {
  const NOMES = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  const PADRAO = [0, 1, 2, 3, 4, 5, 6].map(() => ({ aberto: true, abre: '18:30', fecha: '23:30' }));

  const minutos = (hhmm) => { const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || ''); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
  const hora = (hhmm) => { const [h, m] = String(hhmm).split(':'); return Number(h) + 'h' + (m === '00' ? '' : m); };
  // fecha antes (ou na mesma hora) de abrir = passa da meia-noite
  const viraDia = (d) => minutos(d.fecha) <= minutos(d.abre);

  function lista(horarios) {
    return [0, 1, 2, 3, 4, 5, 6].map((i) => {
      const d = (Array.isArray(horarios) && horarios[i]) || PADRAO[i];
      const ok = minutos(d.abre) != null && minutos(d.fecha) != null;
      return ok ? { aberto: d.aberto !== false, abre: d.abre, fecha: d.fecha } : { ...PADRAO[i], aberto: false };
    });
  }

  // agora = { dia: 0-6 (domingo = 0), min: minutos desde 0h } no fuso da loja
  function estado(loja, agora) {
    if (!loja.aberta) return { aberta: false, texto: 'Fechado agora' };
    if (!loja.horario_automatico) return { aberta: true, texto: loja.horario || '' };
    const h = lista(loja.horarios);
    const { dia, min } = agora;
    const hoje = h[dia], ontem = h[(dia + 6) % 7];
    if (hoje.aberto && min >= minutos(hoje.abre) && (viraDia(hoje) || min < minutos(hoje.fecha))) {
      return { aberta: true, texto: 'Aberto até ' + hora(hoje.fecha) };
    }
    if (ontem.aberto && viraDia(ontem) && min < minutos(ontem.fecha)) {
      return { aberta: true, texto: 'Aberto até ' + hora(ontem.fecha) };
    }
    for (let k = 0; k < 7; k++) {
      const d = h[(dia + k) % 7];
      if (!d.aberto || (k === 0 && min >= minutos(d.abre))) continue;
      const quando = k === 0 ? 'hoje' : k === 1 ? 'amanhã' : NOMES[(dia + k) % 7];
      return { aberta: false, texto: `Abre ${quando} às ${hora(d.abre)}` };
    }
    return { aberta: false, texto: 'Fechado' };
  }

  // texto da semana para mostrar (ex.: "Seg a Sáb 18h30 às 23h30")
  function resumo(horarios) {
    return lista(horarios).map((d, i) => (d.aberto ? `${NOMES[i]}: ${hora(d.abre)} às ${hora(d.fecha)}` : `${NOMES[i]}: fechado`));
  }

  return { estado, lista, resumo, minutos, PADRAO, NOMES };
});
