// server.js
const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

app.get('/cvx', async (req, res) => {
  const ppu = req.query.ppu;
  if (!ppu) {
    return res.status(400).json({ error: 'Falta parámetro ppu' });
  }

  try {
    const response = await axios.get(`https://api.cvx-r.cl/api/localizacion/?ic=0211&ppu=${ppu}`, {
      headers: {
        token: 'pptIW9ZOHXSv6UFU5M5vkM5LvhhT9dWfmwjucPwtorZxtKd1KwcBBbfpGlyLkow3',
      },
    });

    res.json(response.data);
  } catch (err) {
    console.error('Error al contactar API CVX:', err.message);
    res.status(500).json({ error: 'Error al contactar API CVX' });
  }
});

app.get('/', (req, res) => {
  res.send('CVX Proxy API - OK');
});

app.listen(PORT, () => {
  console.log(`Servidor escuchando en puerto ${PORT}`);
});
