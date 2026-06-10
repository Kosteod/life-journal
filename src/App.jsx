import { useState, useEffect, useRef } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// КОНФИГУРАЦИЯ — замени если переедешь на другой проект
// ─────────────────────────────────────────────────────────────────────────────
const SUPABASE_URL = "https://hfnjanaljjxohdkvwyoo.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhmbmphbmFsamp4b2hka3Z3eW9vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwMDIxODQsImV4cCI6MjA5NjU3ODE4NH0.36RQExXDeRQBsHoQphttKiVNC9nte6lLIPs0aRyALJw";

// ─────────────────────────────────────────────────────────────────────────────
// ГЛОБАЛЬНЫЙ КЭШ — повторные запросы возвращаются мгновенно из памяти
// ─────────────────────────────────────────────────────────────────────────────
const _cache = new Map();
const TTL = 60_000;
const cGet = (k) => { const e = _cache.get(k); if (!e) return null; if (Date.now()-e.ts>TTL){_cache.delete(k);return null;} return e.d; };
const cSet = (k,d) => _cache.set(k,{d,ts:Date.now()});
const cDel = (prefix) => { for(const k of _cache.keys()) if(k.includes(prefix)) _cache.delete(k); };

// ─────────────────────────────────────────────────────────────────────────────
// SUPABASE API
// ─────────────────────────────────────────────────────────────────────────────
const H = {
  "Content-Type":"application/json",
  "apikey":SUPABASE_KEY,
  "Authorization":`Bearer ${SUPABASE_KEY}`,
  "Prefer":"return=representation",
};

async function cfetch(url) {
  const hit = cGet(url);
  if (hit !== null) return hit;
  const r = await fetch(url, {headers:H});
  const d = await r.json();
  const result = Array.isArray(d) ? d : [];
  cSet(url, result);
  return result;
}

const db = {
  async get(table, match) {
    const p = Object.entries(match).map(([k,v])=>`${k}=eq.${v}`).join("&");
    const data = await cfetch(`${SUPABASE_URL}/rest/v1/${table}?${p}`);
    return data[0]||null;
  },
  async getMany(table, match={}, order="") {
    let url = `${SUPABASE_URL}/rest/v1/${table}`;
    const p = Object.entries(match).map(([k,v])=>`${k}=eq.${v}`);
    if(order) p.push(`order=${order}`);
    if(p.length) url+="?"+p.join("&");
    return await cfetch(url);
  },
  async getRange(table, dateFrom, dateTo) {
    const url = `${SUPABASE_URL}/rest/v1/${table}?date=gte.${dateFrom}&date=lte.${dateTo}&order=date.asc`;
    return await cfetch(url);
  },
  async upsert(table, data, invalidate) {
    if(invalidate) cDel(invalidate);
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`,{
      method:"POST",
      headers:{...H,"Prefer":"resolution=merge-duplicates,return=representation"},
      body:JSON.stringify(data),
    });
    const result = await r.json();
    return Array.isArray(result)?result[0]:result||null;
  },
  async update(table, id, data, invalidate) {
    if(invalidate) cDel(invalidate);
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`,{
      method:"PATCH", headers:H, body:JSON.stringify(data),
    });
    const result = await r.json();
    return Array.isArray(result)?result[0]:result||null;
  },
  async insert(table, data, invalidate) {
    if(invalidate) cDel(invalidate);
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`,{
      method:"POST", headers:H, body:JSON.stringify(data),
    });
    const result = await r.json();
    return Array.isArray(result)?result[0]:result||null;
  },
  async delete(table, id, invalidate) {
    if(invalidate) cDel(invalidate);
    await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`,{method:"DELETE",headers:H});
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// УТИЛИТЫ
// ─────────────────────────────────────────────────────────────────────────────
const todayKey  = () => new Date().toISOString().slice(0,10);
const monthKey  = () => { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; };
const fmt       = (n) => new Intl.NumberFormat("ru-RU").format(n||0);
const DAY_RU    = ["Вс","Пн","Вт","Ср","Чт","Пт","Сб"];
const MONTH_RU  = ["января","февраля","марта","апреля","мая","июня","июля","августа","сентября","октября","ноября","декабря"];
function getLast7() {
  return Array.from({length:7},(_,i)=>{const d=new Date();d.setDate(d.getDate()-(6-i));return d.toISOString().slice(0,10);});
}

