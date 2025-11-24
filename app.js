// app.js — Reescrito e otimizado (Opção 1: manter visual atual)
// Suporta: carregamento por mês via /data/escala-YYYY-MM.json, dropdown ano/mês, rebuild da escala
// Expondo algumas funções/globals para integração com index.html

// -----------------------------
// 1) Configurações iniciais
// -----------------------------
const monthNames = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const daysOfWeek = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];

const now = new Date();
const systemYear = now.getFullYear();
const systemMonth = now.getMonth();
const systemDay = now.getDate();

// Estado global exposto
window.selectedMonthObj = window.selectedMonthObj || { year: systemYear, month: systemMonth };
window.rawSchedule = window.rawSchedule || {}; // preenchido pelo loadMonthlyJson
window.scheduleData = window.scheduleData || {};

let currentDay = systemDay;
let dailyChart = null;

const statusMap = { 'T':'Trabalhando','F':'Folga','FS':'Folga Sáb','FD':'Folga Dom','FE':'Férias','OFF-SHIFT':'Exp. Encerrado' };

// -----------------------------
// 2) Utilitários
// -----------------------------
function pad(n){ return n<10 ? '0'+n : ''+n; }
function safeText(s){ return (s===null||s===undefined)?'':String(s).trim(); }

// -----------------------------
// 3) Carregamento JSON (GitHub Pages compatível)
// -----------------------------
// Retorna o objeto JSON (estrutura por colaborador) ou null
window.loadMonthlyJson = async function(year, month){
    const path = `./data/escala-${year}-${String(month+1).padStart(2,'0')}.json`;
    try{
        const res = await fetch(path);
        if(!res.ok){ console.info('JSON de escala não encontrado:', path); return null; }
        const json = await res.json();
        return json;
    }catch(err){ console.error('Erro ao carregar JSON:', err); return null; }
};

// -----------------------------
// 4) Geração de escalas (12x36, 5x2)
// -----------------------------
function generate12x36Schedule(startWorkingDay, totalDays){
    const schedule = [];
    for(let d=1; d<=totalDays; d++){
        const offset = d - startWorkingDay;
        schedule.push(offset>=0 && offset%2===0 ? 'T' : 'F');
    }
    return schedule;
}

function generate5x2ScheduleForMonth(monthObj){
    const total = new Date(monthObj.year, monthObj.month+1, 0).getDate();
    const out = [];
    for(let d=1; d<=total; d++){
        const dow = new Date(monthObj.year, monthObj.month, d).getDay();
        out.push((dow===0||dow===6)?'F':'T');
    }
    return out;
}

