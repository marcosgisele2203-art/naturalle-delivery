# Instruções para agentes (Codex, Claude Code e outros)

Este arquivo vale para **qualquer agente de IA** que trabalhe neste repositório.
O `CLAUDE.md` só importa este arquivo, então mantenha as regras **aqui**.

## O projeto

Sistema de pedidos da **Naturalle Mania** (lanchonete): pedido pelo site, pedido na mesa por QR code,
garçom, cozinha, caixa, entregador e administração. O `README.md` descreve o funcionamento para o dono da loja.

| Pasta | O que é |
|---|---|
| `site/server.js` | Servidor HTTP em Node.js puro (sem Express): rotas, API e regras de pedido |
| `site/lib/` | Banco (`db.js`, cria e migra as tabelas sozinho), login (`auth.js`), Manu IA (`manu.js`, Gemini), Mercado Pago, telefone |
| `site/public/` | Front-end sem framework e sem build: cardápio do cliente (`app.js`) e painéis da equipe (`equipe/v-*.js`) |
| `site/public/shared/` | Código usado no navegador **e** nos testes (cálculo, horário, relatório) |
| `site/test/` | Testes com `node:test` |
| `n8n/` | Fluxos do n8n (WhatsApp via Evolution API). O usado em produção é `naturalle-completo.json` |

Dependências: só `pg` e `qrcode`. **Não adicione bibliotecas ou frameworks sem pedir ao dono.**

## Comandos

Rodar tudo dentro de `site/`:

```bash
npm install
npm test                      # = node --test --test-concurrency=1 test/*.test.js (um arquivo por vez)
DATABASE_URL=postgres://... npm start   # porta 3000 (ou PORT)
```

Atenção: `node --test test/` (sem o `*.test.js`) **falha**. Use `npm test`.

Antes de abrir um PR: `npm test` passando e `node --check server.js` sem erro.

## Regras do código

- **Idioma:** código, nomes de variáveis, comentários, mensagens de commit e PRs em **português do Brasil**,
  seguindo o estilo já existente.
- **Fuso horário:** a loja fica em Miranda/MS. Toda data de "dia", horário de funcionamento e relatório usa
  `America/Campo_Grande` (constante `FUSO` em `server.js`). Nunca use o fuso do servidor nem UTC para isso.
- **Preços:** o servidor sempre recalcula pelo cardápio do banco. Nunca confie em preço vindo do navegador.
- **Permissões:** toda ação da equipe confere a permissão **no servidor**, não só escondendo o botão.
- **Banco:** mudanças de tabela entram como migração idempotente em `site/lib/db.js`
  (`CREATE ... IF NOT EXISTS`, `ALTER ... ADD COLUMN IF NOT EXISTS`). Nunca apague dados de pedidos ou clientes.
- **Telefones:** sempre passar por `normalizarTelefone` (`site/lib/telefone.js`).
- **Pedidos:** respeitar a proteção contra reenvio (idempotência) em `site/lib/requisicao-pedido.js`.
- **Segredos:** nunca colocar chaves, tokens ou senhas no código. Tudo vem de variáveis de ambiente
  (lista no `README.md`, seção "Instalação na Easypanel").
- Correção de bug ou regra nova de negócio: **adicione um teste** em `site/test/`.

## Fluxo de trabalho (equipe: dono + Claude Code + Codex)

- **Nunca** faça push direto na `main`. A `main` é publicada automaticamente pelo Easypanel.
- Uma tarefa = uma branch (`feat/...`, `fix/...`) = um Pull Request pequeno.
- Descreva no PR, em português simples: **o que mudou, por que, e como o dono pode testar**.
- Se a mudança exigir ação manual (variável nova no Easypanel, reimportar fluxo do n8n), escreva isso
  em destaque no PR.
- Quem não fez a tarefa revisa o PR (`@codex review` no GitHub, ou pedir ao Claude Code). O dono faz o merge.
- Ao alterar um fluxo em `n8n/`, mantenha o JSON importável e não coloque credenciais nele.
