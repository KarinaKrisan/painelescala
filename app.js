// app.js - Versão C (completa, otimizada, suporte múltiplos horários e 12x36)
// Depende de: employeeMetadata (escala-data.js) e JSONs mensais em ./data/escala-YYYY-MM.json

// ==========================================
// CONFIGURAÇÕES INICIAIS / UTILITÁRIAS
// ==========================================
const currentDateObj = new Date();
const monthNames = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

const systemYear = currentDateObj.getFullYear();
const systemMonth = currentDateObj.getMonth();
const systemDay = currentDateObj.getDate();

// Ajuste de meses disponíveis (editar conforme necessário)
const availableMonths = [
    { year: 2025, month: 10 }, // Novembro 2025
    { year: 2025, month: 11 }, // Dezembro 2025
    { year: 2026, month: 0 }   // Janeiro 2026
];

let selectedMonthObj = availableMonths.find(m => m.year === systemYear && m.month === systemMonth) || availableMonths[0];
let currentDay = systemDay;

let rawSchedule = {};    // JSON carregado por mês (escala-YYYY-MM.json)
let scheduleData = {};   // Estrutura final: { nome: { info, schedule: ['T'|'F'|'FE'|'FS'|'FD'|'12x36' ...] } }
let dailyChart = null;

const daysOfWeek = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];
const statusMap = { 'T':'T','F':'Folga','FS':'Folga Sáb','FD':'Folga Dom','FE':'Férias','OFF-SHIFT':'Exp. Encerrado' };

// Helpers
function pad(n){ return n < 10 ? '0' + n : '' + n; }
function safeGet(obj, key, fallback='') { return obj && obj[key] !== undefined ? obj[key] : fallback; }

// ==========================================
// CARREGAMENTO JSON
// ==========================================
async function loadMonthlyJson(year, month) {
    const filePath = `./data/escala-${year}-${String(month+1).padStart(2,'0')}.json`;
    try {
        const resp = await fetch(filePath);
        if (!resp.ok) {
            console.warn('Arquivo de escala não encontrado:', filePath);
            return null;
        }
        const json = await resp.json();
        return json;
    } catch (err) {
        console.error('Erro ao carregar JSON:', err);
        return null;
    }
}

// ==========================================
// GERAÇÃO DE PADRÕES E PARSE DE DIAS
// ==========================================

// Gera 12x36 alternando dias (assume início no dia startWorkingDay)
function generate12x36Schedule(startWorkingDay, totalDays) {
    const schedule = new Array(totalDays).fill('F');
    for (let d = startWorkingDay; d <= totalDays; d += 2) schedule[d-1] = 'T';
    return schedule;
}

// Gera segunda-a-sexta por mês
function generate5x2ScheduleDefaultForMonth(monthObj) {
    const totalDays = new Date(monthObj.year, monthObj.month+1, 0).getDate();
    const arr = [];
    for (let d=1; d<=totalDays; d++){
        const dow = new Date(monthObj.year, monthObj.month, d).getDay();
        arr.push((dow===0||dow===6) ? 'F' : 'T');
    }
    return arr;
}