// -----------------------------
// 5) Parser de strings (dias, ranges, datas)
// -----------------------------
function parseDayListForMonth(dayString, monthObj){
    if(!dayString) return [];
    const str = String(dayString).replace(/\r/g,'\n').replace(/\s+/g,' ').trim();
    const totalDays = new Date(monthObj.year, monthObj.month+1, 0).getDate();
    const parts = str.split(',').map(p=>p.trim()).filter(Boolean);
    const days = new Set();

    parts.forEach(partRaw => {
        const part = partRaw.replace(/\b(at[eé]|até|a)\b/gi,' a ').replace(/–|—/g,'-').trim();
        // date range dd/mm a dd/mm or dd/mm-dd/mm
        const dateRange = part.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s*(?:a|-)\s*(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
        if(dateRange){
            let [, sd, sm, sy, ed, em, ey] = dateRange;
            sd = parseInt(sd,10); sm = parseInt(sm,10)-1; ed = parseInt(ed,10); em = parseInt(em,10)-1;
            const sYear = sy ? parseInt(sy,10) : monthObj.year;
            const eYear = ey ? parseInt(ey,10) : monthObj.year;
            const start = new Date(sYear, sm, sd);
            const end = new Date(eYear, em, ed);
            for(let dt=new Date(start); dt<=end; dt.setDate(dt.getDate()+1)){
                if(dt.getFullYear()===monthObj.year && dt.getMonth()===monthObj.month) days.add(dt.getDate());
            }
            return;
        }
        // single date dd/mm
        const single = part.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
        if(single){
            const d = parseInt(single[1],10); const m = parseInt(single[2],10)-1;
            if(m===monthObj.month && d>=1 && d<=totalDays) days.add(d);
            return;
        }
        // numeric range 10-15
        const simpleRange = part.match(/^(\d{1,2})-(\d{1,2})$/);
        if(simpleRange){
            const s = parseInt(simpleRange[1],10), e = parseInt(simpleRange[2],10);
            for(let x=s;x<=e;x++) if(x>=1 && x<=totalDays) days.add(x);
            return;
        }
        // single number
        const singleNum = part.match(/^(\d{1,2})$/);
        if(singleNum){ const v=parseInt(singleNum[1],10); if(v>=1 && v<=totalDays) days.add(v); return; }
        // keywords
        if(/fins? de semana/i.test(part) || /fim de semana/i.test(part)){
            for(let d=1; d<=totalDays; d++){ const dow=new Date(monthObj.year, monthObj.month, d).getDay(); if(dow===0||dow===6) days.add(d); }
            return;
        }
        if(/segunda a sexta/i.test(part) || /segunda à sexta/i.test(part)){
            for(let d=1; d<=totalDays; d++){ const dow=new Date(monthObj.year, monthObj.month, d).getDay(); if(dow>=1&&dow<=5) days.add(d); }
            return;
        }
        // otherwise ignore unknown tokens
    });

    return Array.from(days).sort((a,b)=>a-b);
}

// -----------------------------
// 6) Construção da escala final por colaborador
// -----------------------------
function buildFinalScheduleForMonth(employeeData, monthObj){
    const totalDays = new Date(monthObj.year, monthObj.month+1, 0).getDate();
    const schedule = new Array(totalDays).fill(null);

    const parseDaysOrSchedule = (s)=>{
        if(!s) return [];
        const low = String(s).toLowerCase();
        if(low.includes('segunda a sexta') || low.includes('segunda à sexta')) return generate5x2ScheduleForMonth(monthObj);
        if(low.includes('12x36')){
            const m = s.match(/iniciado no dia\s*(\d{1,2})/i);
            const start = m ? parseInt(m[1],10) : 1;
            return generate12x36Schedule(start, totalDays);
        }
        // if input is array of strings 'T'/'F'
        if(Array.isArray(s) && s.length===totalDays && typeof s[0]==='string') return s;
        // otherwise parse numerics/dates
        return parseDayListForMonth(s, monthObj);
    };

    // 1) Férias (FE) - prioridade máxima
    const vacDays = parseDayListForMonth(employeeData.FE, monthObj);
    vacDays.forEach(d=>{ if(d>=1 && d<=totalDays) schedule[d-1]='FE'; });

    // 2) Escala fixa (12x36 ou 5x2) ou dias trabalhados
    let isFixed=false; let fixedSchedule=[];
    const workingOrSchedule = parseDaysOrSchedule(employeeData.T);
    if(Array.isArray(workingOrSchedule) && workingOrSchedule.length===totalDays && typeof workingOrSchedule[0]==='string'){
        isFixed = true; fixedSchedule = workingOrSchedule;
    } else if(employeeData.F && String(employeeData.F).toLowerCase().includes('fins de semana')){
        isFixed = true; fixedSchedule = generate5x2ScheduleForMonth(monthObj);
    }

    if(isFixed){
        for(let i=0;i<totalDays;i++){
            schedule[i] = schedule[i] === 'FE' ? 'FE' : fixedSchedule[i];
        }
    } else {
        if(Array.isArray(workingOrSchedule)){
            workingOrSchedule.forEach(d=>{ if(d>=1 && d<=totalDays && schedule[d-1]===null) schedule[d-1] = 'T'; });
        }
    }

    // 3) FD, FS, F
    parseDayListForMonth(employeeData.FD, monthObj).forEach(d=>{ if(schedule[d-1] !== 'FE') schedule[d-1] = 'FD'; });
    parseDayListForMonth(employeeData.FS, monthObj).forEach(d=>{ if(schedule[d-1] !== 'FE' && schedule[d-1] !== 'FD') schedule[d-1] = 'FS'; });
    if(!isFixed) parseDayListForMonth(employeeData.F, monthObj).forEach(d=>{ if(schedule[d-1] !== 'FE' && schedule[d-1] !== 'FD' && schedule[d-1] !== 'FS') schedule[d-1] = 'F'; });

    // 4) Preencher resto com 'T'
    for(let i=0;i<totalDays;i++) if(!schedule[i]) schedule[i]='T';
    return schedule;
}

// -----------------------------
// 7) Reconstruir scheduleData com base no rawSchedule (carregado do JSON)
// -----------------------------
window.rebuildScheduleDataForSelectedMonth = function(){
    const monthObj = { year: window.selectedMonthObj.year, month: window.selectedMonthObj.month };
    const totalDays = new Date(monthObj.year, monthObj.month+1, 0).getDate();
    window.scheduleData = {};

    Object.keys(window.employeeMetadata || {}).forEach(name => {
        const data = window.rawSchedule && window.rawSchedule[name] ? window.rawSchedule[name] : { T:'segunda a sexta', F:'fins de semana', FS:'', FD:'', FE:'' };
        window.scheduleData[name] = { info: window.employeeMetadata[name], schedule: buildFinalScheduleForMonth(data, monthObj) };
    });

    // slider adjustments
    const slider = document.getElementById('dateSlider');
    if(slider){ slider.max = totalDays; const lbl = document.getElementById('sliderMaxLabel'); if(lbl) lbl.textContent = `Dia ${totalDays}`; if(currentDay>totalDays) currentDay=totalDays; slider.value = currentDay; }
};

// -----------------------------
// 8) Visualização: chart, daily view, personal view, calendar, weekend table
// -----------------------------
function updateChart(working, off, offShift, vacation){
    const total = working+off+offShift+vacation;
    const dataPoints = [working, off, offShift, vacation];
    const labels = [`Trabalhando (${working})`,`Folga Programada (${off})`,`Expediente Encerrado (${offShift})`,`Férias (${vacation})`];
    const colors = ['#10b981','#fcd34d','#6366f1','#ef4444'];
    const filteredData = [], filteredLabels = [], filteredColors = [];
    dataPoints.forEach((v,i)=>{ if(v>0 || total===0){ filteredData.push(v); filteredLabels.push(labels[i]); filteredColors.push(colors[i]); }});
    if(dailyChart){ dailyChart.data.datasets[0].data = filteredData; dailyChart.data.datasets[0].backgroundColor = filteredColors; dailyChart.data.labels = filteredLabels; dailyChart.update(); return; }
    const cfg = { type:'doughnut', data:{ labels: filteredLabels, datasets:[{ data: filteredData, backgroundColor: filteredColors, hoverOffset:4 }] }, options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:'bottom' } } } };
    const ctx = document.getElementById('dailyChart').getContext('2d'); dailyChart = new Chart(ctx, cfg);
}

