const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.set('trust proxy', 1);

/* ============================================================
 *   CONFIGURACIÓN
 * ============================================================ */

const CACHE_TTL = 1000; // 1 segundo por bus
const WINDOW_TIME = 5 * 60 * 1000; // 5 minutos
const MAX_REQUESTS = 2000; // máximo por ventana
const BAN_TIME = 30 * 60 * 1000; // 30 minutos
const CLEANUP_INTERVAL = 10 * 60 * 1000; // limpiar memoria cada 10 min

/* ============================================================
 *   MEMORIA
 * ============================================================ */

const cache = new Map();       // cache por ppu
const clients = new Map();     // control IP + device
const inFlight = new Map();    // evita múltiples requests simultáneos a CVX

/* ============================================================
 *   LIMPIEZA AUTOMÁTICA DE MEMORIA
 * ============================================================ */

setInterval(() => {
  const now = Date.now();

  // limpiar cache vieja
  for (const [key, value] of cache.entries()) {
    if (now - value.timestamp > CACHE_TTL * 5) {
      cache.delete(key);
    }
  }

  // limpiar clientes antiguos
  for (const [key, value] of clients.entries()) {
    if (!value.bannedUntil && now - value.startTime > WINDOW_TIME * 2) {
      clients.delete(key);
    }
  }

  console.log("🧹 Limpieza automática ejecutada");
}, CLEANUP_INTERVAL);

/* ============================================================
 *   PROTECCIÓN AVANZADA IP + DEVICE
 * ============================================================ */

function securityMiddleware(req, res, next) {

  const ip = req.ip;
  const deviceId = req.query.deviceId || 'no-device';
  const key = ip + "-" + deviceId;
  const now = Date.now();

  if (!clients.has(key)) {
    clients.set(key, {
      count: 1,
      startTime: now,
      bannedUntil: null
    });
    return next();
  }

  const client = clients.get(key);

  // 🔴 Si está baneado
  if (client.bannedUntil && now < client.bannedUntil) {
    return res.status(403).json({
      error: "Bloqueado temporalmente por abuso."
    });
  }

  // Si terminó el ban
  if (client.bannedUntil && now >= client.bannedUntil) {
    client.bannedUntil = null;
    client.count = 1;
    client.startTime = now;
    return next();
  }

  // Ventana activa
  if (now - client.startTime < WINDOW_TIME) {
    client.count++;

    if (client.count > MAX_REQUESTS) {
      client.bannedUntil = now + BAN_TIME;
      console.log("🚫 Baneado:", key);
      return res.status(403).json({
        error: "Demasiadas solicitudes. Bloqueado 30 minutos."
      });
    }

  } else {
    client.count = 1;
    client.startTime = now;
  }

  next();
}

app.use('/cvx', securityMiddleware);

/* ============================================================
 *   ENDPOINT PRINCIPAL CON CACHE + CONTROL DE CONSUMO
 * ============================================================ */

app.get('/cvx', async (req, res) => {

  const { ppu } = req.query;

  if (!ppu) {
    return res.status(400).json({ error: 'Falta parámetro ppu' });
  }

  const now = Date.now();

  // 1️⃣ Revisar cache
  if (cache.has(ppu)) {
    const cached = cache.get(ppu);

    if (now - cached.timestamp < CACHE_TTL) {
      return res.json(cached.data);
    }
  }

  // 2️⃣ Evitar múltiples requests simultáneos al mismo bus
  if (inFlight.has(ppu)) {
    return res.json(await inFlight.get(ppu));
  }

  // 3️⃣ Hacer request a CVX
  const requestPromise = axios.get(
    `https://api.cvx-r.cl/api/localizacion/?ic=0211&ppu=${ppu}`,
    {
      headers: {
        token: 'pptIW9ZOHXSv6UFU5M5vkM5LvhhT9dWfmwjucPwtorZxtKd1KwcBBbfpGlyLkow3',
      },
      timeout: 5000
    }
  )
  .then(response => {
    cache.set(ppu, {
      data: response.data,
      timestamp: Date.now()
    });
    return response.data;
  })
  .catch(err => {
    console.error("Error CVX:", err.message);
    throw err;
  })
  .finally(() => {
    inFlight.delete(ppu);
  });

  inFlight.set(ppu, requestPromise);

  try {
    const data = await requestPromise;
    res.json(data);
  } catch {
    res.status(500).json({ error: "Error al contactar API CVX" });
  }
});

/* ============================================================
 *   ROOT
 * ============================================================ */

app.get('/', (req, res) => {
  res.send('CVX Proxy API PRO - OK');
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor PRO escuchando en puerto ${PORT}`);
});