// Parse strings como "1,2,5-10,15/11 a 20/11, fins de semana, segunda a sexta"
function parseDayListForMonth(dayString, monthObj) {
    if (!dayString) return [];
    const totalDays = new Date(monthObj.year, monthObj.month+1, 0).getDate();
    const days = new Set();

    const normalized = String(dayString)
        .replace(/\b(at[eé]|até|a)\b/gi,' a ')
        .replace(/–|—/g,'-')
        .replace(/\s*-\s*/g,'-')
        .replace(/\s+/g,' ')
        .trim();

    const parts = normalized.split(',').map(p=>p.trim()).filter(p=>p.length>0);

    parts.forEach(part=>{
        // full date range dd/mm a dd/mm or dd/mm/yyyy - dd/mm/yyyy
        const dateRange = part.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s*(?:a|-)\s*(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
        if (dateRange) {
            let [, sD, sM, sY, eD, eM, eY] = dateRange;
            sD = parseInt(sD,10); sM = parseInt(sM,10)-1; eD = parseInt(eD,10); eM = parseInt(eM,10)-1;
            const sYear = sY ? parseInt(sY,10) : monthObj.year;
            const eYear = eY ? parseInt(eY,10) : monthObj.year;
            const start = new Date(sYear, sM, sD);
            const end = new Date(eYear, eM, eD);
            for (let dt = new Date(start); dt <= end; dt.setDate(dt.getDate()+1)){
                if (dt.getFullYear() === monthObj.year && dt.getMonth() === monthObj.month) days.add(dt.getDate());
            }
            return;
        }

        // single dd/mm
        const single = part.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
        if (single) {
            const d = parseInt(single[1],10);
            const m = parseInt(single[2],10)-1;
            if (m === monthObj.month) days.add(d);
            return;
        }

        // simple numeric range 10-15
        const simple = part.match(/^(\d{1,2})-(\d{1,2})$/);
        if (simple) {
            const s = parseInt(simple[1],10), e = parseInt(simple[2],10);
            for (let x=s; x<=e; x++) if (x>=1 && x<=totalDays) days.add(x);
            return;
        }

        // single number
        const number = part.match(/^(\d{1,2})$/);
        if (number) {
            const v = parseInt(number[1],10);
            if (v>=1 && v<=totalDays) days.add(v);
            return;
        }

        // keywords
        if (/fins? de semana|fim de semana/i.test(part)) {
            for (let d=1; d<=totalDays; d++){ const dow = new Date(monthObj.year, monthObj.month, d).getDay(); if (dow===0||dow===6) days.add(d); }
            return;
        }
        if (/segunda a sexta|segunda à sexta/i.test(part)) {
            for (let d=1; d<=totalDays; d++){ const dow = new Date(monthObj.year, monthObj.month, d).getDay(); if (dow>=1 && dow<=5) days.add(d); }
            return;
        }
    });

    return Array.from(days).sort((a,b)=>a-b);
}

// ==========================================
// BUILD FINAL SCHEDULE (UNIFICA FORMAS)
// ==========================================
function buildFinalScheduleForMonth(employeeData, monthObj) {
    // employeeData : object do JSON mensal para esse nome
    // monthObj : {year, month}
    const totalDays = new Date(monthObj.year, monthObj.month+1, 0).getDate();
    const schedule = new Array(totalDays).fill(null);

    // Helper: interpreta T (string, array, pattern)
    const parseTtoArray = (t) => {
        if (!t) return [];
        // If already an array like ['T','F',...'] assume full schedule
        if (Array.isArray(t) && t.length === totalDays && typeof t[0] === 'string') return t;
        // If string contains '12x36', generate 12x36 pattern (try to detect start day)
        if (typeof t === 'string' && /12x36/i.test(t)) {
            const m = t.match(/iniciado no dia\s*(\d{1,2})/i);
            const start = m ? parseInt(m[1],10) : 1;
            return generate12x36Schedule(start, totalDays);
        }
        // If string says 'segunda a sexta' or 'fins de semana' -> generate 5x2 pattern
        if (typeof t === 'string' && /segunda a sexta|segunda à sexta/i.test(t)) {
            return generate5x2ScheduleDefaultForMonth(monthObj);
        }
        // If string looks like list of days -> parseDayListForMonth returns array of day numbers
        if (typeof t === 'string') {
            const parsedDays = parseDayListForMonth(t, monthObj);
            if (parsedDays.length > 0) {
                const arr = new Array(totalDays).fill('F');
                parsedDays.forEach(d=> { if (d>=1 && d<=totalDays) arr[d-1] = 'T'; });
                return arr;
            }
            // else if contains something else (like a single horario string), fallback to full T (we'll treat T filling later)
        }
        // If array of numbers
        if (Array.isArray(t) && t.length && typeof t[0] === 'number') {
            const arr = new Array(totalDays).fill('F');
            t.forEach(d => { if (d>=1 && d<=totalDays) arr[d-1] = 'T'; });
            return arr;
        }
        return []; // empty => no fixed T pattern
    };

    // 1) Mark vacations FE (priority)
    const vacDays = parseDayListForMonth(employeeData.FE, monthObj);
    vacDays.forEach(d => { if (d>=1 && d<=totalDays) schedule[d-1] = 'FE'; });

    // 2) Try fixed schedule
    const tParsed = parseTtoArray(employeeData.T);
    const isFixedFullSchedule = Array.isArray(tParsed) && tParsed.length === totalDays && typeof tParsed[0] === 'string';

    if (isFixedFullSchedule) {
        for (let i=0;i<totalDays;i++){
            if (schedule[i] === 'FE') continue;
            schedule[i] = tParsed[i] || 'F';
        }
    } else {
        // put explicit T days if parsed
        if (Array.isArray(tParsed) && tParsed.length === totalDays) {
            for (let i=0;i<totalDays;i++) {
                if (schedule[i] === 'FE') continue;
                if (tParsed[i] === 'T') schedule[i] = 'T';
            }
        } else if (Array.isArray(tParsed) && tParsed.length > 0 && typeof tParsed[0] === 'number') {
            tParsed.forEach(d => { if (d>=1 && d<=totalDays && schedule[d-1] !== 'FE') schedule[d-1] = 'T'; });
        }
    }

    // 3) FD, FS overrides
    parseDayListForMonth(employeeData.FD, monthObj).forEach(d => { if (d>=1 && d<=totalDays && schedule[d-1] !== 'FE') schedule[d-1] = 'FD'; });
    parseDayListForMonth(employeeData.FS, monthObj).forEach(d => { if (d>=1 && d<=totalDays && schedule[d-1] !== 'FE' && schedule[d-1] !== 'FD') schedule[d-1] = 'FS'; });

    // 4) F (folgas)
    parseDayListForMonth(employeeData.F, monthObj).forEach(d => { if (d>=1 && d<=totalDays && !['FE','FD','FS'].includes(schedule[d-1])) schedule[d-1] = 'F'; });

    // 5) Finally, fill blanks:
    // If employeeData.T is a horario (e.g. "07:00 às 19:00"), treat blank as T (work every non-FE day)
    const tIsHorarioString = typeof employeeData.T === 'string' && employeeData.T.trim().length > 0 && !/segunda a sexta|12x36|fins? de semana/i.test(employeeData.T.toLowerCase());
    for (let i=0;i<totalDays;i++){
        if (!schedule[i]) {
            if (tIsHorarioString) schedule[i] = 'T';
            else schedule[i] = 'T'; // default: working unless specifically listed as F; keeps previous behaviour
        }
    }

    return schedule;
}

// ==========================================
// HORÁRIO: parsing e verificação de "agora"
// aceitamos Horário como string "07:00 às 19:00" ou array ["07:00 às 19:00", ...]
// ==========================================
function parseSingleTimeRange(rangeStr) {
    // aceitáveis: "7:00 às 19:00", "07:00 às 19:00", "19:00 às 07:00"
    if (!rangeStr || typeof rangeStr !== 'string') return null;
    // Regex correto (sem escape duplo)
    const m = rangeStr.match(/(\d{1,2}):(\d{2})\s*às\s*(\d{1,2}):(\d{2})/);
    if (!m) return null;
    // Note: m[1]..m[4] são strings
    const startH = parseInt(m[1],10), startM = parseInt(m[2],10);
    const endH = parseInt(m[3],10), endM = parseInt(m[4],10);
    return { startTotal: startH*60 + startM, endTotal: endH*60 + endM };
}

function isWorkingTime(timeRange) {
    // timeRange pode ser: string ("07:00 às 19:00"), array de strings, null, ou "12x36"
    if (!timeRange) return true; // se sem horário, consideramos disponível (compat.)
    if (typeof timeRange === 'string' && /12x36/i.test(timeRange)) return true;
    const now = new Date();
    const currentMinutes = now.getHours()*60 + now.getMinutes();

    if (Array.isArray(timeRange)) {
        // se qualquer período incluir o horário atual -> working
        for (const r of timeRange) {
            const parsed = parseSingleTimeRange(r);
            if (!parsed) continue;
            const { startTotal, endTotal } = parsed;
            if (startTotal > endTotal) {
                if (currentMinutes >= startTotal || currentMinutes <= endTotal) return true;
            } else {
                if (currentMinutes >= startTotal && currentMinutes <= endTotal) return true;
            }
        }
        return false;
    } else if (typeof timeRange === 'string') {
        const parsed = parseSingleTimeRange(timeRange);
        if (!parsed) return false;
        const { startTotal, endTotal } = parsed;
        if (startTotal > endTotal) {
            // vira após meia-noite
            return currentMinutes >= startTotal || currentMinutes <= endTotal;
        }
        return currentMinutes >= startTotal && currentMinutes <= endTotal;
    }
    return false;
}

// ==========================================
// REBUILD scheduleData a partir de employeeMetadata e rawSchedule do mês
// ==========================================
function rebuildScheduleDataForSelectedMonth() {
    const monthObj = { year: selectedMonthObj.year, month: selectedMonthObj.month };
    const totalDays = new Date(monthObj.year, monthObj.month+1, 0).getDate();

    scheduleData = {};
    Object.keys(employeeMetadata).forEach(name => {
        const data = rawSchedule && rawSchedule[name] ? rawSchedule[name] : { T: employeeMetadata[name].Horário || 'segunda a sexta', F: 'fins de semana', FS: '', FD: '', FE: '' };
        scheduleData[name] = {
            info: employeeMetadata[name],
            schedule: buildFinalScheduleForMonth(data, monthObj)
        };
    });

    // Ajusta slider
    const slider = document.getElementById('dateSlider');
    if (slider) {
        slider.max = totalDays;
        const sliderMaxLabel = document.getElementById('sliderMaxLabel');
        if (sliderMaxLabel) sliderMaxLabel.textContent = `Dia ${totalDays}`;
        if (currentDay > totalDays) currentDay = totalDays;
        slider.value = currentDay;
    }
}

// ==========================================
// VISUALIZAÇÃO / CHART
// ==========================================
function updateChart(working, off, offShift, vacation) {
    const total = working + off + offShift + vacation;
    const dataPoints = [working, off, offShift, vacation];
    const labels = [
        `Trabalhando (${working})`,
        `Folga Programada (${off})`,
        `Expediente Encerrado (${offShift})`,
        `Férias (${vacation})`
    ];
    const colors = ['#10b981','#fcd34d','#6366f1','#ef4444'];
    const filteredData = [], filteredLabels = [], filteredColors = [];
    dataPoints.forEach((d,i)=>{ if (d>0 || total===0){ filteredData.push(d); filteredLabels.push(labels[i]); filteredColors.push(colors[i]); }});
    if (dailyChart) {
        dailyChart.data.datasets[0].data = filteredData;
        dailyChart.data.datasets[0].backgroundColor = filteredColors;
        dailyChart.data.labels = filteredLabels;
        dailyChart.update();
        return;
    }
    const data = { labels: filteredLabels, datasets:[{ data: filteredData, backgroundColor: filteredColors, hoverOffset:4 }]};
    const config = { type:'doughnut', data, options: { responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:'bottom' } } } };
    const ctx = document.getElementById('dailyChart').getContext('2d');
    dailyChart = new Chart(ctx, config);
}

