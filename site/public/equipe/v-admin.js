// Administração: cardápio, mesas e QR codes, equipe e permissões, dados da loja.
App.views.admin = {
  montar(el, params) {
    const { esc, brl } = App;
    const ABAS = [['cardapio', 'Cardápio'], ['quadro', 'Quadro da Manu'], ['clientes', 'Clientes'], ['equipe', 'Funcionários'], ['mesas', 'Mesas e QR code'], ['horario', 'Horário e taxas'], ['loja', 'Loja'], ['impressora', 'Impressora']];
    let aba = ABAS.some(([a]) => a === params[0]) ? params[0] : 'cardapio';
    let d = null; // { cardapio, loja, usuarios, mesas, permissoes }
    const copia = (o) => JSON.parse(JSON.stringify(o));
    const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

    async function carregar() { d = await App.api('/api/admin/tudo'); }

    async function salvarCardapio(novo, msg) {
      try {
        const r = await App.api('/api/admin/cardapio', { cardapio: novo }, 'PUT');
        d.cardapio = r.cardapio;
        App.toast(msg || 'Cardápio salvo');
        return true;
      } catch (e) { App.toast(e.message, true); return false; }
    }

    // ---------------- cardápio
    function abaCardapio() {
      const m = d.cardapio;
      return `<section class="cartao"><div class="topo"><div><h2>Categorias</h2><p>A ordem aqui é a ordem das abas no app.</p></div>
          <button class="btn verde" data-nova-cat>+ Categoria</button></div>
        <div class="chips">${m.categorias.map((c, i) => `<span class="chip" style="display:inline-flex;align-items:center;gap:4px;padding-right:4px">${esc(c.nome)}
          <button class="btn fraco" data-cat-sobe="${i}" aria-label="Mover ${esc(c.nome)} para antes"${i ? '' : ' disabled'}>←</button>
          <button class="btn fraco" data-cat-edita="${i}">editar</button></span>`).join('')}</div></section>
        ${m.categorias.map((c) => {
          const ps = m.produtos.filter((p) => p.categoria === c.id);
          return `<section class="cartao"><div class="topo"><h2>${esc(c.nome)}</h2><button class="btn" data-novo-prod="${esc(c.id)}">+ Produto</button></div>
            ${ps.map((p) => `<div class="produto-adm">
              ${p.foto ? `<img class="foto-adm" src="${esc(p.foto)}" alt="" loading="lazy" onerror="this.remove()">` : '<span class="foto-adm sem-foto" aria-hidden="true"></span>'}
              <div><b>${esc(p.nome)}</b> ${p.disponivel === false ? '<span class="selo-off">esgotado</span>' : ''}
                <small>${(p.grupos || []).some((g) => g.obrigatorio) ? 'a partir de ' : ''}${brl(window.Calc.precoMinimo(p))}${p.dias && p.dias.length ? ' · só ' + p.dias.map((x) => DIAS[x]).join(', ') : ''}${(p.grupos || []).length ? ' · ' + p.grupos.map((g) => esc(g.nome)).join(', ') : ''}</small></div>
              <label class="check" style="font-size:13px"><input type="checkbox" data-disp="${esc(p.id)}"${p.disponivel === false ? '' : ' checked'}> Disponível</label>
              <button class="btn" data-edita="${esc(p.id)}">Editar</button>
            </div>`).join('') || '<p class="nota">Nenhum produto nesta categoria.</p>'}
          </section>`;
        }).join('')}`;
    }

    function editarCategoria(i) {
      const m = copia(d.cardapio);
      const c = i == null ? { id: '', nome: '' } : m.categorias[i];
      const usada = i != null && m.produtos.some((p) => p.categoria === c.id);
      const j = App.janela(i == null ? 'Nova categoria' : 'Editar categoria', `<form class="grade-form" style="grid-template-columns:1fr">
        <label class="campo">Nome<input name="nome" required value="${esc(c.nome)}"></label>
        <button class="btn verde grande">Salvar</button>
        ${i != null ? `<button type="button" class="btn fraco" data-apagar${usada ? ' disabled title="Tire os produtos dela antes"' : ''}>Apagar categoria${usada ? ' (tem produtos)' : ''}</button>` : ''}
      </form>`);
      j.querySelector('form').addEventListener('submit', async (e) => {
        e.preventDefault();
        c.nome = e.target.nome.value;
        if (i == null) m.categorias.push(c);
        if (await salvarCardapio(m)) { j.fechar(); render(); }
      });
      j.querySelector('[data-apagar]')?.addEventListener('click', async () => {
        if (!confirm('Apagar a categoria ' + c.nome + '?')) return;
        m.categorias.splice(i, 1);
        if (await salvarCardapio(m)) { j.fechar(); render(); }
      });
    }

    function editarProduto(id, categoria) {
      const m = copia(d.cardapio);
      let p = id ? m.produtos.find((x) => x.id === id) : { id: '', categoria, nome: '', descricao: '', preco: 0, grupos: [] };
      p = copia(p);
      const j = App.janela(id ? 'Editar produto' : 'Novo produto', '');
      const grupoHtml = (g, gi) => `<div class="grupo-adm" data-gi="${gi}">
          <div class="grade-form">
            <label class="campo">Nome do grupo<input data-g="nome" value="${esc(g.nome)}" placeholder="Ex.: Tamanho, Sabor, Adicionais"></label>
            <label class="campo">Tipo<select data-g="tipo"><option value="unica"${g.tipo === 'unica' ? ' selected' : ''}>Escolhe 1</option><option value="multipla"${g.tipo !== 'unica' ? ' selected' : ''}>Escolhe vários</option></select></label>
            ${g.tipo !== 'unica' ? `<label class="campo">Máximo (0 = sem limite)<input type="number" min="0" data-g="max" value="${g.max || 0}"></label>` : ''}
            <label class="check"><input type="checkbox" data-g="obrigatorio"${g.obrigatorio ? ' checked' : ''}> Obrigatório</label>
          </div>
          <div class="opcao-adm" style="font-size:12px;color:var(--cinza);font-weight:600"><span>Opção</span><span>Preço (+R$)</span><span>Preço "de" (riscado)</span><span>Disponível</span><span></span></div>
          ${(g.opcoes || []).map((o, oi) => `<div class="opcao-adm" data-oi="${oi}">
            <input type="text" data-o="nome" value="${esc(o.nome)}" aria-label="Nome da opção">
            <input type="number" step="0.01" min="0" data-o="preco" value="${o.preco ?? 0}" aria-label="Preço">
            <input type="number" step="0.01" min="0" data-o="preco_de" value="${o.preco_de ?? ''}" aria-label="Preço de">
            <label class="check" style="min-height:40px"><input type="checkbox" data-o="disponivel"${o.disponivel === false ? '' : ' checked'}><span class="sr">Disponível</span></label>
            <button type="button" class="btn fraco" data-tira-op="${oi}" aria-label="Remover ${esc(o.nome)}">remover</button>
          </div>`).join('')}
          <div class="acoes"><button type="button" class="btn" data-poe-op>+ Opção</button><button type="button" class="btn fraco" data-tira-grupo>Remover grupo</button></div>
        </div>`;

      function lerTela() {
        const f = j.corpo;
        p.nome = f.querySelector('[name=nome]').value;
        p.descricao = f.querySelector('[name=descricao]').value;
        p.categoria = f.querySelector('[name=categoria]').value;
        p.preco = Number(f.querySelector('[name=preco]').value || 0);
        if (f.querySelector('[name=disponivel]').checked) delete p.disponivel; else p.disponivel = false;
        p.dias = [...f.querySelectorAll('[name=dia]:checked')].map((x) => Number(x.value));
        f.querySelectorAll('[data-gi]').forEach((ge) => {
          const g = p.grupos[Number(ge.dataset.gi)];
          g.nome = ge.querySelector('[data-g=nome]').value;
          g.tipo = ge.querySelector('[data-g=tipo]').value;
          g.obrigatorio = ge.querySelector('[data-g=obrigatorio]').checked;
          const mx = ge.querySelector('[data-g=max]'); if (mx) g.max = Number(mx.value) || 0;
          ge.querySelectorAll('[data-oi]').forEach((oe) => {
            const o = g.opcoes[Number(oe.dataset.oi)];
            o.nome = oe.querySelector('[data-o=nome]').value;
            o.preco = Number(oe.querySelector('[data-o=preco]').value || 0);
            const de = oe.querySelector('[data-o=preco_de]').value;
            if (de) o.preco_de = Number(de); else delete o.preco_de;
            if (oe.querySelector('[data-o=disponivel]').checked) delete o.disponivel; else o.disponivel = false;
          });
        });
      }

      function desenhar() {
        j.corpo.innerHTML = `<form class="form-produto" style="display:flex;flex-direction:column;gap:14px">
          <div class="grade-form">
            <label class="campo">Nome<input name="nome" required value="${esc(p.nome)}"></label>
            <label class="campo">Categoria<select name="categoria">${m.categorias.map((c) => `<option value="${esc(c.id)}"${c.id === p.categoria ? ' selected' : ''}>${esc(c.nome)}</option>`).join('')}</select></label>
            <label class="campo">Preço base (R$)<input name="preco" type="number" step="0.01" min="0" value="${p.preco ?? 0}"><small>Use 0 quando o preço vem do tamanho escolhido.</small></label>
          </div>
          <label class="campo">Descrição / ingredientes<input name="descricao" value="${esc(p.descricao || '')}"></label>
          <div class="campo"><span>Foto</span>
            <div class="acoes">${p.foto ? `<img src="${esc(p.foto)}" alt="Foto atual" style="width:96px;height:96px;object-fit:cover;border-radius:12px" onerror="this.replaceWith('Foto não encontrada')">` : '<span class="nota">Sem foto</span>'}
              <label class="btn" style="cursor:pointer">${p.foto ? 'Trocar foto' : 'Enviar foto'}<input type="file" accept="image/*" data-foto hidden></label>
              ${p.foto ? '<button type="button" class="btn fraco" data-tira-foto>Remover foto</button>' : ''}</div>
            <small>Foto quadrada ou deitada fica melhor. Ela é reduzida antes de enviar.</small></div>
          <label class="check"><input type="checkbox" name="disponivel"${p.disponivel === false ? '' : ' checked'}> Disponível (desmarque quando acabar)</label>
          <div class="campo"><span>Dias em que aparece (nenhum marcado = todos os dias)</span><div class="dias">${DIAS.map((n, i) =>
            `<label><input type="checkbox" name="dia" value="${i}"${(p.dias || []).includes(i) ? ' checked' : ''}> ${n}</label>`).join('')}</div></div>
          <h3>Opções e adicionais</h3>
          ${(p.grupos || []).map(grupoHtml).join('') || '<p class="nota">Sem opções: o cliente só escolhe a quantidade.</p>'}
          <button type="button" class="btn" data-poe-grupo>+ Grupo de opções</button>
          <div class="acoes"><button class="btn verde grande">Salvar produto</button>
            ${id ? '<button type="button" class="btn" data-duplica>Duplicar</button><button type="button" class="btn fraco" data-apaga>Apagar produto</button>' : ''}</div>
        </form>`;
      }

      j.corpo.addEventListener('change', async (e) => {
        if (e.target.matches('[data-g=tipo]')) { lerTela(); desenhar(); }
        if (e.target.matches('[data-foto]') && e.target.files[0]) {
          lerTela();
          try {
            App.toast('Enviando foto…');
            p.foto = (await App.api('/api/admin/fotos', { dados: await reduzirFoto(e.target.files[0]) })).url;
            desenhar(); App.toast('Foto enviada. Clique em Salvar produto.');
          } catch (err) { App.toast(err.message, true); }
        }
      });
      j.corpo.addEventListener('click', async (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        const ge = b.closest('[data-gi]');
        if (b.hasAttribute('data-tira-foto')) { lerTela(); delete p.foto; desenhar(); }
        else if (b.hasAttribute('data-poe-grupo')) { lerTela(); p.grupos = p.grupos || []; p.grupos.push({ nome: '', tipo: 'unica', obrigatorio: true, opcoes: [{ nome: '', preco: 0 }] }); desenhar(); }
        else if (b.hasAttribute('data-tira-grupo')) { lerTela(); p.grupos.splice(Number(ge.dataset.gi), 1); desenhar(); }
        else if (b.hasAttribute('data-poe-op')) { lerTela(); p.grupos[Number(ge.dataset.gi)].opcoes.push({ nome: '', preco: 0 }); desenhar(); }
        else if (b.dataset.tiraOp != null) { lerTela(); p.grupos[Number(ge.dataset.gi)].opcoes.splice(Number(b.dataset.tiraOp), 1); desenhar(); }
        else if (b.hasAttribute('data-duplica')) {
          lerTela();
          const novo = copia(p); novo.id = ''; novo.nome = p.nome + ' (cópia)';
          m.produtos.splice(m.produtos.findIndex((x) => x.id === id) + 1, 0, novo);
          if (await salvarCardapio(m, 'Produto duplicado')) { j.fechar(); render(); }
        } else if (b.hasAttribute('data-apaga')) {
          if (!confirm('Apagar ' + p.nome + ' do cardápio?')) return;
          m.produtos = m.produtos.filter((x) => x.id !== id);
          if (await salvarCardapio(m, 'Produto apagado')) { j.fechar(); render(); }
        }
      });
      j.corpo.addEventListener('submit', async (e) => {
        e.preventDefault();
        lerTela();
        if (id) m.produtos[m.produtos.findIndex((x) => x.id === id)] = p; else m.produtos.push(p);
        if (await salvarCardapio(m, 'Produto salvo')) { j.fechar(); render(); }
      });
      desenhar();
    }

    // reduz a foto no navegador (até 900 px) antes de enviar
    async function reduzirFoto(arquivo) {
      const img = await createImageBitmap(arquivo);
      const escala = Math.min(1, 900 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * escala); c.height = Math.round(img.height * escala);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      const webp = c.toDataURL('image/webp', 0.82);
      return webp.startsWith('data:image/webp') ? webp : c.toDataURL('image/jpeg', 0.85);
    }

    // ---------------- quadro da Manu (promoções e novidades)
    async function salvarQuadro(lista, msg) {
      try {
        d.quadro = (await App.api('/api/admin/quadro', { quadro: lista }, 'PUT')).quadro;
        App.toast(msg || 'Quadro salvo');
        return true;
      } catch (e) { App.toast(e.message, true); return false; }
    }

    function abaQuadro() {
      const q = d.quadro;
      const quando = (a) => (a.dias.length ? a.dias.map((i) => DIAS[i]).join(', ') : 'Todos os dias');
      return `<section class="cartao"><div class="topo"><div><h2>Quadro da Manu</h2>
            <p>O quadro-negro no topo do cardápio. Coloque promoções e novidades com foto; quando tem mais de um, eles passam sozinhos.</p></div>
          <button class="btn verde grande" data-aviso="">+ Novo aviso</button></div>
        <div class="avisos">
        ${q.map((a, i) => `<article class="aviso-quadro${a.ativo ? '' : ' inativo'}">
          ${a.foto ? `<img src="${esc(a.foto)}" alt="" onerror="this.remove()">` : '<span class="aviso-sem-foto">sem foto</span>'}
          <div><span class="aviso-tipo ${a.tipo}">${a.tipo === 'novidade' ? 'Novidade' : 'Promoção'}</span>${a.ativo ? '' : ' <span class="selo-off">pausado</span>'}
            <b>${esc(a.titulo)}</b>${a.texto ? `<small>${esc(a.texto)}</small>` : ''}
            <small>${a.preco ? esc(a.preco) + ' · ' : ''}${quando(a)}</small></div>
          <div class="acoes"><button class="btn" data-aviso="${i}">Editar</button>
            <button class="btn fraco" data-aviso-ativo="${i}">${a.ativo ? 'Pausar' : 'Mostrar'}</button>
            <button class="btn fraco" data-aviso-sobe="${i}" aria-label="Mostrar antes"${i ? '' : ' disabled'}>↑</button></div>
        </article>`).join('') || '<p class="nota">Nenhum aviso ainda. Sem avisos, o quadro mostra o combo do dia ou o recado da aba Loja.</p>'}
        </div>
        <p class="nota">Com foto, o cartaz ocupa o quadro-negro inteiro e o cliente toca nele para pedir o produto escolhido (sem produto, o toque mostra a foto grande). Sem foto, o quadro mostra o título, o texto e o preço escritos a giz. Cartaz em pé fica melhor. Os combos do dia entram sozinhos, no dia deles.</p></section>`;
    }

    function editarAviso(i) {
      const lista = copia(d.quadro);
      const a = i === '' ? { tipo: 'promocao', titulo: '', texto: '', preco: '', foto: '', produto: '', dias: [], ativo: true } : lista[Number(i)];
      const j = App.janela(i === '' ? 'Novo aviso no quadro' : 'Editar aviso', '<div data-corpo></div>');
      const corpo = j.querySelector('[data-corpo]');
      const ler = () => {
        const f = corpo.querySelector('form');
        Object.assign(a, { titulo: f.titulo.value, texto: f.texto.value, preco: f.preco.value, produto: f.produto.value, ativo: f.ativo.checked,
          dias: [...f.querySelectorAll('[name=dia]:checked')].map((x) => Number(x.value)) });
      };
      const desenhar = () => {
        corpo.innerHTML = `<form style="display:flex;flex-direction:column;gap:14px">
          <div class="campo"><span>Tipo</span><div class="chips">${[['promocao', 'Promoção'], ['novidade', 'Novidade']].map(([v, n]) =>
            `<button type="button" class="chip" data-tipo="${v}" aria-pressed="${a.tipo === v}">${n}</button>`).join('')}</div></div>
          <label class="campo">Título<input name="titulo" required maxlength="50" value="${esc(a.titulo)}" placeholder="Ex.: Açaí 500 ml + 3 adicionais"></label>
          <label class="campo">Texto (opcional)<input name="texto" maxlength="140" value="${esc(a.texto)}" placeholder="Ex.: Só neste fim de semana!"></label>
          <label class="campo">Preço ou destaque (opcional)<input name="preco" maxlength="30" value="${esc(a.preco)}" placeholder="Ex.: R$ 19,90 ou Leve 2, pague 1"></label>
          <div class="campo"><span>Foto da promoção</span>
            <div class="acoes">${a.foto ? `<img src="${esc(a.foto)}" alt="Foto atual" style="width:128px;height:96px;object-fit:cover;border-radius:10px">` : '<span class="nota">Sem foto</span>'}
              <label class="btn" style="cursor:pointer">${a.foto ? 'Trocar foto' : 'Enviar foto'}<input type="file" accept="image/*" data-foto hidden></label>
              ${a.foto ? '<button type="button" class="btn fraco" data-tira-foto>Remover foto</button>' : ''}</div>
            <small>Pode ser o cartaz da promoção (em pé fica melhor): ele ocupa o quadro inteiro. Ela é reduzida antes de enviar.</small></div>
          <label class="campo">Ao tocar, abre o produto (opcional)<select name="produto"><option value="">Sem botão</option>
            ${d.cardapio.produtos.map((p) => `<option value="${esc(p.id)}"${a.produto === p.id ? ' selected' : ''}>${esc(p.nome)}</option>`).join('')}</select></label>
          <div class="campo"><span>Dias em que aparece (nenhum marcado = todos os dias)</span><div class="dias">${DIAS.map((n, k) =>
            `<label><input type="checkbox" name="dia" value="${k}"${a.dias.includes(k) ? ' checked' : ''}> ${n}</label>`).join('')}</div></div>
          <label class="check"><input type="checkbox" name="ativo"${a.ativo ? ' checked' : ''}> Mostrar no quadro</label>
          <div class="acoes"><button class="btn verde grande">Salvar aviso</button>
            ${i === '' ? '' : '<button type="button" class="btn fraco" data-apaga>Apagar aviso</button>'}</div></form>`;
      };
      corpo.addEventListener('change', async (e) => {
        if (!e.target.matches('[data-foto]') || !e.target.files[0]) return;
        ler();
        try {
          App.toast('Enviando foto…');
          a.foto = (await App.api('/api/admin/fotos', { dados: await reduzirFoto(e.target.files[0]) })).url;
          desenhar(); App.toast('Foto enviada. Clique em Salvar aviso.');
        } catch (err) { App.toast(err.message, true); }
      });
      corpo.addEventListener('click', async (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        if (b.dataset.tipo) { ler(); a.tipo = b.dataset.tipo; desenhar(); }
        else if (b.hasAttribute('data-tira-foto')) { ler(); a.foto = ''; desenhar(); }
        else if (b.hasAttribute('data-apaga')) {
          if (!confirm('Apagar o aviso "' + a.titulo + '"?')) return;
          lista.splice(Number(i), 1);
          if (await salvarQuadro(lista, 'Aviso apagado')) { j.fechar(); render(); }
        }
      });
      corpo.addEventListener('submit', async (e) => {
        e.preventDefault();
        ler();
        if (i === '') lista.unshift(a);
        if (await salvarQuadro(lista, 'Aviso salvo. Já aparece no quadro do cardápio.')) { j.fechar(); render(); }
      });
      desenhar();
    }

    // ---------------- mesas
    function abaMesas() {
      return `<section class="cartao"><div class="topo"><div><h2>Mesas</h2><p>Cada mesa tem um QR code. O cliente aponta a câmera e pede sem chamar o garçom.</p></div>
          <div class="controles"><a class="btn principal" href="/equipe/qr.html" target="_blank" rel="noopener">Imprimir QR codes</a></div></div>
        <form class="acoes" data-form="varias">
          <label class="campo">Criar da mesa<input name="de" type="number" min="1" value="${d.mesas.length + 1}" style="width:110px"></label>
          <label class="campo">até a mesa<input name="ate" type="number" min="1" value="${d.mesas.length + 10}" style="width:110px"></label>
          <button class="btn verde" style="align-self:flex-end">Criar mesas</button>
        </form>
        <form class="acoes" data-form="uma">
          <label class="campo">Ou uma mesa com nome<input name="nome" placeholder="Ex.: Varanda 1"></label>
          <button class="btn" style="align-self:flex-end">Adicionar</button>
        </form>
        <div class="rolagem"><table class="tabela"><thead><tr><th>Mesa</th><th>Situação</th><th></th></tr></thead><tbody>
        ${d.mesas.map((m) => `<tr><td><b>${esc(m.nome)}</b></td><td>${m.ativa ? 'Ativa' : '<span class="selo-off">desativada</span>'}</td>
          <td><div class="acoes"><button class="btn" data-mesa-nome="${m.id}">Renomear</button>
            <button class="btn" data-mesa-ativa="${m.id}">${m.ativa ? 'Desativar' : 'Ativar'}</button>
            <button class="btn fraco" data-mesa-qr="${m.id}">Trocar QR</button>
            <a class="btn fraco" href="/m/${esc(m.token)}" target="_blank" rel="noopener">Abrir</a></div></td></tr>`).join('')}
        </tbody></table></div>
        <p class="nota">"Trocar QR" invalida o QR antigo daquela mesa (use se alguém levar foto do QR para pedir de fora). Depois imprima de novo.</p>
      </section>`;
    }

    // ---------------- clientes (cadastro automático pelos pedidos)
    let clientes = null, buscaCli = '';
    async function carregarClientes() {
      try { clientes = (await App.api('/api/admin/clientes?busca=' + encodeURIComponent(buscaCli))).clientes; }
      catch (e) { clientes = []; App.toast(e.message, true); }
      if (aba === 'clientes') render();
    }
    function abaClientes() {
      if (!clientes) { carregarClientes(); return '<section class="cartao"><p class="nota">Carregando clientes…</p></section>'; }
      const data = (d) => (d ? new Date(d).toLocaleDateString('pt-BR') : '—');
      return `<section class="cartao"><div class="topo"><div><h2>Clientes</h2>
            <p>${clientes.length} cliente(s). Todo pedido com WhatsApp (site, Manu, caixa) cadastra ou atualiza o cliente sozinho.</p></div>
          <div class="controles"><button class="btn" data-cli-csv>Baixar planilha</button></div></div>
        <form class="acoes" data-form="busca-cli"><label class="campo" style="flex:1">Buscar por nome ou WhatsApp<input name="busca" value="${esc(buscaCli)}" placeholder="Ex.: Ana ou 9988"></label>
          <button class="btn" style="align-self:flex-end">Buscar</button></form>
        <div class="rolagem"><table class="tabela"><thead><tr><th>Cliente</th><th>Último endereço</th><th class="num">Pedidos</th><th class="num">Gasto</th><th>Último pedido</th><th>Mais pede</th><th></th></tr></thead><tbody>
        ${clientes.map((c) => `<tr><td><b>${esc(c.nome || 'Sem nome')}</b><br><a href="https://wa.me/${esc(c.telefone)}" target="_blank" rel="noopener">${esc(App.fone(c.telefone))}</a></td>
          <td>${esc(c.endereco || '—')}</td><td class="num">${c.pedidos}</td><td class="num">${brl(c.gasto)}</td>
          <td>${data(c.ultimo_pedido)}<br><small class="nota">cliente desde ${data(c.criado_em)}</small></td><td>${esc(c.preferido || '—')}</td>
          <td><button class="btn fraco" data-cli-apagar="${esc(c.chave)}">Apagar</button></td></tr>`).join('') || '<tr><td colspan="7" class="nota">Nenhum cliente ainda. Eles aparecem aqui sozinhos a cada pedido.</td></tr>'}
        </tbody></table></div>
        <p class="nota">LGPD: use os dados só para atender e avisar o cliente. Se ele pedir, clique em <b>Apagar</b>: o cadastro some e os pedidos antigos ficam sem nome, telefone e endereço.</p></section>`;
    }
    function baixarClientesCsv() {
      const cel = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
      const linhas = [['Nome', 'WhatsApp', 'Último endereço', 'Pedidos', 'Gasto', 'Último pedido', 'Cliente desde', 'Mais pede'].map(cel).join(';')]
        .concat(clientes.map((c) => [c.nome, c.telefone, c.endereco, c.pedidos, String(Number(c.gasto).toFixed(2)).replace('.', ','),
          c.ultimo_pedido ? new Date(c.ultimo_pedido).toLocaleDateString('pt-BR') : '', new Date(c.criado_em).toLocaleDateString('pt-BR'), c.preferido].map(cel).join(';')));
      if (window.__demo) { App.toast('Na demonstração o download fica desligado.'); return; }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob(['\ufeff' + linhas.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
      a.download = 'clientes-naturalle.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    }

    // ---------------- funcionários
    const SECOES = {
      admin: 'Tudo: cardápio, mesas, funcionários, loja e relatórios.',
      pedidos: 'Quadro de pedidos: confirmar os do site, saiu para entrega, confirmar Pix.',
      caixa: 'Novo pedido de balcão/telefone, fechar conta das mesas, resumo do dia e relatórios.',
      cozinha: 'Tela da cozinha com os pedidos confirmados e o botão Pronto.',
      garcom: 'Mapa das mesas, lançar pedido na mesa, confirmar pedidos do QR, servido.',
      entregador: 'Tela Entregas no celular: pega o pedido pronto, maquininha/troco e confirma o pagamento.',
    };
    // funções prontas: marcam as seções de uma vez
    const FUNCOES = [['Administrador', ['admin']], ['Atendente / caixa', ['pedidos', 'caixa']], ['Cozinheiro', ['cozinha']], ['Garçom', ['garcom']], ['Entregador', ['entregador']]];
    const fone = (t) => { const n = String(t || '').replace(/^55/, ''); return n.length >= 10 ? `(${n.slice(0, 2)}) ${n.slice(2, -4)}-${n.slice(-4)}` : n; };

    function abaEquipe() {
      const ativos = d.usuarios.filter((u) => u.ativo);
      const conta = (p) => ativos.filter((u) => u.permissoes.includes(p)).length;
      return `<section class="cartao"><div class="topo"><div><h2>Funcionários</h2>
            <p>${ativos.length} ativo(s) · ${conta('cozinha')} na cozinha · ${conta('garcom')} garçom · ${conta('entregador')} entregador · ${ativos.filter((u) => u.permissoes.some((p) => p === 'pedidos' || p === 'caixa')).length} no atendimento/caixa</p></div>
          <button class="btn verde grande" data-usuario="">+ Cadastrar funcionário</button></div>
        <div class="funcionarios">
        ${d.usuarios.map((u) => `<article class="funcionario${u.ativo ? '' : ' inativo'}">
          <span class="avatar" aria-hidden="true">${esc((u.nome.trim()[0] || '?').toUpperCase())}</span>
          <div class="func-dados"><b>${esc(u.nome)}</b>${u.ativo ? '' : ' <span class="selo-off">desativado</span>'}${u.id === App.usuario.id ? ' <span class="selo-voce">você</span>' : ''}
            <small>Login: <b>${esc(u.login)}</b>${u.telefone ? ` · ${esc(fone(u.telefone))}` : ''}</small>
            <div class="func-secoes">${u.permissoes.map((x) => `<span>${esc(d.permissoes[x] || x)}</span>`).join('')}</div></div>
          <div class="func-acoes"><button class="btn" data-usuario="${u.id}">Editar</button>
            ${u.id === App.usuario.id ? '' : `<button class="btn fraco" data-ativar="${u.id}">${u.ativo ? 'Desativar' : 'Reativar'}</button>`}</div>
        </article>`).join('') || '<p class="nota">Nenhum funcionário cadastrado.</p>'}
        </div>
        <p class="nota">Cada funcionário entra pela tela de painéis com o próprio login e só abre as seções marcadas para ele. Quando alguém sair da equipe, use <b>Desativar</b>: o acesso é cortado na hora e o histórico de pedidos continua.</p></section>`;
    }

    async function salvarUsuario(u, extra) {
      await App.api('/api/admin/usuarios', { id: u.id || null, nome: u.nome, login: u.login, telefone: u.telefone || '', senha: '', permissoes: u.permissoes, ativo: u.ativo, ...extra });
    }

    function editarUsuario(id) {
      const u = id ? d.usuarios.find((x) => x.id === Number(id)) : { nome: '', login: '', telefone: '', permissoes: [], ativo: true };
      const j = App.janela(id ? 'Editar ' + u.nome : 'Cadastrar funcionário', `<form style="display:flex;flex-direction:column;gap:14px">
        <div class="grade-form">
          <label class="campo">Nome<input name="nome" required value="${esc(u.nome)}" autocomplete="off"></label>
          <label class="campo">WhatsApp (opcional)<input name="telefone" inputmode="tel" value="${esc(fone(u.telefone))}" placeholder="(67) 99999-0000"></label>
          <label class="campo">Login<input name="login" required autocapitalize="none" autocomplete="off" value="${esc(u.login)}"><small>Sem espaços. Ex.: joao, maria.caixa</small></label>
          <label class="campo">${id ? 'Nova senha (deixe vazio para manter)' : 'Senha'}<input name="senha" type="password" autocomplete="new-password"${id ? '' : ' required'} minlength="6"><small>Pelo menos 6 caracteres.</small></label>
        </div>
        <div class="campo"><span>Função</span><div class="chips">${FUNCOES.map(([n, ps], i) => `<button type="button" class="chip" data-funcao="${i}" aria-pressed="${ps.length === u.permissoes.length && ps.every((p) => u.permissoes.includes(p))}">${n}</button>`).join('')}</div>
          <small>Escolha a função para marcar as seções, ou marque as seções uma a uma abaixo.</small></div>
        <fieldset class="secoes-func"><legend>Seções liberadas</legend>
          ${Object.entries(d.permissoes).map(([k, n]) => `<label class="secao-func"><input type="checkbox" name="perm" value="${k}"${u.permissoes.includes(k) ? ' checked' : ''}><span><b>${esc(n)}</b><small>${SECOES[k] || ''}</small></span></label>`).join('')}
        </fieldset>
        <label class="check"><input type="checkbox" name="ativo"${u.ativo ? ' checked' : ''}> Ativo (desmarque quando a pessoa sair da equipe)</label>
        <p class="erro" data-msg hidden></p>
        <button class="btn verde grande">${id ? 'Salvar' : 'Cadastrar funcionário'}</button></form>`);
      const f = j.querySelector('form');
      const marcarFuncao = () => {
        const marc = [...f.querySelectorAll('[name=perm]:checked')].map((x) => x.value);
        f.querySelectorAll('[data-funcao]').forEach((c) => { const ps = FUNCOES[c.dataset.funcao][1]; c.setAttribute('aria-pressed', ps.length === marc.length && ps.every((p) => marc.includes(p))); });
      };
      f.addEventListener('click', (e) => {
        const c = e.target.closest('[data-funcao]');
        if (!c) return;
        const ps = FUNCOES[c.dataset.funcao][1];
        f.querySelectorAll('[name=perm]').forEach((x) => { x.checked = ps.includes(x.value); });
        marcarFuncao();
      });
      f.addEventListener('change', marcarFuncao);
      // login sugerido a partir do nome
      if (!id) f.nome.addEventListener('input', () => { if (!f.login.dataset.mexeu) f.login.value = f.nome.value.trim().split(/\s+/)[0].normalize('NFD').replace(/[^\w.-]/g, '').toLowerCase(); });
      f.login.addEventListener('input', () => { f.login.dataset.mexeu = '1'; });
      f.addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
          await App.api('/api/admin/usuarios', {
            id: id || null, nome: f.nome.value, login: f.login.value, telefone: f.telefone.value, senha: f.senha.value,
            permissoes: [...f.querySelectorAll('[name=perm]:checked')].map((x) => x.value), ativo: f.ativo.checked,
          });
          j.fechar(); App.toast(id ? 'Funcionário salvo' : 'Funcionário cadastrado. Ele já pode entrar com o login ' + f.login.value.trim().toLowerCase());
          await carregar(); render();
        } catch (err) { const p = j.querySelector('[data-msg]'); p.textContent = err.message; p.hidden = false; }
      });
    }

    // ---------------- loja
    function abaLoja() {
      const l = d.loja;
      const ch = (k, txt) => `<label class="check"><input type="checkbox" name="${k}"${l[k] ? ' checked' : ''}> ${txt}</label>`;
      return `<form class="cartao" data-form="loja">
        <h2>Loja</h2>
        <div class="grade-form">
          <label class="campo">Nome<input name="nome" value="${esc(l.nome)}"></label>
          <label class="campo">Frase do topo<input name="frase" value="${esc(l.frase || '')}"></label>
          <label class="campo">WhatsApp da loja<input name="whatsapp" value="${esc(l.whatsapp || '')}" inputmode="tel"></label>
          <label class="campo">Recado no quadro da Manu<input name="recado" maxlength="140" value="${esc(l.recado || '')}" placeholder="Ex.: Hoje tem açaí em dobro!"><small>Aparece quando não tem combo do dia nem aviso na aba Quadro da Manu.</small></label>
          <label class="campo">Endereço do site<input name="url_publica" value="${esc(l.url_publica || '')}" placeholder="https://pedidos.naturallemania.com.br"><small>Usado nos QR codes. Vazio = o endereço atual.</small></label>
        </div>
        <h2 style="margin-top:8px">Cadastro da loja</h2>
        <p class="nota">Aparece no rodapé do cardápio, no cupom impresso e a Manu usa para informar o endereço de retirada.</p>
        <div class="grade-form">
          <label class="campo">Razão social<input name="razao_social" value="${esc(l.razao_social || '')}" placeholder="Nome registrado da empresa"></label>
          <label class="campo">CNPJ ou CPF<input name="cnpj" value="${esc(l.cnpj || '')}" inputmode="numeric" placeholder="00.000.000/0001-00"></label>
          <label class="campo">Responsável<input name="responsavel" value="${esc(l.responsavel || '')}"></label>
          <label class="campo">Telefone fixo (opcional)<input name="telefone" value="${esc(l.telefone || '')}" inputmode="tel"></label>
          <label class="campo">E-mail<input name="email" type="email" value="${esc(l.email || '')}"></label>
          <label class="campo">Instagram<input name="instagram" value="${esc(l.instagram ? '@' + l.instagram : '')}" placeholder="@naturallemania"></label>
          <label class="campo">Endereço (rua e número)<input name="endereco" value="${esc(l.endereco || '')}" placeholder="Rua Exemplo, 123"></label>
          <label class="campo">Bairro<input name="bairro" value="${esc(l.bairro || '')}"></label>
          <label class="campo">Cidade<input name="cidade" value="${esc(l.cidade || 'Campo Grande')}"></label>
          <label class="campo">UF<input name="uf" maxlength="2" value="${esc(l.uf || 'MS')}"></label>
          <label class="campo">CEP<input name="cep" inputmode="numeric" value="${esc(l.cep || '')}"></label>
          <label class="campo">Ponto de referência<input name="referencia" value="${esc(l.referencia || '')}" placeholder="Ex.: em frente à praça"></label>
          <label class="campo">Chave Pix<input name="pix_chave" value="${esc(l.pix_chave || '')}" placeholder="CPF, CNPJ, celular, e-mail ou aleatória"><small>Aparece para o cliente logo depois do pedido e a Manu manda no WhatsApp.</small></label>
          <label class="campo">Nome do recebedor do Pix<input name="pix_nome" value="${esc(l.pix_nome || '')}" placeholder="O nome que o banco mostra"></label>
        </div>
        <h2 style="margin-top:8px">Funcionamento</h2>
        ${ch('delivery', 'Fazemos entrega')}
        ${ch('retirada', 'Cliente pode retirar no balcão')}
        ${ch('mesa_auto_confirmar', 'Pedido feito pelo QR da mesa vai direto para a cozinha (sem o garçom confirmar)')}
        <button class="btn verde grande">Salvar</button>
      </form>`;
    }

    // ---------------- horário de funcionamento e taxas
    function abaHorario() {
      const l = d.loja, h = window.Horario.lista(l.horarios), auto = !!l.horario_automatico;
      const NOMES = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
      return `<form class="cartao" data-form="horario">
        <div class="status-loja ${d.agora.aberta ? 'aberta' : 'fechada'}"><b>${d.agora.aberta ? 'Aberto agora' : 'Fechado agora'}</b>
          <span>${esc(d.agora.texto || '')}${d.agora.aberta ? ' · o cardápio está recebendo pedidos.' : ' · o cliente vê o cardápio, mas não consegue pedir.'}</span></div>
        <h2>Horário de funcionamento</h2>
        <label class="check"><input type="checkbox" name="horario_automatico" data-auto${auto ? ' checked' : ''}> <b>Abrir e fechar sozinho pelo horário</b></label>
        <div class="rolagem" data-tabela-horario${auto ? '' : ' hidden'}><table class="tabela horarios"><thead><tr><th>Dia</th><th>Abre?</th><th>Abre às</th><th>Fecha às</th></tr></thead><tbody>
          ${h.map((x, i) => `<tr><td><b>${NOMES[i]}</b></td>
            <td><label class="check" style="min-height:0"><input type="checkbox" name="aberto${i}"${x.aberto ? ' checked' : ''}> Abre</label></td>
            <td><input type="time" name="abre${i}" value="${esc(x.abre)}"></td><td><input type="time" name="fecha${i}" value="${esc(x.fecha)}"></td></tr>`).join('')}
        </tbody></table>
        <button type="button" class="btn" data-copia-horario>Usar o horário de segunda em todos os dias</button>
        <p class="nota">Se fecha depois da meia-noite, coloque a hora normalmente (ex.: abre 18:30, fecha 00:30).</p></div>
        <label class="campo" data-manual${auto ? ' hidden' : ''}>Horário que aparece no cardápio<input name="horario" value="${esc(l.horario || '')}" placeholder="Ex.: Desde 18h30"></label>
        <label class="check"><input type="checkbox" name="aberta"${l.aberta ? ' checked' : ''}> Recebendo pedidos pelo site ${auto ? '(desmarque para fechar na hora, mesmo dentro do horário)' : '(desmarque para fechar)'}</label>
        <h2 style="margin-top:8px">Taxas</h2>
        <div class="grade-form">
          <label class="campo">Taxa de entrega (R$)<input name="taxa_entrega" type="number" step="0.5" min="0" value="${Number(l.taxa_entrega) || 0}"><small>Somada em todo pedido de entrega.</small></label>
          <label class="campo">Acréscimo do cartão (R$)<input name="taxa_cartao" type="number" step="0.5" min="0" value="${l.taxa_cartao ?? 1}"><small>Taxa da maquininha, somada quando o cliente paga no cartão. Use 0 para não cobrar.</small></label>
        </div>
        <button class="btn verde grande">Salvar horário e taxas</button>
      </form>`;
    }

    // ---------------- impressora
    function abaImpressora() {
      return `<section class="cartao"><div class="topo"><div><h2>Impressora térmica</h2>
          <p>Cada computador ou tablet configura a impressora que está ligada nele.</p></div>
          <button class="btn verde" data-config-impressora>Configurar a impressora deste aparelho</button></div>
        <ol class="passos">
          <li><b>Instale a impressora no computador</b> (Epson, Elgin, Bematech, Knup…) com o programa do fabricante e deixe ela como <b>impressora padrão</b>.</li>
          <li>Entre na área da equipe nesse computador e clique em <b>Impressora</b> (no menu da esquerda). Escolha o papel (58 ou 80 mm), o que imprimir e se imprime sozinho.</li>
          <li>Clique em <b>Imprimir teste</b>. Na primeira vez, na janela de impressão, escolha a térmica, margens <b>Nenhuma</b> e desmarque <b>Cabeçalhos e rodapés</b>.</li>
          <li><b>Para imprimir sem aparecer a janela</b> (recomendado na cozinha): no Windows, clique com o botão direito no atalho do Google Chrome › Propriedades › no campo <b>Destino</b>, acrescente no final, depois das aspas, um espaço e <code>--kiosk-printing</code>. Feche todo o Chrome e abra por esse atalho.</li>
        </ol>
        <p class="nota">Dica: no computador da cozinha, ligue "Quando o pedido for para a cozinha". No caixa, se quiser o cupom do cliente, ligue "Cupom do cliente" e imprima pelo botão <b>Imprimir</b> de cada pedido.</p>
      </section>`;
    }

    // ---------------- geral
    function render() {
      const corpo = { clientes: abaClientes, cardapio: abaCardapio, quadro: abaQuadro, horario: abaHorario, mesas: abaMesas, equipe: abaEquipe, loja: abaLoja, impressora: abaImpressora }[aba]();
      const scroll = window.scrollY;
      el.innerHTML = `<div class="topo"><div><h1>Administração</h1></div>
        <nav class="abas-admin" aria-label="Partes da administração">${ABAS.map(([a, n]) => `<a class="chip aba-adm" href="#/admin/${a}" aria-pressed="${aba === a}"${aba === a ? ' aria-current="page"' : ''}>${n}</a>`).join('')}</nav></div>
        ${corpo}`;
      window.scrollTo(0, scroll);
    }

    el.addEventListener('click', async (e) => {
      const b = e.target.closest('button');
      if (!b || b.closest('.janela')) return;
      if (b.hasAttribute('data-config-impressora')) App.configurarImpressora();
      else if (b.hasAttribute('data-copia-horario')) {
        const f = b.form;
        for (let i = 0; i < 7; i++) if (i !== 1) { f['aberto' + i].checked = f.aberto1.checked; f['abre' + i].value = f.abre1.value; f['fecha' + i].value = f.fecha1.value; }
        App.toast('Horário de segunda copiado. Clique em Salvar.');
      }
      else if (b.hasAttribute('data-nova-cat')) editarCategoria(null);
      else if (b.dataset.catEdita != null) editarCategoria(Number(b.dataset.catEdita));
      else if (b.dataset.catSobe != null) {
        const m = copia(d.cardapio); const i = Number(b.dataset.catSobe);
        [m.categorias[i - 1], m.categorias[i]] = [m.categorias[i], m.categorias[i - 1]];
        if (await salvarCardapio(m, 'Ordem salva')) render();
      } else if (b.dataset.novoProd) editarProduto(null, b.dataset.novoProd);
      else if (b.dataset.edita) editarProduto(b.dataset.edita);
      else if (b.dataset.usuario != null) editarUsuario(b.dataset.usuario);
      else if (b.dataset.aviso != null) editarAviso(b.dataset.aviso);
      else if (b.hasAttribute('data-cli-csv')) baixarClientesCsv();
      else if (b.dataset.cliApagar) {
        const c = clientes.find((x) => x.chave === b.dataset.cliApagar);
        if (!confirm(`Apagar ${c.nome || 'este cliente'}? O cadastro some e os pedidos antigos dele ficam sem nome, telefone e endereço. Não dá para desfazer.`)) return;
        try { await App.api('/api/admin/clientes/' + c.chave + '/apagar', {}); App.toast('Cliente apagado'); await carregarClientes(); }
        catch (err) { App.toast(err.message, true); }
      }
      else if (b.dataset.avisoAtivo) {
        const lista = copia(d.quadro); const a = lista[Number(b.dataset.avisoAtivo)];
        a.ativo = !a.ativo;
        if (await salvarQuadro(lista, a.ativo ? 'Aviso de volta no quadro' : 'Aviso pausado')) render();
      } else if (b.dataset.avisoSobe) {
        const lista = copia(d.quadro); const k = Number(b.dataset.avisoSobe);
        [lista[k - 1], lista[k]] = [lista[k], lista[k - 1]];
        if (await salvarQuadro(lista, 'Ordem salva')) render();
      }
      else if (b.dataset.ativar) {
        const u = d.usuarios.find((x) => x.id === Number(b.dataset.ativar));
        if (u.ativo && !confirm('Desativar ' + u.nome + '? O acesso dele é cortado na hora.')) return;
        try { await salvarUsuario(u, { ativo: !u.ativo }); App.toast(u.nome + (u.ativo ? ' desativado' : ' reativado')); await carregar(); render(); }
        catch (err) { App.toast(err.message, true); }
      }
      else if (b.dataset.mesaNome) {
        const m = d.mesas.find((x) => x.id === Number(b.dataset.mesaNome));
        const nome = prompt('Novo nome da mesa', m.nome);
        if (!nome) return;
        await acaoMesa({ id: m.id, nome, ativa: m.ativa, ordem: m.ordem });
      } else if (b.dataset.mesaAtiva) {
        const m = d.mesas.find((x) => x.id === Number(b.dataset.mesaAtiva));
        await acaoMesa({ id: m.id, nome: m.nome, ativa: !m.ativa, ordem: m.ordem });
      } else if (b.dataset.mesaQr) {
        if (!confirm('Trocar o QR code desta mesa? O QR impresso hoje vai parar de funcionar.')) return;
        await acaoMesa(null, '/api/admin/mesas/' + b.dataset.mesaQr + '/novo-qr');
      }
    });

    async function acaoMesa(corpo, url = '/api/admin/mesas') {
      try { await App.api(url, corpo || {}); await carregar(); render(); App.toast('Mesas atualizadas'); } catch (err) { App.toast(err.message, true); }
    }

    el.addEventListener('change', async (e) => {
      if (e.target.hasAttribute('data-auto')) {
        el.querySelector('[data-tabela-horario]').hidden = !e.target.checked;
        el.querySelector('[data-manual]').hidden = e.target.checked;
        return;
      }
      if (!e.target.dataset.disp) return;
      const m = copia(d.cardapio);
      const p = m.produtos.find((x) => x.id === e.target.dataset.disp);
      if (e.target.checked) delete p.disponivel; else p.disponivel = false;
      if (await salvarCardapio(m, e.target.checked ? p.nome + ' disponível' : p.nome + ' marcado como esgotado')) render();
    });

    el.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      try {
        if (f.dataset.form === 'busca-cli') { buscaCli = f.busca.value.trim(); await carregarClientes(); return; }
        if (f.dataset.form === 'varias') await acaoMesa({ de: f.de.value, ate: f.ate.value }, '/api/admin/mesas/varias');
        else if (f.dataset.form === 'uma') await acaoMesa({ nome: f.nome.value });
        else if (f.dataset.form === 'loja') {
          const fd = new FormData(f);
          const loja = Object.fromEntries(['nome', 'frase', 'whatsapp', 'url_publica', 'recado', 'razao_social', 'cnpj', 'responsavel', 'telefone', 'email',
            'instagram', 'endereco', 'bairro', 'cidade', 'uf', 'cep', 'referencia', 'pix_chave', 'pix_nome'].map((k) => [k, fd.get(k)]));
          for (const k of ['delivery', 'retirada', 'mesa_auto_confirmar']) loja[k] = f[k].checked;
          Object.assign(d, await App.api('/api/admin/loja', { loja }, 'PUT'));
          App.toast('Loja salva'); render();
        } else if (f.dataset.form === 'horario') {
          const fd = new FormData(f);
          const loja = {
            aberta: f.aberta.checked, horario_automatico: f.horario_automatico.checked,
            horarios: DIAS.map((_, i) => ({ aberto: f['aberto' + i].checked, abre: fd.get('abre' + i), fecha: fd.get('fecha' + i) })),
            taxa_entrega: fd.get('taxa_entrega'), taxa_cartao: fd.get('taxa_cartao'),
          };
          if (f.horario) loja.horario = fd.get('horario');
          Object.assign(d, await App.api('/api/admin/loja', { loja }, 'PUT'));
          App.toast('Horário e taxas salvos'); render();
        }
      } catch (err) { App.toast(err.message, true); }
    });

    carregar().then(render).catch((e) => { el.innerHTML = `<p class="erro">${esc(e.message)}</p>`; });
  },
};
