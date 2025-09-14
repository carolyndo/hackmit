import {AppServer, AppSession} from "@mentra/sdk"
import dotenv from "dotenv"

dotenv.config()
import express from "express";
import cors from "cors";

// Add process error handlers
process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught Exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[FATAL] Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

console.log("[BOOT] Starting application...");
console.log("[BOOT] process.env.PORT =", JSON.stringify(process.env.PORT));
console.log("[BOOT] process.env.MENTRAOS_API_KEY =", process.env.MENTRAOS_API_KEY ? "SET" : "MISSING");

// ---- config ----
const PACKAGE_NAME = process.env.PACKAGE_NAME || "com.example.myfirstmentraosapp";
const PORT = parseInt(process.env.PORT || "8080", 10);
const MENTRA_PORT = parseInt(process.env.MENTRA_PORT || "8081", 10);
const MENTRAOS_API_KEY = process.env.MENTRAOS_API_KEY;

console.log(`[CONFIG] PORT=${PORT}, MENTRA_PORT=${MENTRA_PORT}, PACKAGE=${PACKAGE_NAME}`);

if (!MENTRAOS_API_KEY) {
  console.error("MENTRAOS_API_KEY environment variable is required");
  process.exit(1);
}

// ---- EXPRESS SERVER FIRST (to ensure Railway health checks work) ----
const api = express();

const allowedOrigins = [
  'https://jamiedani.github.io',
  'http://127.0.0.1:5500',
  'http://localhost:5500'
];

