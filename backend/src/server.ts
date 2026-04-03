import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { analyzeClaimWithProvider } from "./services/analysisService.js";

const app = express();
const port = process.env.PORT ?? 4000;
const MAX_CHUNKS = 30;

type RealtimeSession = {
  id: string;
  type: "text" | "audio" | "video";
  claimedSources: string[];
  chunks: Array<{
    text: string;
    source: "screen" | "audio";
    timestamp: number;
  }>;
  updatedAt: number;
};

const realtimeSessions = new Map<string, RealtimeSession>();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(morgan("dev"));

app.get("/", (_req, res) => {
  res.json({
    ok: true,
    service: "veriph-backend",
    message: "Backend is running. Use /api/health for health checks."
  });
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "veriph-backend" });
});

app.post("/api/analyze/:type", async (req, res) => {
  const type = req.params.type;
  if (!["text", "audio", "video"].includes(type)) {
    return res.status(400).json({ error: "Invalid type. Use text, audio, or video." });
  }

  const { content, claimedSources } = req.body as {
    content?: string;
    claimedSources?: string[];
  };

  if (!content || typeof content !== "string" || content.trim().length < 8) {
    return res.status(400).json({ error: "Content is required and must be at least 8 chars." });
  }

  const result = await analyzeClaimWithProvider({
    type: type as "text" | "audio" | "video",
    content,
    claimedSources: Array.isArray(claimedSources) ? claimedSources : []
  });

  return res.json(result);
});

app.post("/api/realtime/session", (req, res) => {
  const { type, claimedSources } = req.body as {
    type?: "text" | "audio" | "video";
    claimedSources?: string[];
  };

  if (!type || !["text", "audio", "video"].includes(type)) {
    return res.status(400).json({ error: "Invalid type. Use text, audio, or video." });
  }

  const id = crypto.randomUUID();
  const session: RealtimeSession = {
    id,
    type,
    claimedSources: Array.isArray(claimedSources) ? claimedSources : [],
    chunks: [],
    updatedAt: Date.now()
  };
  realtimeSessions.set(id, session);

  return res.json({ sessionId: id });
});

app.post("/api/realtime/session/:id/chunk", async (req, res) => {
  const session = realtimeSessions.get(req.params.id);
  if (!session) {
    return res.status(404).json({ error: "Realtime session not found." });
  }

  const { text, source, timestamp } = req.body as {
    text?: string;
    source?: "screen" | "audio";
    timestamp?: number;
  };

  if (!text || typeof text !== "string" || text.trim().length < 2) {
    return res.status(400).json({ error: "Text is required and must be at least 2 chars." });
  }

  if (source !== "screen" && source !== "audio") {
    return res.status(400).json({ error: "Source must be screen or audio." });
  }

  session.chunks.push({
    text: text.trim(),
    source,
    timestamp: typeof timestamp === "number" ? timestamp : Date.now()
  });

  if (session.chunks.length > MAX_CHUNKS) {
    session.chunks = session.chunks.slice(session.chunks.length - MAX_CHUNKS);
  }
  session.updatedAt = Date.now();

  const mergedContent = session.chunks
    .map((chunk) => `[${chunk.source}] ${chunk.text}`)
    .join(" ");

  const result = await analyzeClaimWithProvider({
    type: session.type,
    content: mergedContent,
    claimedSources: session.claimedSources
  });

  return res.json({
    sessionId: session.id,
    chunkCount: session.chunks.length,
    mergedContent,
    result
  });
});

app.get("/api/realtime/session/:id", async (req, res) => {
  const session = realtimeSessions.get(req.params.id);
  if (!session) {
    return res.status(404).json({ error: "Realtime session not found." });
  }

  const mergedContent = session.chunks
    .map((chunk) => `[${chunk.source}] ${chunk.text}`)
    .join(" ");
  if (mergedContent.length < 8) {
    return res.json({
      sessionId: session.id,
      chunkCount: session.chunks.length,
      mergedContent,
      result: null
    });
  }

  const result = await analyzeClaimWithProvider({
    type: session.type,
    content: mergedContent,
    claimedSources: session.claimedSources
  });

  return res.json({
    sessionId: session.id,
    chunkCount: session.chunks.length,
    mergedContent,
    result
  });
});

app.delete("/api/realtime/session/:id", (req, res) => {
  const deleted = realtimeSessions.delete(req.params.id);
  return res.json({ ok: deleted });
});

app.listen(port, () => {
  console.log(`VeriPH backend listening on http://localhost:${port}`);
});
