import React, { useState, useEffect, useCallback, useRef } from "react";
import { AreaChart, Area, ResponsiveContainer } from "recharts";
import {
  Wifi, WifiOff, Thermometer, Droplets, Gauge,
  Sun, Leaf, Sparkles, Power, Waves, AlertTriangle,
  Loader2, CloudRain
} from "lucide-react";

const DEVICE_ID = "greenhouse-01";
const POLL_MS = 10_000;

/* ── colour tokens ────────────────────────────────── */
const T = {
  alert: { c: "#FF6B5C", g: "rgba(255,107,92,.45)", s: "rgba(255,107,92,.14)" },
  warn:  { c: "#E7B24C", g: "rgba(231,178,76,.4)",  s: "rgba(231,178,76,.13)" },
  ok:    { c: "#4FD08A", g: "rgba(79,208,138,.4)",  s: "rgba(79,208,138,.13)" },
  wet:   { c: "#45B8E8", g: "rgba(69,184,232,.4)",  s: "rgba(69,184,232,.13)" },
};
const CYAN = "#46B6E8";

/* ── helpers ──────────────────────────────────────── */
function statusOf(m, thr) {
  if (m == null) return { label: "No data", tone: "warn" };
  if (m < (thr ?? 30))      return { label: "Water now", tone: "alert" };
  if (m < (thr ?? 30) + 15) return { label: "Drying",    tone: "warn" };
  if (m <= 80)              return { label: "Healthy",   tone: "ok" };
  return { label: "Moist", tone: "wet" };
}

