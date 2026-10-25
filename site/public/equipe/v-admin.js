// Administração: cardápio, mesas e QR codes, equipe e permissões, dados da loja.
App.views.admin = {
  montar(el, params) {
    const { esc, brl } = App;
    const ABAS = [['cardapio', 'Cardápio'], ['mesas', 'Mesas e QR code'], ['equipe', 'Equipe'], ['loja', 'Loja'], ['impressora', 'Impressora']];
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

    // ---------------- equipe
    function abaEquipe() {
      return `<section class="cartao"><div class="topo"><div><h2>Equipe</h2><p>Cada pessoa entra com o próprio login e só vê as seções liberadas.</p></div>
          <button class="btn verde" data-usuario="">+ Funcionário</button></div>
        <div class="rolagem"><table class="tabela"><thead><tr><th>Nome</th><th>Login</th><th>Seções</th><th></th></tr></thead><tbody>
        ${d.usuarios.map((u) => `<tr><td><b>${esc(u.nome)}</b>${u.ativo ? '' : ' <span class="selo-off">desativado</span>'}</td><td>${esc(u.login)}</td>
          <td>${u.permissoes.map((x) => esc(d.permissoes[x] || x)).join(', ')}</td>
          <td><button class="btn" data-usuario="${u.id}">Editar</button></td></tr>`).join('')}
        </tbody></table></div></section>
        <section class="cartao"><h2>O que cada seção libera</h2><ul class="nota">
          <li><b>Administrador</b>: tudo, inclusive cardápio, mesas, equipe e configurações.</li>
          <li><b>Pedidos e delivery</b>: quadro de pedidos, confirmar pedidos do site, saiu para entrega, confirmar Pix, novo pedido.</li>
          <li><b>Cozinha</b>: tela da cozinha com os pedidos confirmados e o botão Pronto.</li>
          <li><b>Garçom</b>: mapa das mesas, lançar pedido na mesa, confirmar pedidos do QR, marcar servido.</li>
          <li><b>Entregador</b>: tela Entregas no celular: pega os pedidos prontos, vê o que levar (maquininha, troco), abre o mapa e confirma o pagamento na entrega.</li>
          <li><b>Caixa / balcão</b>: novo pedido de balcão/telefone/entrega, fechar conta das mesas, resumo do dia.</li></ul></section>`;
    }

    function editarUsuario(id) {
      const u = id ? d.usuarios.find((x) => x.id === Number(id)) : { nome: '', login: '', permissoes: [], ativo: true };
      const j = App.janela(id ? 'Editar ' + u.nome : 'Novo funcionário', `<form style="display:flex;flex-direction:column;gap:12px">
        <div class="grade-form">
          <label class="campo">Nome<input name="nome" required value="${esc(u.nome)}"></label>
          <label class="campo">Login<input name="login" required autocapitalize="none" value="${esc(u.login)}"><small>Sem espaços. Ex.: joao, maria.caixa</small></label>
          <label class="campo">${id ? 'Nova senha (deixe vazio para manter)' : 'Senha'}<input name="senha" type="password" autocomplete="new-password"${id ? '' : ' required'} minlength="6"></label>
        </div>
        <fieldset class="campo" style="border:0;padding:0;margin:0"><legend>Seções liberadas</legend>
          ${Object.entries(d.permissoes).map(([k, n]) => `<label class="check"><input type="checkbox" name="perm" value="${k}"${u.permissoes.includes(k) ? ' checked' : ''}> ${esc(n)}</label>`).join('')}
        </fieldset>
        <label class="check"><input type="checkbox" name="ativo"${u.ativo ? ' checked' : ''}> Ativo (desmarque quando a pessoa sair da equipe)</label>
        <p class="erro" data-msg hidden></p>
        <button class="btn verde grande">Salvar</button></form>`);
      j.querySelector('form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const f = e.target;
        try {
          await App.api('/api/admin/usuarios', {
            id: id || null, nome: f.nome.value, login: f.login.value, senha: f.senha.value,
            permissoes: [...f.querySelectorAll('[name=perm]:checked')].map((x) => x.value), ativo: f.ativo.checked,
          });
          j.fechar(); App.toast('Funcionário salvo');
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
          <label class="campo">Horário (aparece no app)<input name="horario" value="${esc(l.horario || '')}"></label>
          <label class="campo">WhatsApp da loja<input name="whatsapp" value="${esc(l.whatsapp || '')}" inputmode="tel"></label>
          <label class="campo">Taxa de entrega (R$)<input name="taxa_entrega" type="number" step="0.5" min="0" value="${l.taxa_entrega || 0}"></label>
          <label class="campo">Acréscimo no cartão (R$)<input name="taxa_cartao" type="number" step="0.5" min="0" value="${l.taxa_cartao ?? 1}"><small>Taxa da maquininha. Use 0 para não cobrar.</small></label>
          <label class="campo">Recado no quadro da Manu<input name="recado" maxlength="140" value="${esc(l.recado || '')}" placeholder="Ex.: Hoje tem açaí em dobro!"><small>Aparece nos dias sem combo.</small></label>
          <label class="campo">Endereço do site<input name="url_publica" value="${esc(l.url_publica || '')}" placeholder="https://pedidos.naturallemania.com.br"><small>Usado nos QR codes. Vazio = o endereço atual.</small></label>
        </div>
        ${ch('aberta', 'Aceitando pedidos pelo site agora')}
        ${ch('delivery', 'Fazemos entrega')}
        ${ch('retirada', 'Cliente pode retirar no balcão')}
        ${ch('mesa_auto_confirmar', 'Pedido feito pelo QR da mesa vai direto para a cozinha (sem o garçom confirmar)')}
        <button class="btn verde grande">Salvar</button>
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
      const corpo = { cardapio: abaCardapio, mesas: abaMesas, equipe: abaEquipe, loja: abaLoja, impressora: abaImpressora }[aba]();
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
      else if (b.hasAttribute('data-nova-cat')) editarCategoria(null);
      else if (b.dataset.catEdita != null) editarCategoria(Number(b.dataset.catEdita));
      else if (b.dataset.catSobe != null) {
        const m = copia(d.cardapio); const i = Number(b.dataset.catSobe);
        [m.categorias[i - 1], m.categorias[i]] = [m.categorias[i], m.categorias[i - 1]];
        if (await salvarCardapio(m, 'Ordem salva')) render();
      } else if (b.dataset.novoProd) editarProduto(null, b.dataset.novoProd);
      else if (b.dataset.edita) editarProduto(b.dataset.edita);
      else if (b.dataset.usuario != null) editarUsuario(b.dataset.usuario);
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
        if (f.dataset.form === 'varias') await acaoMesa({ de: f.de.value, ate: f.ate.value }, '/api/admin/mesas/varias');
        else if (f.dataset.form === 'uma') await acaoMesa({ nome: f.nome.value });
        else if (f.dataset.form === 'loja') {
          const fd = new FormData(f);
          const loja = Object.fromEntries(['nome', 'frase', 'horario', 'whatsapp', 'taxa_entrega', 'taxa_cartao', 'url_publica', 'recado'].map((k) => [k, fd.get(k)]));
          for (const k of ['aberta', 'delivery', 'retirada', 'mesa_auto_confirmar']) loja[k] = f[k].checked;
          d.loja = (await App.api('/api/admin/loja', { loja }, 'PUT')).loja;
          App.toast('Loja salva'); render();
        }
      } catch (err) { App.toast(err.message, true); }
    });

    carregar().then(render).catch((e) => { el.innerHTML = `<p class="erro">${esc(e.message)}</p>`; });
  },
};
