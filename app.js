// Este script depende das variáveis globais: employeeMetadata (de escala-data.js)
// Compatível com GitHub Pages: carrega JSONs de /data/escala-YYYY-MM.json

// ==========================================
// 1. CONFIGURAÇÃO DE DATA (MULTI-MÊS)
// ==========================================
const currentDateObj = new Date();
const monthNames = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

const systemYear = currentDateObj.getFullYear();
const systemMonth = currentDateObj.getMonth();
const systemDay = currentDateObj.getDate();

// Meses disponíveis (ajuste conforme necessário)
const availableMonths = [
    { year: 2025, month: 10 }, // Novembro 2025
    { year: 2025, month: 11 }, // Dezembro 2025
    { year: 2026, month: 0 }   // Janeiro 2026
];

let selectedMonthObj = availableMonths.find(m => m.year === systemYear && m.month === systemMonth) || availableMonths[0];
let currentDay = systemDay;

let scheduleData = {};
let rawSchedule = {}; // carregado do JSON por mês
const daysOfWeek = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];
const statusMap = { 'T':'Trabalhando','F':'Folga','FS':'Folga Sáb','FD':'Folga Dom','FE':'Férias','OFF-SHIFT':'Exp. Encerrado' };
let dailyChart = null;

// ==========================================
// 2. FUNÇÕES DE CARREGAMENTO DE JSON E PARSE
// ==========================================
async function loadMonthlyJson(year, month) {
    // month: 0-indexed
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

// Reuso das funções de geração (baseadas no formato Option A)
function pad(n){return n<10?'0'+n:''+n;}

function generate12x36Schedule(startWorkingDay, totalDays) {
    const schedule = [];
    for (let day=1; day<=totalDays; day++){
        const offset = day - startWorkingDay;
        schedule.push(offset>=0 && offset%2===0 ? 'T' : 'F');
    }
    return schedule;
}

function generate5x2ScheduleDefaultForMonth(monthObj) {
    const totalDays = new Date(monthObj.year, monthObj.month+1, 0).getDate();
    const schedule = [];
    for (let d=1; d<=totalDays; d++){
        const dow = new Date(monthObj.year, monthObj.month, d).getDay();
        schedule.push((dow===0||dow===6)?'F':'T');
    }
    return schedule;
}

// Parse de listas, ranges e datas (produz array de dias para o mês)
function parseDayListForMonth(dayString, monthObj) {
    if (!dayString) return [];
    const totalDays = new Date(monthObj.year, monthObj.month+1, 0).getDate();
    const days = new Set();
    const normalized = String(dayString).replace(/\b(at[eé]|até|a)\b/gi,' a ').replace(/–|—/g,'-').replace(/\s*-\s*/g,'-').replace(/\s+/g,' ').trim();
    const parts = normalized.split(',').map(p=>p.trim()).filter(p=>p.length>0);

    parts.forEach(part=>{
        // date range dd/mm a dd/mm
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
        // single date dd/mm
        const single = part.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
        if (single) {
            const d = parseInt(single[1],10);
            const m = parseInt(single[2],10)-1;
            if (m === monthObj.month) days.add(d);
            return;
        }
        // simple range 10-15
        const simple = part.match(/^(\d{1,2})-(\d{1,2})$/);
        if (simple) {
            const s = parseInt(simple[1],10), e = parseInt(simple[2],10);
            for (let x=s; x<=e; x++) if (x>=1 && x<=totalDays) days.add(x);
            return;
        }
        // single day number
        const number = part.match(/^(\d{1,2})$/);
        if (number) {
            const v = parseInt(number[1],10);
            if (v>=1 && v<=totalDays) days.add(v);
            return;
        }
        // keywords
        if (/fins? de semana/i.test(part) || /fim de semana/i.test(part)) {
            for (let d=1; d<=totalDays; d++){ const dow = new Date(monthObj.year, monthObj.month, d).getDay(); if (dow===0||dow===6) days.add(d); }
            return;
        }
        if (/segunda a sexta/i.test(part) || /segunda à sexta/i.test(part)) {
            for (let d=1; d<=totalDays; d++){ const dow = new Date(monthObj.year, monthObj.month, d).getDay(); if (dow>=1 && dow<=5) days.add(d); }
            return;
        }
    });

    return Array.from(days).sort((a,b)=>a-b);
}

// Build final schedule for a month from data (option A format)
function buildFinalScheduleForMonth(employeeData, monthObj) {
    const totalDays = new Date(monthObj.year, monthObj.month+1, 0).getDate();
    let schedule = new Array(totalDays).fill(null);

    const parseDaysOrSchedule = (s) => {
        if (!s) return [];
        if (typeof s === 'string' && (s.toLowerCase().includes('segunda a sexta') || s.toLowerCase().includes('segunda à sexta'))) return generate5x2ScheduleDefaultForMonth(monthObj);
        if (typeof s === 'string' && s.toLowerCase().includes('12x36')) {
            // guess start day if 'iniciado no dia X' present
            const m = s.match(/iniciado no dia\s*(\d{1,2})/i);
            const start = m ? parseInt(m[1],10) : 1;
            return generate12x36Schedule(start, totalDays);
        }
        // if already array of 'T'/'F' strings (full schedule)
        if (Array.isArray(s) && s.length === totalDays && typeof s[0] === 'string') return s;
        // if array of numbers or string lists -> parse with parseDayListForMonth
        if (Array.isArray(s)) {
            // assume numbers array -> set T on those days
            const arr = new Array(totalDays).fill(null);
            s.forEach(d => { if (d>=1 && d<=totalDays) arr[d-1] = 'T'; });
            for (let i=0;i<totalDays;i++) if (!arr[i]) arr[i] = 'F';
            return arr;
        }
        return parseDayListForMonth(s, monthObj);
    };

    // 1. vacations FE (priority)
    const vac = parseDayListForMonth(employeeData.FE, monthObj);
    vac.forEach(d => { if (d>=1 && d<=totalDays) schedule[d-1] = 'FE'; });

    // 2. fixed schedule
    let isFixed = false;
    let fixed = [];
    const workingOrSchedule = parseDaysOrSchedule(employeeData.T);
    if (Array.isArray(workingOrSchedule) && workingOrSchedule.length === totalDays && typeof workingOrSchedule[0] === 'string') {
        fixed = workingOrSchedule; isFixed = true;
    } else if (employeeData.F && typeof employeeData.F === 'string' && employeeData.F.toLowerCase().includes('fins de semana')) {
        fixed = generate5x2ScheduleDefaultForMonth(monthObj); isFixed = true;
    }

    if (isFixed) {
        schedule = fixed.map((s,i) => schedule[i] === 'FE' ? 'FE' : s);
    } else {
        if (Array.isArray(workingOrSchedule)) {
            workingOrSchedule.forEach(d => { if (d>=1 && d<=totalDays && schedule[d-1] === null) schedule[d-1] = 'T'; });
        }
    }

    // FD and FS and F
    parseDayListForMonth(employeeData.FD, monthObj).forEach(d => { if (schedule[d-1] !== 'FE') schedule[d-1] = 'FD'; });
    parseDayListForMonth(employeeData.FS, monthObj).forEach(d => { if (schedule[d-1] !== 'FE' && schedule[d-1] !== 'FD') schedule[d-1] = 'FS'; });
    if (!isFixed) {
        parseDayListForMonth(employeeData.F, monthObj).forEach(d => { if (schedule[d-1] !== 'FE' && schedule[d-1] !== 'FD' && schedule[d-1] !== 'FS') schedule[d-1] = 'F'; });
    }

    // fill rest with T
    for (let i=0;i<totalDays;i++) if (!schedule[i]) schedule[i] = 'T';
    return schedule;
}

// rebuild scheduleData for selected month
function rebuildScheduleDataForSelectedMonth() {
    const monthObj = { year: selectedMonthObj.year, month: selectedMonthObj.month };
    const totalDays = new Date(monthObj.year, monthObj.month+1, 0).getDate();

    scheduleData = {};
    Object.keys(employeeMetadata).forEach(name => {
        const data = rawSchedule && rawSchedule[name] ? rawSchedule[name] : { T: 'segunda a sexta', F: 'fins de semana', FS: '', FD: '', FE: '' };
        scheduleData[name] = { info: employeeMetadata[name], schedule: buildFinalScheduleForMonth(data, monthObj) };
    });

    // slider adjustments
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
// 3. VISUALIZAÇÃO (mantive as funções fornecidas)
// ==========================================
function isWorkingTime(timeRange) {
    if (!timeRange || timeRange.includes('12x36')) return true;
    const now = new Date();
    const currentMinutes = now.getHours()*60 + now.getMinutes();
    const match = timeRange.match(/(\\d{1,2}):(\\d{2})\\s*às\\s*(\\d{1,2}):(\\d{2})/);
    if (!match) return false;
    const [, startH, startM, endH, endM] = match.map(Number);
    const startTotal = startH*60 + startM;
    const endTotal = endH*60 + endM;
    if (startTotal > endTotal) return currentMinutes >= startTotal || currentMinutes <= endTotal;
    return currentMinutes >= startTotal && currentMinutes <= endTotal;
}

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
        dailyChart.update(); return;
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
        const status = employee.schedule[currentDay-1];
        let kpiStatus = status;
        let displayStatus = status;
        if (kpiStatus === 'FE') { vacationCount++; displayStatus = 'FE'; }
        else if (isToday && kpiStatus === 'T') {
            const isWorking = isWorkingTime(employee.info.Horário);
            if (!isWorking) { offShiftCount++; displayStatus='OFF-SHIFT'; kpiStatus = 'F_EFFECTIVE'; }
            else { workingCount++; }
        } else if (kpiStatus === 'T') { workingCount++; }
        else if (['F','FS','FD'].includes(kpiStatus)) { offCount++; }

        const itemHtml = `
            <li class="flex justify-between items-center text-sm p-3 rounded hover:bg-indigo-50 border-b border-gray-100 last:border-0 transition-colors">
                <div class="flex flex-col">
                    <span class="font-semibold text-gray-700">${name}</span>
                    <span class="text-xs text-gray-400">${employee.info.Horário}</span>
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

function initSelect() {
    const select = document.getElementById('employeeSelect');
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
            infoCard.classList.remove('opacity-100'); infoCard.classList.add('opacity-0');
            setTimeout(()=>{ infoCard.classList.add('hidden'); calendarContainer.classList.add('hidden'); }, 300);
        }
    });
}

function updatePersonalView(employeeName) {
    const employee = scheduleData[employeeName];
    const infoCard = document.getElementById('personalInfoCard');
    const calendarContainer = document.getElementById('calendarContainer');
    const isLeader = employee.info.Grupo === "Líder de Célula";
    const bgColor = isLeader ? 'bg-purple-700' : 'bg-indigo-600';
    const mainColor = isLeader ? 'text-purple-300' : 'text-indigo-300';
    const turnoDisplay = employee.info.Turno;
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
                <p class="font-bold text-sm">${employee.info.Célula}</p>
            </div>
            <div class="md:col-span-1">
                <p class="text-xs font-medium ${mainColor}">Horário</p>
                <p class="font-bold text-sm">${employee.info.Horário}</p>
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
    const grid = document.getElementById('calendarGrid'); grid.innerHTML = '';
    const monthObj = { year: selectedMonthObj.year, month: selectedMonthObj.month };
    const firstDay = new Date(monthObj.year, monthObj.month, 1).getDay();
    for (let i=0;i<firstDay;i++) grid.insertAdjacentHTML('beforeend','<div class="calendar-cell bg-gray-50 border-gray-100"></div>');
    const todayDay = systemDay;
    const isCurrentMonth = (systemMonth === monthObj.month && systemYear === monthObj.year);
    for (let i=0;i<schedule.length;i++){
        const dayNumber = i+1; const status = schedule[i]; const displayStatus = statusMap[status] || status;
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

function updateWeekendTable() {
    const container = document.getElementById('weekendPlantaoContainer'); container.innerHTML = '';
    let hasResults = false;
    const monthObj = { year: selectedMonthObj.year, month: selectedMonthObj.month };
    const totalDays = new Date(monthObj.year, monthObj.month+1, 0).getDate();
    for (let day=1; day<=totalDays; day++){
        const date = new Date(monthObj.year, monthObj.month, day);
        const dow = date.getDay();
        if (dow===6 || dow===0) {
            const satDay = dow===6 ? day : (day-1);
            const sunDay = dow===0 ? day : (day+1);
            if (dow===6 || (dow===0 && day===1)) {
                let satWorkers = [], sunWorkers = [];
                Object.keys(scheduleData).forEach(name=>{
                    const emp = scheduleData[name];
                    if (emp.info.Grupo === "Operador Noc" || emp.info.Grupo === "Líder de Célula") {
                        if (satDay>0 && satDay<=totalDays && emp.schedule[satDay-1] === 'T') satWorkers.push(name);
                        if (sunDay>0 && sunDay<=totalDays && emp.schedule[sunDay-1] === 'T') sunWorkers.push(name);
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
    }
    if (!hasResults) container.innerHTML = `<div class="md:col-span-2 lg:col-span-3 bg-white p-8 rounded-xl shadow-sm border border-gray-200 text-center"><p class="text-gray-500 text-lg">Nenhum Operador Noc escalado para fins de semana neste mês.</p></div>`;
}

function initTabs() {
    const tabButtons = document.querySelectorAll('.tab-button:not(.turno-filter)');
    const tabContents = document.querySelectorAll('.tab-content');
    tabButtons.forEach(button=>{ button.addEventListener('click', ()=>{
        tabButtons.forEach(btn=>btn.classList.remove('active')); button.classList.add('active');
        const target = button.dataset.tab;
        tabContents.forEach(content=>{ if (content.id === `${target}View`) { content.classList.remove('hidden'); if (target==='personal') updateWeekendTable(); } else content.classList.add('hidden'); });
    });});
}

function initDailyView() {
    const slider = document.getElementById('dateSlider');
    slider.addEventListener('input', e=>{ currentDay = parseInt(e.target.value,10); updateDailyView(); });
    const ctx = document.getElementById('dailyChart').getContext('2d');
    dailyChart = new Chart(ctx, { type:'doughnut', data:{ datasets:[{ data:[0,0,0,0] }] }, options:{ responsive:true, maintainAspectRatio:false } });
}

// ==========================================
// 4. MÊS SELECT (DROPDOWN) E INICIALIZAÇÃO GLOBAL
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

function initGlobal() {
    // load monthly JSON for initial month, then initialize everything
    loadMonthlyJson(selectedMonthObj.year, selectedMonthObj.month).then(json=>{
        rawSchedule = json || {};
        initMonthSelect();
        rebuildScheduleDataForSelectedMonth();
        document.getElementById('headerDate').textContent = `Mês de Referência: ${monthNames[selectedMonthObj.month]} de ${selectedMonthObj.year}`;
        const monthObj = { year: selectedMonthObj.year, month: selectedMonthObj.month };
        const totalDays = new Date(monthObj.year, monthObj.month+1, 0).getDate();
        const slider = document.getElementById('dateSlider'); slider.max = totalDays;
        const sliderMaxLabel = document.getElementById('sliderMaxLabel'); if (sliderMaxLabel) sliderMaxLabel.textContent = `Dia ${totalDays}`;
        initTabs(); initSelect(); initDailyView();
        currentDay = Math.min(systemDay, totalDays);
        document.getElementById('dateSlider').value = currentDay;
        updateDailyView();
        scheduleMidnightUpdate();
        updateWeekendTable();
    });
}

function scheduleMidnightUpdate() {
    const now = new Date(); const midnight = new Date(now); midnight.setHours(24,0,0,0);
    const timeToMidnight = midnight.getTime() - now.getTime();
    setTimeout(()=>{ updateDailyView(); setInterval(updateDailyView, 24*60*60*1000); }, timeToMidnight+1000);
}

document.addEventListener('DOMContentLoaded', initGlobal);