function isWorkingTime(timeRange){
    if(!timeRange || /12x36/i.test(timeRange)) return true;
    const nowLocal = new Date(); const currentMinutes = nowLocal.getHours()*60 + nowLocal.getMinutes();
    const m = String(timeRange).match(/(\d{1,2}):(\d{2})\s*às\s*(\d{1,2}):(\d{2})/);
    if(!m) return false; const [, sh, sm, eh, em] = m.map(Number); const start = sh*60+sm; const end = eh*60+em;
    if(start> end) return currentMinutes >= start || currentMinutes <= end; return currentMinutes >= start && currentMinutes <= end;
}

function updateDailyView(){
    const label = document.getElementById('currentDateLabel');
    const monthObj = { year: window.selectedMonthObj.year, month: window.selectedMonthObj.month };
    const dayOfWeekIndex = new Date(monthObj.year, monthObj.month, currentDay).getDay();
    const today = new Date();
    const isToday = (today.getDate()===currentDay && today.getMonth()===systemMonth && today.getFullYear()===systemYear);
    label.textContent = `${daysOfWeek[dayOfWeekIndex]}, ${pad(currentDay)}/${pad(monthObj.month+1)}/${monthObj.year}`;

    let working=0, off=0, vac=0, offShift=0; let htmlWorking='', htmlOff='', htmlVac='', htmlOffShift='';
    const kpiWorking = document.getElementById('kpiWorking'); const kpiOffShift = document.getElementById('kpiOffShift'); const kpiOff = document.getElementById('kpiOff'); const kpiVacation = document.getElementById('kpiVacation');
    const listWorking = document.getElementById('listWorking'); const listOffShift = document.getElementById('listOffShift'); const listOff = document.getElementById('listOff'); const listVacation = document.getElementById('listVacation');

    Object.keys(window.scheduleData).forEach(name => {
        const emp = window.scheduleData[name];
        const status = emp.schedule[currentDay-1];
        let kpiStatus = status; let display = status;
        if(kpiStatus === 'FE'){ vac++; display='FE'; }
        else if(isToday && kpiStatus === 'T'){
            const inWork = isWorkingTime(emp.info.Horário);
            if(!inWork){ offShift++; display='OFF-SHIFT'; kpiStatus = 'F_EFFECTIVE'; }
            else { working++; }
        } else if(kpiStatus === 'T'){ working++; }
        else if(['F','FS','FD'].includes(kpiStatus)){ off++; }

        const item = `\n<li class="flex justify-between items-center text-sm p-3 rounded hover:bg-indigo-50 border-b border-gray-100 last:border-0 transition-colors">\n<div class="flex flex-col">\n<span class="font-semibold text-gray-700">${name}</span>\n<span class="text-xs text-gray-400">${emp.info.Horário}</span>\n</div>\n<span class="font-bold text-xs px-2 py-1 rounded day-status status-${display}">${statusMap[display]||display}</span>\n</li>\n`;

        if(kpiStatus === 'T') htmlWorking += item;
        else if(kpiStatus === 'F_EFFECTIVE') htmlOffShift += item;
        else if(['F','FS','FD'].includes(kpiStatus)) htmlOff += item;
        else if(kpiStatus === 'FE') htmlVac += item;
    });

    kpiWorking.textContent = working; kpiOffShift.textContent = offShift; kpiOff.textContent = off; kpiVacation.textContent = vac;
    listWorking.innerHTML = htmlWorking || '<li class="text-gray-400 text-sm text-center py-4">Ninguém em expediente no momento.</li>';
    listOffShift.innerHTML = htmlOffShift || '<li class="text-gray-400 text-sm text-center py-4">Ninguém fora de expediente no momento.</li>';
    listOff.innerHTML = htmlOff || '<li class="text-gray-400 text-sm text-center py-4">Nenhuma folga programada.</li>';
    listVacation.innerHTML = htmlVac || '<li class="text-gray-400 text-sm text-center py-4">Ninguém de férias.</li>';

    updateChart(working, off, offShift, vac);
}