function updateDailyView() {
    const currentDateLabel = document.getElementById('currentDateLabel');
    const monthObj = { year: selectedMonthObj.year, month: selectedMonthObj.month };
    const dayOfWeekIndex = new Date(monthObj.year, monthObj.month, currentDay).getDay();
    const now = new Date();
    const isToday = (now.getDate() === currentDay && now.getMonth() === systemMonth && now.getFullYear() === systemYear);
    const dayString = currentDay < 10 ? '0'+currentDay : currentDay;
    currentDateLabel.textContent = `${daysOfWeek[dayOfWeekIndex]}, ${dayString}/${pad(monthObj.month+1)}/${monthObj.year}`;

    let workingCount=0, offCount=0, vacationCount=0, offShiftCount=0;
    let workingHtml='', offHtml='', vacationHtml='', offShiftHtml='';

    const kpiWorking = document.getElementById('kpiWorking');
    const kpiOffShift = document.getElementById('kpiOffShift');
    const kpiOff = document.getElementById('kpiOff');
    const kpiVacation = document.getElementById('kpiVacation');
    const listWorking = document.getElementById('listWorking');
    const listOffShift = document.getElementById('listOffShift');
    const listOff = document.getElementById('listOff');
    const listVacation = document.getElementById('listVacation');

    Object.keys(scheduleData).forEach(name=>{
        const employee = scheduleData[name];
        const status = employee.schedule[currentDay-1]; // 'T','F','FE','FD','FS', etc.
        let kpiStatus = status;
        let displayStatus = status;

        if (kpiStatus === 'FE') {
            vacationCount++; displayStatus = 'FE';
        } else if (isToday && kpiStatus === 'T') {
            // precisa checar Horário efetivo (employee.info.Horário) - pode ser "07:00 às 19:00" ou array
            const horarioRaw = employee.info.Horário || employee.info.Horario || '';
            const isWorking = isWorkingTime(horarioRaw);
            if (!isWorking) { offShiftCount++; displayStatus = 'OFF-SHIFT'; kpiStatus = 'F_EFFECTIVE'; }
            else { workingCount++; }
        } else if (kpiStatus === 'T') {
            workingCount++;
        } else if (['F','FS','FD'].includes(kpiStatus)) {
            offCount++;
        }

        const itemHtml = `
            <li class="flex justify-between items-center text-sm p-3 rounded hover:bg-indigo-50 border-b border-gray-100 last:border-0 transition-colors">
                <div class="flex flex-col">
                    <span class="font-semibold text-gray-700">${name}</span>
                    <span class="text-xs text-gray-400">${employee.info.Horário || employee.info.Horario || ''}</span>
                </div>
                <span class="font-bold text-xs px-2 py-1 rounded day-status status-${displayStatus}">
                    ${statusMap[displayStatus] || displayStatus}
                </span>
            </li>
        `;

        if (kpiStatus === 'T') workingHtml += itemHtml;
        else if (kpiStatus === 'F_EFFECTIVE') offShiftHtml += itemHtml;
        else if (['F','FS','FD'].includes(kpiStatus)) offHtml += itemHtml;
        else if (kpiStatus === 'FE') vacationHtml += itemHtml;
    });

    kpiWorking.textContent = workingCount;
    kpiOffShift.textContent = offShiftCount;
    kpiOff.textContent = offCount;
    kpiVacation.textContent = vacationCount;

    listWorking.innerHTML = workingHtml || '<li class="text-gray-400 text-sm text-center py-4">Ninguém em expediente no momento.</li>';
    listOffShift.innerHTML = offShiftHtml || '<li class="text-gray-400 text-sm text-center py-4">Ninguém fora de expediente no momento.</li>';
    listOff.innerHTML = offHtml || '<li class="text-gray-400 text-sm text-center py-4">Nenhuma folga programada.</li>';
    listVacation.innerHTML = vacationHtml || '<li class="text-gray-400 text-sm text-center py-4">Ninguém de férias.</li>';

    updateChart(workingCount, offCount, offShiftCount, vacationCount);
}

