const express = require('express');
const cors = require('cors');
const { google } = require('googleapis');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

const SHEET_ID = "1h-V1q5MpZ51AXJEFI4VEInnbuqO2pxNQuhDg_vGTSRw";

// ✅ Keys LOWERCASE honi chahiye (frontend se lowercase aata hai)
// Values = Google Sheet mein jo tab name EXACTLY likha hai
const CLUB_SHEET_MAP = {
  manutd:        'Manutd',        // Tab: Manutd
  mancity:       'Mancity',       // Tab: Mancity
  everton:       'Everton',       // Tab: Everton
  astonvilla:    'AstonVilla',    // Tab: AstonVilla
  wolves:        'Wolves',        // Tab: Wolves (agar hai)
  tottenham:     'Tottenham',     // Tab: Tottenham
  crystalpalace: 'CrystalPalace', // Tab: CrystalPalace
  fifa:          'FIFA',          // Tab: FIFA (agar hai)
  newcastle:     'Newcastle',     // Tab: Newcastle
  music:         'Music',         // Tab: Music (agar hai)
  arsenal:       'Arsenal',       // Tab: Arsenal
  brentford:     'Brentford',     // Tab: Brentford (agar hai)
};

// Screenshot mein dikhe tabs: Sheet11, Manutd, Mancity, CrystalPalace, Everton, Arsenal, Newcastle, AstonVilla, Tottenham

const DEFAULT_SHEET_TAB = 'Sheet11'; // Tumhara main tab Sheet11 hai

const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS || '{}'),
  scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"]
});

const clubCache = {};

async function getSheetDataForClub(clubKey) {
  const client = await auth.getClient();
  const sheets = google.sheets({ version: "v4", auth: client });
  const tabName = CLUB_SHEET_MAP[clubKey] || DEFAULT_SHEET_TAB;
  console.log(`📋 Fetching [${clubKey}] from tab: "${tabName}"`);
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${tabName}!A:Y`
  });
  return res.data.values || [];
}

// ✅ Per-club route
app.get('/orders/:club', async (req, res) => {
  // lowercase + spaces hata do (manutd, mancity, crystalpalace etc.)
  const clubKey = req.params.club.toLowerCase().replace(/\s+/g, '').replace(/-/g, '');
  try {
    if (clubCache[clubKey] && clubCache[clubKey].length > 0) {
      return res.json(clubCache[clubKey]);
    }
    const data = await getSheetDataForClub(clubKey);
    clubCache[clubKey] = data;
    res.json(data);
  } catch (err) {
    console.log(`❌ /orders/${clubKey} error:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// ✅ Legacy /orders route — Sheet11 se (jo pehle kaam kar raha tha)
app.get('/orders', async (req, res) => {
  try {
    if (clubCache['_default'] && clubCache['_default'].length > 0) {
      return res.json(clubCache['_default']);
    }
    const client = await auth.getClient();
    const sheets = google.sheets({ version: "v4", auth: client });
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${DEFAULT_SHEET_TAB}!A:Y`
    });
    const data = result.data.values || [];
    clubCache['_default'] = data;
    res.json(data);
  } catch (err) {
    console.log("❌ /orders error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ✅ Background poller
async function pollAllClubs() {
  const clubKeys = Object.keys(CLUB_SHEET_MAP);
  for (const clubKey of clubKeys) {
    try {
      const data = await getSheetDataForClub(clubKey);
      const changed = JSON.stringify(clubCache[clubKey] || []) !== JSON.stringify(data);
      if (changed) {
        clubCache[clubKey] = data;
        io.emit('ordersUpdate', { club: clubKey, data });
        console.log(`✅ [${clubKey}] updated!`);
      }
    } catch (err) {
      console.log(`❌ Poll [${clubKey}]:`, err.message);
    }
    await new Promise(r => setTimeout(r, 600));
  }
}

setInterval(pollAllClubs, 10000);
pollAllClubs();

// ✅ Health check (UptimeRobot ke liye)
app.get('/health', (req, res) => res.status(200).send('OK'));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

server.listen(3000, () => {
  console.log('✅ Server running on http://localhost:3000');
});