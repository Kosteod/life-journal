import { useState, useEffect } from "react";
import { api } from "../api.js";
import { todayISO, fmt, DAY_SHORT, getLast7 } from "../utils.js";
import { S, Sec, SkPage, StatCard, BarChart, shimmer } from "./UI.jsx";

export default function WeekTab() {
  const [days,    setDays]    = useState([]);
  const [txs,     setTxs]     = useState([]);
  const [loading, setLoading] = useState(true);
  const last7  = getLast7();
  const today  = todayISO();

  useEffect(() => {
    const from = last7[0], to = last7[last7.length-1];
    Promise.all([
      api.getRange("daily_logs",   from, to),
      api.getRange("transactions", from, to),
    ]).then(([logs, t]) => {
      const logMap = Object.fromEntries(logs.map(l => [l.date, l]));
      setDays(last7.map(date => ({
        key:   date,
        label: DAY_SHORT[new Date(date+"T12:00:00").getDay()],
        ...(logMap[date] || {}),
      })));
      setTxs(t || []);
      setLoading(false);
    });
  }, []);

  if (loading) return <div style={{paddingTop:20}}><style>{shimmer}</style><SkPage/></div>;

  const withMood   = days.filter(d => d.mood);
  const avgMood    = withMood.length ? (withMood.reduce((s,d)=>s+d.mood,0)/withMood.length).toFixed(1) : "—";
  const avgSteps   = (() => { const a=days.map(d=>Number(d.steps)).filter(Boolean); return a.length?Math.round(a.reduce((s,v)=>s+v,0)/a.length):"—"; })();
  const avgKcal    = (() => { const a=days.map(d=>Number(d.kcal)).filter(Boolean);  return a.length?Math.round(a.reduce((s,v)=>s+v,0)/a.length):"—"; })();
  const totalStudy = days.reduce((s,d) => s+(Number(d.study_minutes)||0), 0);
  const weekExp    = txs.filter(t=>t.type==="expense").reduce((s,t)=>s+t.amount,0);
  const weekInc    = txs.filter(t=>t.type==="income").reduce((s,t)=>s+t.amount,0);
  const goodDays   = days.filter(d=>d.day_result==="yes").length;
  const badDays    = days.filter(d=>d.day_result==="no").length;

  const maxSteps  = Math.max(...days.map(d=>Number(d.steps)||0), 8000);
  const maxKcal   = Math.max(...days.map(d=>Number(d.kcal)||0),  2500);
  const maxStudy  = Math.max(...days.map(d=>Number(d.study_minutes)||0), 60);

  // Полезное/вредное время за неделю (из расписания считаем по блокам)
  const usefulTypes  = ["учёба","спорт","работа","прогулка"];
  const harmfulTypes = ["телефон"];

  return (
    <>
      <style>{shimmer}</style>

      {/* ── ИТОГИ ── */}
      <div style={{...S.statsGrid, marginTop:20}}>
        <StatCard icon="🙂" label="Ср. настроение" val={`${avgMood}/10`}          color="#e07a5f"/>
        <StatCard icon="👣" label="Ср. шаги"       val={fmt(avgSteps)}             color="#81b29a"/>
        <StatCard icon="🔥" label="Ср. калории"    val={`${fmt(avgKcal)} ккал`}    color="#e8c97a"/>
        <StatCard icon="📚" label="Учёба"          val={`${fmt(totalStudy)} мин`}  color="#7b9ccc"/>
        <StatCard icon="💰" label="Доходы"         val={`${fmt(weekInc)} ₽`}       color="#81b29a"/>
        <StatCard icon="💸" label="Расходы"        val={`${fmt(weekExp)} ₽`}       color="#e07a5f"/>
      </div>

      {/* ── ХОРОШИЕ/ПЛОХИЕ ДНИ ── */}
      {(goodDays > 0 || badDays > 0) && (
        <div style={{marginTop:10, display:"flex", gap:8}}>
          <div style={{flex:1, ...S.card, textAlign:"center", borderColor:"#81b29a33"}}>
            <div style={{fontSize:22, color:"#81b29a"}}>{goodDays}</div>
            <div style={{fontSize:11, color:"#6b6760"}}>хороших дней</div>
          </div>
          <div style={{flex:1, ...S.card, textAlign:"center", borderColor:"#e07a5f33"}}>
            <div style={{fontSize:22, color:"#e07a5f"}}>{badDays}</div>
            <div style={{fontSize:11, color:"#6b6760"}}>трудных дней</div>
          </div>
        </div>
      )}

      {/* ── ГРАФИКИ ── */}
      <Sec id="week_mood"  title="Настроение">
        <BarChart days={days} field="mood"          max={10}       color="#e07a5f" today={today}/>
      </Sec>
      <Sec id="week_kcal"  title="Калории">
        <BarChart days={days} field="kcal"          max={maxKcal}  color="#e8c97a" today={today}/>
      </Sec>
      <Sec id="week_steps" title="Шаги">
        <BarChart days={days} field="steps"         max={maxSteps} color="#81b29a" today={today}/>
      </Sec>
      <Sec id="week_study" title="Учёба (мин)">
        <BarChart days={days} field="study_minutes" max={maxStudy} color="#7b9ccc" today={today}/>
      </Sec>

      {/* ── ФИНАНСЫ ПО ДНЯМ ── */}
      <Sec id="week_finance" title="Финансы по дням">
        <div style={{display:"flex", gap:4}}>
          {last7.map(date => {
            const dayTxs = txs.filter(t => t.date === date);
            const exp = dayTxs.filter(t=>t.type==="expense").reduce((s,t)=>s+t.amount,0);
            const inc = dayTxs.filter(t=>t.type==="income").reduce((s,t)=>s+t.amount,0);
            const isToday = date === today;
            const label = DAY_SHORT[new Date(date+"T12:00:00").getDay()];
            return (
              <div key={date} style={{flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:3}}>
                {inc > 0 && <div style={{width:"100%", height:Math.max(4,inc/Math.max(weekInc,1)*50), background:"#81b29a55", borderRadius:3}}/>}
                {exp > 0 && <div style={{width:"100%", height:Math.max(4,exp/Math.max(weekExp,1)*50), background:"#e07a5f55", borderRadius:3}}/>}
                {inc===0&&exp===0 && <div style={{width:"100%", height:4, background:"#2a2825", borderRadius:3}}/>}
                <div style={{fontSize:10, color:isToday?"#e07a5f":"#555"}}>{label}</div>
              </div>
            );
          })}
        </div>
        <div style={{display:"flex", gap:12, marginTop:8, fontSize:11, color:"#555"}}>
          <span style={{color:"#81b29a"}}>■ доходы</span>
          <span style={{color:"#e07a5f"}}>■ расходы</span>
        </div>
      </Sec>
    </>
  );
}