// ==========================================
// VIEWS PESSOAL E CALENDÁRIO
// ==========================================
function initSelect() {
    const select = document.getElementById('employeeSelect');
    if (!select) return;
    select.innerHTML = '<option value="">Selecione seu nome</option>';
    Object.keys(scheduleData).sort().forEach(name=>{
        const opt = document.createElement('option'); opt.value = name; opt.textContent = name; select.appendChild(opt);
    });
    select.addEventListener('change', e=>{
        const employeeName = e.target.value;
        const infoCard = document.getElementById('personalInfoCard');
        const calendarContainer = document.getElementById('calendarContainer');
        if (employeeName) updatePersonalView(employeeName);
        else {
            if (infoCard) {
                infoCard.classList.remove('opacity-100'); infoCard.classList.add('opacity-0');
                setTimeout(()=>{ infoCard.classList.add('hidden'); if (calendarContainer) calendarContainer.classList.add('hidden'); }, 300);
            }
        }
    });
}

function updatePersonalView(employeeName) {
    const employee = scheduleData[employeeName];
    if (!employee) return;
    const infoCard = document.getElementById('personalInfoCard');
    const calendarContainer = document.getElementById('calendarContainer');
    const isLeader = employee.info.Grupo === "Líder de Célula";
    const bgColor = isLeader ? 'bg-purple-700' : 'bg-indigo-600';
    const mainColor = isLeader ? 'text-purple-300' : 'text-indigo-300';
    const turnoDisplay = employee.info.Turno || '';

    infoCard.className = `hidden ${bgColor} p-6 rounded-2xl mb-6 shadow-xl text-white flex flex-col sm:flex-row justify-between items-center transition-opacity duration-300 opacity-0`;
    infoCard.innerHTML = `
        <div class="flex items-center space-x-4 w-full mb-4 sm:mb-0 pb-4 sm:pb-0 border-b sm:border-b-0 sm:border-r border-white/20">
            <svg class="h-10 w-10 ${mainColor} flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                ${isLeader ? '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20v-2c0-.656-.126-1.283-.356-1.857M9 20l3-3m0 0l-3-3m3 3h6m-3 3v-2.5M10 9a2 2 0 012-2h4a2 2 0 012 2v4a2 2 0 01-2 2h-4a2 2 0 01-2-2v-4zm-9 3a2 2 0 012-2h4a2 2 0 012 2v4a2 2 0 01-2 2H3a2 2 0 01-2-2v-4z" />' : '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />'}
            </svg>
            <div class="flex-1 min-w-0">
                <p class="text-xl sm:text-2xl font-extrabold">${employeeName}</p>
                <p class="text-sm font-semibold">${employee.info.Grupo}</p>
            </div>
        </div>
        <div class="grid grid-cols-2 gap-4 w-full sm:w-auto mt-4 sm:mt-0 sm:pl-6">
            <div class="md:col-span-1">
                <p class="text-xs font-medium ${mainColor}">Célula</p>
                <p class="font-bold text-sm">${employee.info.Célula || '-'}</p>
            </div>
            <div class="md:col-span-1">
                <p class="text-xs font-medium ${mainColor}">Horário</p>
                <p class="font-bold text-sm">${employee.info.Horário || employee.info.Horario || '-'}</p>
            </div>
            <div class="md:col-span-1">
                <p class="text-xs font-medium ${mainColor}">Turno</p>
                <p class="font-bold text-sm">${turnoDisplay}</p>
            </div>
        </div>
    `;
    infoCard.classList.remove('hidden','opacity-0'); infoCard.classList.add('opacity-100');
    calendarContainer.classList.remove('hidden');
    updateCalendar(employee.schedule);
}