// ─────────────────────────────────────────────────────────────────────────────
// КОНСТАНТЫ
// Чтобы добавить тип блока — добавь строку сюда
// Чтобы добавить категорию расходов — добавь строку в EXPENSE_CATS
// ─────────────────────────────────────────────────────────────────────────────
const BLOCK_COLORS = {
  "сон":"#3d405b","учёба":"#7b9ccc","спорт":"#e07a5f","еда":"#81b29a",
  "работа":"#c9a96e","отдых":"#6b6760","прогулка":"#81b29a","свободно":"#2a2825",
};
const BLOCK_TYPES = Object.keys(BLOCK_COLORS);
const HOURS = Array.from({length:18},(_,i)=>i+6);
const EXPENSE_CATS = ["🍔 Еда","🚇 Транспорт","☕ Кафе","🛒 Продукты","💊 Здоровье","📱 Подписки","👕 Одежда","🎮 Развлечения","📚 Учёба","💸 Другое"];
const INCOME_CATS  = ["💼 Подработка","🎁 Помощь","💰 Фриланс","📦 Продажа","💳 Другое"];
const TABS = [{id:"day",label:"День"},{id:"finance",label:"Финансы"},{id:"stats",label:"Статистика"},{id:"month",label:"Месяц"}];

// ─────────────────────────────────────────────────────────────────────────────
// SKELETON — красивая загрузка вместо "загружаю..."
// ─────────────────────────────────────────────────────────────────────────────
function Skeleton({w="100%",h=16,r=6,mb=8}) {
  return <div style={{width:w,height:h,borderRadius:r,marginBottom:mb,background:"linear-gradient(90deg,#1a1917 25%,#242220 50%,#1a1917 75%)",backgroundSize:"200% 100%",animation:"shimmer 1.4s infinite"}} />;
}
function SkeletonDay() {
  return (
    <div style={{paddingTop:20}}>
      <style>{`@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:24}}>
        {[1,2,3,4].map(i=><Skeleton key={i} h={80} r={12}/>)}
      </div>
      <Skeleton h={12} w="30%" mb={14}/>
      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:24}}>
        {[1,2,3,4,5,6,7,8,9,10].map(i=><Skeleton key={i} w={36} h={36} r={8} mb={0}/>)}
      </div>
      <Skeleton h={12} w="40%" mb={14}/>
      {Array.from({length:6},(_,i)=><Skeleton key={i} h={32} r={6}/>)}
    </div>
  );
}
function SkeletonFinance() {
  return (
    <div style={{paddingTop:20}}>
      <Skeleton h={12} w="30%" mb={14}/>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:24}}>
        <Skeleton h={80} r={12}/><Skeleton h={80} r={12}/>
      </div>
      <div style={{display:"flex",gap:8,marginBottom:20}}>
        <Skeleton h={60} r={12}/><Skeleton h={60} r={12}/><Skeleton h={60} r={12}/>
      </div>
      <Skeleton h={12} w="40%" mb={14}/>
      {[1,2,3].map(i=><Skeleton key={i} h={44} r={8}/>)}
    </div>
  );
}
function SkeletonStats() {
  return (
    <div style={{paddingTop:20}}>
      <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:10,marginBottom:24}}>
        {[1,2,3,4].map(i=><Skeleton key={i} h={90} r={12}/>)}
      </div>
      {[1,2,3,4].map(i=>(
        <div key={i} style={{marginBottom:24}}>
          <Skeleton h={12} w="35%" mb={14}/>
          <Skeleton h={80} r={8}/>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ГЛАВНЫЙ КОМПОНЕНТ
// ─────────────────────────────────────────────────────────────────────────────
export default function App() {
  const [tab,    setTab]   = useState("day");
  const [date,   setDate]  = useState(todayKey());
  const [online, setOnline]= useState(true);

  useEffect(()=>{
    fetch(`${SUPABASE_URL}/rest/v1/daily_logs?limit=1`,{headers:H})
      .then(()=>setOnline(true)).catch(()=>setOnline(false));
  },[]);

  const now = new Date();
  const dateLabel = `${DAY_RU[now.getDay()]}, ${now.getDate()} ${MONTH_RU[now.getMonth()]}`;

  return (
    <div style={S.root}>
      <style>{`@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}} * {box-sizing:border-box;}`}</style>
      <div style={S.header}>
        <div>
          <div style={S.dateSmall}>{dateLabel}</div>
          <div style={S.h1}>Дневник жизни</div>
        </div>
        <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:6}}>
          <div style={{...S.badge,borderColor:online?"#81b29a44":"#e07a5f44",color:online?"#81b29a":"#e07a5f"}}>
            {online?"● онлайн":"● офлайн"}
          </div>
          <input type="date" value={date} onChange={e=>setDate(e.target.value)} style={S.datePicker}/>
        </div>
      </div>
      <div style={S.tabs}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)}
            style={{...S.tab,...(tab===t.id?S.tabOn:{})}}>
            {t.label}
          </button>
        ))}
      </div>
      <div style={S.body}>
        {tab==="day"     && <DayTab     date={date}/>}
        {tab==="finance" && <FinanceTab date={date}/>}
        {tab==="stats"   && <StatsTab   last7={getLast7()}/>}
        {tab==="month"   && <MonthTab   monthK={monthKey()}/>}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ДЕНЬ
// ─────────────────────────────────────────────────────────────────────────────
function DayTab({date}) {
  const [log,      setLog]      = useState(null);
  const [schedule, setSchedule] = useState([]);
  const [tasks,    setTasks]    = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [editHour, setEditHour] = useState(null);
  const [blockType,setBlockType]= useState("учёба");
  const [blockNote,setBlockNote]= useState("");
  const [taskInput,setTaskInput]= useState("");
  const saveTimer = useRef({});

  useEffect(()=>{
    setLoading(true);
    Promise.all([
      db.get("daily_logs",{date}),
      db.getMany("schedule_blocks",{date},"hour.asc"),
      db.getMany("tasks",{date},"created_at.asc"),
    ]).then(([l,s,t])=>{
      setLog(l||{});
      setSchedule(s||[]);
      setTasks(t||[]);
      setLoading(false);
    });
  },[date]);

  // Debounced сохранение — не шлём запрос на каждый символ, ждём 600мс паузы
  function saveLog(field, value) {
    setLog(prev=>({...prev,[field]:value}));
    clearTimeout(saveTimer.current[field]);
    saveTimer.current[field] = setTimeout(()=>{
      db.upsert("daily_logs",{date,[field]:value},`daily_logs?date=eq.${date}`);
    },600);
  }

  async function saveBlock(hour) {
    const existing = schedule.find(b=>b.hour===hour);
    cDel("schedule_blocks");
    if(existing) {
      await db.update("schedule_blocks",existing.id,{block_type:blockType,note:blockNote});
      setSchedule(prev=>prev.map(b=>b.hour===hour?{...b,block_type:blockType,note:blockNote}:b));
    } else {
      const created = await db.insert("schedule_blocks",{date,hour,block_type:blockType,note:blockNote});
      if(created) setSchedule(prev=>[...prev,created].sort((a,b)=>a.hour-b.hour));
    }
    setEditHour(null); setBlockNote("");
  }
  async function clearBlock(hour) {
    const block = schedule.find(b=>b.hour===hour);
    if(block){ await db.delete("schedule_blocks",block.id,`schedule_blocks`); setSchedule(prev=>prev.filter(b=>b.hour!==hour)); }
  }
  async function addTask() {
    if(!taskInput.trim()) return;
    const t = await db.insert("tasks",{date,text:taskInput.trim(),done:false},`tasks?date=eq.${date}`);
    if(t) setTasks(prev=>[...prev,t]);
    setTaskInput("");
  }
  async function toggleTask(id,done) {
    await db.update("tasks",id,{done:!done},`tasks?date=eq.${date}`);
    setTasks(prev=>prev.map(t=>t.id===id?{...t,done:!done}:t));
  }
  async function deleteTask(id) {
    await db.delete("tasks",id,`tasks?date=eq.${date}`);
    setTasks(prev=>prev.filter(t=>t.id!==id));
  }

  const isToday = date===todayKey();
  const nowHour = new Date().getHours();
  const schedMap = Object.fromEntries(schedule.map(b=>[b.hour,b]));
  const blockCount = {};
  schedule.forEach(b=>{blockCount[b.block_type]=(blockCount[b.block_type]||0)+1;});

  if(loading) return <SkeletonDay/>;

  return (
    <>
      <div style={S.vitalsGrid}>
        <Vital icon="😴" label="Сон (ч)"   val={log?.sleep||""} color="#7b9ccc" onChange={v=>saveLog("sleep",v)}/>
        <Vital icon="👣" label="Шаги"      val={log?.steps||""} color="#81b29a" onChange={v=>saveLog("steps",v)}/>
        <Vital icon="🔥" label="Калории"   val={log?.kcal||""}  color="#e07a5f" onChange={v=>saveLog("kcal",v)}/>
        <Vital icon="💧" label="Вода (мл)" val={log?.water||""} color="#7bc4cc" onChange={v=>saveLog("water",v)}/>
      </div>

      <Sec title="Состояние">
        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>
          {[1,2,3,4,5,6,7,8,9,10].map(n=>(
            <button key={n} onClick={()=>saveLog("mood",n)}
              style={{...S.moodBtn,...(log?.mood===n?{borderColor:"#e07a5f",background:"#e07a5f18",color:"#e07a5f"}:{})}}>
              {n}
            </button>
          ))}
        </div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          {["😴 Устал","😤 Тревога","😐 Норм","🙂 Хорошо","🔥 В потоке"].map(e=>(
            <button key={e} onClick={()=>saveLog("energy",e)}
              style={{...S.tag,...(log?.energy===e?{borderColor:"#81b29a",color:"#81b29a",background:"#81b29a18"}:{})}}>
              {e}
            </button>
          ))}
        </div>
      </Sec>

      <Sec title="Почасовое расписание">
        {Object.keys(blockCount).length>0&&(
          <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12}}>
            {Object.entries(blockCount).map(([type,cnt])=>(
              <div key={type} style={{...S.tag,borderColor:BLOCK_COLORS[type]+"88",color:BLOCK_COLORS[type],background:BLOCK_COLORS[type]+"18"}}>
                {type} {cnt}ч
              </div>
            ))}
          </div>
        )}
        <div style={{display:"flex",flexDirection:"column",gap:2}}>
          {HOURS.map(h=>{
            const block=schedMap[h];
            const isCurrent=isToday&&nowHour===h;
            const isPast=isToday&&nowHour>h;
            return(
              <div key={h}>
                <div onClick={()=>{setEditHour(editHour===h?null:h);if(block){setBlockType(block.block_type);setBlockNote(block.note||"");}}}
                  style={{...S.hourRow,
                    borderLeft:`3px solid ${block?BLOCK_COLORS[block.block_type]||"#555":isCurrent?"#e07a5f":"#2a2825"}`,
                    background:block?BLOCK_COLORS[block.block_type]+"18":isCurrent?"#e07a5f08":"transparent",
                    opacity:isPast&&!block?0.35:1}}>
                  <div style={{...S.hourLabel,color:isCurrent?"#e07a5f":isPast?"#555":"#888"}}>
                    {String(h).padStart(2,"0")}:00{isCurrent&&<span style={{fontSize:8,color:"#e07a5f",marginLeft:4}}>●</span>}
                  </div>
                  <div style={{flex:1,fontSize:13,color:block?BLOCK_COLORS[block.block_type]:"#2a2825"}}>
                    {block&&<><span style={{textTransform:"capitalize"}}>{block.block_type}</span>{block.note&&<span style={{color:"#666",fontSize:12}}> — {block.note}</span>}</>}
                  </div>
                  {block&&<button onClick={e=>{e.stopPropagation();clearBlock(h);}} style={S.clearBtn}>✕</button>}
                </div>
                {editHour===h&&(
                  <div style={S.editPanel}>
                    <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>
                      {BLOCK_TYPES.map(bt=>(
                        <button key={bt} onClick={()=>setBlockType(bt)}
                          style={{...S.tag,borderColor:blockType===bt?BLOCK_COLORS[bt]:BLOCK_COLORS[bt]+"44",
                            color:BLOCK_COLORS[bt],background:blockType===bt?BLOCK_COLORS[bt]+"28":"transparent"}}>
                          {bt}
                        </button>
                      ))}
                    </div>
                    <input value={blockNote} onChange={e=>setBlockNote(e.target.value)}
                      placeholder="Заметка (необязательно)" style={{...S.input,marginBottom:8}}/>
                    <button onClick={()=>saveBlock(h)} style={S.saveBtn}>Сохранить</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Sec>

      <Sec title="Задачи дня">
        <div style={{display:"flex",gap:8,marginBottom:10}}>
          <input value={taskInput} onChange={e=>setTaskInput(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&addTask()}
            placeholder="Добавить задачу..." style={{...S.input,flex:1}}/>
          <button onClick={addTask} style={S.saveBtn}>+</button>
        </div>
        {tasks.map(t=>(
          <div key={t.id} style={{...S.taskRow,opacity:t.done?0.5:1}}>
            <button onClick={()=>toggleTask(t.id,t.done)}
              style={{...S.checkbox,background:t.done?"#81b29a":"transparent",borderColor:t.done?"#81b29a":"#444"}}>
              {t.done&&"✓"}
            </button>
            <span style={{flex:1,fontSize:14,color:"#f0ece4",textDecoration:t.done?"line-through":"none"}}>{t.text}</span>
            <button onClick={()=>deleteTask(t.id)} style={S.clearBtn}>✕</button>
          </div>
        ))}
      </Sec>

      <Sec title="Учёба (SQL / Python)">
        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>
          {["✅ Занимался час","📖 15–30 минут","🔁 Повторял","😴 День отдыха"].map(opt=>(
            <button key={opt} onClick={()=>saveLog("study",opt)}
              style={{...S.tag,...(log?.study===opt?{borderColor:"#e8c97a",color:"#e8c97a",background:"#e8c97a18"}:{})}}>
              {opt}
            </button>
          ))}
        </div>
        <input value={log?.study_note||""} onChange={e=>saveLog("study_note",e.target.value)}
          placeholder="Что прошёл сегодня..." style={S.input}/>
      </Sec>

      <Sec title="Заметка дня">
        <textarea rows={3} value={log?.note||""} onChange={e=>saveLog("note",e.target.value)}
          placeholder="Мысли, ощущения, итог дня..." style={S.ta}/>
      </Sec>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ФИНАНСЫ
// ─────────────────────────────────────────────────────────────────────────────
function FinanceTab({date}) {
  const [txs,    setTxs]    = useState([]);
  const [budget, setBudget] = useState(null);
  const [loading,setLoading]= useState(true);
  const [form,   setForm]   = useState({type:"expense",amount:"",cat:EXPENSE_CATS[0],note:""});

  useEffect(()=>{
    setLoading(true);
    Promise.all([
      db.getMany("transactions",{date},"created_at.desc"),
      db.get("monthly_budget",{month:date.slice(0,7)}),
    ]).then(([t,b])=>{
      setTxs(t||[]);
      setBudget(b||{month:date.slice(0,7),budget:0,savings_goal:0});
      setLoading(false);
    });
  },[date]);

  async function addTx() {
    if(!form.amount||isNaN(Number(form.amount))) return;
    const t = await db.insert("transactions",{date,type:form.type,amount:Number(form.amount),category:form.cat,note:form.note},`transactions?date=eq.${date}`);
    if(t) setTxs(prev=>[t,...prev]);
    setForm(f=>({...f,amount:"",note:""}));
  }
  async function removeTx(id) {
    await db.delete("transactions",id,`transactions?date=eq.${date}`);
    setTxs(prev=>prev.filter(t=>t.id!==id));
  }
  async function saveBudget(field,value) {
    const updated={...budget,[field]:Number(value)};
    setBudget(updated);
    db.upsert("monthly_budget",{month:date.slice(0,7),[field]:Number(value)},"monthly_budget");
  }

  const totalExp=txs.filter(t=>t.type==="expense").reduce((s,t)=>s+t.amount,0);
  const totalInc=txs.filter(t=>t.type==="income").reduce((s,t)=>s+t.amount,0);
  const balance=totalInc-totalExp;
  const catMap={};
  txs.filter(t=>t.type==="expense").forEach(t=>{catMap[t.category]=(catMap[t.category]||0)+t.amount;});

  if(loading) return <SkeletonFinance/>;

  return (
    <>
      <Sec title="Бюджет месяца">
        <div style={S.budgetRow}>
          <div style={S.budgetCard}>
            <div style={S.budgetLabel}>Бюджет ₽</div>
            <input type="number" value={budget?.budget||""} onChange={e=>saveBudget("budget",e.target.value)}
              placeholder="0" style={{...S.input,fontSize:18,textAlign:"center"}}/>
          </div>
          <div style={S.budgetCard}>
            <div style={S.budgetLabel}>Цель сбережений ₽</div>
            <input type="number" value={budget?.savings_goal||""} onChange={e=>saveBudget("savings_goal",e.target.value)}
              placeholder="0" style={{...S.input,fontSize:18,textAlign:"center"}}/>
          </div>
        </div>
        {budget?.budget>0&&(
          <div style={{marginTop:12}}>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:12,color:"#6b6760",marginBottom:6}}>
              <span>Потрачено: {fmt(totalExp)} ₽</span><span>из {fmt(budget.budget)} ₽</span>
            </div>
            <div style={S.progressBg}>
              <div style={{...S.progressFill,width:`${Math.min(100,(totalExp/budget.budget)*100)}%`,
                background:totalExp/budget.budget>0.8?"#e07a5f":"#81b29a"}}/>
            </div>
          </div>
        )}
      </Sec>

      <div style={S.finSummary}>
        <FinCard label="Доходы"  val={`+${fmt(totalInc)} ₽`} color="#81b29a"/>
        <FinCard label="Расходы" val={`−${fmt(totalExp)} ₽`} color="#e07a5f"/>
        <FinCard label="Баланс"  val={`${balance>=0?"+":""}${fmt(balance)} ₽`} color={balance>=0?"#81b29a":"#e07a5f"}/>
      </div>

      <Sec title="Добавить операцию">
        <div style={{display:"flex",gap:8,marginBottom:10}}>
          {["expense","income"].map(t=>(
            <button key={t} onClick={()=>setForm(f=>({...f,type:t,cat:t==="expense"?EXPENSE_CATS[0]:INCOME_CATS[0]}))}
              style={{...S.tag,...(form.type===t?{borderColor:t==="expense"?"#e07a5f":"#81b29a",
                color:t==="expense"?"#e07a5f":"#81b29a",
                background:t==="expense"?"#e07a5f18":"#81b29a18"}:{})}}>
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

      {txs.length>0&&(
        <Sec title="Операции за день">
          {txs.map(tx=>(
            <div key={tx.id} style={S.txRow}>
              <div style={{flex:1}}>
                <div style={{fontSize:13,color:"#f0ece4"}}>{tx.category}{tx.note&&<span style={{color:"#666"}}> — {tx.note}</span>}</div>
              </div>
              <div style={{fontSize:15,color:tx.type==="expense"?"#e07a5f":"#81b29a",marginRight:10}}>
                {tx.type==="expense"?"-":"+"}{fmt(tx.amount)} ₽
              </div>
              <button onClick={()=>removeTx(tx.id)} style={S.clearBtn}>✕</button>
            </div>
          ))}
        </Sec>
      )}

      {Object.keys(catMap).length>0&&(
        <Sec title="По категориям">
          {Object.entries(catMap).sort((a,b)=>b[1]-a[1]).map(([cat,amt])=>(
            <div key={cat} style={{marginBottom:10}}>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:4}}>
                <span style={{color:"#f0ece4"}}>{cat}</span>
                <span style={{color:"#e07a5f"}}>{fmt(amt)} ₽ <span style={{color:"#555",fontSize:11}}>({Math.round(amt/totalExp*100)}%)</span></span>
              </div>
              <div style={S.progressBg}>
                <div style={{...S.progressFill,width:`${Math.min(100,amt/totalExp*100)}%`,background:"#e07a5f"}}/>
              </div>
            </div>
          ))}
        </Sec>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// СТАТИСТИКА
// ─────────────────────────────────────────────────────────────────────────────
function StatsTab({last7}) {
  const [days,   setDays]   = useState([]);
  const [loading,setLoading]= useState(true);

  useEffect(()=>{
    // Один запрос на диапазон вместо 7 отдельных
    const from = last7[0], to = last7[last7.length-1];
    db.getRange("daily_logs",from,to).then(logs=>{
      const logMap = Object.fromEntries(logs.map(l=>[l.date,l]));
      setDays(last7.map(date=>({
        key:date,
        label:DAY_RU[new Date(date+"T12:00:00").getDay()],
        ...(logMap[date]||{}),
      })));
      setLoading(false);
    });
  },[]);

  if(loading) return <SkeletonStats/>;

  const maxSteps=Math.max(...days.map(d=>Number(d.steps)||0),10000);
  const maxKcal =Math.max(...days.map(d=>Number(d.kcal)||0),2000);

  let studyStreak=0;
  for(let i=days.length-1;i>=0;i--){if(days[i].study&&days[i].study!=="😴 День отдыха")studyStreak++;else break;}
  const avgMood=(()=>{const a=days.map(d=>d.mood).filter(Boolean);return a.length?(a.reduce((s,v)=>s+v,0)/a.length).toFixed(1):"—";})();
  const avgSleep=(()=>{const a=days.map(d=>Number(d.sleep)).filter(Boolean);return a.length?(a.reduce((s,v)=>s+v,0)/a.length).toFixed(1):"—";})();

  return (
    <>
      <div style={S.statsGrid}>
        <StatCard icon="🙂" label="Ср. настроение" val={`${avgMood}/10`}    color="#e07a5f"/>
        <StatCard icon="😴" label="Ср. сон"        val={`${avgSleep} ч`}    color="#7b9ccc"/>
        <StatCard icon="📚" label="Учёба подряд"   val={`${studyStreak} д`} color="#e8c97a"/>
        <StatCard icon="📅" label="Дней заполнено" val={`${days.filter(d=>d.mood).length}/7`} color="#81b29a"/>
      </div>
      <Sec title="Настроение — 7 дней"><Chart days={days} field="mood"  max={10}       color="#e07a5f"/></Sec>
      <Sec title="Шаги — 7 дней">      <Chart days={days} field="steps" max={maxSteps} color="#81b29a"/></Sec>
      <Sec title="Сон — 7 дней">       <Chart days={days} field="sleep" max={10}       color="#7b9ccc"/></Sec>
      <Sec title="Калории — 7 дней">   <Chart days={days} field="kcal"  max={maxKcal}  color="#e8c97a"/></Sec>
      <Sec title="Учёба по дням">
        <div style={{display:"flex",gap:6}}>
          {days.map(d=>{
            const done=d.study&&d.study!=="😴 День отдыха";
            const rest=d.study==="😴 День отдыха";
            return(
              <div key={d.key} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
                <div style={{width:"100%",aspectRatio:"1",borderRadius:8,
                  background:done?"#e8c97a22":rest?"#2a2825":"#1a1917",
                  border:`1px solid ${done?"#e8c97a55":rest?"#333":"#2a2825"}`,
                  display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>
                  {done?"📚":rest?"😴":"·"}
                </div>
                <div style={{fontSize:10,color:"#555"}}>{d.label}</div>
              </div>
            );
          })}
        </div>
      </Sec>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// МЕСЯЦ
// ─────────────────────────────────────────────────────────────────────────────
function MonthTab({monthK}) {
  const [logs,   setLogs]   = useState([]);
  const [txs,    setTxs]    = useState([]);
  const [budget, setBudget] = useState(null);
  const [loading,setLoading]= useState(true);

  const [yr,mo] = monthK.split("-").map(Number);
  const daysInMonth = new Date(yr,mo,0).getDate();
  const allDays = Array.from({length:daysInMonth},(_,i)=>`${yr}-${String(mo).padStart(2,"0")}-${String(i+1).padStart(2,"0")}`);
  const dateFrom = `${monthK}-01`;
  const dateTo   = `${monthK}-${String(daysInMonth).padStart(2,"0")}`;

  useEffect(()=>{
    setLoading(true);
    // Два запроса на диапазон вместо множества отдельных
    Promise.all([
      db.getRange("daily_logs",dateFrom,dateTo),
      db.getRange("transactions",dateFrom,dateTo),
      db.get("monthly_budget",{month:monthK}),
    ]).then(([l,t,b])=>{
      setLogs(l||[]);
      setTxs(t||[]);
      setBudget(b||{budget:0,savings_goal:0});
      setLoading(false);
    });
  },[monthK]);

  if(loading) return <SkeletonStats/>;

  const logMap=Object.fromEntries(logs.map(l=>[l.date,l]));
  const totalExp=txs.filter(t=>t.type==="expense").reduce((s,t)=>s+t.amount,0);
  const totalInc=txs.filter(t=>t.type==="income").reduce((s,t)=>s+t.amount,0);
  const savings=(budget?.budget||0)-totalExp;
  const studyDays=logs.filter(l=>l.study&&l.study!=="😴 День отдыха").length;
  const avgMood=(()=>{const a=logs.map(l=>l.mood).filter(Boolean);return a.length?(a.reduce((s,v)=>s+v,0)/a.length).toFixed(1):"—";})();
  const catMap={};
  txs.filter(t=>t.type==="expense").forEach(t=>{catMap[t.category]=(catMap[t.category]||0)+t.amount;});
  const MONTH_NAMES=["Январь","Февраль","Март","Апрель","Май","Июнь","Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"];

  return (
    <>
      <Sec title={`${MONTH_NAMES[mo-1]} ${yr}`}>
        <div style={S.statsGrid}>
          <StatCard icon="💸" label="Расходы"        val={`${fmt(totalExp)} ₽`} color="#e07a5f"/>
          <StatCard icon="💰" label="Доходы"          val={`${fmt(totalInc)} ₽`} color="#81b29a"/>
          <StatCard icon="🏦" label={savings>=0?"Сэкономлено":"Перерасход"} val={`${fmt(Math.abs(savings))} ₽`} color={savings>=0?"#81b29a":"#e07a5f"}/>
          <StatCard icon="📚" label="Дней учёбы"     val={`${studyDays} дн`}   color="#e8c97a"/>
          <StatCard icon="🙂" label="Ср. настроение" val={`${avgMood}/10`}      color="#7b9ccc"/>
        </div>
      </Sec>

      {budget?.budget>0&&(
        <Sec title="Бюджет">
          <div style={{display:"flex",justifyContent:"space-between",fontSize:13,color:"#6b6760",marginBottom:8}}>
            <span>Потрачено: {fmt(totalExp)} ₽</span><span>из {fmt(budget.budget)} ₽</span>
          </div>
          <div style={S.progressBg}>
            <div style={{...S.progressFill,width:`${Math.min(100,(totalExp/budget.budget)*100)}%`,
              background:totalExp/budget.budget>0.9?"#e07a5f":totalExp/budget.budget>0.7?"#e8c97a":"#81b29a"}}/>
          </div>
          <div style={{fontSize:12,color:"#6b6760",marginTop:6}}>Осталось: {fmt(Math.max(0,budget.budget-totalExp))} ₽</div>
        </Sec>
      )}

      {Object.keys(catMap).length>0&&(
        <Sec title="Расходы по категориям">
          {Object.entries(catMap).sort((a,b)=>b[1]-a[1]).map(([cat,amt])=>(
            <div key={cat} style={{marginBottom:10}}>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:4}}>
                <span style={{color:"#f0ece4"}}>{cat}</span>
                <span style={{color:"#e07a5f"}}>{fmt(amt)} ₽ <span style={{color:"#555",fontSize:11}}>({Math.round(amt/totalExp*100)}%)</span></span>
              </div>
              <div style={S.progressBg}>
                <div style={{...S.progressFill,width:`${Math.min(100,amt/totalExp*100)}%`,background:"#e07a5f"}}/>
              </div>
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
            const log=logMap[k];
            const mood=log?.mood;
            const d=Number(k.slice(8));
            const isToday=k===todayKey();
            return(
              <div key={k} style={{aspectRatio:"1",borderRadius:5,
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
// ПЕРЕИСПОЛЬЗУЕМЫЕ КОМПОНЕНТЫ
// ─────────────────────────────────────────────────────────────────────────────
function Sec({title,children}) {
  return(
    <div style={{marginTop:24}}>
      <div style={S.secTitle}>{title}</div>
      {children}
    </div>
  );
}
function Vital({icon,label,val,color,onChange}) {
  return(
    <div style={{...S.vitalCard,borderColor:val?color+"44":"#2a2825"}}>
      <div style={{fontSize:20,marginBottom:4}}>{icon}</div>
      <input type="number" value={val} onChange={e=>onChange(e.target.value)}
        placeholder="—" style={{...S.vitalInput,color}}/>
      <div style={{fontSize:10,color:"#6b6760",marginTop:2,textAlign:"center"}}>{label}</div>
    </div>
  );
}
function Chart({days,field,max,color}) {
  return(
    <div style={{display:"flex",alignItems:"flex-end",gap:4,height:80}}>
      {days.map(d=>{
        const val=Number(d[field])||0;
        const pct=max>0?val/max:0;
        return(
          <div key={d.key} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
            {val>0&&<div style={{fontSize:9,color:"#888"}}>{val}</div>}
            <div style={{width:"100%",borderRadius:4,height:Math.max(val?4:2,pct*60),
              background:val?color+"cc":"#2a2825",transition:"height 0.3s"}}/>
            <div style={{fontSize:10,color:"#555"}}>{d.label}</div>
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
function FinCard({label,val,color}) {
  return(
    <div style={{flex:1,background:"#1a1917",border:`1px solid ${color}33`,borderRadius:12,padding:"12px 8px",textAlign:"center"}}>
      <div style={{fontSize:14,color,marginBottom:4}}>{val}</div>
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
  badge:      {background:"#1e1c1a",border:"1px solid",borderRadius:10,padding:"5px 10px",fontSize:11},
  datePicker: {background:"#1a1917",border:"1px solid #2a2825",borderRadius:8,padding:"5px 8px",color:"#888",fontSize:12,fontFamily:"inherit",outline:"none"},
  tabs:       {display:"flex",borderBottom:"1px solid #1e1c1a",position:"sticky",top:0,background:"#0a0908",zIndex:10},
  tab:        {flex:1,padding:"12px 0",background:"none",border:"none",color:"#555",fontSize:13,cursor:"pointer",fontFamily:"inherit"},
  tabOn:      {color:"#f0ece4",borderBottom:"2px solid #e07a5f"},
  body:       {padding:"0 16px"},
  secTitle:   {fontSize:10,letterSpacing:3,color:"#6b6760",textTransform:"uppercase",marginBottom:12},
  vitalsGrid: {display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginTop:20},
  vitalCard:  {background:"#1a1917",border:"1px solid",borderRadius:12,padding:"12px 6px",display:"flex",flexDirection:"column",alignItems:"center"},
  vitalInput: {width:"100%",background:"transparent",border:"none",outline:"none",fontSize:17,textAlign:"center",fontFamily:"inherit"},
  moodBtn:    {width:36,height:36,borderRadius:8,border:"1px solid #2a2825",background:"#1a1917",color:"#555",fontSize:13,cursor:"pointer",fontFamily:"inherit"},
  tag:        {padding:"5px 10px",borderRadius:8,border:"1px solid #2a2825",background:"transparent",color:"#555",fontSize:12,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"},
  hourRow:    {display:"flex",alignItems:"center",gap:10,padding:"7px 10px",borderRadius:6,cursor:"pointer",borderLeft:"3px solid",transition:"background 0.15s"},
  hourLabel:  {fontSize:12,minWidth:42,fontVariantNumeric:"tabular-nums"},
  editPanel:  {background:"#1a1917",border:"1px solid #2a2825",borderRadius:10,padding:"12px",margin:"4px 0 6px"},
  clearBtn:   {background:"none",border:"none",color:"#444",cursor:"pointer",fontSize:13,padding:"2px 6px"},
  input:      {width:"100%",background:"#1a1917",border:"1px solid #2a2825",borderRadius:8,padding:"10px 12px",color:"#f0ece4",fontSize:14,fontFamily:"inherit",outline:"none"},
  saveBtn:    {padding:"9px 18px",borderRadius:8,border:"1px solid #81b29a",background:"#81b29a18",color:"#81b29a",fontSize:13,cursor:"pointer",fontFamily:"inherit"},
  ta:         {width:"100%",background:"#1a1917",border:"1px solid #2a2825",borderRadius:8,padding:"10px 12px",color:"#f0ece4",fontSize:13,fontFamily:"inherit",resize:"none",outline:"none",lineHeight:1.6},
  budgetRow:  {display:"grid",gridTemplateColumns:"1fr 1fr",gap:10},
  budgetCard: {background:"#1a1917",border:"1px solid #2a2825",borderRadius:12,padding:"14px"},
  budgetLabel:{fontSize:11,color:"#6b6760",marginBottom:8},
  progressBg: {height:6,background:"#1e1c1a",borderRadius:3,overflow:"hidden"},
  progressFill:{height:"100%",borderRadius:3,transition:"width 0.4s"},
  finSummary: {display:"flex",gap:8,marginTop:20},
  txRow:      {display:"flex",alignItems:"center",gap:8,padding:"10px 12px",background:"#1a1917",borderRadius:8,marginBottom:6,border:"1px solid #2a2825"},
  statsGrid:  {display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:10},
  taskRow:    {display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:"1px solid #1a1917"},
  checkbox:   {width:22,height:22,borderRadius:5,border:"1px solid",background:"transparent",cursor:"pointer",color:"#0a0908",fontSize:12,flexShrink:0},
};
