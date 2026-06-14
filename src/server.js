import dotenv from "dotenv";
dotenv.config();

import app from "./app.js";
import pool from "./db.js";
import { initTelegram } from "./telegram.js";

const port = process.env.PORT || 3000;

app.listen(port, async () => {
  console.log(`🌿 Garden API listening on port ${port}`);
  await initTelegram(pool);
});