function updateCalendar(schedule) {
    const grid = document.getElementById('calendarGrid');
    if (!grid) return;
    grid.innerHTML = '';
    const monthObj = { year: selectedMonthObj.year, month: selectedMonthObj.month };
    const firstDay = new Date(monthObj.year, monthObj.month, 1).getDay();
    for (let i=0;i<firstDay;i++) grid.insertAdjacentHTML('beforeend','<div class="calendar-cell bg-gray-50 border-gray-100"></div>');
    const todayDay = systemDay;
    const isCurrentMonth = (systemMonth === monthObj.month && systemYear === monthObj.year);
    for (let i=0;i<schedule.length;i++){
        const dayNumber = i+1;
        const status = schedule[i];
        const displayStatus = statusMap[status] || status;
        const currentDayClass = isCurrentMonth && dayNumber === todayDay ? 'current-day' : '';
        const cellHtml = `
            <div class="calendar-cell ${currentDayClass}">
                <div class="day-number">${dayNumber}</div>
                <div class="day-status-badge status-${status}">${displayStatus}</div>
            </div>
        `;
        grid.insertAdjacentHTML('beforeend', cellHtml);
    }
}

// ==========================================
// TABELA DE PLANTÃO DE FIM DE SEMANA
// ==========================================
function updateWeekendTable() {
    const container = document.getElementById('weekendPlantaoContainer');
    if (!container) return;
    container.innerHTML = '';
    let hasResults = false;
    const monthObj = { year: selectedMonthObj.year, month: selectedMonthObj.month };
    const totalDays = new Date(monthObj.year, monthObj.month+1, 0).getDate();

    for (let day=1; day<=totalDays; day++){
        const date = new Date(monthObj.year, monthObj.month, day);
        const dow = date.getDay();
        if (dow === 6 || dow === 0) {
            // gather saturday & sunday workers around this weekend
            // find satDay and sunDay for the weekend card
            const isSaturday = dow === 6;
            const satDay = isSaturday ? day : (day - 1);
            const sunDay = isSaturday ? (day + 1) : day;

            // avoid duplicates: only create card when encountering Saturday OR when month starts on Sunday (day==1)
            if (!isSaturday && !(dow===0 && day===1)) continue;

            let satWorkers = [], sunWorkers = [];
            Object.keys(scheduleData).forEach(name=>{
                const emp = scheduleData[name];
                if (emp.info.Grupo === "Operador Noc" || emp.info.Grupo === "Líder de Célula") {
                    if (satDay > 0 && satDay <= totalDays && emp.schedule[satDay-1] === 'T') satWorkers.push(name);
                    if (sunDay > 0 && sunDay <= totalDays && emp.schedule[sunDay-1] === 'T') sunWorkers.push(name);
                }
            });

            const hasSat = satWorkers.length>0 && satDay<=totalDays;
            const hasSun = sunWorkers.length>0 && sunDay<=totalDays;
            if (hasSat || hasSun) {
                hasResults = true;
                const formatDate = d => `${pad(d)}/${pad(monthObj.month+1)}`;
                const formatBadge = name => {
                    const emp = scheduleData[name];
                    const isLeader = emp.info.Grupo === "Líder de Célula";
                    const badgeClass = isLeader ? 'bg-purple-100 text-purple-800 border-purple-300' : 'bg-blue-100 text-blue-800 border-blue-300';
                    return `<span class="text-sm font-semibold px-3 py-1 rounded-full border ${badgeClass} shadow-sm">${name}</span>`;
                };
                const cardHtml = `
                    <div class="bg-white p-5 rounded-2xl shadow-xl border border-gray-200 flex flex-col min-h-full">
                        <div class="bg-indigo-700 text-white p-4 -m-5 mb-5 rounded-t-xl flex justify-center items-center">
                            <h3 class="text-white font-bold text-base"> Fim de Semana ${formatDate(satDay)} - ${formatDate(sunDay)}</h3>
                        </div>
                        <div class="flex-1 flex flex-col justify-start space-y-6">
                            ${hasSat ? `<div class="flex gap-4"><div class="w-1.5 bg-blue-500 rounded-full shrink-0"></div><div class="flex-1"><p class="text-xs font-bold text-blue-600 uppercase tracking-widest mb-3">Sábado (${formatDate(satDay)})</p><div class="flex flex-wrap gap-2">${satWorkers.map(formatBadge).join('') || '<span class="text-gray-400 text-sm italic">Ninguém escalado</span>'}</div></div></div>` : ''}
                            ${hasSun ? `<div class="flex gap-4"><div class="w-1.5 bg-purple-500 rounded-full shrink-0"></div><div class="flex-1"><p class="text-xs font-bold text-purple-600 uppercase tracking-widest mb-3">Domingo (${formatDate(sunDay)})</p><div class="flex flex-wrap gap-2">${sunWorkers.map(formatBadge).join('') || '<span class="text-gray-400 text-sm italic">Ninguém escalado</span>'}</div></div></div>` : ''}
                        </div>
                    </div>
                `;
                container.insertAdjacentHTML('beforeend', cardHtml);
            }
        }
    }

    if (!hasResults) container.innerHTML = `<div class="md:col-span-2 lg:col-span-3 bg-white p-8 rounded-xl shadow-sm border border-gray-200 text-center"><p class="text-gray-500 text-lg">Nenhum Operador Noc escalado para fins de semana neste mês.</p></div>`;
}

