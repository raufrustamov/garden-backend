import express from "express";
import cors from "cors";
import { query } from "./db.js";
import { notifyWatering, notifyTankLow } from "./telegram.js";

const app = express();
app.use(cors());
app.use(express.json());

// ─── HEALTHCHECK ────────────────────────────────────────────
app.get("/health", async (_req, res) => {
  try {
    const { rows } = await query("SELECT NOW() AS time");
    res.json({ status: "ok", db: "connected", time: rows[0].time });
  } catch (err) {
    res.status(503).json({ status: "error", db: "disconnected", error: err.message });
  }
});

// ─── TELEMETRY (ESP32 → server) ─────────────────────────────
app.post("/api/telemetry", async (req, res) => {
  const { deviceId, ambient, tank, pots, wifiRssi } = req.body;

  if (!deviceId || !pots) {
    return res.status(400).json({ error: "deviceId and pots are required" });
  }

  try {
    await query(
        `UPDATE devices SET last_seen = NOW(), wifi_rssi = $1 WHERE id = $2`,
        [wifiRssi ?? null, deviceId]
    );

    if (ambient) {
      await query(
          `INSERT INTO ambient_readings (device_id, temp_c, humidity, pressure_hpa, light_lux, tank_low)
         VALUES ($1, $2, $3, $4, $5, $6)`,
          [deviceId, ambient.tempC, ambient.humidity, ambient.pressureHpa, ambient.lightLux, tank?.lowLevel ?? false]
      );

      // 🔔 Notify: tank is empty
      if (tank?.lowLevel) {
        notifyTankLow();
      }
    }

    for (const p of pots) {
      const potRes = await query(
          `SELECT id FROM pots WHERE device_id = $1 AND slot = $2`,
          [deviceId, p.slot]
      );
      if (potRes.rows.length > 0) {
        await query(
            `INSERT INTO pot_readings (pot_id, moisture_pct, raw_adc) VALUES ($1, $2, $3)`,
            [potRes.rows[0].id, p.moisturePct, p.rawAdc ?? null]
        );
      }
    }

    res.json({ ok: true });
  } catch (err) {
    console.error("Telemetry error:", err.message);
    res.status(500).json({ error: "Failed to save telemetry" });
  }
});

// ─── STATE (server → dashboard) ─────────────────────────────
app.get("/api/state/:deviceId", async (req, res) => {
  const { deviceId } = req.params;

  try {
    const devRes = await query(`SELECT * FROM devices WHERE id = $1`, [deviceId]);
    if (devRes.rows.length === 0) {
      return res.status(404).json({ error: "Device not found" });
    }
    const device = devRes.rows[0];

    const ambRes = await query(
        `SELECT * FROM ambient_readings WHERE device_id = $1 ORDER BY ts DESC LIMIT 1`,
        [deviceId]
    );
    const ambient = ambRes.rows[0] ?? null;

    const potsRes = await query(
        `SELECT p.*,
        (SELECT moisture_pct FROM pot_readings pr WHERE pr.pot_id = p.id ORDER BY ts DESC LIMIT 1) AS moisture_pct,
        (SELECT ts FROM watering_events we WHERE we.pot_id = p.id ORDER BY ts DESC LIMIT 1) AS last_watered
       FROM pots p
       WHERE p.device_id = $1 AND p.enabled = true
       ORDER BY p.slot`,
        [deviceId]
    );

    const aiRes = await query(
        `SELECT * FROM ai_recommendations WHERE device_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [deviceId]
    );

    res.json({
      device,
      ambient,
      pots: potsRes.rows,
      recommendation: aiRes.rows[0] ?? null,
    });
  } catch (err) {
    console.error("State error:", err.message);
    res.status(500).json({ error: "Failed to fetch state" });
  }
});

// ─── HISTORY ────────────────────────────────────────────────
app.get("/api/history/:potId", async (req, res) => {
  const { potId } = req.params;
  const hours = parseInt(req.query.hours) || 24;

  try {
    const { rows } = await query(
        `SELECT ts, moisture_pct FROM pot_readings
       WHERE pot_id = $1 AND ts > NOW() - INTERVAL '1 hour' * $2
       ORDER BY ts`,
        [potId, hours]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch history" });
  }
});

// ─── COMMANDS (dashboard → board) ───────────────────────────
app.post("/api/commands", async (req, res) => {
  const { deviceId, potSlot, durationSec } = req.body;

  if (!deviceId || !potSlot) {
    return res.status(400).json({ error: "deviceId and potSlot are required" });
  }

  try {
    const { rows } = await query(
        `INSERT INTO commands (device_id, type, pot_slot, duration_sec)
       VALUES ($1, 'water', $2, $3)
       RETURNING *`,
        [deviceId, potSlot, durationSec ?? 8]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Failed to create command" });
  }
});

app.get("/api/commands/pending/:deviceId", async (req, res) => {
  const { deviceId } = req.params;

  try {
    const { rows } = await query(
        `SELECT * FROM commands
       WHERE device_id = $1 AND status = 'pending'
       ORDER BY created_at`,
        [deviceId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch commands" });
  }
});

app.patch("/api/commands/:id/done", async (req, res) => {
  const { id } = req.params;

  try {
    const { rows } = await query(
        `UPDATE commands SET status = 'done', executed_at = NOW()
       WHERE id = $1 RETURNING *`,
        [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: "Command not found" });
    }

    const cmd = rows[0];
    await query(
        `INSERT INTO watering_events (pot_id, trigger, duration_sec)
       SELECT p.id, 'manual', $1
       FROM pots p WHERE p.device_id = $2 AND p.slot = $3`,
        [cmd.duration_sec, cmd.device_id, cmd.pot_slot]
    );

    // 🔔 Notify: manual watering completed
    const potRes = await query(
        "SELECT name FROM pots WHERE device_id = $1 AND slot = $2",
        [cmd.device_id, cmd.pot_slot]
    );
    if (potRes.rows.length) {
      notifyWatering(potRes.rows[0].name, "manual", cmd.duration_sec);
    }

    res.json(cmd);
  } catch (err) {
    res.status(500).json({ error: "Failed to complete command" });
  }
});

// ─── WATERING EVENTS ────────────────────────────────────────
app.post("/api/watering", async (req, res) => {
  const { deviceId, potSlot, trigger, durationSec } = req.body;

  try {
    await query(
        `INSERT INTO watering_events (pot_id, trigger, duration_sec)
       SELECT p.id, $1, $2
       FROM pots p WHERE p.device_id = $3 AND p.slot = $4`,
        [trigger ?? "auto", durationSec, deviceId, potSlot]
    );

    // 🔔 Notify: auto-watering
    const potRes = await query(
        "SELECT name FROM pots WHERE device_id = $1 AND slot = $2",
        [deviceId, potSlot]
    );
    if (potRes.rows.length) {
      notifyWatering(potRes.rows[0].name, trigger ?? "auto", durationSec);
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to log watering event" });
  }
});

export default app;
