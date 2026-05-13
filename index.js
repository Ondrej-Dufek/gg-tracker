const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');

const app = express();
app.use(cors());

const API_KEY = 'RGAPI-6624fc31-2e85-41cf-9cef-4f2e4776e862';

app.get('/account/:name/:tag', async (req, res) => {
  try {
    const { name, tag } = req.params;
    const url = `https://europe.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(name)}/${encodeURIComponent(tag)}?api_key=${API_KEY}`;
    const r = await fetch(url);
    const data = await r.json();
    res.json(data);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/matches/:puuid', async (req, res) => {
  try {
    const { puuid } = req.params;
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const startTs = Math.floor(startOfDay.getTime() / 1000);
    const url = `https://europe.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?queue=420&start=0&count=20&startTime=${startTs}&api_key=${API_KEY}`;
    const r = await fetch(url);
    const data = await r.json();
    res.json(data);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/match/:matchId', async (req, res) => {
  try {
    const { matchId } = req.params;
    const url = `https://europe.api.riotgames.com/lol/match/v5/matches/${matchId}?api_key=${API_KEY}`;
    const r = await fetch(url);
    const data = await r.json();
    res.json(data);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/summoner/:puuid', async (req, res) => {
  try {
    const { puuid } = req.params;
    const url = `https://eun1.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${puuid}?api_key=${API_KEY}`;
    const r = await fetch(url);
    const data = await r.json();
    res.json(data);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Running on port ${PORT}`));

