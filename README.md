# Naturalle Mania · Delivery

Sistema de pedidos online da Naturalle Mania:

- **App do cliente** (`/`): monta o açaí, o Mac de 10, combos do dia e bebidas, e envia o pedido.
- **Painel do restaurante** (`/painel`): pedidos em colunas (Novos → Em preparo → Saiu → Entregues), com som de novo pedido, confirmação de Pix e botão de WhatsApp do cliente.
- **n8n + Evolution API**: salva o pedido, avisa a cozinha e manda cada etapa para o cliente no WhatsApp
  (número conectado na Evolution: **+55 67 9715-5502**).

```
Cliente ──► site (/api/pedido) ──► n8n /webhook/pedido ──► Postgres
               │  confere preços pelo cardápio            └─► WhatsApp cozinha + cliente
Painel ───► site (/api/status) ──► n8n /webhook/status ──► WhatsApp cliente
Cliente manda foto do comprovante ─► Evolution ─► n8n /webhook/evolution ─► marca Pix + avisa cozinha
```

## Pastas

| Caminho | O quê |
|---|---|
| `site/` | Servidor Node do app e do painel (tem `Dockerfile`) |
| `site/public/menu.js` | **Cardápio e preços.** É aqui que se muda preço ou se cria item |
| `site/public/img/` | Fotos da fachada. Coloque a Manu como `manu.png` (fundo transparente) |
| `db/schema.sql` | Tabela `pedidos` |
| `n8n/*.json` | Os 3 fluxos para importar no n8n |

## Instalação na Easypanel

Tudo no mesmo projeto da Easypanel.

### 1. Postgres
Crie um serviço **Postgres** (template). Anote o *Internal connection URL*
(algo como `postgres://postgres:SENHA@naturalle_postgres:5432/naturalle`).
Abra o console do Postgres e rode o conteúdo de `db/schema.sql`.

### 2. Evolution API
Crie a **Evolution API** (template) com um domínio. No gerenciador dela:
- crie a instância `naturalle` e leia o QR Code com o celular do **67 9715-5502**;
- em *Webhook* da instância: URL `https://SEU-N8N/webhook/evolution`, evento `MESSAGES_UPSERT`, ligado.

### 3. n8n
Crie o **n8n** (template) com um domínio.
1. *Credentials → New → Postgres*: host, porta, banco, usuário e senha do passo 1 (host = nome interno do serviço).
2. *Workflows → Import from file*: importe os 3 arquivos de `n8n/`.
3. Em **cada** fluxo, abra o nó **Config** e preencha:

| Campo | Valor |
|---|---|
| `evolution_url` | endereço da sua Evolution, ex.: `https://evolution.seudominio.com` |
| `evolution_instance` | `naturalle` |
| `evolution_apikey` | a API key global da Evolution |
| `numero_cozinha` | quem recebe os avisos de pedido (já vem `5567996421751`) |
| `pix_chave` / `pix_nome` | a chave Pix da loja e o nome do recebedor |
| `painel_token` | uma senha forte, **igual** à `PAINEL_TOKEN` do site |
| `app_token` | outra senha forte, **igual** à `APP_TOKEN` do site |

4. Nos nós Postgres, escolha a credencial criada. **Save** e **Activate** nos 3.

### 4. Site (app + painel)
Suba a pasta `site/` para um repositório no GitHub (pode ser privado).
Na Easypanel: **+ Service → App**, fonte **GitHub**, aponte para o repositório
(se a pasta `site` não for a raiz do repo, coloque `/site` em *Build path*). Build: **Dockerfile**.

Em *Environment*:

```
N8N_URL=https://SEU-N8N/webhook
APP_TOKEN=a-mesma-do-app_token
PAINEL_TOKEN=a-mesma-do-painel_token
DATABASE_URL=postgres://postgres:SENHA@naturalle_postgres:5432/naturalle
```

Em *Domains*, aponte seu domínio para a porta **3000**. Pronto:
- `https://seudominio.com` → app do cliente
- `https://seudominio.com/painel` → painel (entra com a `PAINEL_TOKEN`)

## Dia a dia

- **Mudar preço ou item**: edite `site/public/menu.js` e faça deploy de novo. As porções de batata estão com
  `preco: null` (aparecem como "Consulte no WhatsApp"); coloque o valor para liberar.
- **Painel**: clique em "Ativar som de novo pedido" ao abrir (o navegador só deixa tocar depois de um clique).
  A tela se atualiza sozinha a cada 8 segundos.
- **Pix**: o pedido mostra "aguardando comprovante" → "comprovante recebido, conferir" quando o cliente manda a foto.
  Confira no banco/app do banco e clique em **Confirmar Pix**.
- **Combos**: o preço promocional só vale no dia (fuso de Campo Grande). Em outros dias, o combo sai pelo preço normal.

## Segurança

- O site **recalcula todos os preços** pelo `menu.js`; o preço que vem do navegador é ignorado.
- O n8n só aceita pedidos com o `app_token` e mudanças de status com o `painel_token`.
- O site limita 8 pedidos a cada 10 minutos por IP.

## Rodar no computador (opcional)

```
cd site
npm install
N8N_URL=http://localhost:5678/webhook APP_TOKEN=x PAINEL_TOKEN=y DATABASE_URL=postgres://... npm start
```
