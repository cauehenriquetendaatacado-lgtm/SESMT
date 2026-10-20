# Dashboard SESMT – Tenda Atacado (PWA + Neon + Render)

App instalável (botão **⬇ Instalar app** no topo) com login por senha e dados guardados no Postgres do Neon,
sincronizados entre PC, celular e tablet. Sem internet o app continua abrindo e reenvia as alterações quando voltar.

## Publicar (uma vez)

1. **Neon** → crie um projeto → copie a *connection string* (`postgresql://...neon.tech/neondb?sslmode=require`).
   A tabela `sesmt_kv` é criada sozinha na primeira execução.
2. **GitHub** → suba esta pasta como repositório (o `.gitignore` já ignora `node_modules`, `.env` e `data.json`).
3. **Render** → *New → Blueprint* e escolha o repositório (usa o `render.yaml`). Preencha:
   - `DATABASE_URL` = a string do Neon
   - `APP_PASSWORD` = a senha de acesso do dashboard
4. Abra a URL `https://dashboard-sesmt.onrender.com` (ou a que o Render gerar), entre com a senha.

> O dashboard tem nomes e chapas de colaboradores, por isso **o servidor não sobe sem `APP_PASSWORD`**.

## Trazer os dados que já estão no arquivo antigo (faça antes de abrir em outros aparelhos)

Os dados que você lançou no .html antigo ficam só no navegador onde foram digitados.
Abra `https://SEU-APP.onrender.com/migrar` e siga os 2 passos da página (copiar do arquivo antigo → colar → enviar).
Depois disso, qualquer aparelho que abrir já recebe tudo do servidor.

## Instalar como app

- **Chrome/Edge (PC e Android):** botão **⬇ Instalar app** no topo (ou ícone de instalar na barra de endereço).
- **iPhone/iPad (Safari):** o botão mostra o passo: Compartilhar → *Adicionar à Tela de Início*.

## Como a sincronização funciona

- Cada aba/bloco de dados (`sesmtOcc`, `sesmtMoki`, `sesmtCtl`...) é salvo no Neon como JSON, com data/hora.
- Vale a **última gravação** de cada bloco. Se duas pessoas editarem o mesmo bloco ao mesmo tempo, a última que salvar prevalece.
- Aparelho que nunca sincronizou sempre recebe o que está no servidor primeiro (não sobrescreve).
- Render gratuito "dorme" após ~15 min sem acesso; o primeiro acesso depois disso demora ~30–60 s.

## Aba "Avaliações Moki": link, pasta e planilha

- **Ler pelo link do Moki**: cole o link; se o Moki exigir login, o link fica no formulário e você cola o texto do e-mail.
- **Pasta da planilha**: guarda o link da pasta (chave `sesmtPasta`, sincronizada pelo Neon) com botão **Abrir pasta**.
- **Ler arquivo .xlsx**: importa avaliações (colunas LOJA/UNIDADE e APROVEITAMENTO/%; opcionais DATA, PROTOCOLO, NC, LINK). Repetidas (mesma loja e data) são atualizadas, sem duplicar.

## Aba "Gráficos"

Só gráficos (ocorrências por regional, técnico e unidade, não respondidos, tratados x aguardando, evolução mensal, por 100 colaboradores e aproveitamento Moki), com filtro de **gerente regional** e **técnico responsável** pelas lojas. A lista de técnicos acompanha a regional escolhida.

## Rodar localmente

```
npm install
cp .env.example .env     # defina APP_PASSWORD (DATABASE_URL vazio = grava em data.json)
npm run dev              # http://localhost:3000
```
