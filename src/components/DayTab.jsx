import { useState, useEffect, useRef } from "react";
export default function DayTab({date, settings, saveSettings}) {
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
