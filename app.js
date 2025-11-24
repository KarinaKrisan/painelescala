// Este script depende das variáveis globais: rawDataFromEscala e employeeMetadata (de escala-data.js)

// ==========================================
// 1. CONFIGURAÇÃO DE DATA (MULTI-MÊS)
// ==========================================
const currentDateObj = new Date();
const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

// Variáveis do sistema
const systemYear = currentDateObj.getFullYear();
const systemMonth = currentDateObj.getMonth();
const systemDay = currentDateObj.getDate();

// Meses disponíveis na interface (Nov 2025, Dez 2025, Jan 2026)
const availableMonths = [
    { year: 2025, month: 10 }, // Novembro 2025 (index 10)
    { year: 2025, month: 11 }, // Dezembro 2025 (index 11)
    { year: 2026, month: 0 }   // Janeiro 2026 (index 0)
];

// Estado selecionado (inicialmente tenta systemMonth se estiver disponível, senão primeiro disponível)
let selectedMonthObj = availableMonths.find(m => m.year === systemYear && m.month === systemMonth) || availableMonths[0];
let currentDay = systemDay;

// scheduleData para o mês atual (reconstruído ao trocar mês)
let scheduleData = {};
let rawSchedule = {}; // resultado do parse inicial do texto bruto

// Mapa de status
const daysOfWeek = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const statusMap = { 'T': 'Trabalhando', 'F': 'Folga', 'FS': 'Folga Sáb', 'FD': 'Folga Dom', 'FE': 'Férias', 'OFF-SHIFT': 'Exp. Encerrado' };
let dailyChart = null;


// ==========================================
// 2. FUNÇÕES DE PARSE E GERAÇÃO DA ESCALA
// ==========================================

// Processa o texto bruto e extrai os blocos. Também corrige nomes com quebras estranhas (une linhas seguidas quando necessário).
function processRawSchedule(rawText) {
    const records = rawText.trim().split('*********************************');
    const processedData = {};

    records.forEach(record => {
        // Normaliza quebras de linha duplicadas e remove trailing markers
        const normalized = record.replace(/\r/g, '\n').replace(/\n{2,}/g, '\n').trim();
        const lines = normalized.split('\n').map(line => line.trim()).filter(line => line.length > 0);
        let name = '';
        const data = { T: '', F: '', FS: '', FD: '', FE: '' };
        let currentField = null;

        lines.forEach(line => {
            // Se a linha iniciar com "Nome do colaborador:" mas por alguma razão o nome estiver em duas linhas,
            // juntamos as próximas linhas até encontrar outro rótulo conhecido.
            if (line.startsWith('Nome do colaborador:')) {
                name = line.replace('Nome do colaborador:', '').trim();
                currentField = null;
            } else if (line.startsWith('Dias trabalhados:')) {
                data.T = line.replace('Dias trabalhados:', '').trim();
                currentField = 'T';
            } else if (line.startsWith('F:')) {
                if (line.includes('12x36') || line.toLowerCase().includes('12x36')) {
                    data.T = line.substring(line.indexOf('12x36'));
                    data.F = '';
                    currentField = 'T';
                } else {
                    data.F = line.replace('F:', '').trim();
                    currentField = 'F';
                }
            } else if (line.startsWith('FS:')) {
                data.FS = line.replace('FS:', '').trim();
                currentField = 'FS';
            } else if (line.startsWith('FD:')) {
                data.FD = line.replace('FD:', '').trim();
                currentField = 'FD';
            } else if (line.startsWith('FE:')) {
                data.FE = line.replace('FE:', '').trim();
                currentField = 'FE';
            } else if (currentField) {
                data[currentField] += ', ' + line;
            } else {
                // Se a linha não pertence a campo conhecido, pode ser continuação do nome (ex: "Patricia" newline "Oliveira")
                if (name && !data.T && !data.F && !data.FS && !data.FD && !data.FE) {
                    name = (name + ' ' + line).trim();
                }
            }
        });

        // limpeza final
        Object.keys(data).forEach(key => {
            data[key] = data[key].replace(/,\s*$/, '').replace(/^\s*,\s*/, '').trim();
        });

        if (name) {
            // Normaliza espaços repetidos no nome
            const cleanName = name.replace(/\s{2,}/g, ' ').trim();
            processedData[cleanName] = data;
        }
    });

    return processedData;
}

