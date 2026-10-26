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
| **Entregas** | Entregador | No celular: recebe as entregas que o painel de Pedidos liberou para ele, vê o que levar (maquininha ou troco), abre o endereço no mapa e confirma **entregue e pago** (com a forma que o cliente usou) |
| **Caixa** | Caixa / balcão | **Novo pedido** de balcão ou telefone (retirada, entrega ou mesa), contas abertas das mesas, **fechar conta**, resumo do dia e **acerto dos entregadores** |
| **Relatórios** | Caixa / balcão | Vendas do dia, semana, mês, ano ou período escolhido; baixar planilha (Excel) e imprimir / PDF |
| **Administração** | Administrador | Cardápio, **funcionários** (cadastro, função, seções liberadas, desativar), mesas e QR codes, dados da loja |

### Caminho de um pedido

```
Site ───────────► Aguardando confirmação ─(Pedidos confirma)─┐
QR da mesa ─────► Aguardando confirmação ─(Garçom confirma)──┤
Garçom / balcão ─────────────────────────────────────────────┼─► Cozinha ─(Pronto)─► Pronto
                                                             │
Pronto (só a Cozinha marca) ─► entrega: "Saiu para entrega" (só no painel de Pedidos, escolhendo o entregador)
                                ─► Entregue (painel de Pedidos ou app do entregador)
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
GEMINI_API_KEY=chave-do-google-ai-studio   (opcional: liga a Manu IA)
EVOLUTION_URL=https://sua-evolution          (opcional: recuperar senha pelo WhatsApp)
EVOLUTION_INSTANCE=nome-da-instancia
EVOLUTION_APIKEY=apikey-da-evolution
MP_ACCESS_TOKEN=APP_USR-...                  (opcional: Pix automático pelo Mercado Pago)
```

Em *Domains*, aponte o domínio para a porta em que o app sobe (aparece nos logs: "no ar na porta …"; no Easypanel costuma ser **80**) e faça o deploy.

**Endereço só da equipe (opcional):** crie também um domínio `painel.seudominio` (registro A no DNS e outro domínio no
mesmo App, mesma porta). Nele, a página inicial já abre o painel da equipe; o domínio principal continua sendo o cardápio.

### 3. Primeiro acesso
Abra `https://seudominio/equipe`. Na primeira vez ele pede para **criar o administrador**. Depois, em Administração:
1. **Horário e taxas**: marque *Abrir e fechar sozinho pelo horário* e preencha o horário de cada dia; confira a taxa de entrega e o acréscimo do cartão.
   **Loja**: confira nome, WhatsApp e o **endereço do site** (vai nos QR codes).
2. **Mesas e QR code**: crie as mesas (ex.: da 1 até a 10) e clique em **Imprimir QR codes**.
3. **Funcionários**: clique em *+ Cadastrar funcionário*, preencha nome, WhatsApp, login e senha e escolha a função (Administrador, Atendente / caixa, Cozinheiro, Garçom, Entregador).
4. **Cardápio**: ajuste preços, marque o que acabou (Disponível), crie produtos e adicionais.

### 4. Evolution API (WhatsApp)
Crie a **Evolution API** (template) com domínio. Crie a instância `naturalle` e leia o QR com o celular do
**67 9715-5502**. Em *Webhook* da instância: `https://SEU-N8N/webhook/evolution`, evento `MESSAGES_UPSERT`.

### 5. n8n
Use **um fluxo só**: `n8n/naturalle-completo.json` (avisos de pedido e de status + a Manu IA no WhatsApp).

1. No n8n: **+ Criar fluxo › ⋯ › Importar de URL** e cole
   `https://raw.githubusercontent.com/marcosgisele2203-art/naturalle-delivery/main/n8n/naturalle-completo.json`
2. Abra o nó **Config** e preencha:

| Campo | Valor |
|---|---|
| `site_url` | endereço do site, ex.: `https://pedidos.seudominio.com` (sem barra no final) |
| `evolution_url` | endereço da Evolution, ex.: `https://api.seudominio.com` (sem barra no final) |
| `evolution_instance` | nome da instância conectada ao WhatsApp |
| `evolution_apikey` | API key da Evolution |
| `numero_loja` | quem recebe aviso de pedido novo (vem `5567996421751`) |
| `pix_chave` / `pix_nome` | chave Pix e nome do recebedor |
| `token` | **o mesmo** valor do `N8N_TOKEN` do site |

3. **Save** e ligue **Active**.
4. Na Evolution, webhook da instância: `https://SEU-N8N/webhook/evolution`, evento `MESSAGES_UPSERT`
   (ligar **Webhook Base64** deixa fotos e áudios mais rápidos; sem ele o fluxo busca o arquivo na Evolution).

