// telegram.js — Telegram notifications module.
// Sends messages through the Bot API and listens for /start to register chat_ids.

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const API = `https://api.telegram.org/bot${TOKEN}`;

// chat_id storage (in memory, backed by the database)
let chatIds = new Set();

// ── Send a message ──────────────────────────────────
export async function notify(text) {
    if (!TOKEN) return;
    for (const chatId of chatIds) {
        try {
            await fetch(`${API}/sendMessage`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    chat_id: chatId,
                    text,
                    parse_mode: "HTML",
                    disable_notification: false,
                }),
            });
        } catch (err) {
            console.error(`Telegram send error (chat ${chatId}):`, err.message);
        }
    }
}

// ── Ready-made notification templates ───────────────
export function notifyWatering(potName, trigger, durationSec) {
    const icon = trigger === "manual" ? "🖐" : "🤖";
    const mode = trigger === "manual" ? "manual" : "auto";
    notify(`${icon} <b>Watering:</b> ${potName}\nMode: ${mode}\nDuration: ${durationSec} sec`);
}

export function notifyTankLow() {
    notify(`🚰 <b>Tank almost empty!</b>\nTime to refill the water. Watering is disabled.`);
}

export function notifyDeviceOffline(deviceId) {
    notify(`⚠️ <b>Device offline</b>\n<code>${deviceId}</code> has not responded for over 5 minutes.`);
}

export function notifyAI(summary) {
    notify(`🌿 <b>Gardener (AI):</b>\n${summary}`);
}

// ── Polling: listen for /start ──────────────────────
let offset = 0;

async function pollUpdates(db) {
    if (!TOKEN) return;
    try {
        const res = await fetch(`${API}/getUpdates?offset=${offset}&timeout=30`);
        const data = await res.json();
        if (!data.ok) return;

        for (const update of data.result) {
            offset = update.update_id + 1;
            const msg = update.message;
            if (!msg?.text) continue;

            const chatId = msg.chat.id;
            const cmd = msg.text.trim().toLowerCase();

            if (cmd === "/start") {
                chatIds.add(chatId);
                // Persist to the database so it survives a restart
                try {
                    await db.query(
                        `INSERT INTO telegram_chats (chat_id, username) VALUES ($1, $2)
             ON CONFLICT (chat_id) DO NOTHING`,
                        [chatId, msg.from?.username ?? ""]
                    );
                } catch {}

                await fetch(`${API}/sendMessage`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        chat_id: chatId,
                        text: "🌿 <b>Garden connected!</b>\n\nYou'll get notifications about:\n• Watering (manual and auto)\n• Water tank level\n• AI recommendations\n\nSend /status for the current state.",
                        parse_mode: "HTML",
                    }),
                });
                console.log(`Telegram: registered chat ${chatId} (@${msg.from?.username})`);
            }

            if (cmd === "/status") {
                try {
                    const { rows } = await db.query(
                        `SELECT p.name, pr.moisture_pct
             FROM pots p
             LEFT JOIN LATERAL (
               SELECT moisture_pct FROM pot_readings WHERE pot_id = p.id ORDER BY ts DESC LIMIT 1
             ) pr ON true
             WHERE p.enabled = true
             ORDER BY p.slot`
                    );
                    const lines = rows.map(r =>
                        `${parseFloat(r.moisture_pct) < 30 ? "🔴" : "🟢"} ${r.name}: ${r.moisture_pct != null ? Math.round(parseFloat(r.moisture_pct)) + "%" : "—"}`
                    );
                    await fetch(`${API}/sendMessage`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            chat_id: chatId,
                            text: `📊 <b>Current state:</b>\n\n${lines.join("\n")}`,
                            parse_mode: "HTML",
                        }),
                    });
                } catch {}
            }
        }
    } catch (err) {
        console.error("Telegram poll error:", err.message);
    }
}

// ── Initialization ──────────────────────────────────
export async function initTelegram(db) {
    if (!TOKEN) {
        console.log("Telegram: TELEGRAM_BOT_TOKEN not set, skipping");
        return;
    }

    // Load saved chat_ids from the database
    try {
        // Create the table if it does not exist
        await db.query(`
      CREATE TABLE IF NOT EXISTS telegram_chats (
        chat_id bigint primary key,
        username text,
        created_at timestamptz default now()
      )
    `);
        const { rows } = await db.query("SELECT chat_id FROM telegram_chats");
        rows.forEach(r => chatIds.add(r.chat_id));
        console.log(`Telegram: loaded ${chatIds.size} chat(s)`);
    } catch (err) {
        console.error("Telegram: failed to load chats:", err.message);
    }

    // Start polling
    async function loop() {
        while (true) {
            await pollUpdates(db);
            await new Promise(r => setTimeout(r, 1000));
        }
    }
    loop().catch(err => console.error("Telegram polling crashed:", err));

    console.log("Telegram: bot started ✓");
}