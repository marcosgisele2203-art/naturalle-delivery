# Naturalle Mania · Sistema de pedidos

Sistema completo da Naturalle Mania: pedido pelo site, pedido na mesa por QR code, garçom, cozinha, caixa e
administração. As mensagens de WhatsApp saem pelo n8n + Evolution API (número **+55 67 9715-5502**).

## O que tem

| Endereço | Quem usa | Para quê |
|---|---|---|
| `/` | Cliente | Pede para **entrega** ou **retirada**, paga com Pix, cartão ou dinheiro e acompanha o pedido |
| `/m/<código>` | Cliente na mesa | Abre pelo **QR code da mesa**. Pede sem chamar o garçom; vai para a conta da mesa |
| `/equipe` | Equipe | Entrada com os painéis da loja (Administração, Atendimento e caixa, Cozinha, Garçom, Entregador, Cardápio). Ao tocar num painel pede o login; cada um só entra nas seções liberadas para ele |

Seções da área da equipe:

| Seção | Permissão | O que faz |
|---|---|---|
| **Pedidos** | Pedidos e delivery | Quadro com todos os pedidos: confirmar os do site, saiu para entrega, entregue, confirmar Pix, cancelar |
| **Cozinha** | Cozinha | Tela (pode ficar numa TV/tablet) com os pedidos **já confirmados**, tempo de espera em cores e botão **Pronto**. Som de novo pedido |
| **Mesas (garçom)** | Garçom | Mapa das mesas (livre, ocupada, pedido para confirmar, pronto para servir), lançar pedido na mesa pelo celular, confirmar pedidos do QR, marcar **Servido** |
| **Entregas** | Entregador | No celular: pega os pedidos prontos, vê o que levar (maquininha ou troco), abre o endereço no mapa e confirma **entregue e pago** (com a forma que o cliente usou) |
| **Caixa** | Caixa / balcão | **Novo pedido** de balcão ou telefone (retirada, entrega ou mesa), contas abertas das mesas, **fechar conta**, resumo do dia e **acerto dos entregadores** |
| **Relatórios** | Caixa / balcão | Vendas do dia, semana, mês, ano ou período escolhido; baixar planilha (Excel) e imprimir / PDF |
| **Administração** | Administrador | Cardápio, **funcionários** (cadastro, função, seções liberadas, desativar), mesas e QR codes, dados da loja |

### Caminho de um pedido

```
Site ───────────► Aguardando confirmação ─(Pedidos confirma)─┐
QR da mesa ─────► Aguardando confirmação ─(Garçom confirma)──┤
Garçom / balcão ─────────────────────────────────────────────┼─► Cozinha ─(Pronto)─► Pronto
                                                             │
Pronto ─► entrega: "Saiu para entrega" ─► Entregue
       ─► retirada: "Cliente retirou"
       ─► mesa: "Servido" (ou ao fechar a conta)
```

Em Administração › Loja dá para fazer o pedido do QR ir **direto para a cozinha**, sem o garçom confirmar.

A cada etapa, o cliente que deixou WhatsApp recebe uma mensagem (pedidos de mesa não recebem).

## Instalação na Easypanel

Tudo no mesmo projeto da Easypanel.

### 1. Postgres
Crie um serviço **Postgres** (template) e anote o *Internal connection URL*
(ex.: `postgres://postgres:SENHA@naturalle_postgres:5432/naturalle`).
Não precisa criar tabelas: o site cria e atualiza tudo sozinho quando liga.

### 2. Site
**+ Service → App**, fonte **GitHub**: `marcosgisele2203-art/naturalle-delivery`, branch `main`,
*Build path* `/site`, build por **Dockerfile**. Em *Environment*:

```
DATABASE_URL=postgres://postgres:SENHA@naturalle_postgres:5432/naturalle
N8N_URL=https://SEU-N8N/webhook
N8N_TOKEN=uma-senha-forte-qualquer
```

Em *Domains*, aponte o domínio para a porta **3000** e faça o deploy.

### 3. Primeiro acesso
Abra `https://seudominio/equipe`. Na primeira vez ele pede para **criar o administrador**. Depois, em Administração:
1. **Loja**: confira nome, horário, WhatsApp, taxa de entrega e o **endereço do site** (vai nos QR codes).
2. **Mesas e QR code**: crie as mesas (ex.: da 1 até a 10) e clique em **Imprimir QR codes**.
3. **Funcionários**: clique em *+ Cadastrar funcionário*, preencha nome, WhatsApp, login e senha e escolha a função (Administrador, Atendente / caixa, Cozinheiro, Garçom, Entregador).
4. **Cardápio**: ajuste preços, marque o que acabou (Disponível), crie produtos e adicionais.