function initSelect(){
    const sel = document.getElementById('employeeSelect');
    if(!sel) return;
    sel.innerHTML = '<option value="">Selecione seu nome</option>';
    Object.keys(window.scheduleData).sort().forEach(name=>{ const opt = document.createElement('option'); opt.value=name; opt.textContent=name; sel.appendChild(opt); });
    sel.addEventListener('change', e=>{ const nm = e.target.value; if(nm) updatePersonalView(nm); else { const info=document.getElementById('personalInfoCard'); const cal=document.getElementById('calendarContainer'); info.classList.remove('opacity-100'); info.classList.add('opacity-0'); setTimeout(()=>{ info.classList.add('hidden'); cal.classList.add('hidden'); },300); } });
}

function updatePersonalView(name){ const emp = window.scheduleData[name]; if(!emp) return; const card = document.getElementById('personalInfoCard'); const calCont = document.getElementById('calendarContainer'); const isLeader = emp.info.Grupo === 'Líder de Célula'; const bg = isLeader ? 'bg-purple-700' : 'bg-indigo-600'; const main = isLeader ? 'text-purple-300' : 'text-indigo-300'; const turno = emp.info.Turno || '';
    card.className = `hidden ${bg} p-6 rounded-2xl mb-6 shadow-xl text-white flex flex-col sm:flex-row justify-between items-center transition-opacity duration-300 opacity-0`;
    card.innerHTML = `
        <div class="flex items-center space-x-4 w-full mb-4 sm:mb-0 pb-4 sm:pb-0 border-b sm:border-b-0 sm:border-r border-white/20">
            <svg class="h-10 w-10 ${main} flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">${isLeader ? '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20v-2c0-.656-.126-1.283-.356-1.857M9 20l3-3m0 0l-3-3m3 3h6m-3 3v-2.5M10 9a2 2 0 012-2h4a2 2 0 012 2v4a2 2 0 01-2 2h-4a2 2 0 01-2-2v-4zm-9 3a2 2 0 012-2h4a2 2 0 012 2v4a2 2 0 01-2 2H3a2 2 0 01-2-2v-4z" />' : '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />'}</svg>
            <div class="flex-1 min-w-0"><p class="text-xl sm:text-2xl font-extrabold">${name}</p><p class="text-sm font-semibold">${emp.info.Grupo}</p></div>
        </div>
        <div class="grid grid-cols-2 gap-4 w-full sm:w-auto mt-4 sm:mt-0 sm:pl-6">
            <div><p class="text-xs font-medium ${main}">Célula</p><p class="font-bold text-sm">${emp.info.Célula}</p></div>
            <div><p class="text-xs font-medium ${main}">Horário</p><p class="font-bold text-sm">${emp.info.Horário}</p></div>
            <div><p class="text-xs font-medium ${main}">Turno</p><p class="font-bold text-sm">${turno}</p></div>
        </div>
    `;
    card.classList.remove('hidden','opacity-0'); card.classList.add('opacity-100'); calCont.classList.remove('hidden'); updateCalendar(emp.schedule);
}

