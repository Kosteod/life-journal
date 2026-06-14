// ─────────────────────────────────────────────────────────────────────────────
// ФИНАНСЫ — вставь вместо старой FinanceTab
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect } from "react";
import {
  todayISO,
  monthISO,
  fmt,
  DAY_SHORT,
  BLOCK_TYPES,
  BLOCK_COLORS,
  HOURS,
  REPEAT_TYPES
} from "../utils.js";
export default function FinanceTab({settings, saveSettings}) {
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
  const todayExpenses = todayTxs.filter(t=>t.type==="expense").reduce((s,t)=>s+t.amount,0);
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
          {soonPayments.map(p=>(
            <div key={p.id} style={{display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:4}}>
              <span style={{color:"#f0ece4"}}>{p.name}</span>
              <span style={{color:"#e07a5f"}}>−{fmt(p.amount)} ₽ · {new Date(p.next_date+"T12:00:00").toLocaleDateString("ru-RU",{day:"numeric",month:"short"})}</span>
            </div>
          ))}
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
