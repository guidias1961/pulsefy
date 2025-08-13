
# Deploy (Railway + Cloudflare Worker)

## Site estático no Railway
1. Tenha o Node 18+.
2. Na raiz do projeto:
   ```bash
   npm install
   npm start
   # abre http://localhost:3000
   ```
3. No Railway (serviço Node):
   - **Install Command**: `npm install`
   - **Start Command**: `npm start`
   - Root Directory: a raiz onde está este `package.json`.
4. O comando `start` serve a pasta `site/` na porta `${PORT}` (ou 3000 local).

## Worker (bongo-api/) no Cloudflare
O diretório `bongo-api/` é um Cloudflare Worker (Wrangler). Para deployar:
1. Instale o Wrangler e faça login:
   ```bash
   npm i -g wrangler
   wrangler login
   ```
2. Ajuste `bongo-api/wrangler.toml`:
   - `ALLOWED_ORIGIN` para o domínio do seu site do Railway (ex.: `https://seu-app.up.railway.app`).
   - `PUBLIC_BASE_URL` para a URL pública do bucket R2 (se aplicável).
3. Deploy:
   ```bash
   cd bongo-api
   wrangler deploy
   ```

> Observação: o Worker **não** é um servidor Express/Node. Ele roda na plataforma da Cloudflare. O site (Railway) deve chamar o endpoint do Worker conforme as rotas implementadas.

## Estrutura esperada
- `site/` → contém `index.html` e assets do seu site.
- `bongo-api/` → código do Cloudflare Worker.
- `package.json` (raiz) → inclui `serve` em `dependencies` e `"start": "serve -s site -l ${PORT:-3000}"`.