/**
 * Função que resolve strings contendo:
 * - listas de dias: "1,2,3"
 * - ranges simples: "10-15"
 * - ranges com datas: "03/11 a 03/12", "24/11 até 08/12", "03/11-03/12"
 * - datas únicas: "03/11" ou "3/11"
 *
 * Retorna um array de números representando os dias do mês 'monthObj' (monthObj = {year, month})
 */
function parseDayListForMonth(dayString, monthObj) {
    if (!dayString) return [];
    const totalDays = new Date(monthObj.year, monthObj.month + 1, 0).getDate();
    const days = new Set();

    // Normaliza conectores
    const normalized = dayString.replace(/\b(at[eé]|até|a)\b/gi, ' a ')
                                .replace(/–|—/g, '-')
                                .replace(/\s*-\s*/g, '-')
                                .replace(/\s+até\s+/gi, ' a ')
                                .replace(/\s+/g, ' ')
                                .trim();

    // Splita por vírgula, mas preserva ranges com barra
    const parts = normalized.split(',').map(p => p.trim()).filter(p => p.length > 0);

    parts.forEach(part => {
        // 1) Range de data com formato dd/mm [a|-] dd/mm  => 03/11 a 03/12
        const dateRange = part.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s*(?:a|-)\s*(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
        if (dateRange) {
            let [ , sDay, sMonth, sYear, eDay, eMonth, eYear ] = dateRange;
            sDay = parseInt(sDay, 10);
            sMonth = parseInt(sMonth, 10) - 1;
            eDay = parseInt(eDay, 10);
            eMonth = parseInt(eMonth, 10) - 1;

            // Assumir anos se não fornecidos: usar year do monthObj ou inferir sequência
            const sY = sYear ? parseInt(sYear,10) : (sMonth <= monthObj.month ? monthObj.year : monthObj.year - (sMonth > monthObj.month ? 1 : 0));
            const eY = eYear ? parseInt(eYear,10) : (eMonth >= monthObj.month ? monthObj.year : monthObj.year + (eMonth < monthObj.month ? 1 : 0));

            const startDate = new Date(sY, sMonth, sDay);
            const endDate = new Date(eY, eMonth, eDay);

            if (isNaN(startDate) || isNaN(endDate)) return;

            for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
                if (d.getFullYear() === monthObj.year && d.getMonth() === monthObj.month) {
                    days.add(d.getDate());
                }
            }
            return;
        }

        // 2) Data única no formato dd/mm
        const singleDate = part.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
        if (singleDate) {
            const day = parseInt(singleDate[1],10);
            const month = parseInt(singleDate[2],10) - 1;
            const year = singleDate[3] ? parseInt(singleDate[3],10) : (month <= monthObj.month ? monthObj.year : monthObj.year + (month < monthObj.month ? 1 : 0));
            if (year === monthObj.year && month === monthObj.month) {
                if (day >=1 && day <= totalDays) days.add(day);
            }
            return;
        }

        // 3) Range simples de números 10-15
        const simpleRange = part.match(/^(\d{1,2})-(\d{1,2})$/);
        if (simpleRange) {
            let start = parseInt(simpleRange[1],10);
            let end = parseInt(simpleRange[2],10);
            if (!isNaN(start) && !isNaN(end) && start <= end) {
                for (let d = start; d <= end; d++) {
                    if (d >=1 && d <= totalDays) days.add(d);
                }
            }
            return;
        }

        // 4) Dia isolado "5" ou " 05 "
        const dayOnly = part.match(/^(\d{1,2})$/);
        if (dayOnly) {
            const d = parseInt(dayOnly[1],10);
            if (d >=1 && d <= totalDays) days.add(d);
            return;
        }

        // 5) Caso especial: texto 'fins de semana' ou 'segunda a sexta'
        if (/fins de semana/i.test(part) || /fim de semana/i.test(part)) {
            // adicionar sáb/dom do mês
            for (let d = 1; d <= totalDays; d++) {
                const dow = new Date(monthObj.year, monthObj.month, d).getDay();
                if (dow === 0 || dow === 6) days.add(d);
            }
            return;
        }
        if (/segunda a sexta/i.test(part) || /segunda à sexta/i.test(part)) {
            for (let d = 1; d <= totalDays; d++) {
                const dow = new Date(monthObj.year, monthObj.month, d).getDay();
                if (dow >= 1 && dow <= 5) days.add(d);
            }
            return;
        }

        // 6) Caso não reconhecido: ignorar
    });

    return Array.from(days).sort((a,b) => a-b);
}


