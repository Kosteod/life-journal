import { useState, useEffect } from "react";
import { auth, api, setSession, clearSession, _userId } from "./api.js";
import { todayISO, monthISO, fmt, MONTH_GEN, DAY_SHORT } from "./utils.js";
import { S, shimmer } from "./components/UI.jsx";
import AuthScreen from "./components/Auth.jsx";
import DayTab     from "./components/DayTab.jsx";
import WeekTab    from "./components/WeekTab.jsx";
import MonthTab   from "./components/MonthTab.jsx";
import FinanceTab from "./components/FinanceTab.jsx";

// ─────────────────────────────────────────────────────────────────────────────
// APP
// ─────────────────────────────────────────────────────────────────────────────
export default function App() {
  const [user,      setUser]     = useState(null);
  const [checking,  setChecking] = useState(true);
  const [tab,       setTab]      = useState("day");
  const [date,      setDate]     = useState(todayISO());
  const [settings,  setSettings] = useState(null);

  // ── Восстанавливаем сессию ─────────────────────────────────────────────────
  useEffect(() => {
    const token = localStorage.getItem("lj_token");
    const uid   = localStorage.getItem("lj_uid");
    if (token && uid) {
      setSession(token, uid);
      auth.getUser().then(u => {
        if (u?.id) setUser(u);
        else { clearSession(); }
        setChecking(false);
      });
    } else {
      setChecking(false);
    }
  }, []);

  // ── Загружаем настройки после логина ──────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    api.get("settings", { user_id: _userId }).then(s => {
      setSettings(s || {
        study_name:         "SQL",
        kcal_goal:          2500,
        balance:            0,
        next_income_date:   null,
        next_income_amount: 0,
        savings_goal:       0,
        day_blocks:         null,
        top_widgets:        null,
      });
    });
  }, [user]);

  function patchSettings(patch) {
    setSettings(prev => ({ ...prev, ...patch }));
  }

  async function saveSettings(patch) {
    patchSettings(patch);
    // Персистирование — через get/update в каждом компоненте
  }

  async function handleSignOut() {
    await auth.signOut();
    setUser(null);
    setSettings(null);
  }

  function handleAuth(u) { setUser(u); }

  // ── Считаем dayBalance для виджета ────────────────────────────────────────
  // Передаём в DayTab чтобы не дублировать логику
  const [dayBalance, setDayBalance] = useState(null);

  // ── Рендер ────────────────────────────────────────────────────────────────
  if (checking) return (
    <div style={{minHeight:"100vh", background:"#0a0908", display:"flex", alignItems:"center", justifyContent:"center", color:"#555", fontSize:13}}>
      <style>{shimmer}</style>
    </div>
  );

  if (!user)     return <AuthScreen onAuth={handleAuth}/>;
  if (!settings) return (
    <div style={{minHeight:"100vh", background:"#0a0908", display:"flex", alignItems:"center", justifyContent:"center", color:"#555", fontSize:13}}>
      <style>{shimmer}</style>
      загрузка...
    </div>
  );

  const now       = new Date();
  const dateLabel = `${DAY_SHORT[now.getDay()]}, ${now.getDate()} ${MONTH_GEN[now.getMonth()]}`;

  return (
    <div style={S.root}>
      <style>{shimmer}</style>

      {/* ── ШАПКА ── */}
      <div style={{
        padding:"24px 20px 18px",
        borderBottom:"1px solid #1e1c1a",
        display:"flex",
        justifyContent:"space-between",
        alignItems:"flex-end",
      }}>
        <div>
          <div style={{fontSize:11, letterSpacing:3, color:"#6b6760", textTransform:"uppercase", marginBottom:6}}>
            {dateLabel}
          </div>
          <div style={{fontSize:22, fontWeight:"normal"}}>Дневник жизни</div>
        </div>
        <div style={{display:"flex", flexDirection:"column", alignItems:"flex-end", gap:6}}>
          <button onClick={handleSignOut}
            style={{fontSize:11, color:"#444", background:"none", border:"1px solid #2a2825", borderRadius:6, padding:"3px 10px", cursor:"pointer", fontFamily:"inherit"}}>
            выйти
          </button>
          <input type="date" value={date} onChange={e=>setDate(e.target.value)}
            style={{background:"#1a1917", border:"1px solid #2a2825", borderRadius:8, padding:"5px 8px", color:"#888", fontSize:12, fontFamily:"inherit", outline:"none"}}/>
        </div>
      </div>

      {/* ── ТАБЫ ── */}
      <div style={{display:"flex", borderBottom:"1px solid #1e1c1a", position:"sticky", top:0, background:"#0a0908", zIndex:10}}>
        {[["day","День"],["week","Неделя"],["month","Месяц"],["finance","Финансы"]].map(([id,lbl]) => (
          <button key={id} onClick={()=>setTab(id)}
            style={{
              flex:1, padding:"12px 0", background:"none", border:"none",
              color: tab===id?"#f0ece4":"#555", fontSize:13, cursor:"pointer", fontFamily:"inherit",
              borderBottom: tab===id?"2px solid #e07a5f":"2px solid transparent",
              transition:"color 0.15s",
            }}>
            {lbl}
          </button>
        ))}
      </div>

      {/* ── КОНТЕНТ ── */}
      <div style={{padding:"0 16px"}}>
        {tab==="day"     && <DayTab     date={date} settings={settings} saveSettings={saveSettings} dayBalance={dayBalance}/>}
        {tab==="week"    && <WeekTab/>}
        {tab==="month"   && <MonthTab/>}
        {tab==="finance" && <FinanceTab settings={settings} saveSettings={saveSettings}/>}
      </div>
    </div>
  );
}
