const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.set('trust proxy', 1);

/* ================= CONFIG ================= */

const CACHE_TTL = 2000; // 2 segundos (más seguro)
const WINDOW_TIME = 5 * 60 * 1000;
const MAX_REQUESTS = 4000;
const BAN_TIME = 30 * 60 * 1000;
const SESSION_TIME_LIMIT = 1 * 60 * 1000; // 5 minutos



/* ================= MEMORIA ================= */

const cache = new Map();
const clients = new Map();

/* ================= LIMPIEZA ================= */

setInterval(() => {
  const now = Date.now();

  for (const [ppu, value] of cache.entries()) {
    if (now - value.timestamp > CACHE_TTL * 10) {
      cache.delete(ppu);
    }
  }

  for (const [key, value] of clients.entries()) {
    if (!value.bannedUntil && now - value.startTime > WINDOW_TIME * 2) {
      clients.delete(key);
    }
  }

  console.log("🧹 Limpieza ejecutada");
}, 10 * 60 * 1000);

/* ================= SEGURIDAD ================= */


function security(req, res, next) {

  const ip = req.ip;
  const deviceId = req.query.deviceId;
  const now = Date.now();

  // 🚫 Bloquear si no hay IP válida
  if (!ip) {
    return res.status(403).json({
      error: "IP no detectada"
    });
  }

  // 🚫 Bloquear si no hay deviceId
  if (!deviceId) {
    return res.status(403).json({
      error: "deviceId requerido"
    });
  }

  const key = ip + "-" + deviceId;

  if (!clients.has(key)) {
    clients.set(key, {
      sessionStart: now,
      bannedUntil: null
    });
    return next();
  }

  const client = clients.get(key);

  // 🚫 Si está baneado
  if (client.bannedUntil && now < client.bannedUntil) {
    return res.status(403).json({
      error: "Bloqueado 30 minutos"
    });
  }

  // 🔁 Si terminó el ban
  if (client.bannedUntil && now >= client.bannedUntil) {
    client.bannedUntil = null;
    client.sessionStart = now;
    return next();
  }

  // ⏳ Si supera tiempo máximo
  if (now - client.sessionStart > SESSION_TIME_LIMIT) {

    client.bannedUntil = now + BAN_TIME;

    return res.status(403).json({
      error: "Tiempo máximo de uso alcanzado. Bloqueado 30 minutos."
    });
  }

  next();
}




app.use('/cvx', security);

/* ================= ENDPOINT ================= */

app.get('/cvx', async (req, res) => {
  const { ppu } = req.query;
  if (!ppu) return res.status(400).json({ error: "Falta ppu" });

  const now = Date.now();

  // 1️⃣ CACHE
  if (cache.has(ppu)) {
    const cached = cache.get(ppu);
    if (now - cached.timestamp < CACHE_TTL) {
      return res.json(cached.data);
    }
  }

  // 2️⃣ CONSULTA REAL
  try {
    const response = await axios.get(
      `https://api.cvx-r.cl/api/localizacion/?ic=0211&ppu=${ppu}`,
      {
        headers: { token: 'pptIW9ZOHXSv6UFU5M5vkM5LvhhT9dWfmwjucPwtorZxtKd1KwcBBbfpGlyLkow3' },
        timeout: 8000
      }
    );

    cache.set(ppu, {
      data: response.data,
      timestamp: Date.now()
    });

    return res.json(response.data);

  } catch (err) {

    console.error("Error CVX:", err.message);

    // 3️⃣ FALLBACK: si falla CVX, devolver último cache si existe
    if (cache.has(ppu)) {
      return res.json(cache.get(ppu).data);
    }

    return res.status(500).json({ error: "Error CVX" });
  }
});

/* ================= ROOT ================= */

app.get('/', (req, res) => {
  res.send('CVX Proxy STABLE - OK');
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor estable en puerto ${PORT}`);
});
