import { useState, useEffect } from "react";
import { api } from "../api.js";
import { todayISO, monthISO, fmt, MONTH_NAMES } from "../utils.js";
import { S, Sec, SkPage, StatCard, shimmer } from "./UI.jsx";

export default function MonthTab() {
  const [logs,    setLogs]    = useState([]);
  const [txs,     setTxs]     = useState([]);
  const [loading, setLoading] = useState(true);

  const monthK = monthISO();
  const [yr, mo] = monthK.split("-").map(Number);
  const daysInMonth = new Date(yr, mo, 0).getDate();
  const allDays = Array.from({length:daysInMonth}, (_,i) =>
    `${yr}-${String(mo).padStart(2,"0")}-${String(i+1).padStart(2,"0")}`
  );
  const dateFrom = `${monthK}-01`;
  const dateTo   = `${monthK}-${String(daysInMonth).padStart(2,"0")}`;

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.getRange("daily_logs",   dateFrom, dateTo),
      api.getRange("transactions", dateFrom, dateTo),
    ]).then(([l, t]) => {
      setLogs(l || []);
      setTxs(t  || []);
      setLoading(false);
    });
  }, [monthK]);

  if (loading) return <div style={{paddingTop:20}}><style>{shimmer}</style><SkPage/></div>;

  const logMap     = Object.fromEntries(logs.map(l => [l.date, l]));
  const totalExp   = txs.filter(t=>t.type==="expense").reduce((s,t)=>s+t.amount,0);
  const totalInc   = txs.filter(t=>t.type==="income").reduce((s,t)=>s+t.amount,0);
  const totalStudy = logs.reduce((s,l) => s+(Number(l.study_minutes)||0), 0);
  const totalSteps = logs.reduce((s,l) => s+(Number(l.steps)||0), 0);
  const avgMood    = (() => { const a=logs.map(l=>l.mood).filter(Boolean); return a.length?(a.reduce((s,v)=>s+v,0)/a.length).toFixed(1):"—"; })();
  const avgKcal    = (() => { const a=logs.map(l=>Number(l.kcal)).filter(Boolean); return a.length?Math.round(a.reduce((s,v)=>s+v,0)/a.length):"—"; })();
  const goodDays   = logs.filter(l=>l.day_result==="yes").length;
  const badDays    = logs.filter(l=>l.day_result==="no").length;
  const result     = totalInc - totalExp;

  const catMap = {};
  txs.filter(t=>t.type==="expense").forEach(t => { catMap[t.category] = (catMap[t.category]||0)+t.amount; });

  const today = todayISO();

  return (
    <>
      <style>{shimmer}</style>
      <div style={{marginTop:20, marginBottom:12, fontSize:18, color:"#f0ece4"}}>
        {MONTH_NAMES[mo-1]} {yr}
      </div>

      {/* ── ИТОГИ ── */}
      <div style={S.statsGrid}>
        <StatCard icon="💰" label="Доходы"          val={`${fmt(totalInc)} ₽`}   color="#81b29a"/>
        <StatCard icon="💸" label="Расходы"         val={`${fmt(totalExp)} ₽`}   color="#e07a5f"/>
        <StatCard icon="🏦" label={result>=0?"Накоплено":"Перерасход"} val={`${result>=0?"+":""}${fmt(result)} ₽`} color={result>=0?"#81b29a":"#e07a5f"}/>
        <StatCard icon="🙂" label="Ср. настроение"  val={`${avgMood}/10`}         color="#e07a5f"/>
        <StatCard icon="📚" label="Учёба"           val={`${fmt(Math.round(totalStudy/60))} ч`} color="#7b9ccc"/>
        <StatCard icon="👣" label="Шагов всего"     val={fmt(totalSteps)}          color="#81b29a"/>
        <StatCard icon="🔥" label="Ср. калории"     val={`${fmt(avgKcal)} ккал`}  color="#e8c97a"/>
        <StatCard icon="✓"  label="Хороших дней"   val={`${goodDays}/${goodDays+badDays}`} color="#81b29a"/>
      </div>

      {/* ── РАСХОДЫ ПО КАТЕГОРИЯМ ── */}
      {Object.keys(catMap).length > 0 && (
        <Sec id="month_cats" title="Расходы по категориям">
          {Object.entries(catMap).sort((a,b)=>b[1]-a[1]).map(([cat,amt]) => (
            <div key={cat} style={{marginBottom:10}}>
              <div style={{display:"flex", justifyContent:"space-between", fontSize:13, marginBottom:4}}>
                <span style={{color:"#f0ece4"}}>{cat}</span>
                <span style={{color:"#e07a5f"}}>
                  {fmt(amt)} ₽{" "}
                  <span style={{color:"#555", fontSize:11}}>({Math.round(amt/totalExp*100)}%)</span>
                </span>
              </div>
              <div style={S.progressBg}>
                <div style={{...S.progressFill, width:`${Math.min(100,amt/totalExp*100)}%`, background:"#e07a5f"}}/>
              </div>
            </div>
          ))}
        </Sec>
      )}

      {/* ── КАЛЕНДАРЬ НАСТРОЕНИЯ ── */}
      <Sec id="month_mood" title="Календарь настроения">
        <div style={{display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:3}}>
          {["Пн","Вт","Ср","Чт","Пт","Сб","Вс"].map(d => (
            <div key={d} style={{fontSize:9, color:"#555", textAlign:"center", paddingBottom:4}}>{d}</div>
          ))}
          {Array.from({length:(new Date(yr,mo-1,1).getDay()+6)%7}, (_,i) => <div key={"e"+i}/>)}
          {allDays.map(k => {
            const l = logMap[k];
            const mood = l?.mood;
            const d = Number(k.slice(8));
            const isToday = k === today;
            const hasFail = l?.day_result === "no";
            return (
              <div key={k} title={l?.note || ""}
                style={{
                  aspectRatio:"1", borderRadius:5,
                  background: mood ? `hsl(${20+mood*8},${40+mood*4}%,${22+mood*3}%)` : "#1a1917",
                  border: isToday ? "1px solid #e07a5f" : hasFail ? "1px solid #e07a5f55" : "1px solid #2a2825",
                  display:"flex", alignItems:"center", justifyContent:"center",
                  fontSize:9, color: mood ? "#f0ece4" : "#333",
                }}>
                {d}
              </div>
            );
          })}
        </div>
        <div style={{display:"flex", alignItems:"center", gap:4, marginTop:8}}>
          <span style={{fontSize:10, color:"#555"}}>1</span>
          {[1,3,5,7,10].map(n => (
            <div key={n} style={{width:14, height:14, borderRadius:3,
              background:`hsl(${20+n*8},${40+n*4}%,${22+n*3}%)`}}/>
          ))}
          <span style={{fontSize:10, color:"#555"}}>10</span>
        </div>
      </Sec>

      {/* ── УЧЁБА ПО ДНЯМ ── */}
      <Sec id="month_study" title="Учёба по дням">
        <div style={{display:"flex", flexWrap:"wrap", gap:3}}>
          {allDays.map(k => {
            const l = logMap[k];
            const mins = Number(l?.study_minutes || 0);
            const d = Number(k.slice(8));
            const isToday = k === today;
            return (
              <div key={k} title={mins ? `${mins} мин` : ""}
                style={{
                  width:28, height:28, borderRadius:5,
                  background: mins > 60 ? "#7b9ccc" : mins > 0 ? "#7b9ccc55" : "#1a1917",
                  border: isToday ? "1px solid #e07a5f" : "1px solid #2a2825",
                  display:"flex", alignItems:"center", justifyContent:"center",
                  fontSize:9, color: mins ? "#f0ece4" : "#333",
                }}>
                {d}
              </div>
            );
          })}
        </div>
        <div style={{display:"flex", gap:12, marginTop:8, fontSize:11, color:"#555"}}>
          <span><span style={{color:"#7b9ccc"}}>■</span> &gt;60 мин</span>
          <span><span style={{color:"#7b9ccc88"}}>■</span> &gt;0 мин</span>
        </div>
      </Sec>
    </>
  );
}