api.use(cors({
  origin: function (origin, callback) {
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

// Add request logging
api.use((req, res, next) => {
  console.log(`[REQUEST] ${req.method} ${req.url}`);
  next();
});

api.get("/", (req, res) => {
  console.log("[ROOT] Root endpoint accessed");
  res.json({ 
    message: "MentraOS App Server Running",
    timestamp: new Date().toISOString(),
    port: PORT,
    mentraPort: MENTRA_PORT,
    packageName: PACKAGE_NAME
  });
});

api.get("/healthz", (req, res) => {
  console.log("[HEALTHZ] Health check requested");
  res.json({ 
    ok: true, 
    timestamp: new Date().toISOString(),
    port: PORT,
    mentraPort: MENTRA_PORT,
    sessions: sessions.size
  });
});

// Start Express server FIRST
console.log(`[BOOT] Starting Express server on port ${PORT}...`);
const expressServer = api.listen(PORT, '0.0.0.0')
  .on("listening", () => {
    console.log(`[API ] ✅ Express server listening on 0.0.0.0:${PORT}`);
    console.log(`[API ] Should be accessible at Railway's assigned domain`);
  })
  .on("error", (err: any) => {
    console.error(`[API ] ❌ Failed to start Express server on ${PORT}:`, err);
    process.exit(1);
  });

// ---- session + render helpers ----
const sessions = new Set<AppSession>();
let lastPayload: { note: string; lyric: string; songTitle?: string; pitchCorrection?: { isCorrect: boolean; expectedNote?: string; sungNote?: string; detune?: number } } | null = null;
let lastPushAt = 0;
const MIN_UPDATE_MS = 16;

function clean(s: string, max = 140) {
  const t = (s || "").replace(/\s+/g, " ").trim();
  return t.length > max ? t.slice(0, max - 1) + "…" : t;
}

async function renderNoteLyric(session: AppSession, note: string, lyric: string, songTitle?: string, pitchCorrection?: { isCorrect: boolean; expectedNote?: string; sungNote?: string; detune?: number }) {
  let top = clean(note, 40);
  let bottom = clean(lyric, 240);
  
  if (songTitle && songTitle.trim()) {
    bottom += `\n\n🎵 ${clean(songTitle, 60)}`;
  }
  
  if (pitchCorrection) {
    if (pitchCorrection.isCorrect) {
      top = "CORRECT";
    } else {
      top = "WRONG";
      if (pitchCorrection.expectedNote && pitchCorrection.sungNote) {
        top = `WRONG\nExpected: ${pitchCorrection.expectedNote}\nSang: ${pitchCorrection.sungNote}`;
      }
    }
  }
  
  const layouts: any = (session as any).layouts;
  if (typeof layouts.showDoubleTextWall === "function") {
    await layouts.showDoubleTextWall(top, bottom);
  } else if (typeof layouts.showTextWall === "function") {
    await layouts.showTextWall(`${top}\n\n${bottom}`);
  } else if (typeof layouts.show === "function") {
    try { 
      await layouts.show({ layoutType: 2, topText: top, bottomText: bottom }); 
    } catch { 
      await layouts.show({ layoutType: 1, text: `${top}\n\n${bottom}` }); 
    }
  }
}

async function broadcast(note: string, lyric: string, songTitle?: string, pitchCorrection?: { isCorrect: boolean; expectedNote?: string; sungNote?: string; detune?: number }) {
  const now = Date.now();
  if (now - lastPushAt < MIN_UPDATE_MS) return;
  lastPushAt = now;

  const incoming = (note ?? "").trim();
  const lyricToUse = lyric ?? "";
  const songTitleToUse = songTitle ?? "";
  const effectiveNote = incoming || (lastPayload?.note || "");

  lastPayload = { note: effectiveNote, lyric: lyricToUse, songTitle: songTitleToUse, pitchCorrection };
  await Promise.allSettled(
    [...sessions].map(s => renderNoteLyric(s, effectiveNote, lyricToUse, songTitleToUse, pitchCorrection))
  );
}

api.post("/nowplaying", async (req, res) => {
  const { note, lyric, songTitle, pitchCorrection } = req.body || {};
  console.log("[API] /nowplaying", { note, lyric, songTitle, pitchCorrection });
  if (typeof note !== "string" || typeof lyric !== "string") {
    return res.status(400).json({ ok: false, error: "Expected JSON {note, lyric} as strings" });
  }
  await broadcast(note, lyric, songTitle, pitchCorrection);
  res.json({ ok: true });
});

// ---- MentraOS App Server (start after Express is running) ----
class MyMentraOSApp extends AppServer {
  protected override async onSession(session: AppSession, sessionId: string, userId: string): Promise<void> {
    console.log(`[SESSION] New session: ${sessionId} for user ${userId}`);
    sessions.add(session);
    
    try {
      if (lastPayload) {
        console.log(`[SESSION] Showing last payload`);
        await renderNoteLyric(session, lastPayload.note, lastPayload.lyric, lastPayload.songTitle, lastPayload.pitchCorrection);
      } else {
        console.log(`[SESSION] Showing initial message`);
        await session.layouts.showTextWall("Select a song on the app.");
      }
    } catch (error) {
      console.error(`[SESSION] Error displaying message:`, error);
    }
    
    session.events.onDisconnected(() => {
      sessions.delete(session);
      console.log(`[SESSION] Session ${sessionId} disconnected`);
    });
  }
}

// Start MentraOS server after Express is ready
setTimeout(() => {
  console.log(`[BOOT] Starting MentraOS server on port ${MENTRA_PORT}...`);
  
  const server = new MyMentraOSApp({
    packageName: PACKAGE_NAME,
    apiKey: MENTRAOS_API_KEY!,
    port: MENTRA_PORT,
  });

  server.start()
    .then(() => {
      console.log(`[APP ] ✅ MentraOS server running on port ${MENTRA_PORT}`);
      console.log(`[APP ] Package: ${PACKAGE_NAME}`);
      console.log(`[APP ] Ready for glasses connections`);
    })
    .catch(err => {
      console.error("[APP ] ❌ Failed to start MentraOS server:", err);
      // Don't exit - keep Express server running
    });
}, 2000); // Wait 2 seconds for Express to be fully ready