function updateCalendar(schedule){ const grid = document.getElementById('calendarGrid'); if(!grid) return; grid.innerHTML=''; const monthObj = { year: window.selectedMonthObj.year, month: window.selectedMonthObj.month }; const first = new Date(monthObj.year, monthObj.month, 1).getDay(); for(let i=0;i<first;i++) grid.insertAdjacentHTML('beforeend','<div class="calendar-cell bg-gray-50 border-gray-100"></div>'); const today = systemDay; const isCurrent = (systemMonth===monthObj.month && systemYear===monthObj.year);
    for(let i=0;i<schedule.length;i++){ const day=i+1; const status=schedule[i]; const display = statusMap[status] || status; const currClass = isCurrent && day===today ? 'current-day' : ''; grid.insertAdjacentHTML('beforeend',`<div class="calendar-cell ${currClass}"><div class="day-number">${day}</div><div class="day-status-badge status-${status}">${display}</div></div>`); }
}

function updateWeekendTable(){ const container = document.getElementById('weekendPlantaoContainer'); if(!container) return; container.innerHTML=''; let has=false; const monthObj = { year: window.selectedMonthObj.year, month: window.selectedMonthObj.month }; const total = new Date(monthObj.year, monthObj.month+1, 0).getDate(); for(let d=1; d<=total; d++){ const date = new Date(monthObj.year, monthObj.month, d); const dow = date.getDay(); if(dow===6 || dow===0){ const sat = dow===6? d : d-1; const sun = dow===0? d : d+1; if(dow===6 || (dow===0 && d===1)){ let satWorkers=[], sunWorkers=[]; Object.keys(window.scheduleData).forEach(name=>{ const emp=window.scheduleData[name]; if(!emp) return; if(emp.info.Grupo==='Operador Noc' || emp.info.Grupo==='Líder de Célula'){ if(sat>0 && sat<=total && emp.schedule[sat-1]==='T') satWorkers.push(name); if(sun>0 && sun<=total && emp.schedule[sun-1]==='T') sunWorkers.push(name); } }); const hasSat = satWorkers.length>0 && sat<=total; const hasSun = sunWorkers.length>0 && sun<=total; if(hasSat||hasSun){ has=true; const fmt = dd=>`${pad(dd)}/${pad(monthObj.month+1)}`; const badge = nm=>{ const emp=window.scheduleData[nm]; const isLeader = emp.info.Grupo==='Líder de Célula'; const cls = isLeader? 'bg-purple-100 text-purple-800 border-purple-300' : 'bg-blue-100 text-blue-800 border-blue-300'; return `<span class="text-sm font-semibold px-3 py-1 rounded-full border ${cls} shadow-sm">${nm}</span>`; };
                        const card = `
                        <div class="bg-white p-5 rounded-2xl shadow-xl border border-gray-200 flex flex-col min-h-full">
                            <div class="bg-indigo-700 text-white p-4 -m-5 mb-5 rounded-t-xl flex justify-center items-center">
                                <h3 class="text-white font-bold text-base"> Fim de Semana ${fmt(sat)} - ${fmt(sun)}</h3>
                            </div>
                            <div class="flex-1 flex flex-col justify-start space-y-6">
                                ${hasSat?`<div class="flex gap-4"><div class="w-1.5 bg-blue-500 rounded-full shrink-0"></div><div class="flex-1"><p class="text-xs font-bold text-blue-600 uppercase tracking-widest mb-3">Sábado (${fmt(sat)})</p><div class="flex flex-wrap gap-2">${satWorkers.map(badge).join('')||'<span class="text-gray-400 text-sm italic">Ninguém escalado</span>'}</div></div></div>`:''}
                                ${hasSun?`<div class="flex gap-4"><div class="w-1.5 bg-purple-500 rounded-full shrink-0"></div><div class="flex-1"><p class="text-xs font-bold text-purple-600 uppercase tracking-widest mb-3">Domingo (${fmt(sun)})</p><div class="flex flex-wrap gap-2">${sunWorkers.map(badge).join('')||'<span class="text-gray-400 text-sm italic">Ninguém escalado</span>'}</div></div></div>`:''}
                            </div>
                        </div>`;
                        container.insertAdjacentHTML('beforeend', card);
                    }
                }
            }
        }
    }
    if(!has) container.innerHTML = `<div class="md:col-span-2 lg:col-span-3 bg-white p-8 rounded-xl shadow-sm border border-gray-200 text-center"><p class="text-gray-500 text-lg">Nenhum Operador Noc escalado para fins de semana neste mês.</p></div>`;
}