// ==========================================
// TABS E INICIALIZAÇÃO DO DAILY VIEW
// ==========================================
function initTabs() {
    const tabButtons = document.querySelectorAll('.tab-button:not(.turno-filter)');
    const tabContents = document.querySelectorAll('.tab-content');
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            tabButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            const target = button.dataset.tab;
            tabContents.forEach(content => {
                if (content.id === `${target}View`) {
                    content.classList.remove('hidden');
                    if (target === 'personal') updateWeekendTable();
                } else {
                    content.classList.add('hidden');
                }
            });
        });
    });
}

function initDailyView() {
    const slider = document.getElementById('dateSlider');
    if (slider) slider.addEventListener('input', e => { currentDay = parseInt(e.target.value,10); updateDailyView(); });

    const ctx = document.getElementById('dailyChart').getContext('2d');
    dailyChart = new Chart(ctx, { type:'doughnut', data:{ datasets:[{ data:[0,0,0,0] }] }, options:{ responsive:true, maintainAspectRatio:false } });
}

// ==========================================
// MÊS SELECT / INICIALIZAÇÃO GLOBAL
// ==========================================
function initMonthSelect() {
    const select = document.createElement('select');
    select.id = 'monthSelect';
    select.className = 'appearance-none w-56 p-3 bg-indigo-50 border border-indigo-200 rounded-xl focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 text-gray-900 text-sm font-semibold transition-all shadow-lg';
    availableMonths.forEach(m => {
        const opt = document.createElement('option');
        opt.value = `${m.year}-${m.month}`;
        opt.textContent = `${monthNames[m.month]} / ${m.year}`;
        if (m.year === selectedMonthObj.year && m.month === selectedMonthObj.month) opt.selected = true;
        select.appendChild(opt);
    });
    const header = document.querySelector('header');
    const container = document.createElement('div'); container.className = 'mt-3'; container.appendChild(select); header.appendChild(container);

    select.addEventListener('change', (e) => {
        const [y, mo] = e.target.value.split('-').map(Number);
        selectedMonthObj = { year: y, month: mo };
        // load JSON for month and rebuild
        loadMonthlyJson(y, mo).then(json=>{
            rawSchedule = json || {};
            rebuildScheduleDataForSelectedMonth();
            initSelect();
            updateDailyView();
            updateWeekendTable();
            document.getElementById('headerDate').textContent = `Mês de Referência: ${monthNames[selectedMonthObj.month]} de ${selectedMonthObj.year}`;
        });
    });
}

