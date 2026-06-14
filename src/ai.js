// ai.js — AI-анализ через Claude API.
// Раз в N часов: собирает данные → формирует промпт → получает рекомендацию →
// пишет в ai_recommendations → шлёт в Telegram.

import { query } from "./db.js";
import { notifyAI } from "./telegram.js";

const API_KEY = process.env.ANTHROPIC_API_KEY;
const DEVICE_ID = "greenhouse-01";
const INTERVAL_MS = 3 * 60 * 60 * 1000; // каждые 3 часа

// ── Собрать данные для промпта ──────────────────────
async function collectData() {
  // Горшки + текущая влажность + последний полив + скорость высыхания
  const { rows: pots } = await query(`
    SELECT
      p.slot, p.name, p.plant_type, p.moisture_threshold,
      (SELECT moisture_pct FROM pot_readings WHERE pot_id = p.id ORDER BY ts DESC LIMIT 1) AS moisture_now,
      (SELECT ts FROM watering_events WHERE pot_id = p.id ORDER BY ts DESC LIMIT 1) AS last_watered,
      (SELECT COUNT(*) FROM watering_events WHERE pot_id = p.id AND ts > NOW() - INTERVAL '7 days') AS waterings_7d,
      (SELECT AVG(moisture_pct) FROM pot_readings WHERE pot_id = p.id AND ts > NOW() - INTERVAL '24 hours') AS avg_moisture_24h
    FROM pots p
    WHERE p.device_id = $1 AND p.enabled = true
    ORDER BY p.slot
  `, [DEVICE_ID]);

  // Последний замер среды
  const { rows: amb } = await query(`
    SELECT temp_c, humidity, pressure_hpa, light_lux, tank_low
    FROM ambient_readings
    WHERE device_id = $1
    ORDER BY ts DESC LIMIT 1
  `, [DEVICE_ID]);

  return { pots, ambient: amb[0] ?? null };
}

// ── Сформировать промпт ─────────────────────────────
function buildPrompt(data) {
  const { pots, ambient } = data;

  const potLines = pots.map(p => {
    const m = p.moisture_now != null ? `${Math.round(parseFloat(p.moisture_now))}%` : "нет данных";
    const avg = p.avg_moisture_24h != null ? `${Math.round(parseFloat(p.avg_moisture_24h))}%` : "—";
    const lastW = p.last_watered ? new Date(p.last_watered).toLocaleString("ru-RU", { timeZone: "Europe/Warsaw" }) : "никогда";
    return `- ${p.name} (${p.plant_type}): влажность сейчас ${m}, среднее за 24ч ${avg}, порог ${p.moisture_threshold}%, последний полив ${lastW}, поливов за 7 дн: ${p.waterings_7d}`;
  }).join("\n");

  const ambLine = ambient
    ? `Температура: ${ambient.temp_c}°C, влажность воздуха: ${ambient.humidity}%, давление: ${ambient.pressure_hpa} hPa, освещённость: ${ambient.light_lux} lux, бак: ${ambient.tank_low ? "ПУСТ" : "ок"}`
    : "Нет данных среды";

  return `Ты — опытный садовод-консультант для домашних растений на балконе в Варшаве. 
Проанализируй текущее состояние растений и дай краткие, конкретные рекомендации.

Данные с датчиков:

Среда:
${ambLine}

Растения:
${potLines}

Правила ответа:
1. Начни с общей оценки (1-2 предложения): всё ли в порядке.
2. Если какое-то растение требует внимания — укажи конкретно что делать.
3. Учитывай вид растения (разные потребности во влаге и свете).
4. Если данные говорят о необычном паттерне (слишком быстрое/медленное высыхание) — отметь.
5. Ответ на русском, кратко (до 500 символов), без markdown-разметки.`;
}

// ── Вызов Claude API ────────────────────────────────
async function callClaude(prompt) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 600,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude API ${res.status}: ${err}`);
  }

  const data = await res.json();
  return data.content[0]?.text ?? "";
}

// ── Основная функция анализа ────────────────────────
async function runAnalysis() {
  console.log("AI: starting analysis...");

  try {
    const data = await collectData();

    if (!data.pots.length) {
      console.log("AI: no pots found, skipping");
      return;
    }

    const prompt = buildPrompt(data);
    const summary = await callClaude(prompt);

    // Сохраняем в БД
    await query(
      `INSERT INTO ai_recommendations (device_id, severity, summary, details)
       VALUES ($1, $2, $3, $4)`,
      [
        DEVICE_ID,
        summary.includes("срочно") || summary.includes("внимание") ? "warn" : "info",
        summary,
        JSON.stringify(data),
      ]
    );

    // Отправляем в Telegram
    notifyAI(summary);

    console.log("AI: analysis complete ✓");
  } catch (err) {
    console.error("AI: analysis failed:", err.message);
  }
}

// ── Инициализация: первый запуск + интервал ─────────
export function initAI() {
  if (!API_KEY) {
    console.log("AI: ANTHROPIC_API_KEY not set, skipping");
    return;
  }

  // Первый анализ через 30 секунд (дать время данным накопиться)
  setTimeout(runAnalysis, 30_000);

  // Далее каждые 3 часа
  setInterval(runAnalysis, INTERVAL_MS);

  console.log("AI: scheduled every 3h ✓");
}

// ── Ручной запуск через API (для тестов) ────────────
export { runAnalysis };