function relTime(ts) {
  if (!ts) return "—";
  const s = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (s < 90)    return "just now";
  if (s < 3600)  return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

/* ── ring gauge ───────────────────────────────────── */
function Ring({ value, tone }) {
  const t = T[tone] || T.warn;
  const v = value ?? 0;
  const R = 30, C = 2 * Math.PI * R;
  const off = C - (Math.max(0, Math.min(100, v)) / 100) * C;
  return (
    <svg viewBox="0 0 76 76" width="84" height="84">
      <circle cx="38" cy="38" r={R} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="6" />
      <circle cx="38" cy="38" r={R} fill="none" stroke={t.c} strokeWidth="6" strokeLinecap="round"
        strokeDasharray={C} strokeDashoffset={off} transform="rotate(-90 38 38)"
        style={{ transition: "stroke-dashoffset .9s cubic-bezier(.3,.8,.3,1)", filter: `drop-shadow(0 0 6px ${t.g})` }} />
      <text x="38" y="36" textAnchor="middle" fontFamily="Manrope,sans-serif" fontSize="20" fontWeight="300" fill="#EAF2F2">{Math.round(v)}</text>
      <text x="38" y="50" textAnchor="middle" fontFamily="Inter,sans-serif" fontSize="9" fill="#7C8A98">%</text>
    </svg>
  );
}

/* ── sparkline ────────────────────────────────────── */
function Spark({ data, color }) {
  if (!data || data.length < 2) return <div style={{ height: 30 }} />;
  const d = data.map((r, i) => ({ i, v: parseFloat(r.moisture_pct) }));
  return (
    <ResponsiveContainer width="100%" height={30}>
      <AreaChart data={d} margin={{ top: 2, bottom: 0, left: 0, right: 0 }}>
        <defs>
          <linearGradient id={`sg-${color.replace("#","")}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.45} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.6}
          fill={`url(#sg-${color.replace("#","")})`} isAnimationActive={false} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/* ── animated tank bar ────────────────────────────── */
function TankBar({ low }) {
  const pct = low ? 12 : 78;
  const color = low ? "#FF6B5C" : CYAN;
  return (
    <div className="glass" style={{ padding: "18px 20px" }}>
      <div className="chead">
        <span className="cico" style={{ background: low ? "rgba(255,107,92,.16)" : "rgba(70,182,232,.16)" }}>
          <Waves size={15} color={color} />
        </span>
        Water tank
      </div>

      {/* visual tank */}
      <div style={{ display: "flex", gap: 18, alignItems: "flex-end" }}>
        <div style={{
          width: 52, height: 80, borderRadius: "6px 6px 14px 14px",
          border: `2px solid ${low ? "rgba(255,107,92,.35)" : "rgba(70,182,232,.25)"}`,
          background: "rgba(255,255,255,.03)", position: "relative", overflow: "hidden",
        }}>
          {/* water fill */}
          <div style={{
            position: "absolute", bottom: 0, left: 0, right: 0,
            height: `${pct}%`,
            background: `linear-gradient(180deg, ${color}44, ${color}22)`,
            borderTop: `2px solid ${color}88`,
            transition: "height 1.2s cubic-bezier(.3,.8,.3,1)",
          }}>
            {/* wave animation */}
            <svg viewBox="0 0 52 8" style={{ position: "absolute", top: -5, left: 0, width: "100%" }}>
              <path d={`M0 4 Q13 ${low ? 2 : 0} 26 4 Q39 ${low ? 6 : 8} 52 4 L52 8 L0 8 Z`}
                fill={`${color}66`}>
                <animate attributeName="d"
                  values={`M0 4 Q13 0 26 4 Q39 8 52 4 L52 8 L0 8 Z;M0 4 Q13 8 26 4 Q39 0 52 4 L52 8 L0 8 Z;M0 4 Q13 0 26 4 Q39 8 52 4 L52 8 L0 8 Z`}
                  dur="3s" repeatCount="indefinite" />
              </path>
            </svg>
          </div>

          {/* level label inside tank */}
          <div style={{
            position: "absolute", inset: 0, display: "grid", placeItems: "center",
            fontFamily: "Manrope", fontWeight: 300, fontSize: 18, color: "#EAF2F2",
            textShadow: "0 1px 4px rgba(0,0,0,.6)",
          }}>
            {pct}%
          </div>
        </div>

        <div style={{ flex: 1 }}>
          <div style={{
            fontSize: 22, fontFamily: "Manrope", fontWeight: 300, color: low ? "#FF6B5C" : "#EAF2F2",
          }}>
            {low ? "Time to refill" : "Level is fine"}
          </div>
          <div style={{ fontSize: 12, color: "#7C8A98", marginTop: 4 }}>
            {low
              ? "Float switch tripped — the tank is almost empty. Pumps stay off to avoid running dry."
              : "Enough water to irrigate every pot."}
          </div>

          {/* progress bar */}
          <div style={{
            height: 8, borderRadius: 999, background: "rgba(255,255,255,.07)",
            marginTop: 12, overflow: "hidden",
          }}>
            <div style={{
              height: "100%", borderRadius: 999, width: `${pct}%`,
              background: low
                ? "linear-gradient(90deg, #FF6B5C, #FF8A7C)"
                : `linear-gradient(90deg, #2E96C9, ${CYAN})`,
              boxShadow: `0 0 12px ${color}66`,
              transition: "width 1.2s cubic-bezier(.3,.8,.3,1)",
            }} />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════ */
/*  MAIN APP                                         */
/* ══════════════════════════════════════════════════ */
export default function App() {
  const [state, setState]       = useState(null);
  const [histories, setHist]    = useState({});
  const [watering, setWater]    = useState({});
  const [connected, setConn]    = useState(false);
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(true);
  const [now, setNow]           = useState(Date.now());
  const poll = useRef(null);

  /* ── fetch state ────────────────────────────────── */
  const fetchState = useCallback(async () => {
    try {
      const res = await fetch(`/api/state/${DEVICE_ID}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setState(data);
      setConn(true);
      setError("");
      // histories
      for (const pot of (data.pots || [])) {
        try {
          const h = await fetch(`/api/history/${pot.id}?hours=24`);
          if (h.ok) { const d = await h.json(); setHist(prev => ({ ...prev, [pot.id]: d })); }
        } catch {}
      }
    } catch (err) {
      setConn(false);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchState(); }, [fetchState]);
  useEffect(() => {
    poll.current = setInterval(fetchState, POLL_MS);
    return () => clearInterval(poll.current);
  }, [fetchState]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  /* ── water command ──────────────────────────────── */
  async function water(slot) {
    setWater(prev => ({ ...prev, [slot]: true }));
    try {
      await fetch("/api/commands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId: DEVICE_ID, potSlot: slot, durationSec: 8 }),
      });
      setTimeout(() => { setWater(prev => ({ ...prev, [slot]: false })); fetchState(); }, 3000);
    } catch {
      setWater(prev => ({ ...prev, [slot]: false }));
    }
  }

  /* ── derived ────────────────────────────────────── */
  const amb  = state?.ambient;
  const pots = state?.pots || [];
  const rec  = state?.recommendation;
  const dev  = state?.device;
  const tankLow = amb?.tank_low;
  const needWater = pots.filter(p => {
    const m = p.moisture_pct != null ? parseFloat(p.moisture_pct) : null;
    return m != null && m < (p.moisture_threshold ?? 30);
  });
  const clock = new Date(now).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

  /* ── css ────────────────────────────────────────── */
  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@200;300;500;700&family=Inter:wght@400;500;600&display=swap');
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:#070A0F}
    .wrap{min-height:100vh;font-family:Inter,system-ui,sans-serif;color:#EAF2F2;
      background:radial-gradient(900px 480px at 18% -8%,rgba(40,96,120,.45),transparent 60%),
      radial-gradient(820px 520px at 92% 8%,rgba(36,86,72,.4),transparent 62%),
      radial-gradient(700px 600px at 60% 120%,rgba(48,70,120,.3),transparent 60%),#070A0F;
      padding:18px 16px 26px}
    .inner{max-width:1100px;margin:0 auto}
    .num{font-family:Manrope,sans-serif}
    .glass{background:linear-gradient(160deg,rgba(255,255,255,.07),rgba(255,255,255,.02));
      border:1px solid rgba(255,255,255,.09);border-radius:24px;
      backdrop-filter:blur(22px) saturate(140%);-webkit-backdrop-filter:blur(22px) saturate(140%);
      box-shadow:inset 0 1px 0 rgba(255,255,255,.14),0 26px 50px -28px rgba(0,0,0,.85)}
    .topbar{display:flex;align-items:center;justify-content:space-between;padding:4px 6px 16px}
    .clock{font-family:Manrope;font-weight:300;font-size:22px;letter-spacing:.5px}
    .title{font-family:Manrope;font-weight:500;font-size:22px}
    .sysicons{display:flex;align-items:center;gap:12px;color:#8C99A6}
    .sysicons .on{color:#4FD08A}
    .hero{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:14px}
    .card{padding:18px}
    .chead{display:flex;align-items:center;gap:9px;color:#9AA7B4;font-size:12.5px;font-weight:500;margin-bottom:14px}
    .cico{width:26px;height:26px;border-radius:8px;display:grid;place-items:center}
    .bignum{font-family:Manrope;font-weight:200;font-size:54px;line-height:.9;letter-spacing:-1px}
    .cond{color:#AEB9C4;font-size:13px;margin-top:6px}
    .climrow{display:flex;gap:8px;margin-top:16px}
    .chip{flex:1;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.06);border-radius:13px;padding:9px 10px}
    .chip .l{color:#7C8A98;font-size:10.5px;display:flex;align-items:center;gap:5px}
    .chip .v{font-family:Manrope;font-weight:300;font-size:18px;margin-top:3px}
    .chip .v small{font-size:11px;color:#7C8A98}
    .aitxt{font-size:14.5px;line-height:1.45;color:#DCE5EC;min-height:62px}
    .scan{height:3px;border-radius:3px;margin-top:14px;overflow:hidden;background:rgba(255,255,255,.06)}
    .scan i{display:block;height:100%;width:38%;border-radius:3px;
      background:linear-gradient(90deg,transparent,#46B6E8,transparent);animation:scan 2.6s linear infinite}
    @keyframes scan{0%{transform:translateX(-100%)}100%{transform:translateX(360%)}}
    .sysrow{display:flex;justify-content:space-between;align-items:flex-end;margin-top:8px}
    .sysrow .big{font-family:Manrope;font-weight:200;font-size:40px;line-height:1}
    .mid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px}
    .plants{display:grid;grid-template-columns:repeat(auto-fill,minmax(186px,1fr));gap:14px}
    .pcard{padding:16px;display:flex;flex-direction:column;gap:11px;position:relative;overflow:hidden}
    .prow{display:flex;justify-content:space-between;align-items:flex-start}
    .pname{font-family:Manrope;font-weight:500;font-size:16px}
    .pill{display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:600;padding:3px 9px;border-radius:999px;margin-top:6px}
    .pmeta{display:flex;justify-content:space-between;color:#7C8A98;font-size:11.5px}
    .wbtn{appearance:none;border:none;cursor:pointer;font-family:Inter;font-weight:600;font-size:13px;
      border-radius:13px;padding:10px;display:flex;align-items:center;justify-content:center;gap:7px;
      color:#062028;transition:filter .2s,transform .05s}
    .wbtn:hover{filter:brightness(1.08)} .wbtn:active{transform:scale(.98)}
    .wbtn:disabled{opacity:.5;cursor:default}
    .dock{display:flex;align-items:center;gap:14px;flex-wrap:wrap;justify-content:space-between;padding:12px 16px;margin-top:16px}
    .dockL{display:flex;align-items:center;gap:14px;flex-wrap:wrap}
    .allbtn{appearance:none;border:none;cursor:pointer;font-family:Inter;font-weight:600;font-size:13px;
      border-radius:14px;padding:11px 18px;display:flex;align-items:center;gap:8px;
      background:linear-gradient(180deg,#52C2EE,#2E96C9);color:#06222E;box-shadow:0 0 22px rgba(70,182,232,.4)}
    .allbtn:disabled{opacity:.4;cursor:default;box-shadow:none}
    .dockR{display:flex;align-items:center;gap:13px;color:#8C99A6;font-size:12.5px}
    .dot{width:7px;height:7px;border-radius:50%}
    .loader{display:grid;place-items:center;min-height:60vh;color:#7C8A98;font-size:15px}
    .err{text-align:center;padding:60px 20px;color:#FF6B5C;font-size:14px}
    @keyframes spin{to{transform:rotate(360deg)}}
    @media(max-width:860px){.hero{grid-template-columns:1fr}.mid{grid-template-columns:1fr}}
    @media(max-width:500px){.plants{grid-template-columns:1fr}}
  `;

  /* ── render ─────────────────────────────────────── */
  if (loading) return (
    <div className="wrap"><style>{css}</style>
      <div className="loader">
        <div><Loader2 size={32} style={{ animation: "spin 1s linear infinite", marginBottom: 12 }} />
        <div>Connecting to the server…</div></div>
      </div>
    </div>
  );

  if (!state) return (
    <div className="wrap"><style>{css}</style>
      <div className="err">
        <WifiOff size={40} style={{ marginBottom: 12, opacity: .6 }} />
        <div>Could not connect to the API</div>
        <div style={{ fontSize: 12, marginTop: 8, color: "#7C8A98" }}>{error}</div>
        <button onClick={fetchState} style={{
          marginTop: 16, padding: "10px 24px", borderRadius: 12, border: "none",
          background: "rgba(70,182,232,.2)", color: CYAN, cursor: "pointer",
          fontFamily: "Inter", fontWeight: 600, fontSize: 13,
        }}>Retry</button>
      </div>
    </div>
  );

  const lightDesc = !amb ? "" : amb.light_lux > 6000 ? "Bright" : amb.light_lux > 1500 ? "Diffuse light" : "Dim";
  const humDesc = !amb ? "" : amb.humidity < 45 ? "dry" : amb.humidity < 60 ? "comfortable" : "humid";

  return (
    <div className="wrap">
      <style>{css}</style>
      <div className="inner">

        {/* TOP BAR */}
        <div className="topbar">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span className="title">🌿 Garden</span>
            <span className="clock num">{clock}</span>
          </div>
          <div className="sysicons">
            <span style={{ fontSize: 12 }}>RSSI {dev?.wifi_rssi ?? "—"}</span>
            <Waves size={16} style={{ color: tankLow ? "#FF6B5C" : "#8C99A6" }} />
            {connected ? <Wifi size={16} className="on" /> : <WifiOff size={16} color="#FF6B5C" />}
          </div>
        </div>

        {/* HERO: climate / AI / system */}
        <div className="hero">
          {/* MICROCLIMATE */}
          <div className="glass card">
            <div className="chead"><span className="cico" style={{ background: "rgba(231,178,76,.18)" }}><Sun size={15} color="#E7B24C" /></span> Microclimate</div>
            {amb ? (<>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                <div>
                  <div className="bignum num">{Math.round(parseFloat(amb.temp_c))}°</div>
                  <div className="cond">{lightDesc}, {humDesc}</div>
                </div>
                <Sun size={46} color="#E7B24C" style={{ opacity: .9, filter: "drop-shadow(0 0 12px rgba(231,178,76,.4))" }} />
              </div>
              <div className="climrow">
                <div className="chip"><div className="l"><Droplets size={12} /> Humid.</div><div className="v num">{Math.round(parseFloat(amb.humidity))}<small>%</small></div></div>
                <div className="chip"><div className="l"><Gauge size={12} /> Press.</div><div className="v num">{Math.round(parseFloat(amb.pressure_hpa))}<small> hPa</small></div></div>
                <div className="chip"><div className="l"><Sun size={12} /> Light</div><div className="v num">{(parseInt(amb.light_lux) / 1000).toFixed(1)}<small> klx</small></div></div>
              </div>
            </>) : <div style={{ color: "#7C8A98", fontSize: 13 }}>Waiting for the first readings…</div>}
          </div>

          {/* AI GARDENER */}
          <div className="glass card">
            <div className="chead"><span className="cico" style={{ background: "rgba(70,182,232,.18)" }}><Sparkles size={15} color={CYAN} /></span> Gardener · AI</div>
            <div className="aitxt">
              {rec ? rec.summary : needWater.length > 0
                ? `${needWater.length} ${needWater.length === 1 ? "pot needs" : "pots need"} watering.`
                : "All plants are healthy. AI analysis will appear once enough data is collected."}
            </div>
            <div className="scan"><i /></div>
          </div>

          {/* SYSTEM */}
          <div className="glass card">
            <div className="chead"><span className="cico" style={{ background: "rgba(79,208,138,.16)" }}><CloudRain size={15} color="#4FD08A" /></span> System</div>
            <div className="sysrow">
              <div>
                <div style={{ color: "#7C8A98", fontSize: 12 }}>Need watering</div>
                <div className="big num" style={{ color: needWater.length ? "#FF6B5C" : "#4FD08A" }}>{needWater.length}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ color: "#7C8A98", fontSize: 12 }}>Last contact</div>
                <div className="num" style={{ fontSize: 14, fontWeight: 300, color: "#AEB9C4" }}>{relTime(dev?.last_seen)}</div>
              </div>
            </div>
          </div>
        </div>

        {/* TANK BAR — full-width */}
        <div style={{ marginBottom: 14 }}>
          <TankBar low={!!tankLow} />
        </div>

        {/* PLANT TILES */}
        <div className="plants">
          {pots.map(p => {
            const m = p.moisture_pct != null ? parseFloat(p.moisture_pct) : null;
            const s = statusOf(m, p.moisture_threshold);
            const tn = T[s.tone];
            const busy = watering[p.slot];
            return (
              <div key={p.id} className="glass pcard"
                style={{
                  borderColor: s.tone === "alert" ? "rgba(255,107,92,.4)" : undefined,
                  boxShadow: s.tone === "alert" ? `inset 0 1px 0 rgba(255,255,255,.12),0 0 28px -6px ${tn.g}` : undefined,
                }}>
                <div className="prow">
                  <div>
                    <div className="pname num">{p.name}</div>
                    <span className="pill" style={{ color: tn.c, background: tn.s }}>
                      {s.tone === "alert" ? <AlertTriangle size={11} /> : <Leaf size={11} />}{s.label}
                    </span>
                  </div>
                  <Ring value={m} tone={s.tone} />
                </div>
                <Spark data={histories[p.id]} color={tn.c} />
                <div className="pmeta">
                  <span>watered: {relTime(p.last_watered)}</span>
                  <span>threshold: {p.moisture_threshold}%</span>
                </div>
                <button className="wbtn" disabled={busy || tankLow}
                  onClick={() => water(p.slot)}
                  style={{
                    background: busy ? "rgba(69,184,232,.25)" : `linear-gradient(180deg,${tn.c},${tn.c})`,
                    color: busy ? "#9FD9F2" : "#06222E",
                    boxShadow: busy ? "none" : `0 0 20px -4px ${tn.g}`,
                  }}>
                  {busy
                    ? <><Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} /> Watering…</>
                    : tankLow
                      ? <><AlertTriangle size={15} /> Tank empty</>
                      : <><Power size={15} /> Water</>}
                </button>
              </div>
            );
          })}
        </div>

        {/* DOCK */}
        <div className="glass dock">
          <div className="dockL">
            <button className="allbtn" disabled={!needWater.length || tankLow} onClick={() => needWater.forEach(p => water(p.slot))}>
              <Droplets size={15} /> Water all that need it {needWater.length ? `(${needWater.length})` : ""}
            </button>
          </div>
          <div className="dockR">
            <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
              <span className="dot" style={{
                background: connected ? "#4FD08A" : "#FF6B5C",
                boxShadow: connected ? "0 0 8px rgba(79,208,138,.8)" : "0 0 8px rgba(255,107,92,.6)",
              }} />
              {connected ? "online" : "offline"}
            </span>
            <span className="num">{clock}</span>
          </div>
        </div>

      </div>
    </div>
  );
}
