# Bongo Cat – Deploy R2 + Worker

## Passos rápidos

1) **Cloudflare R2**
- Crie o bucket: `bongo-public`.
- Ative **Public Bucket** e anote a URL pública (ex.: `https://bongo-public.r2.dev`).

2) **Worker**
- Instale: `npm i -g wrangler` e faça login: `wrangler login`.
- Edite `bongo-api/wrangler.toml`:
  - `PUBLIC_BASE_URL` = sua URL pública do R2.
  - `ALLOWED_ORIGIN` = domínio do seu site.
- Deploy: dentro de `bongo-api/` rode `wrangler deploy`.
- Anote a URL do Worker (ex.: `https://bongo-api.seunome.workers.dev`).

3) **Site**
- Edite `site/index.html` e troque `API_BASE` para a URL do Worker.
- Suba o conteúdo da pasta `site/` no seu host (Cloudflare Pages, Vercel, Netlify, etc.).
- Abra o site, faça upload e verifique se a faixa aparece.

> Observação: a confirmação de pagamento em BTC é manual (o usuário clica "I've paid").