// Gera a 12x36 para qualquer mês (ajustada para considerar início)
function generate12x36Schedule(startWorkingDay, totalDays) {
    let schedule = [];
    for (let day = 1; day <= totalDays; day++) {
        const offset = day - startWorkingDay;
        schedule.push(offset >= 0 && offset % 2 === 0 ? "T" : "F");
    }
    return schedule;
}

// Gera 5x2 (segunda a sexta) para qualquer mês
function generate5x2ScheduleDefaultForMonth(monthObj) {
    const totalDays = new Date(monthObj.year, monthObj.month + 1, 0).getDate();
    let schedule = [];
    for (let day = 1; day <= totalDays; day++) {
        const dow = new Date(monthObj.year, monthObj.month, day).getDay();
        schedule.push((dow === 0 || dow === 6) ? "F" : "T");
    }
    return schedule;
}


// Constrói a escala final a partir dos dados de texto para um mês específico
function buildFinalScheduleForMonth(employeeData, monthObj) {
    const totalDays = new Date(monthObj.year, monthObj.month + 1, 0).getDate();
    let schedule = new Array(totalDays).fill(null);

    const parseDaysOrSchedule = (dayString) => {
        if (!dayString) return [];
        if (dayString.toLowerCase().includes('segunda a sexta') || dayString.toLowerCase().includes('segunda à sexta')) return generate5x2ScheduleDefaultForMonth(monthObj);
        if (dayString.toLowerCase().includes('12x36 iniciado no dia 1/11')) return generate12x36Schedule(1, totalDays);
        if (dayString.toLowerCase().includes('12x36 iniciado no dia 2/11')) return generate12x36Schedule(2, totalDays);
        // Se string parecer conter dias (números/datas), usar parseDayListForMonth
        return parseDayListForMonth(dayString, monthObj);
    };

    // 1. FÉRIAS - PRIORIDADE MÁXIMA
    const vacationDays = parseDayListForMonth(employeeData.FE, monthObj);
    vacationDays.forEach(day => {
        if (day >=1 && day <= totalDays) schedule[day - 1] = 'FE';
    });

    // 2. Escala fixa
    let isFixedSchedule = false;
    let fixedScheduleDays = [];

    const workingStatusOrDays = parseDaysOrSchedule(employeeData.T);
    if (Array.isArray(workingStatusOrDays) && workingStatusOrDays.length === totalDays && typeof workingStatusOrDays[0] === 'string') {
        fixedScheduleDays = workingStatusOrDays;
        isFixedSchedule = true;
    } else if (employeeData.F && employeeData.F.toLowerCase().includes('fins de semana')) {
        fixedScheduleDays = generate5x2ScheduleDefaultForMonth(monthObj);
        isFixedSchedule = true;
    }

    if (isFixedSchedule) {
        schedule = fixedScheduleDays.map((status, index) => schedule[index] === 'FE' ? 'FE' : status);
    } else {
        if (Array.isArray(workingStatusOrDays)) {
            workingStatusOrDays.forEach(day => {
                if (schedule[day - 1] === null) schedule[day - 1] = 'T';
            });
        }
    }

    // FD (Domingo)
    parseDayListForMonth(employeeData.FD, monthObj).forEach(day => {
        if (schedule[day - 1] !== 'FE') schedule[day - 1] = 'FD';
    });

    // FS (Sábado)
    parseDayListForMonth(employeeData.FS, monthObj).forEach(day => {
        if (schedule[day - 1] !== 'FE' && schedule[day - 1] !== 'FD') schedule[day - 1] = 'FS';
    });

    // F (Folga geral) - só se não for escala fixa
    if (!isFixedSchedule) {
        parseDayListForMonth(employeeData.F, monthObj).forEach(day => {
            if (schedule[day - 1] !== 'FE' && schedule[day - 1] !== 'FD' && schedule[day - 1] !== 'FS') {
                schedule[day - 1] = 'F';
            }
        });
    }

    // Preenche restantes com 'T'
    for (let i = 0; i < totalDays; i++) {
        if (schedule[i] === null) schedule[i] = 'T';
    }

    return schedule;
}