// -----------------------------
// 9) Inicializadores de UI
// -----------------------------
function initTabs(){ const tabs = document.querySelectorAll('.tab-button:not(.turno-filter)'); const contents = document.querySelectorAll('.tab-content'); tabs.forEach(btn=>{ btn.addEventListener('click', ()=>{ tabs.forEach(b=>b.classList.remove('active')); btn.classList.add('active'); const target = btn.dataset.tab; contents.forEach(c=>{ if(c.id===`${target}View`) { c.classList.remove('hidden'); if(target==='personal') updateWeekendTable(); } else c.classList.add('hidden'); }); }); }); }

function initDailyView(){ const slider = document.getElementById('dateSlider'); if(slider){ slider.addEventListener('input', e=>{ currentDay = parseInt(e.target.value,10); updateDailyView(); }); }
    const ctx = document.getElementById('dailyChart'); if(ctx){ const c = ctx.getContext('2d'); dailyChart = new Chart(c, { type:'doughnut', data:{ datasets:[{ data:[0,0,0,0] }] }, options:{ responsive:true, maintainAspectRatio:false } }); }
}

// -----------------------------
// 10) Dropdowns (Ano + Mês) integrados com loadMonthlyJson
// -----------------------------
window.initYearMonthSelectors = function(years){
    // years: array of numbers (ex: [2024,2025,2026])
    const ySel = document.getElementById('yearSelect'); const mSel = document.getElementById('monthSelect');
    if(!ySel || !mSel) return;
    ySel.innerHTML=''; mSel.innerHTML='';
    (years||[systemYear]).forEach(y=>{ const o=document.createElement('option'); o.value=y; o.textContent=y; ySel.appendChild(o); });
    monthNames.forEach((m,i)=>{ const o=document.createElement('option'); o.value=i; o.textContent=m; mSel.appendChild(o); });

    // set defaults
    ySel.value = window.selectedMonthObj.year || systemYear;
    mSel.value = window.selectedMonthObj.month || systemMonth;

    async function handleChange(){
        const year = parseInt(ySel.value,10); const month = parseInt(mSel.value,10);
        window.selectedMonthObj = { year, month };
        const json = await window.loadMonthlyJson(year, month);
        window.rawSchedule = json || {};
        window.rebuildScheduleDataForSelectedMonth();
        initSelect(); updateDailyView(); updateWeekendTable();
        const headerDate = document.getElementById('headerDate'); if(headerDate) headerDate.textContent = `Mês de Referência: ${monthNames[month]} de ${year}`;
    }

    ySel.addEventListener('change', handleChange); mSel.addEventListener('change', handleChange);
    // trigger once
    handleChange();
};

// -----------------------------
// 11) Inicialização global (executa ao DOMContentLoaded)
// -----------------------------
window.initGlobalScheduleApp = function(options){
    // options: { years: [2024,2025,...], initialYear, initialMonth }
    const years = (options && options.years) || [systemYear, systemYear+1];
    window.selectedMonthObj = { year: (options && options.initialYear) || window.selectedMonthObj.year, month: (options && typeof options.initialMonth!=='undefined') ? options.initialMonth : window.selectedMonthObj.month };
    // expose employeeMetadata must be present (from escala-data.js)
    if(typeof window.employeeMetadata === 'undefined') console.warn('employeeMetadata não encontrada - assegure-se de carregar escala-data.js antes do app.js');

    // init selectors
    window.initYearMonthSelectors(years);

    // ui
    initTabs(); initDailyView();

    // ensure rebuild after load
    // rebuildScheduleDataForSelectedMonth() is called by selector change
};

// auto-run if DOM já pronto
if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', ()=>{ /* nothing automatic - waits for caller to call initGlobalScheduleApp */ });
} else {
    /* no auto init - caller (index.html) will call window.initGlobalScheduleApp */ }

// -----------------------------
// 12) Exports (funcs available globally for integration)
// -----------------------------
// window.loadMonthlyJson
// window.rebuildScheduleDataForSelectedMonth
// window.initYearMonthSelectors
// window.initGlobalScheduleApp
// window.initSelect
// window.updateDailyView
// window.updateWeekendTable

// Fim do app.js
