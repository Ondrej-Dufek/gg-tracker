const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');

const app = express();
app.use(cors());

const API_KEY = process.env.RIOT_API_KEY;
const PLAYERS = [
  { name: 'OndyyS', tag: 'cream' },
  { name: 'Moltiks', tag: 'cream' },
  { name: 'Tobyy', tag: '1v9' },
];

// In-memory cache
let cache = { today: null, week: null, month: null };
let lastUpdated = null;

const TIMEZONE_OFFSET_HOURS = 2; // CET/CEST (UTC+2)

function getStartTime(tab) {
  const now = new Date();
  const localNow = new Date(now.getTime() + TIMEZONE_OFFSET_HOURS * 3600000);
  if (tab === 'today') {
    const d = new Date(localNow); d.setUTCHours(0,0,0,0);
    return Math.floor(d.getTime()/1000) - TIMEZONE_OFFSET_HOURS * 3600;
  } else if (tab === 'week') {
    const d = new Date(localNow); d.setUTCHours(0,0,0,0);
    const day = d.getUTCDay(); const diff = day === 0 ? -6 : 1 - day;
    d.setUTCDate(d.getUTCDate() + diff);
    return Math.floor(d.getTime()/1000) - TIMEZONE_OFFSET_HOURS * 3600;
  } else {
    const d = new Date(Date.UTC(localNow.getUTCFullYear(), localNow.getUTCMonth(), 1));
    return Math.floor(d.getTime()/1000) - TIMEZONE_OFFSET_HOURS * 3600;
  }
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function getPUUID(name, tag) {
  const res = await fetch(`https://europe.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(name)}/${encodeURIComponent(tag)}?api_key=${API_KEY}`);
  const data = await res.json();
  if (!res.ok || data.status) throw new Error(`Account not found: ${name}#${tag}`);
  return data.puuid;
}

async function getMatchIds(puuid, tab) {
  const startTime = getStartTime(tab);
  const res = await fetch(`https://europe.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?queue=420&start=0&count=200&startTime=${startTime}&api_key=${API_KEY}`);
  return await res.json();
}

async function getMatchData(matchId, puuid, full) {
  const res = await fetch(`https://europe.api.riotgames.com/lol/match/v5/matches/${matchId}?api_key=${API_KEY}`);
  if (!res.ok) return null;
  const data = await res.json();
  if (!data.info || !data.info.participants) return null;
  const p = data.info.participants.find(p => p.puuid === puuid);
  if (!p) return null;
  if (!full) return { win: p.win };
  return { win: p.win, champion: p.championName, kills: p.kills, deaths: p.deaths, assists: p.assists };
}

async function getSummonerIcon(puuid) {
  try {
    const res = await fetch(`https://eun1.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${puuid}?api_key=${API_KEY}`);
    if (!res.ok) return null;
    const data = await res.json();
    return `https://ddragon.leagueoflegends.com/cdn/14.24.1/img/profileicon/${data.profileIconId}.png`;
  } catch { return null; }
}

async function fetchPlayerForTab(player, tab, delay) {
  await sleep(delay);
  try {
    console.log(`Fetching ${player.name} for tab ${tab}...`);
    const puuid = await getPUUID(player.name, player.tag);
    console.log(`Got PUUID for ${player.name}`);
    await sleep(200);
    const matchIds = await getMatchIds(puuid, tab);
    console.log(`Got ${Array.isArray(matchIds) ? matchIds.length : 'ERROR'} matches for ${player.name} (${tab}):`, Array.isArray(matchIds) ? '' : JSON.stringify(matchIds));
    if (!Array.isArray(matchIds)) return { ok: false, player, error: `Bad matchIds: ${JSON.stringify(matchIds)}` };
    const matches = [];
    const countOnly = [];
    for (let i = 0; i < matchIds.length; i++) {
      await sleep(100);
      const m = await getMatchData(matchIds[i], puuid, i < 10);
      if (!m) continue;
      if (i < 10) matches.push(m);
      else countOnly.push(m.win);
    }
    const wins = matches.filter(m => m.win).length + countOnly.filter(w => w === true).length;
    const losses = matches.filter(m => !m.win).length + countOnly.filter(w => w === false).length;
    console.log(`${player.name} (${tab}): ${wins}W ${losses}L`);
    const iconUrl = await getSummonerIcon(puuid);
    return { ok: true, player, wins, losses, iconUrl, matches };
  } catch(e) {
    console.error(`Error fetching ${player.name} (${tab}):`, e.message);
    return { ok: false, player, error: e.message };
  }
}

async function refreshCache() {
  console.log('Refreshing cache...', new Date().toISOString());
  for (const tab of ['today', 'week', 'month']) {
    const results = [];
    for (let i = 0; i < PLAYERS.length; i++) {
      const result = await fetchPlayerForTab(PLAYERS[i], tab, i * 800);
      results.push(result);
    }
    cache[tab] = results;
    await sleep(2000); // gap between tabs
  }
  lastUpdated = new Date().toISOString();
  console.log('Cache refreshed at', lastUpdated);
}

// API endpoints
app.get('/cache/:tab', (req, res) => {
  const { tab } = req.params;
  if (!['today', 'week', 'month'].includes(tab)) return res.status(400).json({ error: 'Invalid tab' });
  if (!cache[tab]) return res.json({ loading: true });
  res.json({ data: cache[tab], lastUpdated });
});

app.get('/refresh', async (req, res) => {
  res.json({ message: 'Refresh started' });
  await refreshCache();
});

// Keep old endpoints for compatibility
app.get('/account/:name/:tag', async (req, res) => {
  try {
    const { name, tag } = req.params;
    const url = `https://europe.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(name)}/${encodeURIComponent(tag)}?api_key=${API_KEY}`;
    const r = await fetch(url); res.json(await r.json());
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/matches/:puuid', async (req, res) => {
  try {
    const { puuid } = req.params;
    const startTime = req.query.startTime || getStartTime('today');
    const url = `https://europe.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?queue=420&start=0&count=200&startTime=${startTime}&api_key=${API_KEY}`;
    const r = await fetch(url); res.json(await r.json());
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/match/:matchId', async (req, res) => {
  try {
    const url = `https://europe.api.riotgames.com/lol/match/v5/matches/${req.params.matchId}?api_key=${API_KEY}`;
    const r = await fetch(url); res.json(await r.json());
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/summoner/:puuid', async (req, res) => {
  try {
    const url = `https://eun1.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${req.params.puuid}?api_key=${API_KEY}`;
    const r = await fetch(url); res.json(await r.json());
  } catch(e) { res.status(500).json({ error: e.message }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Running on port ${PORT}`);
  // Initial cache fill on startup
  refreshCache();
  // Refresh every 5 minutes
  setInterval(refreshCache, 5 * 60 * 1000);
});