// Reconstrói scheduleData para o mês selecionado
function rebuildScheduleDataForSelectedMonth() {
    const monthObj = { year: selectedMonthObj.year, month: selectedMonthObj.month };
    const totalDays = new Date(monthObj.year, monthObj.month + 1, 0).getDate();

    scheduleData = {};
    Object.keys(employeeMetadata).forEach(name => {
        const data = rawSchedule[name] || { T: 'segunda a sexta', F: 'fins de semana', FS: '', FD: '', FE: '' };
        scheduleData[name] = {
            info: employeeMetadata[name],
            schedule: buildFinalScheduleForMonth(data, monthObj)
        };
    });

    // Ajusta slider max e currentDay se necessário
    const slider = document.getElementById('dateSlider');
    if (slider) {
        slider.max = totalDays;
        const sliderMaxLabel = document.getElementById('sliderMaxLabel');
        if (sliderMaxLabel) sliderMaxLabel.textContent = `Dia ${totalDays}`;
        // Ajusta currentDay se extrapolar o mês
        if (currentDay > totalDays) currentDay = totalDays;
        slider.value = currentDay;
    }
}


// ==========================================
// 3. LÓGICA DE VISUALIZAÇÃO E INTERAÇÃO (ATUALIZADA PARA MULTI-MÊS)
// ==========================================
function pad(number) {
    return number < 10 ? '0' + number : number;
}

function isWorkingTime(timeRange) {
    if (!timeRange || timeRange.includes('12x36')) return true;

    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const match = timeRange.match(/(\d{1,2}):(\d{2})\s*às\s*(\d{1,2}):(\d{2})/);

    if (!match) return false;

    const [, startH, startM, endH, endM] = match.map(Number);
    const startTotal = startH * 60 + startM;
    const endTotal = endH * 60 + endM;

    if (startTotal > endTotal) {
        return currentMinutes >= startTotal || currentMinutes <= endTotal;
    }
    return currentMinutes >= startTotal && currentMinutes <= endTotal;
}