### 4. Evolution API (WhatsApp)
Crie a **Evolution API** (template) com domínio. Crie a instância `naturalle` e leia o QR com o celular do
**67 9715-5502**. Em *Webhook* da instância: `https://SEU-N8N/webhook/evolution`, evento `MESSAGES_UPSERT`.

### 5. n8n
1. *Credentials → New → Postgres* com os dados do passo 1 (só o fluxo 3 usa).
2. Importe os 3 arquivos de `n8n/`. Em **cada** um, abra o nó **Config** e preencha:

| Campo | Valor |
|---|---|
| `evolution_url` | endereço da Evolution, ex.: `https://evolution.seudominio.com` |
| `evolution_instance` | `naturalle` |
| `evolution_apikey` | API key da Evolution |
| `numero_loja` | quem recebe aviso de pedido do site e de comprovante Pix (vem `5567996421751`) |
| `pix_chave` / `pix_nome` | chave Pix e nome do recebedor |
| `token` | **o mesmo** valor do `N8N_TOKEN` do site |

3. No fluxo 3, escolha a credencial Postgres. **Save** e **Activate** nos 3.

Os fluxos:
- `01-pedido-recebido`: confirma o pedido ao cliente (com a chave Pix, se for Pix) e avisa a loja dos pedidos do site.
- `02-status-pedido`: confirmado, pronto para retirar, saiu, entregue, cancelado.
- `03-comprovante-pix`: cliente manda a foto do comprovante → pedido marcado "comprovante recebido" → loja avisada.

Se o n8n cair, os pedidos continuam funcionando normalmente; só as mensagens de WhatsApp param.

## Dia a dia

- **Porção de batata**: R$ 25 (cheddar ou catupiry, com bacon ou calabresa).
- **Quadro da Manu** (topo do app): no dia de um combo, mostra o combo com o botão "Quero!". Nos outros dias mostra o
  recado de Administração › Loja › *Recado no quadro da Manu*. Com a loja fechada, mostra "Fechados agora".
- **Imagens da Manu**: ficam em `site/public/img/manu/`. Para trocar uma, salve outra imagem com o mesmo nome.
- **Acabou um item**: Administração › Cardápio › desmarque *Disponível*. Some na hora do app.
- **Combos do dia**: cada combo tem o dia marcado; nos outros dias aparece "Só terça" e não pode ser pedido.
- **Cozinha**: deixe a tela aberta num tablet/TV, clique em *Ligar som* e *Tela cheia*. "Desfazer" volta um pedido
  marcado como pronto por engano.
- **Som**: cada aparelho precisa clicar uma vez em *Ligar som* (o navegador exige).
- **QR code fotografado**: se alguém estiver pedindo de fora com foto do QR, use *Trocar QR* na mesa e imprima de novo.
- **Tablet da cozinha / celular do entregador**: salve como favorito `seudominio/equipe#/cozinha` (ou `#/entregador`) para abrir direto no painel.
- **Senha esquecida**: o administrador define uma nova em Administração › Equipe.

## Impressora térmica

Cada computador configura a impressora ligada nele: na área da equipe, botão **Impressora** no menu da esquerda
(papel 58 ou 80 mm, comanda da cozinha e/ou cupom do cliente, impressão automática, vias, letra, mensagem do cupom).
Em cada pedido há o botão **Imprimir**. O passo a passo completo (impressora padrão, margens e `--kiosk-printing`
para imprimir sem a janela de confirmação) está em **Administração › Impressora**.

## Segurança

- O servidor recalcula todos os preços pelo cardápio do banco; o preço que vem do navegador é ignorado.
- Senhas guardadas com scrypt; sessão em cookie assinado (`HttpOnly`). Trocar a senha ou desativar o
  funcionário derruba as sessões abertas dele.
- Cada ação confere a permissão no servidor (ex.: a cozinha não cancela pedido, o garçom não lança entrega).
- Limite de pedidos e de tentativas de login por IP.

## Rodar no computador (opcional)

```
cd site
npm install
DATABASE_URL=postgres://... npm start
```
