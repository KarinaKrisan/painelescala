// app.js - Versão Final Corrigida
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

    // Cores mais vivas e contrastadas (Solicitação 2):
    const colors = ['#059669','#F59E0B','#D946EF','#DC2626'];

    const filteredData = [], filteredLabels = [], filteredColors = [];
    dataPoints.forEach((d,i)=>{
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
// UPDATE VIEW / MAIN LOGIC (CORRIGIDO)
// ==========================================

function formatDate(day) {
    const month = monthNames[selectedMonthObj.month];
    return `${pad(day)}/${month.substring(0, 3)}`;
}

function updateDailyView() {
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
        let displayStatus = daySchedule;
        const horarioRaw = employee.info.Horário || employee.info.Horario;

        // 1. Tenta inferir se o expediente T está fora do horário
        if (daySchedule === 'T') {
            const isWorking = isWorkingTime(horarioRaw);
            if (!isWorking) {
                displayStatus = 'OFF-SHIFT';
                offShiftCount++;
            } else {
                workingCount++;
            }
        } else if (daySchedule === 'FE') {
            vacationCount++;
        } else if (['F','FS','FD'].includes(daySchedule)) {
            offCount++;
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
        
        if (displayStatus === 'T') workingHtml += itemHtml;
        else if (displayStatus === 'OFF-SHIFT') offShiftHtml += itemHtml;
        else if (['F','FS','FD'].includes(displayStatus)) offHtml += itemHtml;
        else if (displayStatus === 'FE') vacationHtml += itemHtml;
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
    // Busca a seção de conteúdo.
    const container = document.getElementById('personalViewContainer');
    if (!container) return;

    // Se nenhum nome é fornecido, esconde a seção ou mostra um placeholder.
    if (!employeeName) {
        container.innerHTML = '<p class="text-center text-gray-500 py-10">Selecione um colaborador para ver a escala individual.</p>';
        return;
    }

    const employee = scheduleData[employeeName];
    if (!employee) {
        container.innerHTML = `<p class="text-center text-red-500 py-10">Dados de escala não encontrados para ${employeeName}.</p>`;
        return;
    }

    // Cria o cabeçalho
    const headerHtml = `
        <div class="mb-6 border-b pb-4">
            <h3 class="text-2xl font-bold text-gray-800">${employeeName}</h3>
            <p class="text-sm text-gray-500">
                ${employee.info.Grupo} (${employee.info.Célula || 'N/A'}) | Horário Padrão: ${employee.info.Horário || 'N/A'}
            </p>
        </div>
    `;

    // Renderiza o calendário (o container real do grid)
    const calendarHtml = renderCalendar(employee);

    container.innerHTML = headerHtml + calendarHtml;

    // Adiciona o listener para rolagem horizontal (só no mobile/small screen)
    const scrollContainer = document.getElementById('calendarScrollContainer');
    if (scrollContainer && window.innerWidth < 768) {
        const currentDayCell = scrollContainer.querySelector('.current-day');
        if (currentDayCell) {
            currentDayCell.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }
}

function renderCalendar(employee) {
    const totalDays = employee.schedule.length;
    let calendarHtml = '';

    // Cabeçalho da Semana (visível no desktop)
    const weekHeaderHtml = daysOfWeek.map(d => 
        `<div class="text-center font-semibold text-xs py-2 bg-gray-200 text-gray-700">${d}</div>`
    ).join('');

    // Preenchimento do primeiro dia para alinhar (desktop)
    const firstDayDate = new Date(selectedMonthObj.year, selectedMonthObj.month, 1);
    const offset = firstDayDate.getDay(); // 0 (Domingo) a 6 (Sábado)

    let dayCells = new Array(offset).fill(
        '<div class="calendar-cell bg-gray-50"></div>'
    ).join('');

    // Células de Dias
    for (let day=1; day<=totalDays; day++) {
        const status = employee.schedule[day-1];
        const isCurrentDay = (selectedMonthObj.year === systemYear && selectedMonthObj.month === systemMonth && day === systemDay);
        
        dayCells += `
            <div class="calendar-cell ${isCurrentDay ? 'current-day' : ''}">
                <span class="day-number">${day}</span>
                <span class="day-status-badge status-${status}">${statusMap[status] || status}</span>
            </div>
        `;
    }

    // Estrutura final com cabeçalho e células
    return `
        <div class="hidden md:grid calendar-grid-container">
            ${weekHeaderHtml}
            ${dayCells}
        </div>
        
        <div id="calendarScrollContainer" class="md:hidden overflow-x-scroll whitespace-nowrap py-3 -mx-4 px-4 bg-white border-y border-gray-200 shadow-inner">
            ${employee.schedule.map((status, index) => {
                const day = index + 1;
                const date = new Date(selectedMonthObj.year, selectedMonthObj.month, day);
                const dayName = daysOfWeek[date.getDay()];
                const isCurrentDay = (selectedMonthObj.year === systemYear && selectedMonthObj.month === systemMonth && day === systemDay);
                
                return `
                    <div class="inline-block w-40 p-3 mx-1 bg-white border border-gray-200 rounded-lg shadow-sm ${isCurrentDay ? 'current-day' : ''}">
                        <div class="font-semibold text-sm mb-1">${dayName}, ${day}</div>
                        <span class="day-status-badge status-${status}">${statusMap[status] || status}</span>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

// ==========================================
// TABELA DE PLANTÃO DE FIM DE SEMANA
// ==========================================
function updateWeekendTable() {
    const container = document.getElementById('weekendPlantaoContainer');
    if (!container) return;
    
    // Obter o primeiro dia do mês
    const firstDayDate = new Date(selectedMonthObj.year, selectedMonthObj.month, 1);
    const totalDays = new Date(selectedMonthObj.year, selectedMonthObj.month + 1, 0).getDate();
    
    let weekendData = {};
    
    // Agrupar colaboradores por dia de fim de semana
    Object.keys(scheduleData).forEach(name => {
        const schedule = scheduleData[name].schedule;
        
        for (let day = 1; day <= totalDays; day++) {
            const date = new Date(selectedMonthObj.year, selectedMonthObj.month, day);
            const dow = date.getDay(); // 0=Dom, 6=Sáb
            const status = schedule[day - 1];
            
            if (dow === 0 || dow === 6) { // Fim de semana
                const dayKey = day;
                
                if (status === 'T') {
                    if (!weekendData[dayKey]) weekendData[dayKey] = { date: formatDate(day), saturday: dow === 6, employees: [] };
                    weekendData[dayKey].employees.push({ name: name, status: status, colorClass: 'status-T' });
                }
            }
        }
    });

    // Ordenar os dias
    const sortedDays = Object.keys(weekendData).sort((a,b)=>parseInt(a,10)-parseInt(b,10));
    
    let tableHtml = '';
    
    // Criar os cartões de Plantão (agrupados por fim de semana)
    let currentWeekend = null;
    let weekendCards = [];

    sortedDays.forEach(dayKey => {
        const dayData = weekendData[dayKey];
        const day = parseInt(dayKey, 10);
        const isSaturday = dayData.saturday;

        if (isSaturday) {
            // Inicia um novo fim de semana
            currentWeekend = { 
                startDay: day, 
                saturdayData: dayData, 
                sundayData: null 
            };
            weekendCards.push(currentWeekend);
        } else if (currentWeekend && day === currentWeekend.startDay + 1) {
            // Adiciona o domingo ao fim de semana atual
            currentWeekend.sundayData = dayData;
            currentWeekend = null; // Fim do agrupamento
        } else {
            // Se for um domingo que não segue um sábado, trata como um fim de semana de um dia
            currentWeekend = { startDay: day, saturdayData: null, sundayData: dayData };
            weekendCards.push(currentWeekend);
            currentWeekend = null;
        }
    });


    // Geração do HTML dos cartões
    weekendCards.forEach(wk => {
        const sat = wk.saturdayData;
        const sun = wk.sundayData;

        // Se tiver apenas um dia (por exemplo, mês começa/termina no meio do fim de semana)
        const title = (sat && sun) 
            ? `Plantão: ${sat.date} e ${sun.date}` 
            : (sat ? `Plantão: ${sat.date} (Sáb)` : `Plantão: ${sun.date} (Dom)`);
            
        const satEmployees = sat ? sat.employees.map(e => `
            <li class="flex justify-between items-center text-sm mb-1">
                <span class="font-medium text-gray-700">${e.name}</span>
                <span class="day-status-badge ${e.colorClass}">${statusMap[e.status]}</span>
            </li>
        `).join('') : '<li class="text-gray-400 text-sm text-center py-2">Ninguém escalado.</li>';

        const sunEmployees = sun ? sun.employees.map(e => `
            <li class="flex justify-between items-center text-sm mb-1">
                <span class="font-medium text-gray-700">${e.name}</span>
                <span class="day-status-badge ${e.colorClass}">${statusMap[e.status]}</span>
            </li>
        `).join('') : '<li class="text-gray-400 text-sm text-center py-2">Ninguém escalado.</li>';
        
        tableHtml += `
            <div class="bg-white p-6 rounded-xl shadow-lg border border-gray-200">
                <h4 class="text-lg font-bold text-indigo-700 mb-4">${title}</h4>
                
                ${sat ? `
                <div class="mb-4 pb-4 border-b border-gray-100">
                    <h5 class="font-semibold text-gray-700 mb-2">${sat.date} - Sábado</h5>
                    <ul class="space-y-1">
                        ${satEmployees}
                    </ul>
                </div>
                ` : ''}

                ${sun ? `
                <div>
                    <h5 class="font-semibold text-gray-700 mb-2">${sun.date} - Domingo</h5>
                    <ul class="space-y-1">
                        ${sunEmployees}
                    </ul>
                </div>
                ` : ''}
            </div>
        `;
    });

    container.innerHTML = tableHtml || '<p class="text-center text-gray-500 py-10">Não há fins de semana para o mês selecionado ou os dados de escala estão incompletos.</p>';
}


// ==========================================
// TABS E INICIALIZAÇÃO DO DAILY VIEW
// ==========================================
function initTabs() {
    const tabButtons = document.querySelectorAll('.tab-button');
    const sections = document.querySelectorAll('.content-section');

    const switchTab = (tabName) => {
        tabButtons.forEach(btn => {
            btn.classList.remove('active', 'border-indigo-600', 'bg-indigo-50', 'text-indigo-700', 'font-bold');
            btn.classList.add('border-transparent', 'hover:bg-gray-50', 'font-medium');
            if (btn.getAttribute('data-tab') === tabName) {
                btn.classList.add('active', 'bg-indigo-50', 'text-indigo-700', 'font-bold');
                btn.classList.remove('border-transparent', 'hover:bg-gray-50', 'font-medium');
            }
        });

        sections.forEach(section => {
            section.classList.add('hidden');
            if (section.id === `${tabName}View`) {
                section.classList.remove('hidden');
            }
        });

        if (tabName === 'daily') {
            updateDailyView();
        } else if (tabName === 'weekend') {
            updateWeekendTable();
        } else if (tabName === 'personal') {
            const select = document.getElementById('employeeSelect');
            updatePersonalView(select.value);
        }
    };

    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            switchTab(btn.getAttribute('data-tab'));
        });
    });

    switchTab('daily'); // Inicia na aba diária
}

function initSelect() {
    const select = document.getElementById('employeeSelect');
    if (!select) return;

    // Popula o select com os nomes dos colaboradores (ordenados)
    const names = Object.keys(employeeMetadata).sort();
    
    // Adiciona a opção padrão (vazia)
    select.innerHTML = '<option value="">-- Selecione um Colaborador --</option>';

    names.forEach(name => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        select.appendChild(option);
    });

    // Adiciona o listener para atualizar a visualização individual
    select.addEventListener('change', (e) => {
        updatePersonalView(e.target.value);
    });
}