function updateDailyView() {
    const currentDateLabel = document.getElementById('currentDateLabel');
    const monthObj = { year: selectedMonthObj.year, month: selectedMonthObj.month };
    const dayOfWeekIndex = new Date(monthObj.year, monthObj.month, currentDay).getDay();
    const now = new Date();
    const isToday = (now.getDate() === currentDay && now.getMonth() === systemMonth && now.getFullYear() === systemYear);
    const dayString = currentDay < 10 ? '0' + currentDay : currentDay;

    currentDateLabel.textContent = `${daysOfWeek[dayOfWeekIndex]}, ${dayString}/${pad(monthObj.month + 1)}/${monthObj.year}`;

    let workingCount = 0;
    let offCount = 0;
    let vacationCount = 0;
    let offShiftCount = 0;
    let workingHtml = '';
    let offHtml = '';
    let vacationHtml = '';
    let offShiftHtml = '';

    const kpiWorking = document.getElementById('kpiWorking');
    const kpiOffShift = document.getElementById('kpiOffShift');
    const kpiOff = document.getElementById('kpiOff');
    const kpiVacation = document.getElementById('kpiVacation');
    const listWorking = document.getElementById('listWorking');
    const listOffShift = document.getElementById('listOffShift');
    const listOff = document.getElementById('listOff');
    const listVacation = document.getElementById('listVacation');

    Object.keys(scheduleData).forEach(name => {
        const employee = scheduleData[name];
        const scheduleIndex = currentDay - 1;
        const status = employee.schedule[scheduleIndex];
        let kpiStatus = status;
        let displayStatus = status;

        if (kpiStatus === 'FE') {
            vacationCount++;
            displayStatus = 'FE';
        } else if (isToday && kpiStatus === 'T') {
            const isWorking = isWorkingTime(employee.info.Horário);
            if (!isWorking) {
                offShiftCount++;
                displayStatus = 'OFF-SHIFT';
                kpiStatus = 'F_EFFECTIVE';
            } else {
                workingCount++;
            }
        } else if (kpiStatus === 'T') {
            workingCount++;
        } else if (kpiStatus === 'F' || kpiStatus === 'FS' || kpiStatus === 'FD') {
            offCount++;
        }

        let itemHtml = `
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

        if (kpiStatus === 'T') {
            workingHtml += itemHtml;
        } else if (kpiStatus === 'F_EFFECTIVE') {
            offShiftHtml += itemHtml;
        } else if (kpiStatus === 'F' || kpiStatus === 'FS' || kpiStatus === 'FD') {
            offHtml += itemHtml;
        } else if (kpiStatus === 'FE') {
            vacationHtml += itemHtml;
        }
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

function updateChart(working, off, offShift, vacation) {
    const total = working + off + offShift + vacation;
    const dataPoints = [working, off, offShift, vacation];
    const labels = [
        `Trabalhando (${working})`,
        `Folga Programada (${off})`,
        `Expediente Encerrado (${offShift})`,
        `Férias (${vacation})`
    ];
    const colors = [
        '#10b981',
        '#fcd34d',
        '#6366f1',
        '#ef4444'
    ];

    const filteredData = [];
    const filteredLabels = [];
    const filteredColors = [];

    dataPoints.forEach((data, index) => {
        if (data > 0 || total === 0) {
            filteredData.push(data);
            filteredLabels.push(labels[index]);
            filteredColors.push(colors[index]);
        }
    });

    if (dailyChart) {
        dailyChart.data.datasets[0].data = filteredData;
        dailyChart.data.datasets[0].backgroundColor = filteredColors;
        dailyChart.data.labels = filteredLabels;
        dailyChart.update();
        return;
    }

    const data = {
        labels: filteredLabels,
        datasets: [{
            data: filteredData,
            backgroundColor: filteredColors,
            hoverOffset: 4
        }]
    };

    const config = {
        type: 'doughnut',
        data: data,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.label || '';
                            if (label) {
                                label = label.split('(')[0].trim();
                            }
                            if (context.parsed !== null) {
                                label += ': ' + context.parsed;
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

// Popula o select de nomes
function initSelect() {
    const select = document.getElementById('employeeSelect');
    select.innerHTML = '<option value="">Selecione seu nome</option>';
    Object.keys(scheduleData).sort().forEach(name => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        select.appendChild(option);
    });

    select.addEventListener('change', (e) => {
        const employeeName = e.target.value;
        const infoCard = document.getElementById('personalInfoCard');
        const calendarContainer = document.getElementById('calendarContainer');

        if (employeeName) {
            updatePersonalView(employeeName);
        } else {
            infoCard.classList.remove('opacity-100');
            infoCard.classList.add('opacity-0');
            setTimeout(() => {
                infoCard.classList.add('hidden');
                calendarContainer.classList.add('hidden');
            }, 300);
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
                ${isLeader ?
                    '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20v-2c0-.656-.126-1.283-.356-1.857M9 20l3-3m0 0l-3-3m3 3h6m-3 3v-2.5M10 9a2 2 0 012-2h4a2 2 0 012 2v4a2 2 0 01-2 2h-4a2 2 0 01-2-2v-4zm-9 3a2 2 0 012-2h4a2 2 0 012 2v4a2 2 0 01-2 2H3a2 2 0 01-2-2v-4z" />' :
                    '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />'
                }
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

    infoCard.classList.remove('hidden', 'opacity-0');
    infoCard.classList.add('opacity-100');

    calendarContainer.classList.remove('hidden');
    updateCalendar(employee.schedule);
}

function updateCalendar(schedule) {
    const grid = document.getElementById('calendarGrid');
    grid.innerHTML = '';

    const monthObj = { year: selectedMonthObj.year, month: selectedMonthObj.month };
    const firstDayOfMonth = new Date(monthObj.year, monthObj.month, 1).getDay();
    for (let i = 0; i < firstDayOfMonth; i++) {
        grid.insertAdjacentHTML('beforeend', '<div class="calendar-cell bg-gray-50 border-gray-100"></div>');
    }

    const todayDay = systemDay;
    const isCurrentMonth = (systemMonth === monthObj.month && systemYear === monthObj.year);

    for (let i = 0; i < schedule.length; i++) {
        const dayNumber = i + 1;
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

function updateWeekendTable() {
    const container = document.getElementById('weekendPlantaoContainer');
    container.innerHTML = '';
    let hasResults = false;

    const monthObj = { year: selectedMonthObj.year, month: selectedMonthObj.month };
    const totalDays = new Date(monthObj.year, monthObj.month + 1, 0).getDate();

    for (let day = 1; day <= totalDays; day++) {
        const date = new Date(monthObj.year, monthObj.month, day);
        const dayOfWeek = date.getDay();

        if (dayOfWeek === 6 || dayOfWeek === 0) {
            const satDay = dayOfWeek === 6 ? day : (day - 1);
            const sunDay = dayOfWeek === 0 ? day : (day + 1);

            if (dayOfWeek === 6 || (dayOfWeek === 0 && day === 1)) {
                let satWorkers = [];
                let sunWorkers = [];

                Object.keys(scheduleData).forEach(name => {
                    const employee = scheduleData[name];
                    if (employee.info.Grupo === "Operador Noc" || employee.info.Grupo === "Líder de Célula") {
                        if (satDay > 0 && satDay <= totalDays) {
                            if (employee.schedule[satDay - 1] === 'T') satWorkers.push(name);
                        }
                        if (sunDay > 0 && sunDay <= totalDays) {
                            if (employee.schedule[sunDay - 1] === 'T') sunWorkers.push(name);
                        }
                    }
                });

                const hasSaturday = satWorkers.length > 0 && satDay <= totalDays;
                const hasSunday = sunWorkers.length > 0 && sunDay <= totalDays;

                if (hasSaturday || hasSunday) {
                    hasResults = true;

                    const formatDate = (d) => `${pad(d)}/${pad(monthObj.month + 1)}`;

                    const formatBadge = (name) => {
                        const employee = scheduleData[name];
                        const isLeader = employee.info.Grupo === "Líder de Célula";
                        const badgeClass = isLeader ? 'bg-purple-100 text-purple-800 border-purple-300' : 'bg-blue-100 text-blue-800 border-blue-300';
                        return `<span class="text-sm font-semibold px-3 py-1 rounded-full border ${badgeClass} shadow-sm">${name}</span>`;
                    };
                    const formatSatBadge = (workers) => workers.map(formatBadge).join('');
                    const formatSunBadge = (workers) => workers.map(formatBadge).join('');

                    const cardHtml = `
                        <div class="bg-white p-5 rounded-2xl shadow-xl border border-gray-200 flex flex-col min-h-full">
                            <div class="bg-indigo-700 text-white p-4 -m-5 mb-5 rounded-t-xl flex justify-center items-center">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                                <h3 class="text-white font-bold text-base"> Fim de Semana ${formatDate(satDay)} - ${formatDate(sunDay)}
                                </h3>
                            </div>
                            <div class="flex-1 flex flex-col justify-start space-y-6">
                                ${hasSaturday ? `
                                    <div class="flex gap-4">
                                        <div class="w-1.5 bg-blue-500 rounded-full shrink-0"></div>
                                        <div class="flex-1">
                                            <p class="text-xs font-bold text-blue-600 uppercase tracking-widest mb-3">
                                                Sábado (${formatDate(satDay)})
                                            </p>
                                            <div class="flex flex-wrap gap-2">
                                                ${formatSatBadge(satWorkers) || '<span class="text-gray-400 text-sm italic">Ninguém escalado</span>'}
                                            </div>
                                        </div>
                                    </div>` : ''}
                                ${hasSunday ? `
                                    <div class="flex gap-4">
                                        <div class="w-1.5 bg-purple-500 rounded-full shrink-0"></div>
                                        <div class="flex-1">
                                            <p class="text-xs font-bold text-purple-600 uppercase tracking-widest mb-3">
                                                Domingo (${formatDate(sunDay)})
                                            </p>
                                            <div class="flex flex-wrap gap-2">
                                                ${formatSunBadge(sunWorkers) || '<span class="text-gray-400 text-sm italic">Ninguém escalado</span>'}
                                            </div>
                                        </div>
                                    </div>` : ''}
                            </div>
                        </div>
                    `;
                    container.insertAdjacentHTML('beforeend', cardHtml);
                }
            }
        }
    }

    if (!hasResults) {
        container.innerHTML = `<div class="md:col-span-2 lg:col-span-3 bg-white p-8 rounded-xl shadow-sm border border-gray-200 text-center"><p class="text-gray-500 text-lg">Nenhum Operador Noc escalado para fins de semana neste mês.</p></div>`;
    }
}


// Inicializa abas
function initTabs() {
    const tabButtons = document.querySelectorAll('.tab-button:not(.turno-filter)');
    const tabContents = document.querySelectorAll('.tab-content');

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            tabButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            const targetTab = button.dataset.tab;

            tabContents.forEach(content => {
                if (content.id === `${targetTab}View`) {
                    content.classList.remove('hidden');
                    if (targetTab === 'personal') {
                        updateWeekendTable();
                    }
                } else {
                    content.classList.add('hidden');
                }
            });
        });
    });
}

// Inicia visão diária (slider)
function initDailyView() {
    const slider = document.getElementById('dateSlider');
    slider.addEventListener('input', (e) => {
        currentDay = parseInt(e.target.value, 10);
        updateDailyView();
    });

    // Inicializa chart
    const ctx = document.getElementById('dailyChart').getContext('2d');
    dailyChart = new Chart(ctx, { type: 'doughnut', data: { datasets: [{ data: [0, 0, 0, 0] }] }, options: { responsive: true, maintainAspectRatio: false } });
}


// ==========================================
// 4. MÊS SELECT (DROPDOWN) E INICIALIZAÇÃO GLOBAL
// ==========================================
function initMonthSelect() {
    const select = document.createElement('select');
    select.id = 'monthSelect';
    select.className = 'appearance-none w-56 p-3 bg-indigo-50 border border-indigo-200 rounded-xl focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 text-gray-900 text-sm font-semibold transition-all shadow-lg';
    // Popula opções
    availableMonths.forEach(m => {
        const opt = document.createElement('option');
        opt.value = `${m.year}-${m.month}`;
        opt.textContent = `${monthNames[m.month]} / ${m.year}`;
        if (m.year === selectedMonthObj.year && m.month === selectedMonthObj.month) opt.selected = true;
        select.appendChild(opt);
    });

    // Insere no header (logo / date)
    const header = document.querySelector('header');
    const container = document.createElement('div');
    container.className = 'mt-3';
    container.appendChild(select);
    header.appendChild(container);

    select.addEventListener('change', (e) => {
        const [y, mo] = e.target.value.split('-').map(Number);
        selectedMonthObj = { year: y, month: mo };
        // rebuild scheduleData and UI
        rebuildScheduleDataForSelectedMonth();
        initSelect();
        updateDailyView();
        updateWeekendTable();
        // update header label
        const headerDate = document.getElementById('headerDate');
        headerDate.textContent = `Mês de Referência: ${monthNames[selectedMonthObj.month]} de ${selectedMonthObj.year}`;
    });
}


function initGlobal() {
    // parse raw schedule once
    rawSchedule = processRawSchedule(rawDataFromEscala);

    // initialize month select, rebuild schedule for initial month
    initMonthSelect();
    rebuildScheduleDataForSelectedMonth();

    // Exibe mês
    document.getElementById('headerDate').textContent = `Mês de Referência: ${monthNames[selectedMonthObj.month]} de ${selectedMonthObj.year}`;

    // configura slider max label conforme mês
    const monthObj = { year: selectedMonthObj.year, month: selectedMonthObj.month };
    const totalDays = new Date(monthObj.year, monthObj.month + 1, 0).getDate();
    const slider = document.getElementById('dateSlider');
    slider.max = totalDays;
    const sliderMaxLabel = document.getElementById('sliderMaxLabel');
    if (sliderMaxLabel) sliderMaxLabel.textContent = `Dia ${totalDays}`;

    initTabs();
    initSelect();
    initDailyView();
    // set default day
    currentDay = Math.min(systemDay, totalDays);
    document.getElementById('dateSlider').value = currentDay;
    updateDailyView();
    scheduleMidnightUpdate();
    updateWeekendTable();
}

function scheduleMidnightUpdate() {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    const timeToMidnight = midnight.getTime() - now.getTime();

    setTimeout(() => {
        updateDailyView();
        setInterval(updateDailyView, 24 * 60 * 60 * 1000);
    }, timeToMidnight + 1000);
}

document.addEventListener('DOMContentLoaded', initGlobal);
