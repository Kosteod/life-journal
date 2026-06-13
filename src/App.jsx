import { useState, useEffect, useRef } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// КОНФИГУРАЦИЯ
// ─────────────────────────────────────────────────────────────────────────────
const SUPABASE_URL = "https://hfnjanaljjxohdkvwyoo.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhmbmphbmFsamp4b2hka3Z3eW9vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwMDIxODQsImV4cCI6MjA5NjU3ODE4NH0.36RQExXDeRQBsHoQphttKiVNC9nte6lLIPs0aRyALJw";

// ─────────────────────────────────────────────────────────────────────────────
// КЭШ
// ─────────────────────────────────────────────────────────────────────────────
const _cache = new Map();
const TTL = 30_000;
const cGet = (k) => { const e=_cache.get(k); if(!e) return null; if(Date.now()-e.ts>TTL){_cache.delete(k);return null;} return e.d; };
const cSet = (k,d) => _cache.set(k,{d,ts:Date.now()});
const cDel = (p) => { for(const k of _cache.keys()) if(k.includes(p)) _cache.delete(k); };
const cClear = () => _cache.clear();

// ─────────────────────────────────────────────────────────────────────────────
// AUTH API
// ─────────────────────────────────────────────────────────────────────────────
let _token = null;
let _userId = null;

function authHeaders() {
  return {
    "Content-Type": "application/json",
    "apikey": SUPABASE_KEY,
    "Authorization": `Bearer ${_token || SUPABASE_KEY}`,
    "Prefer": "return=representation",
  };
}

