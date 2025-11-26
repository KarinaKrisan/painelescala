// app.js - Versão D (com Gráfico KPI centralizado)
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
const statusMap = { 'T':'Trabalhando','F':'Folga','FS':'Folga Sáb','FD':'Folga Dom','FE':'Férias','OFF-SHIFT':'Exp. Encerrado' };

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

function generate12x36Schedule(startWorkingDay, totalDays) {
    const schedule = new Array(totalDays).fill('F');
    for (let d = startWorkingDay; d <= totalDays; d += 2) schedule[d-1] = 'T';
    return schedule;
}

function generate5x2ScheduleDefaultForMonth(monthObj) {
    const totalDays = new Date(monthObj.year, monthObj.month+1, 0).getDate();
    const arr = [];
    for (let d=1; d<=totalDays; d++){
        const dow = new Date(monthObj.year, monthObj.month, d).getDay();
        arr.push((dow===0||dow===6) ? 'F' : 'T');
    }
    return arr;
}

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
        const dateRange = part.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s*(?:a|-)\s*(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
        if (dateRange) {
            let [, sD, sM, sY, eD, eM, eY] = dateRange;
            sD = parseInt(sD,10); sM = parseInt(sM,10)-1; eD = parseInt(eD,10); eM = parseInt(eM,10)-1;
            let sYear = sY ? parseInt(sY,10) : monthObj.year;
            let eYear = eY ? parseInt(eY,10) : monthObj.year;

            // FIX (Solicitação 4): Tratar o "wrap-around" de ano (ex: 18/12 a 01/01) quando o ano não é especificado.
            // Se o ano final não foi especificado e o mês final é menor que o inicial, assume-se o próximo ano.
            if (!sY && !eY && sM > eM) {
                eYear = sYear + 1;
            }

            const start = new Date(sYear, sM, sD);
            const end = new Date(eYear, eM, eD);
            for (let dt = new Date(start); dt <= end; dt.setDate(dt.getDate()+1)){
                if (dt.getFullYear() === monthObj.year && dt.getMonth() === monthObj.month) days.add(dt.getDate());
            }
            return;
        }

        const single = part.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
        if (single) {
            const d = parseInt(single[1],10);
            const m = parseInt(single[2],10)-1;
            if (m === monthObj.month) days.add(d);
            return;
        }

        const simple = part.match(/^(\d{1,2})-(\d{1,2})$/);
        if (simple) {
            const s = parseInt(simple[1],10), e = parseInt(simple[2],10);
            for (let x=s; x<=e; x++) if (x>=1 && x<=totalDays) days.add(x);
            return;
        }

        const number = part.match(/^(\d{1,2})$/);
        if (number) {
            const v = parseInt(number[1],10);
            if (v>=1 && v<=totalDays) days.add(v);
            return;
        }

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
    const totalDays = new Date(monthObj.year, monthObj.month+1, 0).getDate();
    const schedule = new Array(totalDays).fill(null);

    const parseTtoArray = (t) => {
        if (!t) return [];
        if (Array.isArray(t) && t.length === totalDays && typeof t[0] === 'string') return t;
        if (typeof t === 'string' && /12x36/i.test(t)) {
            const m = t.match(/iniciado no dia\s*(\d{1,2})/i);
            const start = m ? parseInt(m[1],10) : 1;
            return generate12x36Schedule(start, totalDays);
        }
        if (typeof t === 'string' && /segunda a sexta|segunda à sexta/i.test(t)) {
            return generate5x2ScheduleDefaultForMonth(monthObj);
        }
        if (typeof t === 'string') {
            const parsedDays = parseDayListForMonth(t, monthObj);
            if (parsedDays.length > 0) {
                const arr = new Array(totalDays).fill('F');
                parsedDays.forEach(d=> { if (d>=1 && d<=totalDays) arr[d-1] = 'T'; });
                return arr;
            }
        }
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
    const tIsHorarioString = typeof employeeData.T === 'string' && employeeData.T.trim().length > 0 && !/segunda a sexta|12x36|fins? de semana/i.test(employeeData.T.toLowerCase());
    for (let i=0;i<totalDays;i++){
        if (!schedule[i]) {
            if (tIsHorarioString) schedule[i] = 'T';
            else schedule[i] = 'T'; // default
        }
    }

    return schedule;
}

// ==========================================
// HORÁRIO: parsing e verificação de "agora"
// ==========================================
function parseSingleTimeRange(rangeStr) {
    if (!rangeStr || typeof rangeStr !== 'string') return null;
    const m = rangeStr.match(/(\d{1,2}):(\d{2})\s*às\s*(\d{1,2}):(\d{2})/);
    if (!m) return null;
    const startH = parseInt(m[1],10), startM = parseInt(m[2],10);
    const endH = parseInt(m[3],10), endM = parseInt(m[4],10);
    return { startTotal: startH*60 + startM, endTotal: endH*60 + endM };
}

function isWorkingTime(timeRange) {
    if (!timeRange) return true;
    if (typeof timeRange === 'string' && /12x36/i.test(timeRange)) return true;
    const now = new Date();
    const currentMinutes = now.getHours()*60 + now.getMinutes();

    if (Array.isArray(timeRange)) {
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
        scheduleData[name] = { info: employeeMetadata[name], schedule: buildFinalScheduleForMonth(data, monthObj) };
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
// VISUALIZAÇÃO / CHART (ATUALIZADA PARA PORCENTAGEM)
// ==========================================

function updateDailyChart(working, off, offShift, vacation) {
    const total = working + off + offShift + vacation;
    const dataPoints = [working, off, offShift, vacation];

    // Helper function to format labels with percentages (Solicitação 1)
    const formatLabel = (count, label) => {
        if (total === 0) return `${label} (0.0%)`;
        const percent = ((count / total) * 100).toFixed(1);
        return `${label} (${percent}%)`;
    };

    const chartTitleElement = document.getElementById('chartTitle');
    if (chartTitleElement) {
        chartTitleElement.textContent = "Capacidade Operacional Atual";
    }

    const labels = [
        formatLabel(working, 'Trabalhando'),
        formatLabel(off, 'Folga Programada'),
        formatLabel(offShift, 'Expediente Encerrado'),
        formatLabel(vacation, 'Férias')
    ];

    // Cores: Verde (Trabalhando), Âmbar (Folga), Fúcsia (Exp. Enc.), Vermelho (Férias) (Solicitação 2)
    // Cores mais vivas e contrastadas:
    const colors = ['#059669','#F59E0B','#D946EF','#DC2626'];

    const filteredData = [], filteredLabels = [], filteredColors = [];
    dataPoints.forEach((d,i)=>{
        // Mostrar zero count apenas se o total for 0, ou para manter o layout de 4 cores se o total for > 0
        if (d>0 || total===0){
            filteredData.push(d);
            filteredLabels.push(labels[i]);
            filteredColors.push(colors[i]);
        }
    });

    // Se o gráfico já existe, apenas atualiza os dados
    if (dailyChart) {
        dailyChart.data.datasets[0].data = filteredData;
        dailyChart.data.datasets[0].backgroundColor = filteredColors;
        dailyChart.data.labels = filteredLabels;
        dailyChart.update();
        return;
    }

    // Configuração inicial (com o novo plugin)
    const data = {
        labels: filteredLabels,
        datasets:[{
            data: filteredData,
            backgroundColor: filteredColors,
            hoverOffset:4
        }]
    };

    const config = {
        type: 'doughnut',
        data,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '65%',
            animation: {
                animateRotate: true,
                duration: 900
            },
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        padding: 15,
                        font: { size: 13 }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.parsed !== null) {
                                const value = context.parsed;
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const percentage = ((value / total) * 100).toFixed(1) + '%';
                                label += `${value} (${percentage})`;
                            }
                            return label;
                        }
                    }
                }
            }
        }
    };

    const ctx = document.getElementById('dailyChart').getContext('2d');
    dailyChart = new Chart(ctx, config);
}

