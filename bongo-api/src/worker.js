export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    // CORS básico
    const cors = {
      "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    // Preflight
    if (req.method === "OPTIONS") {
      return new Response(null, { headers: cors });
    }

    // ===== (ADDED) Rotas de Métricas (KV) — early intercept =====
    {
      const resp = await handleMetricsRoutes(req, env, cors);
      if (resp) return resp;
    }
    // ============================================================

    // Lista pública de faixas (index em R2)
    if (req.method === "GET" && url.pathname === "/api/tracks") {
      const idx = await env.PUBLIC_BUCKET.get("tracks/tracks.json");
      const body = idx ? await idx.text() : "[]";
      return new Response(body, { headers: { "Content-Type": "application/json", ...cors } });
    }

    // Upload de faixa + cover para R2, atualização do índice
    if (req.method === "POST" && url.pathname === "/api/upload") {
      const ct = req.headers.get("content-type") || "";
      if (!ct.includes("multipart/form-data")) {
        return json({ error: "Use multipart/form-data" }, 400, cors);
      }

      const form = await req.formData();
      const audio = form.get("audio");   // File obrigatório
      const cover = form.get("cover");   // File opcional
      const title = sanitize(form.get("title"));
      const artist = sanitize(form.get("artist"));
      const genre = sanitize(form.get("genre") || "Unknown");
      const tipAddress = sanitize(form.get("tipAddress") || "");
      const uploader = sanitize(form.get("uploader") || "");

      if (!audio || !title || !artist) {
        return json({ error: "Missing required fields" }, 400, cors);
      }

      // limites
      const maxAudio = parseInt(env.MAX_AUDIO_BYTES || "26214400", 10);
      const maxCover = parseInt(env.MAX_COVER_BYTES || "3145728", 10);
      if (audio.size > maxAudio) return json({ error: "Audio too large" }, 413, cors);
      if (cover && cover.size > maxCover) return json({ error: "Cover too large" }, 413, cors);

      const id = crypto.randomUUID();
      const audioExt = pickExt(audio.type) || "mp3";
      const coverExt = cover ? (pickExt(cover.type) || "jpg") : null;

      const audioKey = `tracks/${id}/audio.${audioExt}`;
      const coverKey = cover ? `tracks/${id}/cover.${coverExt}` : null;

      // Upload para R2
      await env.PUBLIC_BUCKET.put(audioKey, await audio.arrayBuffer(), {
        httpMetadata: { contentType: audio.type || "audio/mpeg" },
      });
      if (cover && coverKey) {
        await env.PUBLIC_BUCKET.put(coverKey, await cover.arrayBuffer(), {
          httpMetadata: { contentType: cover.type || "image/jpeg" },
        });
      }

      const audioUrl = join(env.PUBLIC_BASE_URL, audioKey);
      const coverUrl = coverKey ? join(env.PUBLIC_BASE_URL, coverKey) : null;

      // Atualiza índice público
      const indexArr = await readIndex(env);
      const track = {
        id, title, artist, genre,
        cover: coverUrl,
        audio: audioUrl,
        uploader,
        tipAddress: tipAddress || null,
        likesCount: 0,
        tipTotalSats: 0,
        createdAt: new Date().toISOString()
      };
      indexArr.push(track);
      await env.PUBLIC_BUCKET.put("tracks/tracks.json", JSON.stringify(indexArr, null, 2), {
        httpMetadata: { contentType: "application/json" },
      });

      return json({ ok: true, track }, 200, cors);
    }

    return new Response("Not found", { status: 404, headers: cors });
  }
};

/* ===================== Helpers existentes ===================== */
function sanitize(x) {
  if (typeof x !== "string") return "";
  return x.replace(/[\u0000-\u001F<>]/g, "").slice(0, 200);
}
function pickExt(mime) {
  if (!mime) return null;
  if (mime.includes("audio/mpeg")) return "mp3";
  if (mime.includes("audio/wav")) return "wav";
  if (mime.includes("audio/ogg")) return "ogg";
  if (mime.includes("image/png")) return "png";
  if (mime.includes("image/jpeg")) return "jpg";
  if (mime.includes("image/webp")) return "webp";
  if (mime.includes("image/svg+xml")) return "svg";
  return null;
}
async function readIndex(env) {
  const obj = await env.PUBLIC_BUCKET.get("tracks/tracks.json");
  if (!obj) return [];
  try { return JSON.parse(await obj.text()); } catch { return []; }
}
function join(base, key) {
  return base.endsWith("/") ? base + key : base + "/" + key;
}
function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...headers } });
}
/* ============================================================= */


/* =================== (ADDED) Métricas globais ===================
   - GET  /api/metrics?ids=1,2,3           → [{ id, playCount, likesCount }]
   - POST /api/tracks/:id/play             → { id, playCount }
   - POST /api/tracks/:id/like (body:{device, like})
                                      → { id, likesCount }
   Armazenamento por trackId no KV (binding METRICS):
   { playCount: number, likesSet: string[] }
   =============================================================== */
async function handleMetricsRoutes(req, env, cors) {
  const url = new URL(req.url);

  // GET /api/metrics?ids=1,2,3
  if (req.method === "GET" && url.pathname === "/api/metrics") {
    const idsStr = url.searchParams.get("ids") || "";
    const ids = idsStr.split(",").map(s => s.trim()).filter(Boolean);
    const out = [];
    for (const id of ids) {
      const raw = await env.METRICS.get(id);
      const v = raw ? JSON.parse(raw) : { playCount: 0, likesSet: [] };
      out.push({
        id,
        playCount: v.playCount || 0,
        likesCount: Array.isArray(v.likesSet) ? v.likesSet.length : 0
      });
    }
    return json(out, 200, cors);
  }

  // POST /api/tracks/:id/play
  {
    const m = url.pathname.match(/^\/api\/tracks\/([^/]+)\/play$/);
    if (req.method === "POST" && m) {
      const id = String(m[1]);
      // opcional: pode ler body para 'device' caso queira anti-spam
      // const body = await req.json().catch(() => ({}));
      const raw = await env.METRICS.get(id);
      const v = raw ? JSON.parse(raw) : { playCount: 0, likesSet: [] };
      v.playCount = (v.playCount || 0) + 1;
      await env.METRICS.put(id, JSON.stringify(v));
      return json({ id, playCount: v.playCount }, 200, cors);
    }
  }

  // POST /api/tracks/:id/like  { device, like: true|false }
  {
    const m = url.pathname.match(/^\/api\/tracks\/([^/]+)\/like$/);
    if (req.method === "POST" && m) {
      const id = String(m[1]);
      const body = await req.json().catch(() => ({}));
      const device = String(body.device || "").slice(0, 100);
      const like = !!body.like;
      if (!device) return json({ error: "device required" }, 400, cors);

      const raw = await env.METRICS.get(id);
      const v = raw ? JSON.parse(raw) : { playCount: 0, likesSet: [] };
      const set = new Set(Array.isArray(v.likesSet) ? v.likesSet : []);
      if (like) set.add(device); else set.delete(device);
      v.likesSet = [...set];
      await env.METRICS.put(id, JSON.stringify(v));
      return json({ id, likesCount: v.likesSet.length }, 200, cors);
    }
  }

  // não é rota de métricas
  return null;
}
/* ================= (END ADDED) Métricas globais ================= */
