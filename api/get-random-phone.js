// /api/get-random-phone.js
export default async function handler(req, res) {
  try {
    // ⚙️ EDITA TU AGENCY_ID AQUÍ
    const AGENCY_ID = 14;

    // ✅ Nuevo endpoint (estructura nueva)
    const API_URL = `https://api.asesadmin.com/api/v1/agency/${AGENCY_ID}/random-contact`;

    const response = await fetch(API_URL, {
      headers: { "Cache-Control": "no-store" },
    });

    if (!response.ok) {
      throw new Error(`Error HTTP ${response.status}`);
    }

    const data = await response.json();

    // ✅ Landing tipo B => números activos NO ADS
    const list = data?.whatsapp || [];

    if (!Array.isArray(list) || list.length === 0) {
      throw new Error("No hay números disponibles en whatsapp (normal)");
    }

    // ✅ Elegimos 1 número al azar
    let phone = String(list[Math.floor(Math.random() * list.length)] || "").trim();

    // Normalización: solo dígitos (tu HTML lo acepta)
    phone = phone.replace(/\D+/g, "");

    // Opcional AR: si viene 10 dígitos, antepone 54
    if (phone.length === 10) phone = "54" + phone;

    if (!phone || phone.length < 8) {
      throw new Error("No se encontró número válido");
    }

    // Evitar cache también en la respuesta
    res.setHeader("Cache-Control", "no-store, max-age=0");

    // ✅ IMPORTANTE: devolvemos formato “viejo” compatible con tu HTML:
    // parseApiPayload() detecta phone_number y arma [{phone, weight}]
    return res.status(200).json({ phone_number: phone });
  } catch (err) {
    console.error("❌ Error al obtener número:", err?.message || err);

    // ❌ SIN FALLBACK: igual que tu API anterior
    return res.status(500).json({
      error: "No se pudo obtener número",
      details: err?.message || String(err),
    });
  }
}
