// app.js - Versão completa com suporte 12x36, horários e férias
// Depende de: employeeMetadata (escala-data.js) e JSONs mensais em ./data/escala-YYYY-MM.json

// ==========================================
// CONFIGURAÇÕES INICIAIS / UTILITÁRIAS
// ==========================================
const currentDateObj = new Date();
const monthNames = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

const systemYear = currentDateObj.getFullYear();
const systemMonth = currentDateObj.getMonth();
const systemDay = currentDateObj.getDate();

const availableMonths = [
    { year: 2025, month: 10 }, // Novembro
    { year: 2025, month: 11 }, // Dezembro
    { year: 2026, month: 0 }   // Janeiro
];

let selectedMonthObj = availableMonths.find(m => m.year === systemYear && m.month === systemMonth) || availableMonths[0];
let currentDay = systemDay;

let rawSchedule = {};
let scheduleData = {};
let dailyChart = null;

const daysOfWeek = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];
const statusMap = { 'T':'Trabalhando','F':'Folga','FS':'Folga Sáb','FD':'Folga Dom','FE':'Férias','OFF-SHIFT':'Exp. Encerrado' };

function pad(n){ return n < 10 ? '0'+n : ''+n; }
function safeGet(obj, key, fallback='') { return obj && obj[key] !== undefined ? obj[key] : fallback; }

// ==========================================
// CARREGAMENTO JSON
// ==========================================
async function loadMonthlyJson(year, month) {
    const filePath = `./data/escala-${year}-${String(month+1).padStart(2,'0')}.json`;
    try {
        const resp = await fetch(filePath);
        if (!resp.ok) return null;
        const json = await resp.json();
        return json;
    } catch (err) {
        console.error('Erro ao carregar JSON:', err);
        return null;
    }
}

// ==========================================
// FUNÇÕES DE ESCALA
// ==========================================

// Gera 12x36 alternando dias (começa no dia startWorkingDay)
function generate12x36Schedule(startWorkingDay, totalDays) {
    const schedule = new Array(totalDays).fill('F');
    for (let d=startWorkingDay; d<=totalDays; d+=2) schedule[d-1] = 'T';
    return schedule;
}

// Gera segunda a sexta
function generate5x2ScheduleDefaultForMonth(monthObj) {
    const totalDays = new Date(monthObj.year, monthObj.month+1,0).getDate();
    const arr = [];
    for (let d=1; d<=totalDays; d++){
        const dow = new Date(monthObj.year, monthObj.month, d).getDay();
        arr.push((dow===0||dow===6)?'F':'T');
    }
    return arr;
}