// ==========================================
// UPDATE VIEW / MAIN LOGIC
// ==========================================

function formatDate(day) {
    const month = monthNames[selectedMonthObj.month];
    return `${pad(day)}/${month.substring(0, 3)}`;
}

function updateDailyView() {
    // ...
    const date = new Date(selectedMonthObj.year, selectedMonthObj.month, currentDay);
    const dayName = daysOfWeek[date.getDay()];
    document.getElementById('currentDateLabel').textContent = `${dayName}, ${currentDay} de ${monthNames[selectedMonthObj.month]}`;

    let workingCount = 0;
    let offCount = 0;
    let vacationCount = 0;
    let offShiftCount = 0;

    let workingHtml = '';
    let offHtml = '';
    let vacationHtml = '';
    let offShiftHtml = '';

    Object.keys(scheduleData).forEach(name => {
        const employee = scheduleData[name];
        const daySchedule = employee.schedule[currentDay-1];
        let kpiStatus = daySchedule;
        let displayStatus = daySchedule;
        const horarioRaw = employee.info.Horário || employee.info.Horario;

        // Tenta inferir se o expediente T está fora do horário (só se for dia de T)
        if (kpiStatus === 'T') {
            const isWorking = isWorkingTime(horarioRaw);
            if (!isWorking) {
                offShiftCount++;
                displayStatus = 'OFF-SHIFT';
                kpiStatus = 'F_EFFECTIVE'; // For KPI logic, outside working time is effectively 'Off'
            } else {
                workingCount++;
            }
        } else if (kpiStatus === 'T') {
            workingCount++;
        } else if (['F','FS','FD'].includes(kpiStatus)) {
            offCount++;
        } else if (kpiStatus === 'FE') { // AQUI CONTA AS FÉRIAS
            vacationCount++;
        }
        
        const itemHtml = `
            <li class="flex justify-between items-center text-sm p-3 rounded hover:bg-indigo-50 border-b border-gray-100 last:border-0 transition-colors">
                <div class="flex flex-col">
                    <span class="font-semibold text-gray-700">${name}</span>
                    <span class="text-xs text-gray-400">${employee.info.Horário || employee.info.Horario || ''}</span>
                </div>
                <span class="day-status status-${displayStatus}">
                    ${statusMap[displayStatus] || displayStatus}
                </span>
            </li>
        `;
        
        if (kpiStatus === 'T') workingHtml += itemHtml;
        else if (kpiStatus === 'F_EFFECTIVE') offShiftHtml += itemHtml;
        else if (['F','FS','FD'].includes(kpiStatus)) offHtml += itemHtml;
        else if (kpiStatus === 'FE') vacationHtml += itemHtml;
    });

    // Update KPI counters
    kpiWorking.textContent = workingCount;
    kpiOffShift.textContent = offShiftCount;
    kpiOff.textContent = offCount;
    kpiVacation.textContent = vacationCount;

    // Update lists
    listWorking.innerHTML = workingHtml || '<li class="text-gray-400 text-sm text-center py-4">Ninguém em expediente no momento.</li>';
    listOffShift.innerHTML = offShiftHtml || '<li class="text-gray-400 text-sm text-center py-4">Ninguém fora de expediente no horário comercial.</li>';
    listOff.innerHTML = offHtml || '<li class="text-gray-400 text-sm text-center py-4">Ninguém de folga programada.</li>';
    listVacation.innerHTML = vacationHtml || '<li class="text-gray-400 text-sm text-center py-4">Ninguém de férias.</li>';

    // Update chart (now with percentages logic inside)
    updateDailyChart(workingCount, offCount, offShiftCount, vacationCount);
    
    // Update KPI card colors (using Tailwind classes in index.html, not in JS)
    
}


// ==========================================
// VISUALIZAÇÃO CALENDÁRIO / INDIVIDUAL
// ==========================================

function updatePersonalView(employeeName) {
    // ... (no changes here)
}

function renderCalendar(employee) {
    // ... (no changes here)
}

// ==========================================
// TABELA DE PLANTÃO DE FIM DE SEMANA
// ==========================================
function updateWeekendTable() {
    // ... (no changes here)
}


// ==========================================
// TABS E INICIALIZAÇÃO DO DAILY VIEW
// ==========================================
function initTabs() {
    // ... (no changes here)
}

function initSelect() {
    // ... (no changes here)
}

function initDailyView() {
    // ... (no changes here)
}

function scheduleMidnightUpdate() {
    // ... (no changes here)
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

    // re-render calendar on resize when personal view opened
    window.addEventListener('resize', () => {
        const select = document.getElementById('employeeSelect');
        if (select && select.value) {
            updatePersonalView(select.value);
        }
    });
}

document.addEventListener('DOMContentLoaded', initGlobal);