const auth = {
  async signUp(email, password) {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": SUPABASE_KEY },
      body: JSON.stringify({ email, password }),
    });
    return await r.json();
  },
  async signIn(email, password) {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": SUPABASE_KEY },
      body: JSON.stringify({ email, password }),
    });
    return await r.json();
  },
  async signOut() {
    await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": SUPABASE_KEY, "Authorization": `Bearer ${_token}` },
    });
    _token = null; _userId = null;
    localStorage.removeItem("lj_token");
    localStorage.removeItem("lj_uid");
    cClear();
  },
  async getUser() {
    if (!_token) return null;
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${_token}` },
    });
    if (!r.ok) return null;
    return await r.json();
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// DATA API
// ─────────────────────────────────────────────────────────────────────────────
async function cfetch(url) {
  const hit = cGet(url); if (hit !== null) return hit;
  const r = await fetch(url, { headers: authHeaders() });
  const d = await r.json();
  const result = Array.isArray(d) ? d : [];
  cSet(url, result); return result;
}

const api = {
  async get(table, match) {
    const p = Object.entries(match).map(([k,v]) => `${k}=eq.${encodeURIComponent(v)}`).join("&");
    const url = p ? `${SUPABASE_URL}/rest/v1/${table}?${p}` : `${SUPABASE_URL}/rest/v1/${table}?user_id=eq.${_userId}`;
    const data = await cfetch(url);
    return data[0] || null;
  },
  async getMany(table, match={}, order="") {
    let url = `${SUPABASE_URL}/rest/v1/${table}?user_id=eq.${_userId}`;
    const p = Object.entries(match).map(([k,v]) => `${k}=eq.${encodeURIComponent(v)}`);
    if (order) p.push(`order=${order}`);
    if (p.length) url += "&" + p.join("&");
    return await cfetch(url);
  },
  async getRange(table, from, to) {
    const url = `${SUPABASE_URL}/rest/v1/${table}?user_id=eq.${_userId}&date=gte.${from}&date=lte.${to}&order=date.asc`;
    return await cfetch(url);
  },
  async upsert(table, data, inv) {
    if (inv) cDel(inv);
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: "POST",
      headers: { ...authHeaders(), "Prefer": "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify({ ...data, user_id: _userId }),
    });
    const result = await r.json();
    return Array.isArray(result) ? result[0] : result || null;
  },
  async update(table, id, data, inv) {
    if (inv) cDel(inv);
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
      method: "PATCH", headers: authHeaders(), body: JSON.stringify(data),
    });
    const result = await r.json();
    return Array.isArray(result) ? result[0] : result || null;
  },
  async insert(table, data, inv) {
    if (inv) cDel(inv);
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: "POST", headers: authHeaders(),
      body: JSON.stringify({ ...data, user_id: _userId }),
    });
    const result = await r.json();
    return Array.isArray(result) ? result[0] : result || null;
  },
  async delete(table, id, inv) {
    if (inv) cDel(inv);
    await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
      method: "DELETE", headers: authHeaders(),
    });
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// УТИЛИТЫ
// ─────────────────────────────────────────────────────────────────────────────
const todayISO = () => {
  const now = new Date();
  // МСК = UTC+3
  const msk = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  return msk.toISOString().slice(0, 10);
};
const monthISO = () => {
  const now = new Date();
  const msk = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  return `${msk.getUTCFullYear()}-${String(msk.getUTCMonth()+1).padStart(2,"0")}`;
};
const fmt       = (n, dec=0) => Number(n||0).toLocaleString("ru-RU", {minimumFractionDigits:dec, maximumFractionDigits:dec});
const DAY_SHORT = ["Вс","Пн","Вт","Ср","Чт","Пт","Сб"];
const MONTH_NAMES = ["Январь","Февраль","Март","Апрель","Май","Июнь","Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"];
const MONTH_GEN   = ["января","февраля","марта","апреля","мая","июня","июля","августа","сентября","октября","ноября","декабря"];

function getLast7() {
  return Array.from({length:7}, (_,i) => {
    const d = new Date(); d.setDate(d.getDate()-(6-i)); return d.toISOString().slice(0,10);
  });
}
function daysUntil(dateStr) {
  if (!dateStr) return null;
  const diff = new Date(dateStr) - new Date(todayISO());
  return Math.ceil(diff / (1000*60*60*24));
}

const BLOCK_COLORS = {
  "сон":"#3d405b","учёба":"#7b9ccc","спорт":"#e07a5f","еда":"#81b29a",
  "работа":"#c9a96e","отдых":"#6b6760","прогулка":"#81b29a","свободно":"#2a2825",
};
const BLOCK_TYPES  = Object.keys(BLOCK_COLORS);
const HOURS        = Array.from({length:24}, (_,i) => i);
const EXPENSE_CATS = ["🍔 Еда","🚇 Транспорт","☕ Кафе","🛒 Продукты","💊 Здоровье","📱 Подписки","👕 Одежда","🎮 Развлечения","📚 Учёба","💸 Другое"];
const INCOME_CATS  = ["💼 Работа","🤝 Поддержка","📦 Прочее"];

// ─────────────────────────────────────────────────────────────────────────────
// SKELETON
// ─────────────────────────────────────────────────────────────────────────────
const shimmer = `@keyframes sh{0%{background-position:200% 0}100%{background-position:-200% 0}}`;
function Sk({w="100%", h=16, r=6, mb=10}) {
  return <div style={{width:w,height:h,borderRadius:r,marginBottom:mb,
    background:"linear-gradient(90deg,#1a1917 25%,#252220 50%,#1a1917 75%)",
    backgroundSize:"200% 100%",animation:"sh 1.4s infinite"}}/>;
}
function SkPage() {
  return <div style={{paddingTop:20}}>
    <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:8,marginBottom:20}}>
      {[1,2,3,4].map(i=><Sk key={i} h={80} r={12}/>)}
    </div>
    {[1,2,3,4,5].map(i=><Sk key={i} h={36} r={8}/>)}
  </div>;
}

// ─────────────────────────────────────────────────────────────────────────────
// ЭКРАН АВТОРИЗАЦИИ
// ─────────────────────────────────────────────────────────────────────────────
function AuthScreen({ onAuth }) {
  const [mode,    setMode]    = useState("signin"); // signin | signup
  const [email,   setEmail]   = useState("");
  const [pass,    setPass]    = useState("");
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");
  const [success, setSuccess] = useState("");

  async function handleSubmit() {
    if (!email || !pass) { setError("Заполни email и пароль"); return; }
    if (pass.length < 6) { setError("Пароль минимум 6 символов"); return; }
    setLoading(true); setError(""); setSuccess("");
    try {
      if (mode === "signup") {
        const res = await auth.signUp(email, pass);
        if (res.error) { setError(res.error.message || "Ошибка регистрации"); }
        else { setSuccess("Аккаунт создан! Теперь войди."); setMode("signin"); }
      } else {
        const res = await auth.signIn(email, pass);
        if (res.error || !res.access_token) {
          setError("Неверный email или пароль");
        } else {
          _token = res.access_token;
          _userId = res.user.id;
          localStorage.setItem("lj_token", res.access_token);
          localStorage.setItem("lj_uid", res.user.id);
          onAuth(res.user);
        }
      }
    } catch(e) { setError("Нет соединения"); }
    setLoading(false);
  }

  return (
    <div style={{minHeight:"100vh",background:"#0a0908",display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <style>{shimmer}</style>
      <div style={{width:"100%",maxWidth:360}}>
        <div style={{fontSize:11,letterSpacing:3,color:"#6b6760",textTransform:"uppercase",marginBottom:8}}>
          Дневник жизни
        </div>
        <div style={{fontSize:26,color:"#f0ece4",marginBottom:32,fontFamily:"Georgia,serif"}}>
          {mode==="signin"?"Вход":"Регистрация"}
        </div>

        <div style={{display:"flex",flexDirection:"column",gap:12,marginBottom:20}}>
          <input
            type="email" placeholder="Email" value={email}
            onChange={e=>{setEmail(e.target.value);setError("");}}
            onKeyDown={e=>e.key==="Enter"&&handleSubmit()}
            style={S.authInput}
          />
          <input
            type="password" placeholder="Пароль (мин. 6 символов)" value={pass}
            onChange={e=>{setPass(e.target.value);setError("");}}
            onKeyDown={e=>e.key==="Enter"&&handleSubmit()}
            style={S.authInput}
          />
        </div>

        {error   && <div style={S.authError}>{error}</div>}
        {success && <div style={S.authSuccess}>{success}</div>}

        <button onClick={handleSubmit} disabled={loading}
          style={{...S.authBtn, opacity:loading?0.6:1}}>
          {loading?"...":mode==="signin"?"Войти":"Зарегистрироваться"}
        </button>

        <div style={{textAlign:"center",marginTop:16}}>
          <button onClick={()=>{setMode(mode==="signin"?"signup":"signin");setError("");setSuccess("");}}
            style={{background:"none",border:"none",color:"#6b6760",fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>
            {mode==="signin"?"Нет аккаунта? Зарегистрироваться":"Уже есть аккаунт? Войти"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// APP
// ─────────────────────────────────────────────────────────────────────────────
export default function App() {
  const [user,     setUser]     = useState(null);
  const [checking, setChecking] = useState(true);
  const [tab,      setTab]      = useState("day");
  const [date,     setDate]     = useState(todayISO());
  const [settings, setSettings] = useState(null);

  // Восстанавливаем сессию из localStorage
  useEffect(() => {
    const savedToken = localStorage.getItem("lj_token");
    const savedUid   = localStorage.getItem("lj_uid");
    if (savedToken && savedUid) {
      _token = savedToken;
      _userId = savedUid;
      auth.getUser().then(u => {
        if (u && u.id) { setUser(u); }
        else { _token=null; _userId=null; localStorage.removeItem("lj_token"); localStorage.removeItem("lj_uid"); }
        setChecking(false);
      });
    } else { setChecking(false); }
  }, []);

  // Загружаем настройки после логина
  useEffect(() => {
    if (!user) return;
    api.get("settings", {user_id: _userId}).then(s => {
      setSettings(s || {study_name:"SQL",kcal_goal:2500,balance:0,next_income_date:null,next_income_amount:0});
    });
  }, [user]);

  async function saveSettings(patch) {
  const updated = { ...settings, ...patch };
  setSettings(updated);
  cDel("settings");
  const existing = await api.get("settings", {user_id: _userId});
  if (existing) {
    await api.update("settings", existing.id, patch, "settings");
  } else {
    await api.upsert("settings", {...updated, user_id: _userId}, "settings");
  }
}

  async function handleSignOut() {
    await auth.signOut();
    setUser(null); setSettings(null);
  }

  function handleAuth(u) { setUser(u); }

  if (checking) return (
    <div style={{minHeight:"100vh",background:"#0a0908",display:"flex",alignItems:"center",justifyContent:"center",color:"#555",fontSize:13}}>
      <style>{shimmer}</style>
      загрузка...
    </div>
  );

  if (!user) return <AuthScreen onAuth={handleAuth}/>;
  if (!settings) return (
    <div style={{minHeight:"100vh",background:"#0a0908",display:"flex",alignItems:"center",justifyContent:"center",color:"#555",fontSize:13}}>
      <style>{shimmer}</style>
      загрузка данных...
    </div>
  );

  const now = new Date();
  const dateLabel = `${DAY_SHORT[now.getDay()]}, ${now.getDate()} ${MONTH_GEN[now.getMonth()]}`;

  return (
    <div style={S.root}>
      <style>{shimmer}</style>
      <div style={S.header}>
        <div>
          <div style={S.dateSmall}>{dateLabel}</div>
          <div style={S.h1}>Дневник жизни</div>
        </div>
        <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:6}}>
          <button onClick={handleSignOut}
            style={{fontSize:11,color:"#555",background:"none",border:"1px solid #2a2825",borderRadius:6,padding:"3px 10px",cursor:"pointer",fontFamily:"inherit"}}>
            выйти
          </button>
          <input type="date" value={date} onChange={e=>setDate(e.target.value)} style={S.datePicker}/>
        </div>
      </div>
      <div style={S.tabs}>
        {[["day","День"],["week","Неделя"],["month","Месяц"],["finance","Финансы"]].map(([id,lbl])=>(
          <button key={id} onClick={()=>setTab(id)} style={{...S.tab,...(tab===id?S.tabOn:{})}}>
            {lbl}
          </button>
        ))}
      </div>
      <div style={S.body}>
        {tab==="day"     && <DayTab     date={date} settings={settings} saveSettings={saveSettings}/>}
        {tab==="week"    && <WeekTab    last7={getLast7()}/>}
        {tab==="month"   && <MonthTab   monthK={monthISO()}/>}
        {tab==="finance" && <FinanceTab settings={settings} saveSettings={saveSettings}/>}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ДЕНЬ
// ─────────────────────────────────────────────────────────────────────────────
function DayTab({date, settings, saveSettings}) {
  const [log,          setLog]         = useState(null);
  const [schedule,     setSchedule]    = useState([]);
  const [templates,    setTemplates]   = useState([]);
  const [loading,      setLoading]     = useState(true);
  const [editStudyName,setEditStudyName]= useState(false);

  // Выделение диапазона
  const [selectMode,   setSelectMode]  = useState(false);
  const [selectStart,  setSelectStart] = useState(null);
  const [selectEnd,    setSelectEnd]   = useState(null);
  const [selectType,   setSelectType]  = useState("учёба");
  const [selectNote,   setSelectNote]  = useState("");

  // Шаблоны
  const [showTemplates,   setShowTemplates]   = useState(false);
  const [showSaveTemplate,setShowSaveTemplate]= useState(false);
  const [templateName,    setTemplateName]    = useState("");
  const [templateRepeat,  setTemplateRepeat]  = useState("once");
  const [templateDay,     setTemplateDay]     = useState(1);

  const saveTimer = useRef({});

  useEffect(()=>{
    setLoading(true);
    Promise.all([
      api.get("daily_logs", {date}),
      api.getMany("schedule_blocks", {date}, "hour.asc"),
      api.getMany("schedule_templates", {}, "name.asc"),
    ]).then(([l,s,t])=>{
      setLog(l||{});
      setSchedule(s||[]);
      setTemplates(t||[]);
      setLoading(false);
    });
  },[date]);

  // Автоприменение шаблонов
  useEffect(()=>{
    if (!templates.length || schedule.length > 0 || loading) return;
    const dow = new Date(date+"T12:00:00").getDay(); // 0=вс..6=сб
    const toApply = templates.filter(t=>{
      if (t.repeat_type==="daily")    return true;
      if (t.repeat_type==="weekdays") return dow>=1&&dow<=5;
      if (t.repeat_type==="weekends") return dow===0||dow===6;
      if (t.repeat_type==="weekly")   return t.repeat_day===dow;
      return false;
    });
    if (toApply.length>0) applyTemplate(toApply[0], true);
  },[templates, loading]);

  function saveLog(field, value) {
    setLog(prev=>({...prev,[field]:value}));
    clearTimeout(saveTimer.current[field]);
    saveTimer.current[field]=setTimeout(async()=>{
      const existing = await api.get("daily_logs",{date,user_id:_userId});
      if (existing) await api.update("daily_logs",existing.id,{[field]:value},"daily_logs");
      else await api.upsert("daily_logs",{date,user_id:_userId,[field]:value},"daily_logs");
    },600);
  }

  // Сохраняем один блок
  async function saveOneBlock(hour, block_type, note="") {
    const existing = schedule.find(b=>b.hour===hour);
    cDel("schedule_blocks");
    if (existing) {
      await api.update("schedule_blocks",existing.id,{block_type,note});
      setSchedule(prev=>prev.map(b=>b.hour===hour?{...b,block_type,note}:b));
    } else {
      const created = await api.insert("schedule_blocks",{date,hour,block_type,note});
      if (created) setSchedule(prev=>[...prev,created].sort((a,b)=>a.hour-b.hour));
    }
  }

  // Применяем диапазон
  async function applyRange() {
    if (selectStart===null||selectEnd===null) return;
    const from = Math.min(selectStart,selectEnd);
    const to   = Math.max(selectStart,selectEnd);
    for (let h=from; h<=to; h++) {
      await saveOneBlock(h, selectType, selectNote);
    }
    setSelectMode(false); setSelectStart(null); setSelectEnd(null); setSelectNote("");
  }

  async function clearBlock(hour) {
    const block = schedule.find(b=>b.hour===hour);
    if (block) {
      await api.delete("schedule_blocks",block.id,"schedule_blocks");
      setSchedule(prev=>prev.filter(b=>b.hour!==hour));
    }
  }

  async function clearAll() {
    for (const b of schedule) await api.delete("schedule_blocks",b.id,"schedule_blocks");
    setSchedule([]);
    cDel("schedule_blocks");
  }

  // Применяем шаблон
  async function applyTemplate(tmpl, silent=false) {
    if (!silent) await clearAll();
    const blocks = tmpl.blocks || [];
    for (const b of blocks) await saveOneBlock(b.hour, b.block_type, b.note||"");
    if (!silent) setShowTemplates(false);
  }

  // Сохраняем шаблон
  async function saveTemplate() {
    if (!templateName.trim()) return;
    const blocks = schedule.map(b=>({hour:b.hour,block_type:b.block_type,note:b.note||""}));
    const t = await api.insert("schedule_templates",{
      name: templateName,
      blocks: JSON.stringify(blocks),
      repeat_type: templateRepeat,
      repeat_day: templateRepeat==="weekly" ? templateDay : null,
    },"schedule_templates");
    if (t) setTemplates(prev=>[...prev,t]);
    setTemplateName(""); setShowSaveTemplate(false);
  }

  async function deleteTemplate(id) {
    await api.delete("schedule_templates",id,"schedule_templates");
    setTemplates(prev=>prev.filter(t=>t.id!==id));
  }

  const isToday  = date===todayISO();
  const nowHour  = new Date().getHours();
  const schedMap = Object.fromEntries(schedule.map(b=>[b.hour,b]));

  // Объединяем соседние одинаковые блоки
  function getGrouped() {
    const groups=[];
    HOURS.forEach(h=>{
      const block=schedMap[h];
      const last=groups[groups.length-1];
      if (last&&block&&last.type===block.block_type&&!block.note&&!last.note) {
        last.endHour=h+1;
        last.hours.push(h);
      } else {
        groups.push({startHour:h,endHour:h+1,type:block?.block_type||null,note:block?.note||null,hasBlock:!!block,hours:[h]});
      }
    });
    return groups;
  }
  const grouped=getGrouped();

  // Диапазон выделения
  const selFrom = selectStart!==null&&selectEnd!==null ? Math.min(selectStart,selectEnd) : null;
  const selTo   = selectStart!==null&&selectEnd!==null ? Math.max(selectStart,selectEnd) : null;

  const blockCount={};
  schedule.forEach(b=>{blockCount[b.block_type]=(blockCount[b.block_type]||0)+1;});

  const kcalGoal  = settings.kcal_goal||2500;
  const kcalEaten = Number(log?.kcal||0);
  const kcalLeft  = kcalGoal-kcalEaten;
  const kcalPct   = Math.min(100,kcalEaten/kcalGoal*100);

  const REPEAT_TYPES = [
    {id:"once",     label:"Без повтора"},
    {id:"daily",    label:"Каждый день"},
    {id:"weekdays", label:"По будням"},
    {id:"weekends", label:"По выходным"},
    {id:"weekly",   label:"Раз в неделю"},
  ];
  const DAY_NAMES = ["Вс","Пн","Вт","Ср","Чт","Пт","Сб"];

  if (loading) return <SkPage/>;

  return (
    <>
      {/* ── КАЛОРИИ ── */}
      <Sec title="Калории">
        <div style={{background:"#1a1917",borderRadius:14,padding:"16px",border:"1px solid #2a2825"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",marginBottom:12}}>
            <div>
              <div style={{fontSize:11,color:"#6b6760",marginBottom:4}}>Съедено</div>
              <div style={{display:"flex",alignItems:"baseline",gap:6}}>
                <input type="number" value={log?.kcal||""} onChange={e=>saveLog("kcal",e.target.value)}
                  placeholder="0" style={{...S.bigInput,color:"#f0ece4",width:100}}/>
                <span style={{fontSize:13,color:"#6b6760"}}>ккал</span>
              </div>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:11,color:"#6b6760",marginBottom:2}}>Норма</div>
              <div style={{fontSize:15,color:"#555"}}>{fmt(kcalGoal)}</div>
            </div>
          </div>
          <div style={{height:8,background:"#0f0e0d",borderRadius:4,overflow:"hidden",marginBottom:10}}>
            <div style={{height:"100%",borderRadius:4,transition:"width 0.4s",width:`${kcalPct}%`,
              background:kcalPct>100?"#e07a5f":kcalPct>80?"#e8c97a":"#81b29a"}}/>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:12}}>
            <span style={{color:kcalLeft<0?"#e07a5f":"#81b29a"}}>
              {kcalLeft>=0?`Осталось: ${fmt(kcalLeft)} ккал`:`Превышено на ${fmt(-kcalLeft)} ккал`}
            </span>
            <span style={{color:"#555"}}>{Math.round(kcalPct)}%</span>
          </div>
        </div>
      </Sec>

      {/* ── ШАГИ + НАСТРОЕНИЕ ── */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginTop:24}}>
        <div style={S.metricCard}>
          <div style={{fontSize:11,color:"#6b6760",marginBottom:6}}>👣 Шаги</div>
          <input type="number" value={log?.steps||""} onChange={e=>saveLog("steps",e.target.value)}
            placeholder="0" style={{...S.bigInput,color:"#81b29a"}}/>
        </div>
        <div style={S.metricCard}>
          <div style={{fontSize:11,color:"#6b6760",marginBottom:8}}>🙂 Настроение</div>
          <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
            {[1,2,3,4,5,6,7,8,9,10].map(n=>(
              <button key={n} onClick={()=>saveLog("mood",n)}
                style={{width:26,height:26,borderRadius:6,border:"1px solid",fontSize:11,cursor:"pointer",fontFamily:"inherit",
                  borderColor:log?.mood===n?"#e07a5f":"#2a2825",
                  background:log?.mood===n?"#e07a5f22":"#0f0e0d",
                  color:log?.mood===n?"#e07a5f":"#555"}}>
                {n}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── РАСПИСАНИЕ ── */}
      <Sec title="Расписание дня">

        {/* Панель инструментов */}
        <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>
          <button onClick={()=>{setSelectMode(!selectMode);setSelectStart(null);setSelectEnd(null);}}
            style={{...S.tag,...(selectMode?{borderColor:"#7b9ccc",color:"#7b9ccc",background:"#7b9ccc18"}:{})}}>
            {selectMode?"✕ Отмена":"⊞ Выделить диапазон"}
          </button>
          <button onClick={()=>setShowTemplates(!showTemplates)}
            style={{...S.tag,...(showTemplates?{borderColor:"#e8c97a",color:"#e8c97a",background:"#e8c97a18"}:{})}}>
            📋 Шаблоны {templates.length>0&&`(${templates.length})`}
          </button>
          {schedule.length>0&&(
            <button onClick={()=>{setShowSaveTemplate(!showSaveTemplate);}}
              style={S.tag}>
              💾 Сохранить как шаблон
            </button>
          )}
          {schedule.length>0&&(
            <button onClick={clearAll} style={{...S.tag,borderColor:"#e07a5f44",color:"#e07a5f"}}>
              🗑 Очистить
            </button>
          )}
        </div>

        {/* Режим выделения — выбор типа */}
        {selectMode&&(
          <div style={{background:"#1a1917",borderRadius:10,padding:"12px",marginBottom:12,border:"1px solid #7b9ccc33"}}>
            <div style={{fontSize:11,color:"#7b9ccc",marginBottom:8,letterSpacing:1}}>
              {selectStart===null?"Кликни на начальный час":"Кликни на конечный час"}
            </div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>
              {BLOCK_TYPES.map(bt=>(
                <button key={bt} onClick={()=>setSelectType(bt)}
                  style={{...S.tag,borderColor:selectType===bt?BLOCK_COLORS[bt]:BLOCK_COLORS[bt]+"44",
                    color:BLOCK_COLORS[bt],background:selectType===bt?BLOCK_COLORS[bt]+"25":"transparent"}}>
                  {bt}
                </button>
              ))}
            </div>
            <input value={selectNote} onChange={e=>setSelectNote(e.target.value)}
              placeholder="Заметка (необязательно)" style={{...S.input,marginBottom:10}}/>
            {selectStart!==null&&selectEnd!==null&&(
              <button onClick={applyRange} style={S.saveBtn}>
                Применить {String(Math.min(selectStart,selectEnd)).padStart(2,"0")}:00 — {String(Math.max(selectStart,selectEnd)+1).padStart(2,"0")}:00
              </button>
            )}
          </div>
        )}

        {/* Шаблоны */}
        {showTemplates&&(
          <div style={{background:"#1a1917",borderRadius:10,padding:"12px",marginBottom:12,border:"1px solid #e8c97a33"}}>
            {templates.length===0?(
              <div style={{fontSize:13,color:"#555"}}>Нет сохранённых шаблонов</div>
            ):(
              templates.map(t=>(
                <div key={t.id} style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                  <div style={{flex:1}}>
                    <div style={{fontSize:13,color:"#f0ece4"}}>{t.name}</div>
                    <div style={{fontSize:11,color:"#555"}}>
                      {REPEAT_TYPES.find(r=>r.id===t.repeat_type)?.label}
                      {t.repeat_type==="weekly"&&` · ${DAY_NAMES[t.repeat_day]}`}
                      {" · "}{(t.blocks?.length||JSON.parse(t.blocks||"[]").length)} блоков
                    </div>
                  </div>
                  <button onClick={()=>applyTemplate(t)}
                    style={{fontSize:11,padding:"3px 10px",borderRadius:6,border:"1px solid #81b29a",
                      background:"#81b29a18",color:"#81b29a",cursor:"pointer",fontFamily:"inherit"}}>
                    Применить
                  </button>
                  <button onClick={()=>deleteTemplate(t.id)} style={S.clearBtn}>✕</button>
                </div>
              ))
            )}
          </div>
        )}

        {/* Сохранить шаблон */}
        {showSaveTemplate&&(
          <div style={{background:"#1a1917",borderRadius:10,padding:"12px",marginBottom:12,border:"1px solid #2a2825"}}>
            <input value={templateName} onChange={e=>setTemplateName(e.target.value)}
              placeholder="Название шаблона" style={{...S.input,marginBottom:10}}/>
            <div style={{fontSize:11,color:"#6b6760",marginBottom:8}}>Повторять автоматически</div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>
              {REPEAT_TYPES.map(r=>(
                <button key={r.id} onClick={()=>setTemplateRepeat(r.id)}
                  style={{...S.tag,...(templateRepeat===r.id?{borderColor:"#7b9ccc",color:"#7b9ccc",background:"#7b9ccc18"}:{})}}>
                  {r.label}
                </button>
              ))}
            </div>
            {templateRepeat==="weekly"&&(
              <div style={{display:"flex",gap:6,marginBottom:10}}>
                {DAY_NAMES.map((d,i)=>(
                  <button key={i} onClick={()=>setTemplateDay(i)}
                    style={{...S.tag,padding:"4px 8px",...(templateDay===i?{borderColor:"#7b9ccc",color:"#7b9ccc",background:"#7b9ccc18"}:{})}}>
                    {d}
                  </button>
                ))}
              </div>
            )}
            <div style={{display:"flex",gap:8}}>
              <button onClick={saveTemplate} style={S.saveBtn}>Сохранить</button>
              <button onClick={()=>setShowSaveTemplate(false)}
                style={{...S.saveBtn,borderColor:"#555",color:"#555",background:"transparent"}}>
                Отмена
              </button>
            </div>
          </div>
        )}

        {/* Итог блоков */}
        {Object.keys(blockCount).length>0&&(
          <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12}}>
            {Object.entries(blockCount).map(([type,c])=>(
              <div key={type} style={{...S.tag,borderColor:BLOCK_COLORS[type]+"66",color:BLOCK_COLORS[type],background:BLOCK_COLORS[type]+"15"}}>
                {type} {c}ч
              </div>
            ))}
          </div>
        )}

        {/* Часы */}
        <div style={{display:"flex",flexDirection:"column",gap:1}}>
          {grouped.map((g,gi)=>{
            const isCurrent = isToday&&nowHour>=g.startHour&&nowHour<g.endHour;
            const isPast    = isToday&&nowHour>=g.endHour;
            const isSelected= selFrom!==null&&g.startHour>=selFrom&&g.startHour<=selTo;
            const isSelectStart = selectStart===g.startHour;
            const timeLabel = g.endHour-g.startHour>1
              ?`${String(g.startHour).padStart(2,"0")}:00–${String(g.endHour).padStart(2,"0")}:00`
              :`${String(g.startHour).padStart(2,"0")}:00`;

            function handleClick() {
              if (selectMode) {
                if (selectStart===null) {
                  setSelectStart(g.startHour);
                  setSelectEnd(g.startHour);
                } else {
                  setSelectEnd(g.startHour);
                }
                return;
              }
              // Обычный клик — очистить или показать редактор (не нужен, используем режим выделения)
              if (g.hasBlock) clearBlock(g.startHour);
            }

            return(
              <div key={gi}
                onClick={handleClick}
                style={{display:"flex",alignItems:"center",gap:10,padding:"6px 10px",borderRadius:4,
                  cursor:selectMode?"crosshair":"pointer",
                  borderLeft:`3px solid ${isSelected?"#7b9ccc":g.hasBlock?BLOCK_COLORS[g.type]||"#555":isCurrent?"#e07a5f":"#1e1c1a"}`,
                  background:isSelected?"#7b9ccc15":g.hasBlock?BLOCK_COLORS[g.type]+"12":isCurrent?"#e07a5f06":"transparent",
                  opacity:isPast&&!g.hasBlock?0.25:1,
                  transition:"background 0.1s",
                  outline:isSelectStart?"1px solid #7b9ccc":"none"}}>
                <div style={{fontSize:11,minWidth:86,color:isCurrent?"#e07a5f":isPast?"#3a3835":"#666",fontVariantNumeric:"tabular-nums"}}>
                  {timeLabel}
                  {isCurrent&&<span style={{fontSize:7,color:"#e07a5f",marginLeft:4}}>●</span>}
                </div>
                <div style={{flex:1,fontSize:13,color:g.hasBlock?BLOCK_COLORS[g.type]:"transparent"}}>
                  {g.hasBlock&&(
                    <><span style={{textTransform:"capitalize"}}>{g.type}</span>
                    {g.note&&<span style={{color:"#555",fontSize:12}}> — {g.note}</span>}</>
                  )}
                </div>
                {g.hasBlock&&!selectMode&&(
                  <button onClick={e=>{e.stopPropagation();g.hours.forEach(h=>clearBlock(h));}}
                    style={S.clearBtn}>✕</button>
                )}
              </div>
            );
          })}
        </div>
      </Sec>

      {/* ── УЧЁБА ── */}
      <Sec title="Учёба">
        <div style={{background:"#1a1917",borderRadius:14,padding:"16px",border:"1px solid #2a2825"}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}>
            {editStudyName?(
              <input autoFocus value={settings.study_name||""}
                onChange={e=>saveSettings({study_name:e.target.value})}
                onBlur={()=>setEditStudyName(false)}
                onKeyDown={e=>e.key==="Enter"&&setEditStudyName(false)}
                style={{...S.input,fontSize:16,padding:"4px 10px"}}/>
            ):(
              <>
                <span style={{fontSize:16,color:"#e8c97a"}}>{settings.study_name||"SQL"}</span>
                <button onClick={()=>setEditStudyName(true)}
                  style={{fontSize:11,color:"#555",background:"none",border:"1px solid #2a2825",borderRadius:6,padding:"2px 8px",cursor:"pointer",fontFamily:"inherit"}}>
                  переименовать
                </button>
              </>
            )}
          </div>
          <div style={{display:"flex",gap:12,alignItems:"flex-end",marginBottom:12}}>
            <div>
              <div style={{fontSize:11,color:"#6b6760",marginBottom:4}}>Минут сегодня</div>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <input type="number" value={log?.study_minutes||""} onChange={e=>saveLog("study_minutes",e.target.value)}
                  placeholder="0" style={{...S.bigInput,color:"#7b9ccc",width:70}}/>
                <span style={{fontSize:13,color:"#6b6760"}}>мин</span>
              </div>
            </div>
            {log?.study_minutes>0&&(
              <div style={{fontSize:13,color:"#555",marginBottom:4}}>= {(log.study_minutes/60).toFixed(1)} ч</div>
            )}
          </div>
          <input value={log?.study_note||""} onChange={e=>saveLog("study_note",e.target.value)}
            placeholder="Что изучил сегодня..." style={S.input}/>
        </div>
      </Sec>

      {/* ── ЗАМЕТКА ── */}
      <Sec title="Заметка дня">
        <textarea rows={3} value={log?.note||""} onChange={e=>saveLog("note",e.target.value)}
          placeholder="Мысли, ощущения, итог дня..." style={S.ta}/>
      </Sec>

      {/* ── ИТОГ ── */}
      <Sec title="День удался?">
        <div style={{display:"flex",gap:10,marginBottom:12}}>
          <button onClick={()=>saveLog("day_result","yes")}
            style={{...S.resultBtn,borderColor:log?.day_result==="yes"?"#81b29a":"#2a2825",
              color:log?.day_result==="yes"?"#81b29a":"#555",
              background:log?.day_result==="yes"?"#81b29a18":"#1a1917"}}>
            ✓ Да
          </button>
          <button onClick={()=>saveLog("day_result","no")}
            style={{...S.resultBtn,borderColor:log?.day_result==="no"?"#e07a5f":"#2a2825",
              color:log?.day_result==="no"?"#e07a5f":"#555",
              background:log?.day_result==="no"?"#e07a5f18":"#1a1917"}}>
            ✗ Нет
          </button>
        </div>
        {log?.day_result==="no"&&(
          <textarea rows={2} value={log?.day_fail||""} onChange={e=>saveLog("day_fail",e.target.value)}
            placeholder="Что пошло не так?" style={{...S.ta,borderColor:"#e07a5f33"}}/>
        )}
      </Sec>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// НЕДЕЛЯ
// ─────────────────────────────────────────────────────────────────────────────
function WeekTab({last7}) {
  const [days,   setDays]   = useState([]);
  const [txs,    setTxs]    = useState([]);
  const [loading,setLoading]= useState(true);

  useEffect(()=>{
    const from=last7[0], to=last7[last7.length-1];
    Promise.all([
      api.getRange("daily_logs",from,to),
      api.getRange("transactions",from,to),
    ]).then(([logs,t])=>{
      const logMap=Object.fromEntries(logs.map(l=>[l.date,l]));
      setDays(last7.map(date=>({key:date,label:DAY_SHORT[new Date(date+"T12:00:00").getDay()],...(logMap[date]||{})})));
      setTxs(t||[]); setLoading(false);
    });
  },[]);

  if (loading) return <SkPage/>;

  const withMood  = days.filter(d=>d.mood);
  const avgMood   = withMood.length?(withMood.reduce((s,d)=>s+d.mood,0)/withMood.length).toFixed(1):"—";
  const avgSteps  = (()=>{const a=days.map(d=>Number(d.steps)).filter(Boolean);return a.length?Math.round(a.reduce((s,v)=>s+v,0)/a.length):"—";})();
  const avgKcal   = (()=>{const a=days.map(d=>Number(d.kcal)).filter(Boolean);return a.length?Math.round(a.reduce((s,v)=>s+v,0)/a.length):"—";})();
  const totalStudy= days.reduce((s,d)=>s+(Number(d.study_minutes)||0),0);
  const weekExp   = txs.filter(t=>t.type==="expense").reduce((s,t)=>s+t.amount,0);
  const weekInc   = txs.filter(t=>t.type==="income").reduce((s,t)=>s+t.amount,0);
  const goodDays  = days.filter(d=>d.day_result==="yes").length;
  const badDays   = days.filter(d=>d.day_result==="no").length;
  const maxSteps  = Math.max(...days.map(d=>Number(d.steps)||0),8000);
  const maxKcal   = Math.max(...days.map(d=>Number(d.kcal)||0),2500);
  const maxStudy  = Math.max(...days.map(d=>Number(d.study_minutes)||0),60);

  return (
    <>
      <div style={{...S.statsGrid,marginTop:20}}>
        <StatCard icon="🙂" label="Ср. настроение" val={`${avgMood}/10`}         color="#e07a5f"/>
        <StatCard icon="👣" label="Ср. шаги"       val={fmt(avgSteps)}            color="#81b29a"/>
        <StatCard icon="🔥" label="Ср. калории"    val={`${fmt(avgKcal)} ккал`}   color="#e8c97a"/>
        <StatCard icon="📚" label="Учёба"          val={`${fmt(totalStudy)} мин`} color="#7b9ccc"/>
        <StatCard icon="💰" label="Доходы"         val={`${fmt(weekInc)} ₽`}      color="#81b29a"/>
        <StatCard icon="💸" label="Расходы"        val={`${fmt(weekExp)} ₽`}      color="#e07a5f"/>
      </div>

      {(goodDays>0||badDays>0)&&(
        <div style={{marginTop:10,padding:"10px 14px",background:"#1a1917",border:"1px solid #2a2825",borderRadius:10,fontSize:13,color:"#888"}}>
          Хороших дней: <span style={{color:"#81b29a"}}>{goodDays}</span> · Плохих: <span style={{color:"#e07a5f"}}>{badDays}</span>
        </div>
      )}

      <Sec title="Настроение">  <BarChart days={days} field="mood"          max={10}       color="#e07a5f"/></Sec>
      <Sec title="Калории">     <BarChart days={days} field="kcal"          max={maxKcal}  color="#e8c97a"/></Sec>
      <Sec title="Шаги">        <BarChart days={days} field="steps"         max={maxSteps} color="#81b29a"/></Sec>
      <Sec title="Учёба (мин)"> <BarChart days={days} field="study_minutes" max={maxStudy} color="#7b9ccc"/></Sec>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// МЕСЯЦ
// ─────────────────────────────────────────────────────────────────────────────
function MonthTab({monthK}) {
  const [logs,   setLogs]   = useState([]);
  const [txs,    setTxs]    = useState([]);
  const [loading,setLoading]= useState(true);

  const [yr,mo] = monthK.split("-").map(Number);
  const daysInMonth = new Date(yr,mo,0).getDate();
  const allDays = Array.from({length:daysInMonth},(_,i)=>`${yr}-${String(mo).padStart(2,"0")}-${String(i+1).padStart(2,"0")}`);

  useEffect(()=>{
    setLoading(true);
    Promise.all([
      api.getRange("daily_logs",`${monthK}-01`,`${monthK}-${String(daysInMonth).padStart(2,"0")}`),
      api.getRange("transactions",`${monthK}-01`,`${monthK}-${String(daysInMonth).padStart(2,"0")}`),
    ]).then(([l,t])=>{ setLogs(l||[]); setTxs(t||[]); setLoading(false); });
  },[monthK]);

  if (loading) return <SkPage/>;

  const logMap    = Object.fromEntries(logs.map(l=>[l.date,l]));
  const totalExp  = txs.filter(t=>t.type==="expense").reduce((s,t)=>s+t.amount,0);
  const totalInc  = txs.filter(t=>t.type==="income").reduce((s,t)=>s+t.amount,0);
  const totalStudy= logs.reduce((s,l)=>s+(Number(l.study_minutes)||0),0);
  const totalSteps= logs.reduce((s,l)=>s+(Number(l.steps)||0),0);
  const avgMood   = (()=>{const a=logs.map(l=>l.mood).filter(Boolean);return a.length?(a.reduce((s,v)=>s+v,0)/a.length).toFixed(1):"—";})();
  const avgKcal   = (()=>{const a=logs.map(l=>Number(l.kcal)).filter(Boolean);return a.length?Math.round(a.reduce((s,v)=>s+v,0)/a.length):"—";})();
  const goodDays  = logs.filter(l=>l.day_result==="yes").length;
  const badDays   = logs.filter(l=>l.day_result==="no").length;
  const catMap    = {};
  txs.filter(t=>t.type==="expense").forEach(t=>{catMap[t.category]=(catMap[t.category]||0)+t.amount;});

  return (
    <>
      <div style={{marginTop:20,marginBottom:12,fontSize:18,color:"#f0ece4"}}>{MONTH_NAMES[mo-1]} {yr}</div>
      <div style={S.statsGrid}>
        <StatCard icon="💰" label="Доходы"         val={`${fmt(totalInc)} ₽`}    color="#81b29a"/>
        <StatCard icon="💸" label="Расходы"        val={`${fmt(totalExp)} ₽`}    color="#e07a5f"/>
        <StatCard icon="🏦" label="Результат"      val={`${totalInc-totalExp>=0?"+":""}${fmt(totalInc-totalExp)} ₽`} color={totalInc-totalExp>=0?"#81b29a":"#e07a5f"}/>
        <StatCard icon="🙂" label="Ср. настроение" val={`${avgMood}/10`}          color="#e07a5f"/>
        <StatCard icon="📚" label="Учёба"          val={`${fmt(Math.round(totalStudy/60))} ч`} color="#7b9ccc"/>
        <StatCard icon="👣" label="Шагов всего"    val={fmt(totalSteps)}           color="#81b29a"/>
        <StatCard icon="🔥" label="Ср. калории"    val={`${fmt(avgKcal)} ккал`}   color="#e8c97a"/>
        <StatCard icon="✓"  label="Хороших дней"  val={`${goodDays}/${goodDays+badDays}`} color="#81b29a"/>
      </div>

      {Object.keys(catMap).length>0&&(
        <Sec title="Расходы по категориям">
          {Object.entries(catMap).sort((a,b)=>b[1]-a[1]).map(([cat,amt])=>(
            <div key={cat} style={{marginBottom:10}}>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:4}}>
                <span style={{color:"#f0ece4"}}>{cat}</span>
                <span style={{color:"#e07a5f"}}>{fmt(amt)} ₽ <span style={{color:"#555",fontSize:11}}>({Math.round(amt/totalExp*100)}%)</span></span>
              </div>
              <div style={S.progressBg}><div style={{...S.progressFill,width:`${Math.min(100,amt/totalExp*100)}%`,background:"#e07a5f"}}/></div>
            </div>
          ))}
        </Sec>
      )}

      <Sec title="Календарь настроения">
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:3}}>
          {["Пн","Вт","Ср","Чт","Пт","Сб","Вс"].map(d=>(
            <div key={d} style={{fontSize:9,color:"#555",textAlign:"center",paddingBottom:4}}>{d}</div>
          ))}
          {Array.from({length:(new Date(yr,mo-1,1).getDay()+6)%7},(_,i)=><div key={"e"+i}/>)}
          {allDays.map(k=>{
            const l=logMap[k]; const mood=l?.mood; const d=Number(k.slice(8));
            const isToday=k===todayISO();
            return(
              <div key={k} title={l?.note||""} style={{aspectRatio:"1",borderRadius:5,
                background:mood?`hsl(${20+mood*8},${40+mood*4}%,${22+mood*3}%)`:"#1a1917",
                border:isToday?"1px solid #e07a5f":"1px solid #2a2825",
                display:"flex",alignItems:"center",justifyContent:"center",
                fontSize:9,color:mood?"#f0ece4":"#333"}}>
                {d}
              </div>
            );
          })}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:4,marginTop:8}}>
          <span style={{fontSize:10,color:"#555"}}>1</span>
          {[1,3,5,7,10].map(n=>(
            <div key={n} style={{width:14,height:14,borderRadius:3,background:`hsl(${20+n*8},${40+n*4}%,${22+n*3}%)`}}/>
          ))}
          <span style={{fontSize:10,color:"#555"}}>10</span>
        </div>
      </Sec>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ФИНАНСЫ
// ─────────────────────────────────────────────────────────────────────────────
function FinanceTab({settings, saveSettings}) {
  const [txs,          setTxs]         = useState([]);
  const [payments,     setPayments]    = useState([]);
  const [loading,      setLoading]     = useState(true);
  const [form,         setForm]        = useState({type:"expense",amount:"",cat:EXPENSE_CATS[0],note:""});
  const [editBalance,  setEditBalance] = useState(false);
  const [editIncome,   setEditIncome]  = useState(false);
  const [editSavings,  setEditSavings] = useState(false);
  const [showAddPay,   setShowAddPay]  = useState(false);
  const [tempBalance,  setTempBalance] = useState("");
  const [tempSavings,  setTempSavings] = useState("");
  const [newPay, setNewPay] = useState({name:"",amount:"",type:"monthly",interval_days:"",next_date:""});
  const date = todayISO();

  useEffect(()=>{
    const from = new Date(); from.setDate(from.getDate()-30);
    Promise.all([
      api.getRange("transactions", from.toISOString().slice(0,10), date),
      api.getMany("recurring_payments", {is_active: true}, "next_date.asc"),
    ]).then(([t, p]) => {
      setTxs(t||[]);
      setPayments(p||[]);
      setLoading(false);
    });
  },[]);

  // ── Считаем все платежи до следующего дохода ──────────────────────────────
  function getPaymentsUntilIncome() {
    const nextDate = settings.next_income_date;
    if (!nextDate) return [];
    const endDate = new Date(nextDate);
    const today   = new Date(date);
    const result  = [];

    payments.forEach(p => {
      if (!p.is_active) return;
      let cur = new Date(p.next_date);

      if (p.type === "once") {
        if (cur >= today && cur <= endDate) result.push({...p, date: p.next_date});
        return;
      }

      // Повторяющиеся — собираем все вхождения до даты дохода
      let intervalDays = 0;
      if      (p.type === "daily")   intervalDays = 1;
      else if (p.type === "weekly")  intervalDays = 7;
      else if (p.type === "monthly") {
        // Для monthly считаем по месяцам
        while (cur <= endDate) {
          if (cur >= today) result.push({...p, date: cur.toISOString().slice(0,10)});
          cur = new Date(cur);
          cur.setMonth(cur.getMonth()+1);
        }
        return;
      }
      else if (p.type === "custom")  intervalDays = p.interval_days || 1;

      while (cur <= endDate) {
        if (cur >= today) result.push({...p, date: cur.toISOString().slice(0,10)});
        cur = new Date(cur.getTime() + intervalDays * 86400000);
      }
    });

    return result.sort((a,b) => new Date(a.date) - new Date(b.date));
  }

  const upcomingPayments = getPaymentsUntilIncome();
  const totalUpcoming    = upcomingPayments.reduce((s,p) => s+p.amount, 0);

  // Платежи в ближайшие 3 дня
  const soonDate = new Date(); soonDate.setDate(soonDate.getDate()+3);
  const soonPayments = payments.filter(p => {
    const d = new Date(p.next_date);
    return d >= new Date(date) && d <= soonDate;
  });

  const balance     = settings.balance||0;
  const savingsGoal = settings.savings_goal||0;
  // Рабочий баланс — вычитаем накопления И предстоящие платежи
  const workBalance = balance - savingsGoal - totalUpcoming;

  const todayTxs      = txs.filter(t=>t.date===date);
  const todayExpenses = todayTxs.filter(t=>t.type==="expense"&&!t.skip_daily_limit).reduce((s,t)=>s+t.amount,0);
  const todayIncomes  = todayTxs.filter(t=>t.type==="income").reduce((s,t)=>s+t.amount,0);
  const balanceStartOfDay     = balance + todayExpenses - todayIncomes;
  const workBalanceStartOfDay = balanceStartOfDay - savingsGoal - totalUpcoming;

  const now7  = new Date(); now7.setDate(now7.getDate()-7);
  const now30 = new Date(); now30.setDate(now30.getDate()-30);
  const exp7  = txs.filter(t=>t.type==="expense"&&new Date(t.date)>=now7).reduce((s,t)=>s+t.amount,0);
  const exp30 = txs.filter(t=>t.type==="expense"&&new Date(t.date)>=now30).reduce((s,t)=>s+t.amount,0);
  const avgDay7  = exp7/7;
  const avgDay30 = exp30/30;

  const nextDate   = settings.next_income_date;
  const nextAmount = settings.next_income_amount||0;
  const daysToNext = daysUntil(nextDate);

  function canFallback() { return avgDay7>0 ? Math.floor(workBalance/30) : null; }
  const dailyLimit = daysToNext>0
    ? Math.floor(workBalanceStartOfDay/daysToNext)
    : canFallback();
  const todayLeft    = dailyLimit !== null ? dailyLimit - todayExpenses : null;
  const todayOverrun = todayLeft !== null && todayLeft < 0;

  const days7  = avgDay7>0  ? Math.floor(workBalance/avgDay7)  : null;
  const days30 = avgDay30>0 ? Math.floor(workBalance/avgDay30) : null;
  const willRunOut = daysToNext && avgDay7>0 && workBalance/avgDay7 < daysToNext;

  const monthStart = monthISO()+"-01";
  const catMap = {};
  txs.filter(t=>t.type==="expense"&&t.date>=monthStart).forEach(t=>{catMap[t.category]=(catMap[t.category]||0)+t.amount;});
  const monthExp = Object.values(catMap).reduce((s,v)=>s+v,0);

  // ── Добавить транзакцию ───────────────────────────────────────────────────
  async function addTx() {
    if (!form.amount||isNaN(Number(form.amount))) return;
    const amount = Number(form.amount);
    const t = await api.insert("transactions",{date,type:form.type,amount,category:form.cat,note:form.note},"transactions");
    if (t) {
      setTxs(prev=>[...prev,t]);
      const existing = await api.get("settings",{user_id:_userId});
      const newBalance = (settings.balance||0)+(form.type==="income"?amount:-amount);
      if (existing) await api.update("settings",existing.id,{balance:newBalance},"settings");
      else await api.upsert("settings",{user_id:_userId,balance:newBalance},"settings");
      saveSettings({balance:newBalance});
    }
    setForm(f=>({...f,amount:"",note:""}));
  }

  async function removeTx(id,type,amount) {
    await api.delete("transactions",id,"transactions");
    setTxs(prev=>prev.filter(t=>t.id!==id));
    const existing = await api.get("settings",{user_id:_userId});
    const newBalance = (settings.balance||0)+(type==="income"?-amount:amount);
    if (existing) await api.update("settings",existing.id,{balance:newBalance},"settings");
    else await api.upsert("settings",{user_id:_userId,balance:newBalance},"settings");
    saveSettings({balance:newBalance});
  }

  async function handleSaveBalance(val) {
    const newBalance = Number(val);
    const existing = await api.get("settings",{user_id:_userId});
    if (existing) await api.update("settings",existing.id,{balance:newBalance},"settings");
    else await api.upsert("settings",{user_id:_userId,balance:newBalance},"settings");
    saveSettings({balance:newBalance});
    setEditBalance(false);
  }

  async function handleSaveSavingsGoal(val) {
    const newGoal = Number(val);
    const existing = await api.get("settings",{user_id:_userId});
    if (existing) await api.update("settings",existing.id,{savings_goal:newGoal},"settings");
    else await api.upsert("settings",{user_id:_userId,savings_goal:newGoal},"settings");
    saveSettings({savings_goal:newGoal});
    setEditSavings(false);
  }

  // ── Регулярные платежи ────────────────────────────────────────────────────
  async function addPayment() {
    if (!newPay.name||!newPay.amount||!newPay.next_date) return;
    const p = await api.insert("recurring_payments", {
      name: newPay.name,
      amount: Number(newPay.amount),
      type: newPay.type,
      interval_days: newPay.type==="custom" ? Number(newPay.interval_days) : null,
      next_date: newPay.next_date,
      is_active: true,
    }, "recurring_payments");
    if (p) setPayments(prev=>[...prev,p]);
    setNewPay({name:"",amount:"",type:"monthly",interval_days:"",next_date:""});
    setShowAddPay(false);
  }

  async function deletePayment(id) {
    await api.delete("recurring_payments",id,"recurring_payments");
    setPayments(prev=>prev.filter(p=>p.id!==id));
  }

  async function markPaid(p) {
  // Создаём транзакцию расхода
  const t = await api.insert("transactions", {
    date,
    type: "expense",
    amount: p.amount,
    category: "💸 Другое",
    note: p.name,
    skip_daily_limit: true,
  }, "transactions");
  if (t) setTxs(prev=>[...prev,t]);

  // Обновляем баланс
  const existing = await api.get("settings", {user_id: _userId});
  const newBalance = (settings.balance||0) - p.amount;
  if (existing) await api.update("settings", existing.id, {balance: newBalance}, "settings");
  else await api.upsert("settings", {user_id: _userId, balance: newBalance}, "settings");
  saveSettings({balance: newBalance});

  // Сдвигаем дату следующего платежа
  let nextD = new Date(p.next_date);
  if      (p.type === "once")    { await api.update("recurring_payments", p.id, {is_active: false}, "recurring_payments"); setPayments(prev=>prev.filter(x=>x.id!==p.id)); return; }
  else if (p.type === "daily")   nextD.setDate(nextD.getDate()+1);
  else if (p.type === "weekly")  nextD.setDate(nextD.getDate()+7);
  else if (p.type === "monthly") nextD.setMonth(nextD.getMonth()+1);
  else if (p.type === "custom")  nextD.setDate(nextD.getDate()+(p.interval_days||1));

  const newNextDate = nextD.toISOString().slice(0,10);
  await api.update("recurring_payments", p.id, {next_date: newNextDate}, "recurring_payments");
  setPayments(prev=>prev.map(x=>x.id===p.id?{...x,next_date:newNextDate}:x));
}

  const PAY_TYPES = [
    {id:"once",    label:"Разово"},
    {id:"monthly", label:"Каждый месяц"},
    {id:"weekly",  label:"Каждую неделю"},
    {id:"daily",   label:"Каждый день"},
    {id:"custom",  label:"Каждые N дней"},
  ];

  if (loading) return <SkPage/>;

  return (
    <>
      {/* ── ПРЕДУПРЕЖДЕНИЯ О ПЛАТЕЖАХ ── */}
      {soonPayments.length>0&&(
        <div style={{marginTop:20,padding:"12px 14px",background:"#e8c97a15",border:"1px solid #e8c97a44",borderRadius:10}}>
          <div style={{fontSize:11,letterSpacing:2,color:"#e8c97a",textTransform:"uppercase",marginBottom:8}}>
            ⚠ Ближайшие платежи
          </div>
          {soonPayments.map(p=>{
            const isToday = p.next_date === date;
            return(
             <div key={p.id} style={{display:"flex",alignItems:"center",gap:8,fontSize:13,marginBottom:6}}>
                <div style={{flex:1}}>
                 <span style={{color:"#f0ece4"}}>{p.name}</span>
                 <span style={{color:"#e07a5f",marginLeft:8}}>−{fmt(p.amount)} ₽</span>
                 <span style={{color:"#555",marginLeft:6}}>
                   {isToday?"сегодня":new Date(p.next_date+"T12:00:00").toLocaleDateString("ru-RU",{day:"numeric",month:"short"})}
                  </span>
                </div>
                {isToday&&(
                  <button onClick={()=>markPaid(p)}
                    style={{fontSize:11,padding:"3px 10px",borderRadius:6,border:"1px solid #81b29a",
                      background:"#81b29a18",color:"#81b29a",cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>
                    ✓ Оплачено
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── БАЛАНС ── */}
      <div style={{marginTop:soonPayments.length>0?10:20,background:"#1a1917",borderRadius:16,padding:"20px",border:"1px solid #2a2825"}}>
        <div style={{fontSize:11,letterSpacing:2,color:"#6b6760",textTransform:"uppercase",marginBottom:8}}>Текущий баланс</div>
        {editBalance ? (
          <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:8}}>
            <input type="number" autoFocus value={tempBalance}
              onChange={e=>setTempBalance(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&handleSaveBalance(tempBalance)}
              placeholder="0"
              style={{...S.bigInput,fontSize:28,color:"#f0ece4",flex:1,borderBottom:"1px solid #2a2825"}}/>
            <span style={{fontSize:16,color:"#6b6760"}}>₽</span>
            <button onClick={()=>handleSaveBalance(tempBalance)} style={S.saveBtn}>OK</button>
          </div>
        ) : (
          <div style={{display:"flex",alignItems:"flex-end",gap:8,marginBottom:8}}>
            <div style={{fontSize:32,color:balance>0?"#f0ece4":"#e07a5f"}}>{fmt(balance)}</div>
            <div style={{fontSize:18,color:"#6b6760",marginBottom:4}}>₽</div>
            <button onClick={()=>{setTempBalance(String(balance));setEditBalance(true);}}
              style={{fontSize:11,color:"#555",background:"none",border:"1px solid #2a2825",borderRadius:6,padding:"2px 8px",cursor:"pointer",fontFamily:"inherit",marginBottom:4}}>
              изменить
            </button>
          </div>
        )}
        {/* Разбивка баланса */}
        <div style={{display:"flex",flexDirection:"column",gap:4,fontSize:12,borderTop:"1px solid #2a2825",paddingTop:10}}>
          {savingsGoal>0&&(
            <div style={{display:"flex",justifyContent:"space-between"}}>
              <span style={{color:"#6b6760"}}>Накопления</span>
              <span style={{color:"#e8c97a"}}>−{fmt(savingsGoal)} ₽</span>
            </div>
          )}
          {totalUpcoming>0&&(
            <div style={{display:"flex",justifyContent:"space-between"}}>
              <span style={{color:"#6b6760"}}>Платежи до дохода ({upcomingPayments.length} шт)</span>
              <span style={{color:"#e07a5f"}}>−{fmt(totalUpcoming)} ₽</span>
            </div>
          )}
          <div style={{display:"flex",justifyContent:"space-between",marginTop:4,paddingTop:4,borderTop:"1px solid #2a2825"}}>
            <span style={{color:"#888"}}>Доступно</span>
            <span style={{color:workBalance>0?"#f0ece4":"#e07a5f",fontSize:14}}>{fmt(workBalance)} ₽</span>
          </div>
        </div>
        <div style={{display:"flex",gap:16,marginTop:10,fontSize:12,color:"#6b6760"}}>
          <span>Ср/день (7д): <span style={{color:"#f0ece4"}}>{fmt(avgDay7,0)} ₽</span></span>
          <span>Ср/день (30д): <span style={{color:"#f0ece4"}}>{fmt(avgDay30,0)} ₽</span></span>
        </div>
      </div>

      {/* ── БАЛАНС НА ДЕНЬ ── */}
      {dailyLimit!==null&&(
        <div style={{marginTop:10,background:"#1a1917",borderRadius:14,padding:"16px",
          border:`1px solid ${todayOverrun?"#e07a5f44":"#2a2825"}`}}>
          <div style={{fontSize:11,letterSpacing:2,color:"#6b6760",textTransform:"uppercase",marginBottom:10}}>
            Баланс на сегодня
          </div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",marginBottom:12}}>
            <div>
              <div style={{fontSize:11,color:"#6b6760",marginBottom:4}}>Лимит</div>
              <div style={{fontSize:22,color:"#e8c97a"}}>{fmt(dailyLimit)} ₽</div>
            </div>
            <div style={{textAlign:"center"}}>
              <div style={{fontSize:11,color:"#6b6760",marginBottom:4}}>Потрачено</div>
              <div style={{fontSize:22,color:"#e07a5f"}}>{fmt(todayExpenses)} ₽</div>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:11,color:"#6b6760",marginBottom:4}}>{todayOverrun?"Перерасход":"Осталось"}</div>
              <div style={{fontSize:22,color:todayOverrun?"#e07a5f":"#81b29a"}}>
                {fmt(Math.abs(todayLeft))} ₽
              </div>
            </div>
          </div>
          <div style={{height:8,background:"#0f0e0d",borderRadius:4,overflow:"hidden"}}>
            <div style={{height:"100%",borderRadius:4,transition:"width 0.4s",
              width:`${Math.min(100,dailyLimit>0?todayExpenses/dailyLimit*100:0)}%`,
              background:todayOverrun?"#e07a5f":todayExpenses/dailyLimit>0.8?"#e8c97a":"#81b29a"}}/>
          </div>
          {todayOverrun&&(
            <div style={{marginTop:8,fontSize:12,color:"#e07a5f"}}>
              ⚠ Вышел за лимит на {fmt(-todayLeft)} ₽
            </div>
          )}
        </div>
      )}

      {/* ── ПРОГНОЗ ── */}
      {(days7!==null||days30!==null)&&(
        <div style={{marginTop:10,display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          {days7!==null&&(
            <div style={{background:"#1a1917",borderRadius:12,padding:"14px",border:"1px solid #2a2825",textAlign:"center"}}>
              <div style={{fontSize:11,color:"#6b6760",marginBottom:6}}>Хватит (7д темп)</div>
              <div style={{fontSize:22,color:days7<14?"#e07a5f":days7<30?"#e8c97a":"#81b29a"}}>{days7} дн</div>
            </div>
          )}
          {days30!==null&&(
            <div style={{background:"#1a1917",borderRadius:12,padding:"14px",border:"1px solid #2a2825",textAlign:"center"}}>
              <div style={{fontSize:11,color:"#6b6760",marginBottom:6}}>Хватит (30д темп)</div>
              <div style={{fontSize:22,color:days30<14?"#e07a5f":days30<30?"#e8c97a":"#81b29a"}}>{days30} дн</div>
            </div>
          )}
        </div>
      )}

      {/* ── СЛЕДУЮЩИЙ ДОХОД ── */}
      <Sec title="Следующий доход">
        <div style={{background:"#1a1917",borderRadius:14,padding:"16px",border:"1px solid #2a2825"}}>
          {editIncome ? (
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              <div style={{display:"flex",gap:8}}>
                <input type="date" defaultValue={nextDate||""}
                  onChange={e=>saveSettings({next_income_date:e.target.value})}
                  style={{...S.input,flex:1}}/>
                <input type="number" defaultValue={nextAmount||""}
                  onChange={e=>saveSettings({next_income_amount:Number(e.target.value)})}
                  placeholder="Сумма ₽" style={{...S.input,flex:1}}/>
              </div>
              <button onClick={()=>setEditIncome(false)} style={S.saveBtn}>Сохранить</button>
            </div>
          ) : (
            <div>
              {nextDate ? (
                <>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
                    <div>
                      <div style={{fontSize:11,color:"#6b6760",marginBottom:2}}>Дата</div>
                      <div style={{fontSize:15,color:"#f0ece4"}}>{new Date(nextDate+"T12:00:00").toLocaleDateString("ru-RU",{day:"numeric",month:"long"})}</div>
                    </div>
                    <div style={{textAlign:"right"}}>
                      <div style={{fontSize:11,color:"#6b6760",marginBottom:2}}>Сумма</div>
                      <div style={{fontSize:15,color:"#81b29a"}}>{fmt(nextAmount)} ₽</div>
                    </div>
                  </div>
                  {daysToNext!==null&&(
                    <div style={{display:"flex",gap:16,fontSize:13,flexWrap:"wrap"}}>
                      <span style={{color:"#6b6760"}}>До дохода: <span style={{color:daysToNext<=3?"#e07a5f":"#f0ece4"}}>{daysToNext} дн</span></span>
                      {dailyLimit&&<span style={{color:"#6b6760"}}>Лимит/день: <span style={{color:"#e8c97a"}}>{fmt(dailyLimit)} ₽</span></span>}
                      {totalUpcoming>0&&<span style={{color:"#6b6760"}}>Платежи: <span style={{color:"#e07a5f"}}>−{fmt(totalUpcoming)} ₽</span></span>}
                    </div>
                  )}
                </>
              ) : (
                <div style={{fontSize:13,color:"#555"}}>Не указано</div>
              )}
              <button onClick={()=>setEditIncome(true)}
                style={{marginTop:10,fontSize:11,color:"#555",background:"none",border:"1px solid #2a2825",borderRadius:6,padding:"3px 10px",cursor:"pointer",fontFamily:"inherit"}}>
                {nextDate?"изменить":"указать дату дохода"}
              </button>
            </div>
          )}
        </div>
        {willRunOut&&(
          <div style={{marginTop:10,padding:"12px 14px",background:"#e07a5f15",border:"1px solid #e07a5f44",borderRadius:10,fontSize:13,color:"#e07a5f"}}>
            ⚠ При текущем темпе деньги закончатся через {days7} дн — до дохода ещё {daysToNext} дн
          </div>
        )}
      </Sec>

      {/* ── РЕГУЛЯРНЫЕ ПЛАТЕЖИ ── */}
      <Sec title="Регулярные платежи">
        {payments.length>0&&(
          <div style={{marginBottom:12}}>
            {payments.map(p=>{
              const soon = new Date(p.next_date) <= soonDate;
              return(
                <div key={p.id} style={{display:"flex",alignItems:"center",gap:8,padding:"10px 12px",
                  background:"#1a1917",borderRadius:8,marginBottom:6,
                  border:`1px solid ${soon?"#e8c97a33":"#2a2825"}`}}>
                  <div style={{flex:1}}>
                    <div style={{fontSize:13,color:"#f0ece4"}}>{p.name}</div>
                    <div style={{fontSize:11,color:"#555",marginTop:2}}>
                      {PAY_TYPES.find(t=>t.id===p.type)?.label}
                      {p.type==="custom"&&` (каждые ${p.interval_days} дн)`}
                      {" · "}
                      {new Date(p.next_date+"T12:00:00").toLocaleDateString("ru-RU",{day:"numeric",month:"short"})}
                    </div>
                  </div>
                  <div style={{fontSize:14,color:"#e07a5f",marginRight:4}}>−{fmt(p.amount)} ₽</div>
                  <button onClick={()=>deletePayment(p.id)} style={S.clearBtn}>✕</button>
                </div>
              );
            })}
          </div>
        )}

        {showAddPay ? (
          <div style={{background:"#1a1917",borderRadius:12,padding:"16px",border:"1px solid #2a2825"}}>
            <div style={{display:"flex",gap:8,marginBottom:10}}>
              <input value={newPay.name} onChange={e=>setNewPay(p=>({...p,name:e.target.value}))}
                placeholder="Название (Spotify, кредит...)" style={{...S.input,flex:2}}/>
              <input type="number" value={newPay.amount} onChange={e=>setNewPay(p=>({...p,amount:e.target.value}))}
                placeholder="Сумма ₽" style={{...S.input,flex:1}}/>
            </div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>
              {PAY_TYPES.map(t=>(
                <button key={t.id} onClick={()=>setNewPay(p=>({...p,type:t.id}))}
                  style={{...S.tag,...(newPay.type===t.id?{borderColor:"#7b9ccc",color:"#7b9ccc",background:"#7b9ccc18"}:{})}}>
                  {t.label}
                </button>
              ))}
            </div>
            {newPay.type==="custom"&&(
              <input type="number" value={newPay.interval_days}
                onChange={e=>setNewPay(p=>({...p,interval_days:e.target.value}))}
                placeholder="Каждые N дней" style={{...S.input,marginBottom:10}}/>
            )}
            <div style={{marginBottom:10}}>
              <div style={{fontSize:11,color:"#6b6760",marginBottom:6}}>Дата следующего платежа</div>
              <input type="date" value={newPay.next_date}
                onChange={e=>setNewPay(p=>({...p,next_date:e.target.value}))}
                style={S.input}/>
            </div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={addPayment} style={S.saveBtn}>+ Добавить</button>
              <button onClick={()=>setShowAddPay(false)}
                style={{...S.saveBtn,borderColor:"#555",color:"#555",background:"transparent"}}>
                Отмена
              </button>
            </div>
          </div>
        ) : (
          <button onClick={()=>setShowAddPay(true)}
            style={{...S.saveBtn,width:"100%",textAlign:"center"}}>
            + Добавить платёж
          </button>
        )}
      </Sec>

      {/* ── ЦЕЛЬ НАКОПЛЕНИЯ ── */}
      <Sec title="Цель накопления">
        <div style={{background:"#1a1917",borderRadius:14,padding:"16px",border:"1px solid #2a2825"}}>
          <div style={{fontSize:12,color:"#6b6760",marginBottom:10,lineHeight:1.5}}>
            Эта сумма откладывается и не учитывается в лимитах расходов
          </div>
          {editSavings ? (
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              <input type="number" autoFocus value={tempSavings}
                onChange={e=>setTempSavings(e.target.value)}
                onKeyDown={e=>e.key==="Enter"&&handleSaveSavingsGoal(tempSavings)}
                placeholder="0" style={{...S.input,flex:1}}/>
              <span style={{fontSize:14,color:"#6b6760"}}>₽</span>
              <button onClick={()=>handleSaveSavingsGoal(tempSavings)} style={S.saveBtn}>OK</button>
            </div>
          ) : (
            <div style={{display:"flex",alignItems:"center",gap:12}}>
              <div style={{fontSize:22,color:"#e8c97a"}}>{fmt(savingsGoal)} ₽</div>
              <button onClick={()=>{setTempSavings(String(savingsGoal));setEditSavings(true);}}
                style={{fontSize:11,color:"#555",background:"none",border:"1px solid #2a2825",borderRadius:6,padding:"2px 8px",cursor:"pointer",fontFamily:"inherit"}}>
                {savingsGoal>0?"изменить":"указать цель"}
              </button>
            </div>
          )}
          {savingsGoal>0&&balance>0&&(
            <div style={{marginTop:10,fontSize:12,color:"#6b6760"}}>
              {Math.round(savingsGoal/balance*100)}% от баланса отложено
            </div>
          )}
        </div>
      </Sec>

      {/* ── ДОБАВИТЬ ОПЕРАЦИЮ ── */}
      <Sec title="Добавить операцию">
        <div style={{display:"flex",gap:8,marginBottom:10}}>
          {["expense","income"].map(t=>(
            <button key={t} onClick={()=>setForm(f=>({...f,type:t,cat:t==="expense"?EXPENSE_CATS[0]:INCOME_CATS[0]}))}
              style={{...S.tag,...(form.type===t?{borderColor:t==="expense"?"#e07a5f":"#81b29a",color:t==="expense"?"#e07a5f":"#81b29a",background:t==="expense"?"#e07a5f18":"#81b29a18"}:{})}}>
              {t==="expense"?"💸 Расход":"💰 Доход"}
            </button>
          ))}
        </div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>
          {(form.type==="expense"?EXPENSE_CATS:INCOME_CATS).map(c=>(
            <button key={c} onClick={()=>setForm(f=>({...f,cat:c}))}
              style={{...S.tag,...(form.cat===c?{borderColor:"#7b9ccc",color:"#7b9ccc",background:"#7b9ccc18"}:{})}}>
              {c}
            </button>
          ))}
        </div>
        <div style={{display:"flex",gap:8,marginBottom:10}}>
          <input type="number" value={form.amount} onChange={e=>setForm(f=>({...f,amount:e.target.value}))}
            placeholder="Сумма ₽" style={{...S.input,flex:1}}/>
          <input value={form.note} onChange={e=>setForm(f=>({...f,note:e.target.value}))}
            placeholder="Заметка" style={{...S.input,flex:2}}/>
        </div>
        <button onClick={addTx} style={S.saveBtn}>+ Добавить</button>
      </Sec>

      {/* ── СЕГОДНЯ ── */}
      {todayTxs.length>0&&(
        <Sec title="Сегодня">
          {todayTxs.slice().reverse().map(tx=>(
            <div key={tx.id} style={S.txRow}>
              <div style={{flex:1}}>
                <div style={{fontSize:13,color:"#f0ece4"}}>{tx.category}{tx.note&&<span style={{color:"#555"}}> — {tx.note}</span>}</div>
              </div>
              <div style={{fontSize:15,color:tx.type==="expense"?"#e07a5f":"#81b29a",marginRight:8}}>
                {tx.type==="expense"?"-":"+"}{fmt(tx.amount)} ₽
              </div>
              <button onClick={()=>removeTx(tx.id,tx.type,tx.amount)} style={S.clearBtn}>✕</button>
            </div>
          ))}
        </Sec>
      )}

      {/* ── КАТЕГОРИИ ── */}
      {Object.keys(catMap).length>0&&(
        <Sec title="Расходы месяца по категориям">
          {Object.entries(catMap).sort((a,b)=>b[1]-a[1]).map(([cat,amt])=>(
            <div key={cat} style={{marginBottom:10}}>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:4}}>
                <span style={{color:"#f0ece4"}}>{cat}</span>
                <span style={{color:"#e07a5f"}}>{fmt(amt)} ₽ <span style={{color:"#555",fontSize:11}}>({Math.round(amt/monthExp*100)}%)</span></span>
              </div>
              <div style={S.progressBg}><div style={{...S.progressFill,width:`${Math.min(100,amt/monthExp*100)}%`,background:"#e07a5f"}}/></div>
            </div>
          ))}
        </Sec>
      )}

      {/* ── НАСТРОЙКИ ── */}
      <Sec title="Настройки">
        <div style={{background:"#1a1917",borderRadius:14,padding:"16px",border:"1px solid #2a2825",display:"flex",flexDirection:"column",gap:12}}>
          <div>
            <div style={{fontSize:11,color:"#6b6760",marginBottom:6}}>Дневная норма калорий</div>
            <input type="number" defaultValue={settings.kcal_goal||2500}
              onBlur={e=>saveSettings({kcal_goal:Number(e.target.value)})} style={S.input}/>
          </div>
          <div>
            <div style={{fontSize:11,color:"#6b6760",marginBottom:6}}>Направление обучения</div>
            <input defaultValue={settings.study_name||"SQL"}
              onBlur={e=>saveSettings({study_name:e.target.value})} style={S.input}/>
          </div>
        </div>
      </Sec>
    </>
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// КОМПОНЕНТЫ
// ─────────────────────────────────────────────────────────────────────────────
function Sec({title,children}) {
  return <div style={{marginTop:24}}><div style={S.secTitle}>{title}</div>{children}</div>;
}
function BarChart({days,field,max,color}) {
  return(
    <div style={{display:"flex",alignItems:"flex-end",gap:4,height:80}}>
      {days.map(d=>{
        const val=Number(d[field])||0;
        const pct=max>0?val/max:0;
        const isToday=d.key===todayISO();
        return(
          <div key={d.key} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
            {val>0&&<div style={{fontSize:9,color:"#888"}}>{val}</div>}
            <div style={{width:"100%",borderRadius:4,height:Math.max(val?4:2,pct*60),
              background:val?color+"cc":"#2a2825",transition:"height 0.3s",
              border:isToday?`1px solid ${color}`:"none"}}/>
            <div style={{fontSize:10,color:isToday?color:"#555"}}>{d.label}</div>
          </div>
        );
      })}
    </div>
  );
}
function StatCard({icon,label,val,color}) {
  return(
    <div style={{background:"#1a1917",border:`1px solid ${color}33`,borderRadius:12,padding:"14px 10px",textAlign:"center"}}>
      <div style={{fontSize:20,marginBottom:4}}>{icon}</div>
      <div style={{fontSize:15,color,marginBottom:2}}>{val}</div>
      <div style={{fontSize:11,color:"#6b6760"}}>{label}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// СТИЛИ
// ─────────────────────────────────────────────────────────────────────────────
const S = {
  root:       {minHeight:"100vh",background:"#0a0908",color:"#f0ece4",fontFamily:"Georgia,'Times New Roman',serif",paddingBottom:80},
  header:     {padding:"28px 20px 20px",borderBottom:"1px solid #1e1c1a",display:"flex",justifyContent:"space-between",alignItems:"flex-end"},
  dateSmall:  {fontSize:11,letterSpacing:3,color:"#6b6760",textTransform:"uppercase",marginBottom:6},
  h1:         {fontSize:24,fontWeight:"normal"},
  datePicker: {background:"#1a1917",border:"1px solid #2a2825",borderRadius:8,padding:"5px 8px",color:"#888",fontSize:12,fontFamily:"inherit",outline:"none"},
  tabs:       {display:"flex",borderBottom:"1px solid #1e1c1a",position:"sticky",top:0,background:"#0a0908",zIndex:10},
  tab:        {flex:1,padding:"12px 0",background:"none",border:"none",color:"#555",fontSize:13,cursor:"pointer",fontFamily:"inherit"},
  tabOn:      {color:"#f0ece4",borderBottom:"2px solid #e07a5f"},
  body:       {padding:"0 16px"},
  secTitle:   {fontSize:10,letterSpacing:3,color:"#6b6760",textTransform:"uppercase",marginBottom:12},
  statsGrid:  {display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:8},
  metricCard: {background:"#1a1917",border:"1px solid #2a2825",borderRadius:12,padding:"14px"},
  bigInput:   {background:"transparent",border:"none",outline:"none",fontSize:24,fontFamily:"inherit",color:"#f0ece4"},
  tag:        {padding:"5px 10px",borderRadius:8,border:"1px solid #2a2825",background:"transparent",color:"#555",fontSize:12,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"},
  hourRow:    {display:"flex",alignItems:"center",gap:10,padding:"8px 10px",borderRadius:6,cursor:"pointer",borderLeft:"3px solid",transition:"background 0.15s"},
  editPanel:  {background:"#1a1917",border:"1px solid #2a2825",borderRadius:10,padding:"12px",margin:"4px 0 6px"},
  clearBtn:   {background:"none",border:"none",color:"#444",cursor:"pointer",fontSize:13,padding:"2px 6px"},
  input:      {width:"100%",background:"#1a1917",border:"1px solid #2a2825",borderRadius:8,padding:"10px 12px",color:"#f0ece4",fontSize:14,fontFamily:"inherit",outline:"none",boxSizing:"border-box"},
  saveBtn:    {padding:"9px 18px",borderRadius:8,border:"1px solid #81b29a",background:"#81b29a18",color:"#81b29a",fontSize:13,cursor:"pointer",fontFamily:"inherit"},
  ta:         {width:"100%",background:"#1a1917",border:"1px solid #2a2825",borderRadius:8,padding:"10px 12px",color:"#f0ece4",fontSize:13,fontFamily:"inherit",resize:"none",outline:"none",boxSizing:"border-box",lineHeight:1.6},
  progressBg: {height:6,background:"#0f0e0d",borderRadius:3,overflow:"hidden"},
  progressFill:{height:"100%",borderRadius:3,transition:"width 0.4s"},
  txRow:      {display:"flex",alignItems:"center",gap:8,padding:"10px 12px",background:"#1a1917",borderRadius:8,marginBottom:6,border:"1px solid #2a2825"},
  resultBtn:  {flex:1,padding:"12px",borderRadius:10,border:"1px solid",fontSize:15,cursor:"pointer",fontFamily:"inherit",transition:"all 0.15s"},
  authInput:  {width:"100%",background:"#1a1917",border:"1px solid #2a2825",borderRadius:10,padding:"14px 16px",color:"#f0ece4",fontSize:15,fontFamily:"Georgia,serif",outline:"none",boxSizing:"border-box"},
  authBtn:    {width:"100%",padding:"14px",borderRadius:10,border:"none",background:"#e07a5f",color:"#0a0908",fontSize:15,cursor:"pointer",fontFamily:"Georgia,serif",fontWeight:"normal"},
  authError:  {padding:"10px 14px",background:"#e07a5f15",border:"1px solid #e07a5f44",borderRadius:8,fontSize:13,color:"#e07a5f",marginBottom:12},
  authSuccess:{padding:"10px 14px",background:"#81b29a15",border:"1px solid #81b29a44",borderRadius:8,fontSize:13,color:"#81b29a",marginBottom:12},
};