// Parse strings como "1,2,5-10,15/11 a 20/11, fins de semana, segunda a sexta"
function parseDayListForMonth(dayString, monthObj) {
    if (!dayString) return [];
    const totalDays = new Date(monthObj.year, monthObj.month+1,0).getDate();
    const days = new Set();

    const normalized = String(dayString)
        .replace(/\b(at[eé]|até|a)\b/gi,' a ')
        .replace(/–|—/g,'-')
        .replace(/\s*-\s*/g,'-')
        .replace(/\s+/g,' ')
        .trim();

    const parts = normalized.split(',').map(p=>p.trim()).filter(p=>p.length>0);

    parts.forEach(part=>{
        const dateRange = part.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s*(?:a|-)\s*(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
        if (dateRange) {
            let [, sD, sM, sY, eD, eM, eY] = dateRange;
            sD=parseInt(sD,10); sM=parseInt(sM,10)-1; eD=parseInt(eD,10); eM=parseInt(eM,10)-1;
            const sYear = sY?parseInt(sY,10):monthObj.year;
            const eYear = eY?parseInt(eY,10):monthObj.year;
            const start=new Date(sYear,sM,sD), end=new Date(eYear,eM,eD);
            for(let dt=new Date(start); dt<=end; dt.setDate(dt.getDate()+1)){
                if(dt.getFullYear()===monthObj.year && dt.getMonth()===monthObj.month) days.add(dt.getDate());
            }
            return;
        }

        const single = part.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
        if(single){ const d=parseInt(single[1],10); if(parseInt(single[2],10)-1===monthObj.month) days.add(d); return; }

        const simple = part.match(/^(\d{1,2})-(\d{1,2})$/);
        if(simple){ const s=parseInt(simple[1],10), e=parseInt(simple[2],10); for(let x=s;x<=e;x++) if(x>=1&&x<=totalDays) days.add(x); return; }

        const number = part.match(/^(\d{1,2})$/);
        if(number){ const v=parseInt(number[1],10); if(v>=1&&v<=totalDays) days.add(v); return; }

        if(/fins? de semana|fim de semana/i.test(part)){ for(let d=1;d<=totalDays;d++){ const dow=new Date(monthObj.year,monthObj.month,d).getDay(); if(dow===0||dow===6) days.add(d); } return; }
        if(/segunda a sexta|segunda à sexta/i.test(part)){ for(let d=1;d<=totalDays;d++){ const dow=new Date(monthObj.year,monthObj.month,d).getDay(); if(dow>=1&&dow<=5) days.add(d); } return; }
    });

    return Array.from(days).sort((a,b)=>a-b);
}

// ==========================================
// BUILD FINAL SCHEDULE
// ==========================================
function buildFinalScheduleForMonth(employeeData, monthObj) {
    const totalDays = new Date(monthObj.year, monthObj.month+1,0).getDate();
    const schedule = new Array(totalDays).fill(null);

    // Helper: converte T em array
    const parseTtoArray = (t, empData) => {
        if(empData.escala==='12x36'){
            const startDay = empData.inicio || 1;
            return generate12x36Schedule(startDay, totalDays);
        }
        if(!t) return [];
        if(Array.isArray(t) && t.length===totalDays && typeof t[0]==='string') return t;
        if(typeof t==='string' && /segunda a sexta/i.test(t)) return generate5x2ScheduleDefaultForMonth(monthObj);
        if(typeof t==='string') {
            const parsedDays=parseDayListForMonth(t,monthObj);
            if(parsedDays.length>0){
                const arr=new Array(totalDays).fill('F');
                parsedDays.forEach(d=>{ if(d>=1&&d<=totalDays) arr[d-1]='T'; });
                return arr;
            }
        }
        if(Array.isArray(t) && t.length && typeof t[0]==='number'){
            const arr=new Array(totalDays).fill('F');
            t.forEach(d=>{ if(d>=1&&d<=totalDays) arr[d-1]='T'; });
            return arr;
        }
        return [];
    };

    // 1) Férias
    const vacDays=parseDayListForMonth(employeeData.FE,monthObj);
    vacDays.forEach(d=>{ if(d>=1&&d<=totalDays) schedule[d-1]='FE'; });

    // 2) T
    const tParsed=parseTtoArray(employeeData.T, employeeData);
    for(let i=0;i<totalDays;i++){ if(schedule[i]==='FE') continue; if(tParsed[i]==='T') schedule[i]='T'; }

    // 3) FD, FS
    parseDayListForMonth(employeeData.FD,monthObj).forEach(d=>{ if(d>=1&&d<=totalDays && schedule[d-1]!=='FE') schedule[d-1]='FD'; });
    parseDayListForMonth(employeeData.FS,monthObj).forEach(d=>{ if(d>=1&&d<=totalDays && !['FE','FD'].includes(schedule[d-1])) schedule[d-1]='FS'; });

    // 4) F
    parseDayListForMonth(employeeData.F,monthObj).forEach(d=>{ if(d>=1&&d<=totalDays && !['FE','FD','FS'].includes(schedule[d-1])) schedule[d-1]='F'; });

    // 5) Blanks
    const tIsHorarioString=typeof employeeData.T==='string' && employeeData.T.trim().length>0 && !/segunda a sexta|12x36|fins? de semana/i.test(employeeData.T.toLowerCase());
    for(let i=0;i<totalDays;i++){ if(!schedule[i]) schedule[i]=tIsHorarioString?'T':'T'; }

    return schedule;
}

// ==========================================
// RESTANTE DO APP.JS
// ==========================================
// ... Mantém todo o restante do seu app.js original: parseSingleTimeRange, isWorkingTime, rebuildScheduleDataForSelectedMonth,
// updateDailyView, updatePersonalView, updateCalendar, updateWeekendTable, initTabs, initDailyView, initMonthSelect, scheduleMidnightUpdate, initGlobal

document.addEventListener('DOMContentLoaded', initGlobal);
