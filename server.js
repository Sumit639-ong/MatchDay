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

const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS || '{}'),
  scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"]
});

let lastData = [];

async function getSheetData() {
  const client = await auth.getClient();
  const sheets = google.sheets({ version: "v4", auth: client });

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: "Sheet1!A:Y"
  });

  return res.data.values || [];
}

// ✅ FIX 1: /orders route — frontend calls fetch('/orders') every 5s
app.get('/orders', async (req, res) => {
  try {
    // If we already have cached data, return it immediately
    if (lastData.length > 0) {
      return res.json(lastData);
    }
    // Otherwise fetch fresh from sheet
    const data = await getSheetData();
    lastData = data;
    res.json(data);
  } catch (err) {
    console.log("❌ /orders error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// Background poller: keeps lastData fresh & pushes via Socket.IO
setInterval(async () => {
  try {
    const data = await getSheetData();

    console.log("📊 RAW SHEET DATA:", data);

    if (JSON.stringify(data) !== JSON.stringify(lastData)) {
      io.emit("ordersUpdate", data);
      lastData = data;
      console.log("✅ Sheet updated — pushed to all clients!");
    }
  } catch (err) {
    console.log("❌ Google Sheet Error:", err.message);
  }
}, 5000);

// Serve frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

server.listen(3000, () => {
  console.log('✅ Server running on http://localhost:3000');
});