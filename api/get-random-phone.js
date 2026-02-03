// /api/get-random-phone.js
// ✅ Devuelve 1 número LISTO para WhatsApp
// ✅ AGENCY dinámico por query: ?agency=17
// ✅ Plan A/B/C/D: upstream -> normal list -> last good -> soporte

const CONFIG = {
  // Nombre de marca (solo informativo)
  BRAND_NAME: "Geraldina",

  // Soporte (Plan D)
  SUPPORT_FALLBACK_ENABLED: true,
  SUPPORT_FALLBACK_NUMBER: "5491169789243",

  // Robustez
  TIMEOUT_MS: 2500,
  MAX_RETRIES: 2,

  UPSTREAM_BASE: "https://api.asesadmin.com/api/v1",
};

// Cache en memoria del serverless (puede resetearse, pero ayuda)
let LAST_GOOD_BY_AGENCY = Object.create(null);

const pickRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];

function normalizePhone(raw) {
  let phone = String(raw || "").replace(/\D+/g, "");
  // Si te viene 10 dígitos (sin 54) asumimos AR
  if (phone.length === 10) phone = "54" + phone;
  if (!phone || phone.length < 8) return null;
  return phone;
}

async function fetchJsonWithTimeout(url, timeoutMs) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  const started = Date.now();
  try {
    const res = await fetch(url, {
      headers: { "Cache-Control": "no-store" },
      signal: ctrl.signal,
    });
    const ms = Date.now() - started;

    if (!res.ok) {
      const err = new Error(`HTTP ${res.status}`);
      err.http_status = res.status;
      err.ms = ms;
      throw err;
    }

    const json = await res.json();
    return { json, ms, status: res.status };
  } finally {
    clearTimeout(t);
  }
}

export default async function handler(req, res) {
  const startedAt = Date.now();

  // Cache-control fuerte
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Pragma", "no-cache");

  // ✅ agency dinámico
  const agencyId = Number(req.query.agency || 17);
  const mode = String(req.query.mode || "normal").toLowerCase();

  // Guardamos/traemos "last good" por agency
  const lastGood = LAST_GOOD_BY_AGENCY[String(agencyId)] || null;

  try {
    const API_URL = `${CONFIG.UPSTREAM_BASE}/agency/${agencyId}/random-contact`;

    // ============================================================
    // ✅ Plan A: upstream con timeout + retries
    // ============================================================
    let data = null;
    let upstreamMeta = { attempts: 0, last_error: null, ms: null, status: null };

    for (let attempt = 1; attempt <= CONFIG.MAX_RETRIES && !data; attempt++) {
      upstreamMeta.attempts = attempt;
      try {
        const r = await fetchJsonWithTimeout(API_URL, CONFIG.TIMEOUT_MS);
        data = r.json;
        upstreamMeta.ms = r.ms;
        upstreamMeta.status = r.status;
      } catch (e) {
        upstreamMeta.last_error = e?.message || "unknown";
        upstreamMeta.status = e?.http_status || null;
      }
    }

    if (!data) {
      throw new Error(`Upstream fail: ${upstreamMeta.last_error || "unknown"}`);
    }

    // ============================================================
    // ✅ Plan B: SOLO NORMAL => data.whatsapp
    // ============================================================
    const normalList = Array.isArray(data?.whatsapp) ? data.whatsapp : [];

    if (!normalList.length) {
      throw new Error("whatsapp (normal) vacío");
    }

    const rawPhone = pickRandom(normalList);
    const phone = normalizePhone(rawPhone);

    if (!phone) throw new Error("Número inválido desde whatsapp (normal)");

    // ============================================================
    // ✅ Plan C (server): guardar “último bueno” por agency
    // ============================================================
    const meta = {
      agency_id: agencyId,
      source: "whatsapp",
      ts: new Date().toISOString(),
      upstream: upstreamMeta,
      normal_len: normalList.length,
      mode,
    };

    LAST_GOOD_BY_AGENCY[String(agencyId)] = { number: phone, meta };

    // ✅ Respuesta compatible con tu HTML: {number, name}
    return res.status(200).json({
      number: phone,
      name: CONFIG.BRAND_NAME,
      weight: 1,
      mode,
      agency_id: agencyId,
      chosen_from: "whatsapp",
      ms: Date.now() - startedAt,
      upstream: upstreamMeta,
    });
  } catch (err) {
    // ============================================================
    // ✅ Plan C (respuesta): devolver “último bueno” si existe
    // ============================================================
    if (lastGood?.number && String(lastGood.number).length >= 8) {
      return res.status(200).json({
        number: lastGood.number,
        name: "LastGoodCache",
        weight: 1,
        mode,
        agency_id: agencyId,
        cache: true,
        last_good_meta: lastGood.meta || null,
        error: err?.message || "unknown_error",
        ms: Date.now() - startedAt,
      });
    }

    // ============================================================
    // ✅ Plan D: soporte
    // ============================================================
    if (CONFIG.SUPPORT_FALLBACK_ENABLED) {
      return res.status(200).json({
        number: CONFIG.SUPPORT_FALLBACK_NUMBER,
        name: "SupportFallback",
        weight: 1,
        mode,
        agency_id: agencyId,
        fallback: true,
        error: err?.message || "unknown_error",
        ms: Date.now() - startedAt,
      });
    }

    // Si querés que el frontend decida:
    return res.status(503).json({
      error: "NO_NUMBER_AVAILABLE",
      mode,
      agency_id: agencyId,
      details: err?.message || "unknown_error",
      ms: Date.now() - startedAt,
    });
  }
}
