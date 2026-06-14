import dotenv from "dotenv";
dotenv.config();

import app from "./app.js";
import pool from "./db.js";
import { initTelegram } from "./telegram.js";
import { initAI, runAnalysis } from "./ai.js";

const port = process.env.PORT || 3000;

app.post("/api/ai/analyze", async (_req, res) => {
  try {
    await runAnalysis();
    res.json({ ok: true, message: "Analysis complete" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(port, async () => {
  console.log(`🌿 Garden API listening on port ${port}`);
  await initTelegram(pool);
  initAI();
});
