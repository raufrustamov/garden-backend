#!/usr/bin/env node
// mock-device.js — ESP32 simulator.
// Run: API_URL=http://localhost:3000 node mock-device.js

const API = process.env.API_URL || "http://localhost:3000";
const DEVICE = "greenhouse-01";

function rand(min, max) {
  return +(min + Math.random() * (max - min)).toFixed(1);
}

async function send() {
  const body = {
    deviceId: DEVICE,
    ambient: {
      tempC: rand(20, 28),
      humidity: rand(35, 65),
      pressureHpa: rand(1005, 1020),
      lightLux: Math.round(rand(200, 12000)),
    },
    tank: { lowLevel: Math.random() < 0.1 },
    pots: [
      { slot: 1, moisturePct: rand(30, 80) },  // Роза
      { slot: 2, moisturePct: rand(35, 85) },  // Мята
      { slot: 3, moisturePct: rand(25, 70) },  // Любисток
      { slot: 4, moisturePct: rand(30, 75) },  // Базилик
      { slot: 5, moisturePct: rand(20, 55) },  // Бархатцы
      { slot: 6, moisturePct: rand(35, 85) },  // Кинза
      { slot: 7, moisturePct: rand(30, 75) },  // Ежевика
      { slot: 8, moisturePct: rand(25, 65) },  // Потос
      { slot: 9, moisturePct: rand(30, 70) },  // Рейхан
    ],
    wifiRssi: Math.round(rand(-70, -40)),
  };

  try {
    const res = await fetch(`${API}/api/telemetry`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    const time = new Date().toLocaleTimeString();
    console.log(`[${time}] Sent telemetry → ${res.status}`, data);
  } catch (err) {
    console.error("Failed to send:", err.message);
  }
}

console.log(`🌱 Mock device started. Sending to ${API} every 10s...`);
send();
setInterval(send, 10_000);