### 6. Manu IA (garçonete online)
A Manu atende no **WhatsApp** (texto, áudio e foto) e no botão **Pedir com a Manu** do cardápio. Ela consulta o cardápio do
sistema, calcula com as mesmas regras do site, lança o pedido no painel (origem "Manu") e registra o comprovante Pix pela foto.

1. Crie uma chave grátis em **https://aistudio.google.com/apikey** (Google AI Studio).
2. No Easypanel, em *Environment* do site, acrescente `GEMINI_API_KEY=sua-chave` e clique em **Implantar**.
   Opcional: `MANU_MODELO` (padrão `gemini-2.5-flash`).

Sem a chave, o botão da Manu some do cardápio e, no WhatsApp, ela responde com o link do cardápio (a foto do comprovante Pix
continua sendo registrada).

### 7. Pix automático (Mercado Pago)
Cada pedido no Pix ganha um **QR Code / copia e cola com o valor exato**, que vale 30 minutos. Quando o dinheiro cai, o
Mercado Pago avisa o sistema (`/api/mp/webhook`), o sistema confere direto na API deles e o pedido fica **Pix pago** sozinho,
sem comprovante. O site mostra "Pagamento confirmado ✅" na hora e a Manu manda o código numa mensagem separada.

1. Crie a conta no Mercado Pago (pode ser a da loja) e cadastre uma chave Pix nela.
2. Entre em **https://www.mercadopago.com.br/developers/panel/app** → *Criar aplicação* → **Checkout Transparente**,
   tipo de API **API de Orders**.
3. Em *Credenciais de produção*, copie o **Access Token** (começa com `APP_USR-`). Não mande essa chave para ninguém.
4. No Easypanel, em *Environment* do site, acrescente `MP_ACCESS_TOKEN=APP_USR-...` e clique em **Implantar**.
   Na aplicação do Mercado Pago, em *Webhooks* → *Configurar notificações* (modo produção), coloque a URL
   `https://SEU-SITE/api/mp/webhook` e marque o evento **Order (Mercado Pago)**. Sem isso também funciona: o sistema
   confere sozinho a cada minuto e na hora em que o cliente está com a página aberta.
5. Em Administração › *Loja* aparece "Mercado Pago conectado". Lá dá para desligar e escolher se o Pix pago já vai direto
   para a cozinha.

Sem o token (ou se o Mercado Pago falhar), o cliente recebe a chave Pix da loja e manda o comprovante, como antes.
O Mercado Pago cobra uma taxa por Pix recebido (veja no painel deles).

Os arquivos `01`, `02` e `03` são o mesmo fluxo separado em três; use **ou** o completo **ou** os três, nunca os dois juntos
(os endereços de webhook iriam se repetir).

Se o n8n cair, os pedidos continuam funcionando normalmente; só as mensagens de WhatsApp param.

## Dia a dia

- **Porção de batata**: R$ 25 (cheddar ou catupiry, com bacon ou calabresa).
- **Quadro da Manu** (topo do app): é o painel de **promoções e novidades**. Em Administração › *Quadro da Manu*, clique em
  *+ Novo aviso*: escolha Promoção ou Novidade, título, texto, preço, **foto da promoção**, o produto que o botão "Quero!" abre
  e os dias. Com foto, o cartaz ocupa o quadro-negro inteiro e o cliente toca nele para pedir. Com mais de um aviso,
  eles passam sozinhos. O combo do dia entra sozinho.
  Sem avisos, aparece o recado de Administração › Loja. Com a loja fechada, mostra "Fechados agora".
- **Imagens da Manu**: ficam em `site/public/img/manu/`. Para trocar uma, salve outra imagem com o mesmo nome.
- **Acabou um item**: Administração › Cardápio › desmarque *Disponível*. Some na hora do app.
- **Combos do dia**: cada combo tem o dia marcado; nos outros dias aparece "Só terça" e não pode ser pedido.
- **Cozinha**: deixe a tela aberta num tablet/TV, clique em *Ligar som* e *Tela cheia*. "Desfazer" volta um pedido
  marcado como pronto por engano.
- **Som**: cada aparelho precisa clicar uma vez em *Ligar som* (o navegador exige).
- **QR code fotografado**: se alguém estiver pedindo de fora com foto do QR, use *Trocar QR* na mesa e imprima de novo.
- **Tablet da cozinha / celular do entregador**: salve como favorito `seudominio/equipe#/cozinha` (ou `#/entregas`) para abrir direto no painel.
- **Esqueci a senha**: na tela de login, *Esqueci minha senha* manda um código pelo WhatsApp cadastrado em *Meu cadastro*
  (precisa das 3 variáveis `EVOLUTION_*`). Outra saída: um administrador troca em Funcionários, ou pelo Console do Easypanel
  `node redefinir-senha.js LOGIN NOVASENHA`.
- **Senha esquecida (antigo)**: o administrador define uma nova em Administração › Equipe.

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
