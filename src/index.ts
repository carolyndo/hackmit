import {AppServer, AppSession} from "@mentra/sdk"
import dotenv from "dotenv"

dotenv.config()
import express from "express";
import cors from "cors";

console.log("[BOOT] process.env.PORT =", JSON.stringify(process.env.PORT));

// ---- config ----
const PACKAGE_NAME = process.env.PACKAGE_NAME || "com.example.myfirstmentraosapp";
const PORT = parseInt(process.env.PORT || "8080", 10);
const API_PORT = PORT + 1;
const MENTRAOS_API_KEY = process.env.MENTRAOS_API_KEY;
if (!MENTRAOS_API_KEY) {
  console.error("MENTRAOS_API_KEY environment variable is required");
  process.exit(1);
}

// ---- session + render helpers ----
const sessions = new Set<AppSession>();
let lastPayload: { note: string; lyric: string; songTitle?: string; pitchCorrection?: { isCorrect: boolean; expectedNote?: string; sungNote?: string; detune?: number } } | null = null;
let lastPushAt = 0;
const MIN_UPDATE_MS = 16; // ~60fps for smooth real-time display

function clean(s: string, max = 140) {
  const t = (s || "").replace(/\s+/g, " ").trim();
  return t.length > max ? t.slice(0, max - 1) + "…" : t;
}

async function renderNoteLyric(session: AppSession, note: string, lyric: string, songTitle?: string, pitchCorrection?: { isCorrect: boolean; expectedNote?: string; sungNote?: string; detune?: number }) {
  let top = clean(note, 40);
  let bottom = clean(lyric, 240);
  
  // Add song title underneath lyrics if available
  if (songTitle && songTitle.trim()) {
    bottom += `\n\n🎵 ${clean(songTitle, 60)}`;
  }
  
  // Add pitch correction display if available
  if (pitchCorrection) {
    if (pitchCorrection.isCorrect) {
      top = "CORRECT";
    } else {
      top = "WRONG";
      if (pitchCorrection.expectedNote && pitchCorrection.sungNote) {
        top = `WRONG\nExpected: ${pitchCorrection.expectedNote}\nSang: ${pitchCorrection.sungNote}`;
      }
    }
    // Keep lyrics on the right side (bottom) as normal
  }
  
  const layouts: any = (session as any).layouts;
  if (typeof layouts.showDoubleTextWall === "function") {
    await layouts.showDoubleTextWall(top, bottom);
  } else if (typeof layouts.showTextWall === "function") {
    await layouts.showTextWall(`${top}\n\n${bottom}`);
  } else if (typeof layouts.show === "function") {
    try { await layouts.show({ layoutType: 2, topText: top, bottomText: bottom }); }
    catch { await layouts.show({ layoutType: 1, text: `${top}\n\n${bottom}` }); }
  }
}

async function broadcast(note: string, lyric: string, songTitle?: string, pitchCorrection?: { isCorrect: boolean; expectedNote?: string; sungNote?: string; detune?: number }) {
  const now = Date.now();
  if (now - lastPushAt < MIN_UPDATE_MS) return;
  lastPushAt = now;

  const incoming = (note ?? "").trim();
  const lyricToUse = lyric ?? "";
  const songTitleToUse = songTitle ?? "";

  // If the client sent an empty note (common on lyric ticks), reuse last note
  const effectiveNote = incoming || (lastPayload?.note || "");

  lastPayload = { note: effectiveNote, lyric: lyricToUse, songTitle: songTitleToUse, pitchCorrection };
  await Promise.allSettled(
    [...sessions].map(s => renderNoteLyric(s, effectiveNote, lyricToUse, songTitleToUse, pitchCorrection))
  );
}

/**
 * Mentra app server (unchanged except: no hardcoded text; show waiting msg)
 */
class MyMentraOSApp extends AppServer {
  protected override async onSession(session: AppSession, sessionId: string, userId: string): Promise<void> {
    session.logger.info(`New session: ${sessionId} for user ${userId}`);
    sessions.add(session);
    if (lastPayload) {
      await renderNoteLyric(session, lastPayload.note, lastPayload.lyric, lastPayload.songTitle, lastPayload.pitchCorrection);
    } else {
      await session.layouts.showTextWall("Select a song on the app. Say 'play' to just play the song or say 'sing' to learn to perform it.");
    }
    session.events.onDisconnected(() => {
      sessions.delete(session);
      session.logger.info(`Session ${sessionId} disconnected.`);
    });
  }
}

const server = new MyMentraOSApp({
  packageName: PACKAGE_NAME,
  apiKey: MENTRAOS_API_KEY!,
  port: PORT,
});

// Start Mentra app
server.start()
  .then(() => {
    console.log(`[APP ] Mentra app running at http://localhost:${PORT} (package=${PACKAGE_NAME})`);
  })
  .catch(err => {
    console.error("Failed to start Mentra app:", err);
  });

// ---- tiny HTTP API on PORT+1 (for your web page) ----
const api = express();

const allowedOrigins = [
  'https://jamiedani.github.io',
  'http://127.0.0.1:5500',
  'http://localhost:5500'
];

api.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));
api.use(express.json());

api.get("/healthz", (_req, res) => res.json({ ok: true }));

api.post("/nowplaying", async (req, res) => {
  const { note, lyric, songTitle, pitchCorrection } = req.body || {};
  console.log("[API] /nowplaying", { note, lyric, songTitle, pitchCorrection });
  if (typeof note !== "string" || typeof lyric !== "string") {
    return res.status(400).json({ ok: false, error: "Expected JSON {note, lyric} as strings" });
  }
  await broadcast(note, lyric, songTitle, pitchCorrection);
  res.json({ ok: true });
});

api.listen(API_PORT)
  .on("listening", () => {
    console.log(`[API ] Listening on http://localhost:${API_PORT}`);
  })
  .on("error", (err: any) => {
    console.error(`[API ] Failed to listen on ${API_PORT}:`, err?.code || err, " — try a different port");
  });