function scheduleMidnightUpdate() {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24,0,0,0);
    const timeToMidnight = midnight.getTime() - now.getTime();
    setTimeout(()=>{ updateDailyView(); setInterval(updateDailyView, 24*60*60*1000); }, timeToMidnight+1000);
}

function initGlobal() {
    loadMonthlyJson(selectedMonthObj.year, selectedMonthObj.month).then(json=>{
        rawSchedule = json || {};
        initMonthSelect();
        rebuildScheduleDataForSelectedMonth();
        document.getElementById('headerDate').textContent = `Mês de Referência: ${monthNames[selectedMonthObj.month]} de ${selectedMonthObj.year}`;
        const monthObj = { year: selectedMonthObj.year, month: selectedMonthObj.month };
        const totalDays = new Date(monthObj.year, monthObj.month+1, 0).getDate();
        const slider = document.getElementById('dateSlider'); if (slider) slider.max = totalDays;
        const sliderMaxLabel = document.getElementById('sliderMaxLabel'); if (sliderMaxLabel) sliderMaxLabel.textContent = `Dia ${totalDays}`;
        initTabs(); initSelect(); initDailyView();
        currentDay = Math.min(systemDay, totalDays);
        const ds = document.getElementById('dateSlider'); if (ds) ds.value = currentDay;
        updateDailyView();
        scheduleMidnightUpdate();
        updateWeekendTable();
    });
}

document.addEventListener('DOMContentLoaded', initGlobal);

