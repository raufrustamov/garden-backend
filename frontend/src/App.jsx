import React, { useState, useEffect, useCallback, useRef } from "react";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import {
  Wifi, WifiOff, Thermometer, Droplets, Gauge, Sun, Leaf, Sparkles,
  Power, Waves, AlertTriangle, Loader2, CloudRain, ArrowLeft,
  Settings, History, BarChart3, Home, ChevronRight, Save, Clock,
  Droplet, Zap, Calendar, TrendingDown
} from "lucide-react";

const DID = "greenhouse-01";
const POLL = 10_000;

const T = {
  alert: { c:"#FF6B5C", g:"rgba(255,107,92,.45)", s:"rgba(255,107,92,.14)" },
  warn:  { c:"#E7B24C", g:"rgba(231,178,76,.4)",  s:"rgba(231,178,76,.13)" },
  ok:    { c:"#4FD08A", g:"rgba(79,208,138,.4)",  s:"rgba(79,208,138,.13)" },
  wet:   { c:"#45B8E8", g:"rgba(69,184,232,.4)",  s:"rgba(69,184,232,.13)" },
};
const CY="#46B6E8";

function st(m,thr){
  if(m==null)return{l:"Нет данных",t:"warn"};
  if(m<(thr??30))return{l:"Полить",t:"alert"};
  if(m<(thr??30)+15)return{l:"Подсыхает",t:"warn"};
  if(m<=80)return{l:"В норме",t:"ok"};
  return{l:"Влажно",t:"wet"};
}
function rel(ts){
  if(!ts)return"—";
  const s=Math.floor((Date.now()-new Date(ts).getTime())/1000);
  if(s<90)return"только что";if(s<3600)return`${Math.floor(s/60)} мин`;
  if(s<86400)return`${Math.floor(s/3600)} ч`;return`${Math.floor(s/86400)} дн`;
}
function fmtDate(ts){return new Date(ts).toLocaleString("ru-RU",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit",timeZone:"Europe/Warsaw"})}

/* ── Ring ──────────────────────────── */
function Ring({value,tone,size=84}){
  const tn=T[tone]||T.warn,v=value??0,R=30,C=2*Math.PI*R;
  const off=C-(Math.max(0,Math.min(100,v))/100)*C;
  return(<svg viewBox="0 0 76 76" width={size} height={size}>
    <circle cx="38" cy="38" r={R} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="6"/>
    <circle cx="38" cy="38" r={R} fill="none" stroke={tn.c} strokeWidth="6" strokeLinecap="round"
            strokeDasharray={C} strokeDashoffset={off} transform="rotate(-90 38 38)"
            style={{transition:"stroke-dashoffset .9s",filter:`drop-shadow(0 0 6px ${tn.g})`}}/>
    <text x="38" y="36" textAnchor="middle" fontFamily="Manrope" fontSize="20" fontWeight="300" fill="#EAF2F2">{Math.round(v)}</text>
    <text x="38" y="50" textAnchor="middle" fontFamily="Inter" fontSize="9" fill="#7C8A98">%</text>
  </svg>);
}

/* ── Spark ─────────────────────────── */
function Spark({data,color,h=30}){
  if(!data||data.length<2)return<div style={{height:h}}/>;
  const d=data.map((r,i)=>({i,v:parseFloat(r.moisture_pct)}));
  return(<ResponsiveContainer width="100%" height={h}>
    <AreaChart data={d} margin={{top:2,bottom:0,left:0,right:0}}>
      <defs><linearGradient id={`s${color.replace("#","")}`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={color} stopOpacity={.45}/><stop offset="100%" stopColor={color} stopOpacity={0}/>
      </linearGradient></defs>
      <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.6} fill={`url(#s${color.replace("#","")})`} isAnimationActive={false} dot={false}/>
    </AreaChart>
  </ResponsiveContainer>);
}

/* ── Tank ──────────────────────────── */
function TankBar({low}){
  const pct=low?12:78,c=low?"#FF6B5C":CY;
  return(<div className="gl" style={{padding:"14px 18px"}}>
    <div style={{display:"flex",gap:14,alignItems:"center"}}>
      <div style={{width:42,height:64,borderRadius:"5px 5px 12px 12px",border:`2px solid ${low?"rgba(255,107,92,.35)":"rgba(70,182,232,.25)"}`,background:"rgba(255,255,255,.03)",position:"relative",overflow:"hidden"}}>
        <div style={{position:"absolute",bottom:0,left:0,right:0,height:`${pct}%`,background:`linear-gradient(180deg,${c}44,${c}22)`,borderTop:`2px solid ${c}88`,transition:"height 1.2s"}}>
          <svg viewBox="0 0 42 6" style={{position:"absolute",top:-4,left:0,width:"100%"}}><path d="M0 3Q10 0 21 3Q31 6 42 3L42 6L0 6Z" fill={`${c}66`}><animate attributeName="d" values="M0 3Q10 0 21 3Q31 6 42 3L42 6L0 6Z;M0 3Q10 6 21 3Q31 0 42 3L42 6L0 6Z;M0 3Q10 0 21 3Q31 6 42 3L42 6L0 6Z" dur="3s" repeatCount="indefinite"/></path></svg>
        </div>
        <div style={{position:"absolute",inset:0,display:"grid",placeItems:"center",fontFamily:"Manrope",fontWeight:300,fontSize:14,color:"#EAF2F2"}}>{pct}%</div>
      </div>
      <div style={{flex:1}}>
        <div style={{fontSize:15,fontFamily:"Manrope",fontWeight:300,color:low?"#FF6B5C":"#EAF2F2"}}>{low?"Пора долить воду":"Бак в норме"}</div>
        <div style={{height:6,borderRadius:999,background:"rgba(255,255,255,.07)",marginTop:8,overflow:"hidden"}}>
          <div style={{height:"100%",borderRadius:999,width:`${pct}%`,background:low?"linear-gradient(90deg,#FF6B5C,#FF8A7C)":`linear-gradient(90deg,#2E96C9,${CY})`,transition:"width 1.2s"}}/>
        </div>
      </div>
    </div>
  </div>);
}

/* ── Nav ──────────────────────────── */
function Nav({view,set}){
  const items=[{id:"home",icon:Home,label:"Обзор"},{id:"history",icon:History,label:"История"},{id:"stats",icon:BarChart3,label:"Статистика"},{id:"settings",icon:Settings,label:"Настройки"}];
  return(<div className="gl nav">
    {items.map(i=><button key={i.id} className={`nb ${view===i.id?"na":""}`} onClick={()=>set(i.id)}>
      <i.icon size={16}/><span className="nl">{i.label}</span>
    </button>)}
  </div>);
}

/* ══════════════════════════════════════ */
/*  PLANT DETAIL VIEW                    */
/* ══════════════════════════════════════ */
function PlantDetail({pot,hist,onBack,onWater,watering,tankLow}){
  const m=pot.moisture_pct!=null?parseFloat(pot.moisture_pct):null;
  const s=st(m,pot.moisture_threshold),tn=T[s.t];
  const busy=watering;
  const chartData=(hist||[]).map(r=>({time:new Date(r.ts).toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"}),v:parseFloat(r.moisture_pct)}));

  return(<div>
    <button onClick={onBack} className="backbtn"><ArrowLeft size={16}/> Назад</button>
    <div className="gl" style={{padding:20,marginTop:10}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:16}}>
        <div>
          <div className="nm" style={{fontSize:24}}>{pot.name}</div>
          <div style={{color:"#7C8A98",fontSize:13,marginTop:4}}>{pot.plant_type}</div>
          <span className="pill" style={{color:tn.c,background:tn.s,marginTop:8}}>
            {s.t==="alert"?<AlertTriangle size={11}/>:<Leaf size={11}/>}{s.l}
          </span>
        </div>
        <Ring value={m} tone={s.t} size={110}/>
      </div>

      <div style={{marginTop:20}}>
        <div style={{color:"#9AA7B4",fontSize:12,marginBottom:8}}>Влажность за 24 часа</div>
        <ResponsiveContainer width="100%" height={160}>
          <AreaChart data={chartData} margin={{top:5,right:5,bottom:5,left:5}}>
            <defs><linearGradient id="detG" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={tn.c} stopOpacity={.4}/><stop offset="100%" stopColor={tn.c} stopOpacity={0}/>
            </linearGradient></defs>
            <XAxis dataKey="time" tick={{fontSize:10,fill:"#7C8A98"}} axisLine={false} tickLine={false} interval="preserveStartEnd"/>
            <YAxis domain={[0,100]} tick={{fontSize:10,fill:"#7C8A98"}} axisLine={false} tickLine={false} width={30}/>
            <Tooltip contentStyle={{background:"#1a1f2e",border:"1px solid rgba(255,255,255,.1)",borderRadius:12,fontSize:12,color:"#EAF2F2"}}/>
            <Area type="monotone" dataKey="v" stroke={tn.c} strokeWidth={2} fill="url(#detG)" name="Влажность" unit="%"/>
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="detgrid">
        <div className="detc"><Clock size={14} color="#7C8A98"/><div><div className="detl">Последний полив</div><div className="detv">{rel(pot.last_watered)} назад</div></div></div>
        <div className="detc"><TrendingDown size={14} color="#7C8A98"/><div><div className="detl">Порог полива</div><div className="detv">{pot.moisture_threshold}%</div></div></div>
        <div className="detc"><Droplet size={14} color="#7C8A98"/><div><div className="detl">Текущая</div><div className="detv">{m!=null?Math.round(m)+"%":"—"}</div></div></div>
        <div className="detc"><Zap size={14} color="#7C8A98"/><div><div className="detl">Слот</div><div className="detv">#{pot.slot}</div></div></div>
      </div>

      <button className="wbtn" disabled={busy||tankLow} onClick={()=>onWater(pot.slot)}
              style={{marginTop:16,width:"100%",background:busy?"rgba(69,184,232,.25)":`linear-gradient(180deg,${tn.c},${tn.c})`,color:busy?"#9FD9F2":"#062028",boxShadow:busy?"none":`0 0 20px -4px ${tn.g}`}}>
        {busy?<><Loader2 size={15} className="spin"/> Полив…</>:tankLow?<><AlertTriangle size={15}/> Бак пуст</>:<><Power size={15}/> Полить</>}
      </button>
    </div>
  </div>);
}

/* ══════════════════════════════════════ */
/*  HISTORY VIEW                         */
/* ══════════════════════════════════════ */
function HistoryView({deviceId}){
  const [events,setEvents]=useState(null);
  const [aiLog,setAiLog]=useState(null);
  const [tab,setTab]=useState("water");
  useEffect(()=>{
    fetch(`/api/watering-history/${deviceId}?limit=50`).then(r=>r.json()).then(setEvents).catch(()=>{});
    fetch(`/api/ai/history/${deviceId}?limit=20`).then(r=>r.json()).then(setAiLog).catch(()=>{});
  },[deviceId]);

  return(<div>
    <div style={{display:"flex",gap:8,marginBottom:14}}>
      <button className={`tb ${tab==="water"?"ta":""}`} onClick={()=>setTab("water")}><Droplet size={14}/> Поливы</button>
      <button className={`tb ${tab==="ai"?"ta":""}`} onClick={()=>setTab("ai")}><Sparkles size={14}/> AI-лог</button>
    </div>

    {tab==="water" && (<div className="gl" style={{padding:16}}>
      {!events?<div style={{color:"#7C8A98",textAlign:"center",padding:20}}>Загрузка...</div>:
          events.length===0?<div style={{color:"#7C8A98",textAlign:"center",padding:20}}>Поливов пока не было</div>:
              events.map(e=><div key={e.id} className="hrow">
                <div className="hdot" style={{background:e.trigger==="manual"?"#E7B24C":"#4FD08A"}}/>
                <div style={{flex:1}}>
                  <div style={{fontSize:14}}><b>{e.pot_name}</b> (слот {e.slot})</div>
                  <div style={{fontSize:12,color:"#7C8A98"}}>{e.trigger==="manual"?"🖐 Вручную":"🤖 Авто"} · {e.duration_sec} сек</div>
                </div>
                <div style={{fontSize:12,color:"#7C8A98",textAlign:"right"}}>{fmtDate(e.ts)}</div>
              </div>)}
    </div>)}

    {tab==="ai" && (<div className="gl" style={{padding:16}}>
      {!aiLog?<div style={{color:"#7C8A98",textAlign:"center",padding:20}}>Загрузка...</div>:
          aiLog.length===0?<div style={{color:"#7C8A98",textAlign:"center",padding:20}}>AI-анализов пока не было</div>:
              aiLog.map(a=><div key={a.id} className="hrow">
                <Sparkles size={14} color={a.severity==="warn"?"#E7B24C":"#46B6E8"} style={{flexShrink:0,marginTop:2}}/>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,lineHeight:1.4}}>{a.summary}</div>
                  <div style={{fontSize:11,color:"#7C8A98",marginTop:4}}>{fmtDate(a.created_at)}</div>
                </div>
              </div>)}
    </div>)}
  </div>);
}

/* ══════════════════════════════════════ */
/*  STATS VIEW                           */
/* ══════════════════════════════════════ */
function StatsView({deviceId}){
  const [stats,setStats]=useState(null);
  useEffect(()=>{fetch(`/api/stats/${deviceId}`).then(r=>r.json()).then(setStats).catch(()=>{});},[deviceId]);
  if(!stats)return<div style={{color:"#7C8A98",textAlign:"center",padding:40}}>Загрузка...</div>;

  const chartData=(stats.perPlant||[]).map(p=>({name:p.name,waterings:parseInt(p.waterings),minutes:Math.round(parseInt(p.total_sec)/60)}));

  return(<div>
    <div className="sgrid">
      <div className="gl sc"><div className="sl">Сегодня</div><div className="sv nm">{stats.totals.today}</div><div className="sl">поливов</div></div>
      <div className="gl sc"><div className="sl">За неделю</div><div className="sv nm">{stats.totals.week}</div><div className="sl">поливов</div></div>
      <div className="gl sc"><div className="sl">За месяц</div><div className="sv nm">{stats.totals.month}</div><div className="sl">поливов</div></div>
    </div>
    <div className="gl" style={{padding:18,marginTop:14}}>
      <div style={{color:"#9AA7B4",fontSize:12,marginBottom:12}}>Поливы по растениям (30 дней)</div>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={chartData} margin={{top:5,right:5,bottom:5,left:5}}>
          <XAxis dataKey="name" tick={{fontSize:10,fill:"#7C8A98"}} axisLine={false} tickLine={false} angle={-30} textAnchor="end" height={50}/>
          <YAxis tick={{fontSize:10,fill:"#7C8A98"}} axisLine={false} tickLine={false} width={25}/>
          <Tooltip contentStyle={{background:"#1a1f2e",border:"1px solid rgba(255,255,255,.1)",borderRadius:12,fontSize:12,color:"#EAF2F2"}}/>
          <Bar dataKey="waterings" fill={CY} radius={[6,6,0,0]} name="Поливов"/>
        </BarChart>
      </ResponsiveContainer>
    </div>
  </div>);
}

/* ══════════════════════════════════════ */
/*  SETTINGS VIEW                        */
/* ══════════════════════════════════════ */
function SettingsView({pots,onSave}){
  const [edits,setEdits]=useState({});
  const [saving,setSaving]=useState(null);

  function change(id,field,val){setEdits(prev=>({...prev,[id]:{...(prev[id]||{}), [field]:val}}))}

  async function save(pot){
    const e=edits[pot.id];if(!e)return;
    setSaving(pot.id);
    try{
      await fetch(`/api/pots/${pot.id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(e)});
      onSave();setEdits(prev=>{const n={...prev};delete n[pot.id];return n;});
    }catch{}
    setSaving(null);
  }

  return(<div className="gl" style={{padding:18}}>
    <div style={{color:"#9AA7B4",fontSize:12,marginBottom:14}}>Настройки растений</div>
    {pots.map(p=>{
      const e=edits[p.id]||{};
      const name=e.name??p.name;
      const thr=e.moisture_threshold??p.moisture_threshold;
      const en=e.enabled??p.enabled;
      const changed=Object.keys(e).length>0;
      return(<div key={p.id} className="srow">
        <div style={{display:"flex",alignItems:"center",gap:10,flex:1,flexWrap:"wrap"}}>
          <span style={{color:"#7C8A98",fontSize:12,width:24}}>#{p.slot}</span>
          <input value={name} onChange={ev=>change(p.id,"name",ev.target.value)} className="sinp" style={{flex:"1 1 120px"}}/>
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            <span style={{color:"#7C8A98",fontSize:12}}>Порог:</span>
            <input type="number" min={10} max={90} value={thr} onChange={ev=>change(p.id,"moisture_threshold",parseInt(ev.target.value))} className="sinp" style={{width:56,textAlign:"center"}}/>
            <span style={{color:"#7C8A98",fontSize:12}}>%</span>
          </div>
          <label style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer",fontSize:12,color:en?"#4FD08A":"#7C8A98"}}>
            <input type="checkbox" checked={en} onChange={ev=>change(p.id,"enabled",ev.target.checked)} style={{accentColor:"#4FD08A"}}/>
            {en?"Вкл":"Выкл"}
          </label>
        </div>
        {changed&&<button onClick={()=>save(p)} className="savebtn" disabled={saving===p.id}>
          {saving===p.id?<Loader2 size={14} className="spin"/>:<Save size={14}/>}
        </button>}
      </div>);
    })}
  </div>);
}

/* ══════════════════════════════════════ */
/*  MAIN APP                             */
/* ══════════════════════════════════════ */
export default function App(){
  const [state,setState]=useState(null);
  const [hist,setHist]=useState({});
  const [watering,setW]=useState({});
  const [conn,setConn]=useState(false);
  const [err,setErr]=useState("");
  const [loading,setLoading]=useState(true);
  const [now,setNow]=useState(Date.now());
  const [view,setView]=useState("home");
  const [selPot,setSel]=useState(null);
  const poll=useRef(null);

  const fetchState=useCallback(async()=>{
    try{
      const r=await fetch(`/api/state/${DID}`);if(!r.ok)throw new Error(`HTTP ${r.status}`);
      const d=await r.json();setState(d);setConn(true);setErr("");
      for(const p of(d.pots||[])){try{const h=await fetch(`/api/history/${p.id}?hours=24`);if(h.ok){const hd=await h.json();setHist(prev=>({...prev,[p.id]:hd}))}}catch{}}
    }catch(e){setConn(false);setErr(e.message)}finally{setLoading(false)}
  },[]);

  useEffect(()=>{fetchState()},[fetchState]);
  useEffect(()=>{poll.current=setInterval(fetchState,POLL);return()=>clearInterval(poll.current)},[fetchState]);
  useEffect(()=>{const t=setInterval(()=>setNow(Date.now()),30000);return()=>clearInterval(t)},[]);

  async function water(slot){
    setW(prev=>({...prev,[slot]:true}));
    try{await fetch("/api/commands",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({deviceId:DID,potSlot:slot,durationSec:8})});
      setTimeout(()=>{setW(prev=>({...prev,[slot]:false}));fetchState()},3000);
    }catch{setW(prev=>({...prev,[slot]:false}))}
  }

  const amb=state?.ambient,pots=state?.pots||[],rec=state?.recommendation,dev=state?.device;
  const tankLow=amb?.tank_low;
  const need=pots.filter(p=>{const m=p.moisture_pct!=null?parseFloat(p.moisture_pct):null;return m!=null&&m<(p.moisture_threshold??30)});
  const clock=new Date(now).toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"});

  const css=`
    @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@200;300;500;700&family=Inter:wght@400;500;600&display=swap');
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:#070A0F}
    .wrap{min-height:100vh;font-family:Inter,system-ui,sans-serif;color:#EAF2F2;
      background:radial-gradient(900px 480px at 18% -8%,rgba(40,96,120,.45),transparent 60%),
      radial-gradient(820px 520px at 92% 8%,rgba(36,86,72,.4),transparent 62%),
      radial-gradient(700px 600px at 60% 120%,rgba(48,70,120,.3),transparent 60%),#070A0F;
      padding:14px 12px 26px}
    .inner{max-width:1100px;margin:0 auto}
    .nm{font-family:Manrope,sans-serif}
    .gl{background:linear-gradient(160deg,rgba(255,255,255,.07),rgba(255,255,255,.02));
      border:1px solid rgba(255,255,255,.09);border-radius:20px;
      backdrop-filter:blur(22px) saturate(140%);-webkit-backdrop-filter:blur(22px) saturate(140%);
      box-shadow:inset 0 1px 0 rgba(255,255,255,.14),0 26px 50px -28px rgba(0,0,0,.85)}
    .topbar{display:flex;align-items:center;justify-content:space-between;padding:4px 6px 12px}
    .sysicons{display:flex;align-items:center;gap:10px;color:#8C99A6;font-size:12px}
    .sysicons .on{color:#4FD08A}
    .nav{display:flex;gap:4px;padding:5px;margin-bottom:14px;overflow-x:auto}
    .nb{display:flex;align-items:center;gap:6px;border:none;background:transparent;color:#7C8A98;
      font-family:Inter;font-size:13px;font-weight:500;padding:8px 14px;border-radius:14px;cursor:pointer;white-space:nowrap}
    .na{background:rgba(70,182,232,.15);color:#CDE9F7}
    .nb:hover{color:#CDE9F7}
    .hero{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:12px}
    .card{padding:16px}
    .chead{display:flex;align-items:center;gap:8px;color:#9AA7B4;font-size:12px;font-weight:500;margin-bottom:12px}
    .cico{width:24px;height:24px;border-radius:7px;display:grid;place-items:center}
    .bignum{font-family:Manrope;font-weight:200;font-size:48px;line-height:.9;letter-spacing:-1px}
    .cond{color:#AEB9C4;font-size:12px;margin-top:4px}
    .climrow{display:flex;gap:6px;margin-top:14px}
    .chip{flex:1;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.06);border-radius:12px;padding:8px}
    .chip .l{color:#7C8A98;font-size:10px;display:flex;align-items:center;gap:4px}
    .chip .v{font-family:Manrope;font-weight:300;font-size:16px;margin-top:2px}
    .chip .v small{font-size:10px;color:#7C8A98}
    .aitxt{font-size:13px;line-height:1.4;color:#DCE5EC;min-height:50px}
    .scan{height:3px;border-radius:3px;margin-top:12px;overflow:hidden;background:rgba(255,255,255,.06)}
    .scan i{display:block;height:100%;width:38%;border-radius:3px;background:linear-gradient(90deg,transparent,#46B6E8,transparent);animation:scan 2.6s linear infinite}
    @keyframes scan{0%{transform:translateX(-100%)}100%{transform:translateX(360%)}}
    .plants{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:12px}
    .pcard{padding:14px;display:flex;flex-direction:column;gap:8px;cursor:pointer;transition:border-color .2s}
    .pcard:hover{border-color:rgba(255,255,255,.2)}
    .prow{display:flex;justify-content:space-between;align-items:flex-start}
    .pname{font-family:Manrope;font-weight:500;font-size:15px}
    .pill{display:inline-flex;align-items:center;gap:4px;font-size:10px;font-weight:600;padding:2px 8px;border-radius:999px;margin-top:4px}
    .pmeta{display:flex;justify-content:space-between;color:#7C8A98;font-size:11px}
    .wbtn{appearance:none;border:none;cursor:pointer;font-family:Inter;font-weight:600;font-size:13px;
      border-radius:12px;padding:9px;display:flex;align-items:center;justify-content:center;gap:6px;
      color:#062028;transition:filter .2s,transform .05s}
    .wbtn:hover{filter:brightness(1.08)}.wbtn:active{transform:scale(.98)}.wbtn:disabled{opacity:.5;cursor:default}
    .dock{display:flex;align-items:center;gap:12px;flex-wrap:wrap;justify-content:space-between;padding:10px 14px;margin-top:14px}
    .dockL{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
    .allbtn{appearance:none;border:none;cursor:pointer;font-family:Inter;font-weight:600;font-size:13px;
      border-radius:14px;padding:10px 16px;display:flex;align-items:center;gap:7px;
      background:linear-gradient(180deg,#52C2EE,#2E96C9);color:#06222E;box-shadow:0 0 20px rgba(70,182,232,.4)}
    .allbtn:disabled{opacity:.4;cursor:default;box-shadow:none}
    .dot{width:7px;height:7px;border-radius:50%}
    .backbtn{appearance:none;border:none;background:rgba(255,255,255,.06);color:#9AA7B4;padding:8px 14px;border-radius:12px;cursor:pointer;font-family:Inter;font-size:13px;display:flex;align-items:center;gap:6px}
    .backbtn:hover{color:#EAF2F2}
    .detgrid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:16px}
    .detc{display:flex;gap:10px;align-items:center;background:rgba(255,255,255,.04);border-radius:12px;padding:12px}
    .detl{color:#7C8A98;font-size:11px}.detv{font-family:Manrope;font-size:16px;font-weight:300;margin-top:2px}
    .hrow{display:flex;gap:12px;align-items:flex-start;padding:12px 0;border-bottom:1px solid rgba(255,255,255,.06)}
    .hrow:last-child{border-bottom:none}
    .hdot{width:8px;height:8px;border-radius:50%;margin-top:5px;flex-shrink:0}
    .sgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
    .sc{padding:18px;text-align:center}
    .sl{color:#7C8A98;font-size:12px}.sv{font-family:Manrope;font-weight:200;font-size:36px;margin:4px 0}
    .srow{display:flex;gap:10px;align-items:center;padding:12px 0;border-bottom:1px solid rgba(255,255,255,.06)}
    .srow:last-child{border-bottom:none}
    .sinp{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:10px;padding:8px 12px;color:#EAF2F2;font-family:Inter;font-size:13px;outline:none}
    .sinp:focus{border-color:rgba(70,182,232,.5)}
    .savebtn{appearance:none;border:none;background:rgba(79,208,138,.2);color:#4FD08A;padding:8px 12px;border-radius:10px;cursor:pointer;display:flex;align-items:center}
    .tb{appearance:none;border:none;background:rgba(255,255,255,.05);color:#7C8A98;padding:8px 16px;border-radius:12px;cursor:pointer;font-family:Inter;font-size:13px;font-weight:500;display:flex;align-items:center;gap:6px}
    .ta{background:rgba(70,182,232,.15);color:#CDE9F7}
    @keyframes spin{to{transform:rotate(360deg)}}.spin{animation:spin 1s linear infinite}
    @media(max-width:860px){.hero{grid-template-columns:1fr}.sgrid{grid-template-columns:repeat(3,1fr)}}
    @media(max-width:600px){.plants{grid-template-columns:1fr 1fr}.detgrid{grid-template-columns:1fr}.nl{display:none}.sgrid{grid-template-columns:1fr}}
    @media(max-width:400px){.plants{grid-template-columns:1fr}}
  `;

  if(loading)return(<div className="wrap"><style>{css}</style><div style={{display:"grid",placeItems:"center",minHeight:"60vh",color:"#7C8A98"}}><div style={{textAlign:"center"}}><Loader2 size={32} className="spin" style={{marginBottom:12}}/><div>Подключение…</div></div></div></div>);
  if(!state)return(<div className="wrap"><style>{css}</style><div style={{textAlign:"center",padding:"60px 20px",color:"#FF6B5C"}}><WifiOff size={40} style={{marginBottom:12,opacity:.6}}/><div>Нет связи с API</div><div style={{fontSize:12,marginTop:8,color:"#7C8A98"}}>{err}</div><button onClick={fetchState} style={{marginTop:16,padding:"10px 24px",borderRadius:12,border:"none",background:"rgba(70,182,232,.2)",color:CY,cursor:"pointer",fontFamily:"Inter",fontWeight:600}}>Повторить</button></div></div>);

  const lD=!amb?"":amb.light_lux>6000?"Светло":amb.light_lux>1500?"Рассеянный свет":"Сумрак";
  const hD=!amb?"":amb.humidity<45?"сухо":amb.humidity<60?"комфортно":"влажно";

  return(<div className="wrap"><style>{css}</style><div className="inner">
    <div className="topbar">
      <div style={{display:"flex",alignItems:"center",gap:10}}><span className="nm" style={{fontSize:20,fontWeight:500}}>🌿 Garden</span><span className="nm" style={{fontSize:16,fontWeight:300,color:"#7C8A98"}}>{clock}</span></div>
      <div className="sysicons"><span>RSSI {dev?.wifi_rssi??"—"}</span>{conn?<Wifi size={15} className="on"/>:<WifiOff size={15} color="#FF6B5C"/>}</div>
    </div>

    <Nav view={view} set={v=>{setView(v);setSel(null)}}/>

    {/* ── DETAIL ── */}
    {selPot && view==="home" && <PlantDetail pot={selPot} hist={hist[selPot.id]} onBack={()=>setSel(null)} onWater={water} watering={watering[selPot.slot]} tankLow={tankLow}/>}

    {/* ── HOME ── */}
    {!selPot && view==="home" && <>
      <div className="hero">
        <div className="gl card">
          <div className="chead"><span className="cico" style={{background:"rgba(231,178,76,.18)"}}><Sun size={14} color="#E7B24C"/></span> Микроклимат</div>
          {amb?<><div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}><div><div className="bignum nm">{Math.round(parseFloat(amb.temp_c))}°</div><div className="cond">{lD}, {hD}</div></div><Sun size={40} color="#E7B24C" style={{opacity:.8}}/></div>
            <div className="climrow">
              <div className="chip"><div className="l"><Droplets size={11}/> Вл.</div><div className="v nm">{Math.round(parseFloat(amb.humidity))}<small>%</small></div></div>
              <div className="chip"><div className="l"><Gauge size={11}/> Д.</div><div className="v nm">{Math.round(parseFloat(amb.pressure_hpa))}<small>hPa</small></div></div>
              <div className="chip"><div className="l"><Sun size={11}/> Св.</div><div className="v nm">{(parseInt(amb.light_lux)/1000).toFixed(1)}<small>klx</small></div></div>
            </div></>:<div style={{color:"#7C8A98",fontSize:12}}>Ожидаем данные…</div>}
        </div>
        <div className="gl card">
          <div className="chead"><span className="cico" style={{background:"rgba(70,182,232,.18)"}}><Sparkles size={14} color={CY}/></span> Садовник · AI</div>
          <div className="aitxt">{rec?rec.summary:need.length>0?`${need.length} ${need.length===1?"горшок требует":"горшка требуют"} полива.`:"Все в норме. AI-анализ появится позже."}</div>
          <div className="scan"><i/></div>
        </div>
        <div className="gl card">
          <div className="chead"><span className="cico" style={{background:"rgba(79,208,138,.16)"}}><CloudRain size={14} color="#4FD08A"/></span> Система</div>
          <div style={{display:"flex",justifyContent:"space-between",marginTop:8}}>
            <div><div style={{color:"#7C8A98",fontSize:11}}>Полить</div><div className="nm" style={{fontSize:36,fontWeight:200,color:need.length?"#FF6B5C":"#4FD08A"}}>{need.length}</div></div>
            <div style={{textAlign:"right"}}><div style={{color:"#7C8A98",fontSize:11}}>Связь</div><div className="nm" style={{fontSize:13,fontWeight:300,color:"#AEB9C4",marginTop:4}}>{rel(dev?.last_seen)}</div></div>
          </div>
        </div>
      </div>

      <div style={{marginBottom:12}}><TankBar low={!!tankLow}/></div>

      <div className="plants">
        {pots.map(p=>{
          const m=p.moisture_pct!=null?parseFloat(p.moisture_pct):null;
          const s=st(m,p.moisture_threshold),tn=T[s.t],busy=watering[p.slot];
          return(<div key={p.id} className="gl pcard" onClick={()=>setSel(p)}
                      style={{borderColor:s.t==="alert"?"rgba(255,107,92,.4)":undefined}}>
            <div className="prow">
              <div><div className="pname nm">{p.name}</div>
                <span className="pill" style={{color:tn.c,background:tn.s}}>{s.t==="alert"?<AlertTriangle size={10}/>:<Leaf size={10}/>}{s.l}</span>
              </div>
              <Ring value={m} tone={s.t} size={72}/>
            </div>
            <Spark data={hist[p.id]} color={tn.c}/>
            <div className="pmeta"><span>{rel(p.last_watered)}</span><span>{p.moisture_threshold}%</span></div>
            <button className="wbtn" disabled={busy||tankLow} onClick={e=>{e.stopPropagation();water(p.slot)}}
                    style={{background:busy?"rgba(69,184,232,.25)":`linear-gradient(180deg,${tn.c},${tn.c})`,color:busy?"#9FD9F2":"#062028"}}>
              {busy?<><Loader2 size={14} className="spin"/> Полив…</>:tankLow?<><AlertTriangle size={14}/> Бак</>:<><Power size={14}/> Полить</>}
            </button>
          </div>);
        })}
      </div>

      <div className="gl dock">
        <div className="dockL"><button className="allbtn" disabled={!need.length||tankLow} onClick={()=>need.forEach(p=>water(p.slot))}><Droplets size={14}/> Полить ({need.length})</button></div>
        <div style={{display:"flex",alignItems:"center",gap:10,color:"#8C99A6",fontSize:12}}>
          <span className="dot" style={{background:conn?"#4FD08A":"#FF6B5C",boxShadow:conn?"0 0 8px rgba(79,208,138,.8)":"0 0 8px rgba(255,107,92,.6)"}}/>{conn?"online":"offline"}
        </div>
      </div>
    </>}

    {view==="history" && <HistoryView deviceId={DID}/>}
    {view==="stats" && <StatsView deviceId={DID}/>}
    {view==="settings" && <SettingsView pots={pots} onSave={fetchState}/>}
  </div></div>);
}