function initMonthSelect() {
    const select = document.getElementById('monthSelect');
    if (!select) return;

    select.innerHTML = '';
    availableMonths.forEach((m, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = `${monthNames[m.month]} de ${m.year}`;
        if (m.year === selectedMonthObj.year && m.month === selectedMonthObj.month) {
            option.selected = true;
        }
        select.appendChild(option);
    });

    select.addEventListener('change', async (e) => {
        const index = parseInt(e.target.value, 10);
        selectedMonthObj = availableMonths[index];
        
        // Recarrega os dados do mês e atualiza a view
        const json = await loadMonthlyJson(selectedMonthObj.year, selectedMonthObj.month);
        rawSchedule = json || {};
        
        rebuildScheduleDataForSelectedMonth();
        document.getElementById('headerDate').textContent = `Mês de Referência: ${monthNames[selectedMonthObj.month]} de ${selectedMonthObj.year}`;
        
        // Se a aba pessoal estiver ativa, precisa re-renderizar
        const activeTab = document.querySelector('.tab-button.active').getAttribute('data-tab');
        if (activeTab === 'personal') {
            const employeeName = document.getElementById('employeeSelect').value;
            updatePersonalView(employeeName);
        }
        
        // Atualiza a visualização diária e de fim de semana
        updateDailyView();
        updateWeekendTable();
    });
}

function initDailyView() {
    const slider = document.getElementById('dateSlider');
    if (slider) {
        slider.addEventListener('input', (e) => {
            currentDay = parseInt(e.target.value, 10);
            updateDailyView();
        });
    }
}

function scheduleMidnightUpdate() {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setDate(now.getDate() + 1);
    midnight.setHours(0, 0, 0, 0);

    const timeToMidnight = midnight.getTime() - now.getTime();

    setTimeout(() => { 
        updateDailyView(); 
        setInterval(updateDailyView, 24*60*60*1000); 
    }, timeToMidnight + 1000);
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
