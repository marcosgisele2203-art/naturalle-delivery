// Pedidos: todos os pedidos do dia em colunas, do recebido ao entregue.
App.views.pedidos = {
  montar(el) {
    const { esc, brl } = App;
    const destaque = new Set();
    let filtro = 'todos';
    const COLUNAS = [
      { status: 'novo', nome: 'Aguardando confirmação', cor: '#A3134A' },
      { status: 'preparo', nome: 'Preparando', cor: '#8A5A0B' },
      { status: 'pronto', nome: 'Prontos', cor: '#1E5B2B' },
      { status: 'saiu', nome: 'Saiu para entrega', cor: '#1D5FA8' },
      { status: 'fim', nome: 'Finalizados hoje', cor: '#5A615B' },
    ];

    function acoes(p) {
      const a = [];
      const cozinha = window.Calc.temCozinha(p.itens);
      if (p.status === 'novo') a.push({ rotulo: cozinha ? 'Confirmar e mandar p/ cozinha' : 'Confirmar pedido', classe: 'principal', acao: 'status', valor: 'preparo' });
      // sem lanche não passa pela cozinha: o balcão prepara e marca pronto aqui
      if (p.status === 'preparo' && !cozinha) a.push({ rotulo: 'Pronto (balcão)', classe: 'verde', acao: 'status', valor: 'pronto' });
      if (p.status === 'pronto' && p.tipo === 'entrega') a.push({ rotulo: 'Saiu para entrega', classe: 'azul', acao: 'status', valor: 'saiu' });
      if (p.status === 'pronto' && p.tipo === 'retirada') a.push({ rotulo: 'Cliente retirou', classe: 'verde', acao: 'status', valor: 'entregue' });
      if (p.status === 'pronto' && p.tipo === 'mesa') a.push({ rotulo: 'Servido na mesa', classe: 'verde', acao: 'status', valor: 'entregue' });
      if (p.status === 'saiu') a.push({ rotulo: 'Entregue e pago', classe: 'verde', acao: 'entregar' });
      if (p.pagamento === 'pix' && p.pix_status !== 'confirmado' && p.status !== 'cancelado') a.push({ rotulo: 'Confirmar Pix', acao: 'pix' });
      if (p.cliente_telefone) a.push({ rotulo: 'WhatsApp', href: 'https://wa.me/' + p.cliente_telefone });
      if (['novo', 'preparo', 'pronto', 'saiu'].includes(p.status) && (p.status === 'novo' || App.pode('pedidos', 'caixa'))) a.push({ rotulo: 'Cancelar', classe: 'fraco', acao: 'status', valor: 'cancelado' });
      return a;
    }

    function render(mudaram) {
      if (mudaram) {
        const novos = mudaram.filter((m) => m.para === 'novo' && !m.de);
        novos.forEach((m) => { destaque.add(m.id); setTimeout(() => destaque.delete(m.id), 60000); });
        if (novos.length) App.bip();
      }
      const lista = App.pedidos.filter((p) => filtro === 'todos' || p.tipo === filtro);
      const ativos = lista.filter((p) => ['novo', 'preparo', 'pronto', 'saiu'].includes(p.status));
      const entregues = lista.filter((p) => p.status === 'entregue');
      const total = entregues.reduce((s, p) => s + Number(p.total), 0);
      const scroll = window.scrollY;
      el.innerHTML = `<div class="topo"><div><h1>Pedidos</h1>
          <p>${ativos.length} em andamento · ${entregues.length} entregues · ${brl(total)} entregue hoje</p></div>
        <div class="controles">
          <div class="chips">${[['todos', 'Todos'], ['entrega', 'Entrega'], ['retirada', 'Retirada'], ['mesa', 'Mesas']].map(([v, n]) =>
            `<button class="chip" aria-pressed="${filtro === v}" data-filtro="${v}">${n}</button>`).join('')}</div>
          <button class="btn" data-som aria-pressed="${App.somLigado()}">${App.somLigado() ? 'Som ligado' : 'Ligar som'}</button>
          <span class="status-con${App.online === false ? ' off' : ''}">${App.online === false ? 'Sem conexão' : 'Atualizando sozinho'}</span>
        </div></div>
        <div class="quadro">${COLUNAS.map((c) => {
          let ps = c.status === 'fim' ? lista.filter((p) => ['entregue', 'cancelado'].includes(p.status)).reverse().slice(0, 30) : lista.filter((p) => p.status === c.status);
          return `<section class="coluna" aria-label="${c.nome}"><header><h2><span class="ponto" style="background:${c.cor}" aria-hidden="true"></span>${c.nome}</h2><span class="qtd">${ps.length}</span></header>
            ${ps.length ? ps.map((p) => (p.status === 'cancelado' ? App.cartaoPedido(p, []).replace('class="pedido', 'style="opacity:.6" class="pedido') : App.cartaoPedido(p, acoes(p), { destaque: destaque.has(p.id) }))).join('') : '<p class="vazio">Nenhum pedido</p>'}
          </section>`;
        }).join('')}</div>`;
      window.scrollTo(0, scroll);
    }

    el.addEventListener('click', async (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.filtro) { filtro = b.dataset.filtro; render(); return; }
      if (b.hasAttribute('data-som')) { App.alternarSom(); render(); return; }
      const id = Number(b.dataset.id);
      if (b.dataset.acao === 'status') {
        if (b.dataset.valor === 'cancelado' && !confirm('Cancelar o pedido #' + id + '?' + (App.pedidos.find((p) => p.id === id)?.cliente_telefone ? ' O cliente será avisado no WhatsApp.' : ''))) return;
        const p = App.pedidos.find((x) => x.id === id);
        if (b.dataset.valor === 'saiu' && p) App.escolherEntregador(p);
        else App.mudarStatus(id, b.dataset.valor, b);
      } else if (b.dataset.acao === 'entregar') {
        const p = App.pedidos.find((x) => x.id === id);
        if (p) App.confirmarEntrega(p);
      } else if (b.dataset.acao === 'pix') {
        b.disabled = true;
        try { await App.api('/api/equipe/pedido/' + id + '/pix', {}); } catch (err) { App.toast(err.message, true); }
        App.atualizarPedidos();
      }
    });

    App.on(render);
    render();
    const relogio = setInterval(() => render(), 30000);
    return () => clearInterval(relogio);
  },
};
