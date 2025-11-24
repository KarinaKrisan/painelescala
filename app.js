// Este script depende das variáveis globais: rawDataFromEscala e employeeMetadata (de escala-data.js)

// ==========================================
// 1. CONFIGURAÇÃO DE DATA
// ==========================================
const currentDateObj = new Date();
const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

// Variáveis para a DATA DO SISTEMA (para iniciar o slider no dia e mês atual real)
const systemYear = currentDateObj.getFullYear();
const systemMonth = currentDateObj.getMonth(); // Mês atual real (0=Jan, 10=Nov)
const systemDay = currentDateObj.getDate();

// Variáveis para a ESCALA (Fixas em Novembro/2023, conforme rawDataFromEscala)
const scheduleYear = 2023; 
const scheduleMonth = 10; // Novembro (index 10)
const daysInScheduleMonth = new Date(scheduleYear, scheduleMonth + 1, 0).getDate(); // 30 dias para Nov
let currentDay = systemDay; // Variável para o dia atualmente selecionado no slider


// ==========================================
// 2. FUNÇÕES DE PARSE E GERAÇÃO DA ESCALA
// ==========================================

// Função para processar o texto bruto e extrair os dados de cada colaborador
function processRawSchedule(rawText) {
    const records = rawText.trim().split('*********************************');
    const processedData = {};
    
    records.forEach(record => {
        // Filtra linhas vazias após o trim()
        const lines = record.trim().split('\n').map(line => line.trim()).filter(line => line.length > 0);
        let name = '';
        const data = { T: '', F: '', FS: '', FD: '', FE: '' };
        let currentField = null; // Variável de estado para rastrear o campo atual

        lines.forEach(line => {
            if (line.startsWith('Nome do colaborador:')) {
                name = line.replace('Nome do colaborador:', '').trim();
                currentField = null; // Não há campo de dados ativo após o nome
            } else if (line.startsWith('Dias trabalhados:')) {
                data.T = line.replace('Dias trabalhados:', '').trim();
                currentField = 'T';
            } else if (line.startsWith('F:')) {
                if (line.includes('12x36')) {
                    // Trata o caso do 12x36 onde 'F:' contém a info de trabalho, movendo para 'T'
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
                // Se estamos em um campo de dados (currentField != null) e a linha não é um novo rótulo,
                // trata como continuação e anexa ao campo atual.
                data[currentField] += ', ' + line;
            }
        });
        
        // Limpeza final para remover vírgulas ou espaços soltos no início/fim
        Object.keys(data).forEach(key => {
            data[key] = data[key].replace(/,\s*$/, '').replace(/^\s*,\s*/, '').trim();
        });

        if (name) processedData[name] = data;
    });
    return processedData;
}

/**
 * Gera a escala 12x36 (T/F/T/F...) para o mês de Novembro.
 * Day 1 (offset 0) é Trabalhando se startWorkingDay for 1.
 */
function generate12x36ScheduleNov(startWorkingDay, totalDays) {
    let schedule = [];
    for (let day = 1; day <= totalDays; day++) {
        const offset = day - startWorkingDay;
        // Se o offset for par (0, 2, 4...), é dia de trabalho.
        schedule.push(offset >= 0 && offset % 2 === 0 ? "T" : "F");
    }
    return schedule;
}

// Função que gera a escala 5x2 (segunda a sexta)
function generate5x2ScheduleDefault(totalDays) {
    let schedule = [];
    for (let day = 1; day <= totalDays; day++) {
        // Usa o scheduleYear e scheduleMonth para calcular o dia da semana CORRETO
        let date = new Date(scheduleYear, scheduleMonth, day); 
        let dayOfWeek = date.getDay(); // 0=Dom, 6=Sáb
        if (dayOfWeek === 0 || dayOfWeek === 6) schedule.push("F");
        else schedule.push("T");
    }
    return schedule;
}

// Função auxiliar para parsear dias ou ranges (ex: 1, 5, 10-15)
function parseDayList(dayString, totalDays) {
    if (!dayString) return [];
    const days = new Set();
    // Substitui espaços em torno de vírgulas, remove espaços em excesso e filtra partes vazias.
    const parts = dayString.replace(/\s*,\s*/g, ',').split(',').map(s => s.trim()).filter(s => s.length > 0); 

    parts.forEach(part => {
        // Trata ranges: 10-15
        const rangeMatch = part.match(/^(\d{1,2})\s*-\s*(\d{1,2})$/);
        if (rangeMatch) {
            const start = parseInt(rangeMatch[1]);
            const end = parseInt(rangeMatch[2]);
            if (!isNaN(start) && !isNaN(end) && start > 0 && end <= totalDays && start <= end) {
                for (let day = start; day <= end; day++) {
                    days.add(day);
                }
            }
            return;
        }
        
        // Trata dias específicos: 5, 24, 25, 26, ...
        const dayMatch = part.match(/^(\d{1,2})$/);
        if (dayMatch) {
            const day = parseInt(dayMatch[1]);
            if (!isNaN(day) && day > 0 && day <= totalDays) {
                days.add(day);
            }
            return;
        }

        // Trata ranges de data/mês
        const dateRangeMatch = part.match(/(\d{1,2})\/(\d{1,2})\s*a\s*(\d{1,2})\/(\d{1,2})/);
        if (dateRangeMatch) {
            const startDay = parseInt(dateRangeMatch[1]);
            const startMonth = parseInt(dateRangeMatch[2]) - 1; // Mês é 0-indexed
            const endDay = parseInt(dateRangeMatch[3]);
            const endMonth = parseInt(dateRangeMatch[4]) - 1;

            if (startMonth <= scheduleMonth && endMonth >= scheduleMonth) { // Usar scheduleMonth
                const effectiveStartDay = startMonth === scheduleMonth ? startDay : 1;
                const effectiveEndDay = endMonth === scheduleMonth ? endDay : totalDays;

                for (let day = Math.max(1, effectiveStartDay); day <= Math.min(totalDays, effectiveEndDay); day++) {
                    days.add(day);
                }
            }
        }
    });

    return Array.from(days).sort((a, b) => a - b);
}


// Função principal que constrói a escala final a partir dos dados de texto
function buildFinalSchedule(employeeData, totalDays) {
    let schedule = new Array(totalDays).fill(null);
    
    // Função auxiliar para determinar se deve usar a escala fixa ou a lista de dias
    const parseDaysOrSchedule = (dayString) => {
        if (!dayString) return [];
        // Se for 5x2 ou 12x36, retorna a escala completa (array de T/F/T/F...)
        if (dayString.includes('segunda a sexta') || dayString.includes('fins de semana')) return generate5x2ScheduleDefault(totalDays);
        if (dayString.includes('12x36 iniciado no dia 1/11')) return generate12x36ScheduleNov(1, totalDays);
        if (dayString.includes('12x36 iniciado no dia 2/11')) return generate12x36ScheduleNov(2, totalDays);

        // Caso contrário, retorna a lista de dias (números)
        return parseDayList(dayString, totalDays); 
    };

    // 1. Preenche Férias (FE) - Prioridade Máxima
    const vacationDays = parseDayList(employeeData.FE, totalDays);
    vacationDays.forEach(day => {
        if (day > 0 && day <= totalDays) {
            schedule[day - 1] = 'FE';
        }
    });


    // 2. Dias Trabalhados (T) - Preenche o que não é Férias
    const workingStatusOrDays = parseDaysOrSchedule(employeeData.T);
    
    if (Array.isArray(workingStatusOrDays) && workingStatusOrDays.length === totalDays && typeof workingStatusOrDays[0] === 'string') {
        // Se o resultado for um array de T/F/T/F (escala 12x36 ou 5x2)
        schedule = workingStatusOrDays.map((status, index) => schedule[index] === 'FE' ? 'FE' : status);
    } else if (Array.isArray(workingStatusOrDays)) {
        // Se for apenas uma lista de dias (T)
        workingStatusOrDays.forEach(day => { if (schedule[day - 1] === null) schedule[day - 1] = 'T'; });
    }
    
    // 3. Folga Domingo (FD) - Não sobrescreve FE nem T
    parseDayList(employeeData.FD, totalDays).forEach(day => { 
        // Sobrescreve 'null' ou 'F' (do 12x36/5x2)
        if (schedule[day - 1] === null || schedule[day - 1] === 'F') schedule[day - 1] = 'FD'; 
    });
    
    // 4. Folga Sábado (FS) - Não sobrescreve FE nem T
    parseDayList(employeeData.FS, totalDays).forEach(day => { 
        // Sobrescreve 'null' ou 'F' (do 12x36/5x2)
        if (schedule[day - 1] === null || schedule[day - 1] === 'F') schedule[day - 1] = 'FS'; 
    });
    
    // 5. Folga Fim de Semana / Geral (F) - Não sobrescreve FE
    // Se a agenda não for 12x36 nem 5x2 (já tratado em T) e não for um valor especial
    if (!employeeData.T.includes('12x36') && !employeeData.T.includes('segunda a sexta') && !employeeData.F.includes('fins de semana')) {
        parseDayList(employeeData.F, totalDays).forEach(day => { 
            if (schedule[day - 1] === null) schedule[day - 1] = 'F'; 
        });
    }

    // 6. Preenche o restante:
    for (let i = 0; i < totalDays; i++) {
        if (schedule[i] === null) {
            // Se ainda for nulo, deve ser Trabalhado (T) se não for folga (que já deveria ter sido preenchida em 5)
            schedule[i] = 'T';
        } else if (schedule[i] === 'F' && (employeeData.T.includes('12x36') || employeeData.T.includes('segunda a sexta'))) {
            // Mantém F para escalas 12x36 e 5x2 (F aqui já significa folga)
        }
    }

    return schedule;
}


// ==========================================
// 3. ESTRUTURA DE DADOS UNIFICADA (GLOBAL)
// ==========================================
const rawSchedule = processRawSchedule(rawDataFromEscala);

// scheduleData: Objeto final que combina metadados (employeeMetadata) e a escala processada (rawSchedule).
const scheduleData = {}; 
Object.keys(employeeMetadata).forEach(name => {
    // Tenta obter a escala bruta, senão usa o padrão 5x2
    const data = rawSchedule[name] || { T: 'segunda a sexta', F: 'fins de semana', FS: '', FD: '', FE: '' }; 
    
    // Constrói a estrutura final para cada colaborador
    scheduleData[name] = {
        info: employeeMetadata[name],
        // Usa daysInScheduleMonth para garantir que a escala gerada tenha 30 dias (Nov)
        schedule: buildFinalSchedule(data, daysInScheduleMonth) 
    };
});


// VARIÁVEIS GLOBAIS DE ESTADO
const employeeNames = Object.keys(scheduleData);
const daysOfWeek = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const statusMap = { 'T': 'Trabalhando', 'F': 'Folga', 'FS': 'Folga Sáb', 'FD': 'Folga Dom', 'FE': 'Férias', 'OFF-SHIFT': 'Exp. Encerrado' };
// currentDay já está definido no bloco 1 e será atualizado pelo slider
let dailyChart = null;


// ==========================================
// 4. LÓGICA DE VISUALIZAÇÃO E INTERAÇÃO
// ==========================================

function pad(number) {
    return number < 10 ? '0' + number : number;
}

// Simulação de horário de trabalho (verifica se a hora atual está dentro do range)
function isWorkingTime(timeRange) {
    if (!timeRange || timeRange.includes('12x36')) return true;

    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const match = timeRange.match(/(\d{1,2}):(\d{2})\s*às\s*(\d{1,2}):(\d{2})/);

    if (!match) return false;

    const [, startH, startM, endH, endM] = match.map(Number);
    const startTotal = startH * 60 + startM;
    const endTotal = endH * 60 + endM;

    // Se o horário de fim for no dia seguinte (ex: 19:30 às 07:30)
    if (startTotal > endTotal) {
        return currentMinutes >= startTotal || currentMinutes <= endTotal;
    }
    // Horário normal (ex: 8:00 às 17:48)
    return currentMinutes >= startTotal && currentMinutes <= endTotal;
}

// Atualiza o resumo diário (KPIs e listas)
function updateDailyView() {
    const currentDateLabel = document.getElementById('currentDateLabel');
    // **USANDO scheduleYear e scheduleMonth para a data da escala**
    const dayOfWeekIndex = new Date(scheduleYear, scheduleMonth, currentDay).getDay(); 
    const now = new Date();
    // **Verifica se o dia SELECIONADO é o dia atual do SISTEMA (para Expediente Encerrado)**
    const isToday = (now.getDate() === currentDay && now.getMonth() === systemMonth && now.getFullYear() === systemYear); 
    const dayString = currentDay < 10 ? '0' + currentDay : currentDay;
    
    // **Exibe a data da ESCALA (Novembro)**
    currentDateLabel.textContent = `${daysOfWeek[dayOfWeekIndex]}, ${dayString}/${scheduleMonth + 1}/${scheduleYear}`; 

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

        // 1. Prioridade Máxima: Férias (FE)
        if (kpiStatus === 'FE') {
            vacationCount++;
            displayStatus = 'FE'; 
        } 
        // 2. Expediente Encerrado (Apenas se for hoje E se estiver Trabalhando)
        else if (isToday && kpiStatus === 'T') {
            const isWorking = isWorkingTime(employee.info.Horário);
            if (!isWorking) {
                offShiftCount++;
                displayStatus = 'OFF-SHIFT'; 
                kpiStatus = 'F_EFFECTIVE';   
            } else {
                workingCount++; 
            }
        } 
        // 3. Status Normais: Trabalhando (T) ou Folga (F, FS, FD)
        else if (kpiStatus === 'T') {
            workingCount++; 
        } else if (kpiStatus === 'F' || kpiStatus === 'FS' || kpiStatus === 'FD') {
            offCount++; 
        }

        // Geração do HTML (após determinar o displayStatus final)
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
        
        // Atribuição do HTML à lista correta
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

    // Atualiza KPIs
    kpiWorking.textContent = workingCount;
    kpiOffShift.textContent = offShiftCount;
    kpiOff.textContent = offCount;
    kpiVacation.textContent = vacationCount;

    // Atualiza listas
    listWorking.innerHTML = workingHtml || '<li class="text-gray-400 text-sm text-center py-4">Ninguém em expediente no momento.</li>';
    listOffShift.innerHTML = offShiftHtml || '<li class="text-gray-400 text-sm text-center py-4">Ninguém fora de expediente no momento.</li>';
    listOff.innerHTML = offHtml || '<li class="text-gray-400 text-sm text-center py-4">Nenhuma folga programada.</li>';
    listVacation.innerHTML = vacationHtml || '<li class="text-gray-400 text-sm text-center py-4">Ninguém de férias.</li>';

    // Atualiza o gráfico de pizza
    updateChart(workingCount, offCount, offShiftCount, vacationCount);
}

// Atualiza o gráfico de pizza (Chart.js)
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
        '#10b981', // green-500 (Trabalhando)
        '#fcd34d', // yellow-400 (Folga Programada)
        '#6366f1', // indigo-500 (Exp. Encerrado)
        '#ef4444'  // red-500 (Férias)
    ];

    // Filtra pontos de dados zero
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


// Preenche o <select> com os nomes dos colaboradores
function initSelect() {
    const select = document.getElementById('employeeSelect');
    employeeNames.sort().forEach(name => {
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
            // Lógica para esconder o card e o calendário
            infoCard.classList.remove('opacity-100');
            infoCard.classList.add('opacity-0');
            setTimeout(() => {
                infoCard.classList.add('hidden');
                calendarContainer.classList.add('hidden');
            }, 300);
        }
    });
}

// Atualiza a visualização da escala individual
function updatePersonalView(employeeName) {
    const employee = scheduleData[employeeName];
    const infoCard = document.getElementById('personalInfoCard');
    const calendarContainer = document.getElementById('calendarContainer');
    
    // Cores e Ícones Dinâmicos para Líderes
    const isLeader = employee.info.Grupo === "Líder de Célula";
    const bgColor = isLeader ? 'bg-purple-700' : 'bg-indigo-600';
    const mainColor = isLeader ? 'text-purple-300' : 'text-indigo-300';
    const turnoDisplay = employee.info.Turno;

    // Atualiza a classe do card de informações com a cor dinâmica
    infoCard.className = `hidden ${bgColor} p-6 rounded-2xl mb-6 shadow-xl text-white flex flex-col sm:flex-row justify-between items-center transition-opacity duration-300 opacity-0`;

    // Atualiza o Card de Informação
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

    // Remove 'hidden' para o card de informações e adiciona opacidade (efeito de fade-in)
    infoCard.classList.remove('hidden', 'opacity-0');
    infoCard.classList.add('opacity-100');

    // Remove 'hidden' para o container do calendário
    calendarContainer.classList.remove('hidden');
    updateCalendar(employee.schedule);
}

// Desenha o calendário da escala individual
function updateCalendar(schedule) {
    const grid = document.getElementById('calendarGrid');
    grid.innerHTML = ''; // Limpa o grid

    // Insere células vazias para o preenchimento inicial (dias do mês anterior)
    // **USANDO scheduleYear e scheduleMonth**
    const firstDayOfMonth = new Date(scheduleYear, scheduleMonth, 1).getDay(); // 0=Dom, 1=Seg, ...
    for (let i = 0; i < firstDayOfMonth; i++) {
        grid.insertAdjacentHTML('beforeend', '<div class="calendar-cell bg-gray-50 border-gray-100"></div>');
    }

    // Insere as células dos dias do mês
    const todayDay = systemDay; // Dia atual do sistema
    // **Verifica se o mês da escala é o mês atual do sistema**
    const isCurrentMonth = (systemMonth === scheduleMonth && systemYear === scheduleYear); 

    for (let i = 0; i < schedule.length; i++) {
        const dayNumber = i + 1;
        const status = schedule[i];
        const displayStatus = statusMap[status] || status;
        
        // Verifica se é o dia atual (aplica a borda azul)
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

// Adaptação para Plantão de Fim de Semana - Operador Noc
function updateWeekendTable() {
    const container = document.getElementById('weekendPlantaoContainer');
    container.innerHTML = '';
    let hasResults = false;

    // Loop pelos dias do MÊS DA ESCALA (Novembro)
    for (let day = 1; day <= daysInScheduleMonth; day++) {
        const date = new Date(scheduleYear, scheduleMonth, day);
        const dayOfWeek = date.getDay(); // 0=Dom, 6=Sáb

        // Checa se é Sábado (6) ou Domingo (0)
        if (dayOfWeek === 6 || dayOfWeek === 0) {
            const satDay = dayOfWeek === 6 ? day : (day - 1);
            const sunDay = dayOfWeek === 0 ? day : (day + 1);

            // Processa apenas o sábado para evitar duplicidade (ou o dia 1 se cair no domingo)
            if (dayOfWeek === 6 || (dayOfWeek === 0 && day === 1)) {
                let satWorkers = [];
                let sunWorkers = [];

                Object.keys(scheduleData).forEach(name => {
                    const employee = scheduleData[name];
                    // Filtra apenas Operador Noc e Líder de Célula
                    if (employee.info.Grupo === "Operador Noc" || employee.info.Grupo === "Líder de Célula") {
                        // Plantão de Sábado
                        if (satDay > 0 && satDay <= daysInScheduleMonth) {
                            if (employee.schedule[satDay - 1] === 'T') {
                                satWorkers.push(name);
                            }
                        }
                        // Plantão de Domingo
                        if (sunDay > 0 && sunDay <= daysInScheduleMonth) {
                            if (employee.schedule[sunDay - 1] === 'T') {
                                sunWorkers.push(name);
                            }
                        }
                    }
                });

                // Verifica se há pelo menos um dia de fim de semana para exibir
                const hasSaturday = satWorkers.length > 0 && satDay <= daysInScheduleMonth;
                const hasSunday = sunWorkers.length > 0 && sunDay <= daysInScheduleMonth;

                if (hasSaturday || hasSunday) {
                    hasResults = true;

                    const formatDate = (day) => {
                        return `${pad(day)}/${pad(scheduleMonth + 1)}`;
                    };

                    const formatBadge = (name) => {
                        const employee = scheduleData[name];
                        const cell = employee.info.Célula.split('/')[0].trim();
                        const isLeader = employee.info.Grupo === "Líder de Célula";
                        const badgeClass = isLeader ? 'bg-purple-100 text-purple-800 border-purple-300' : 'bg-blue-100 text-blue-800 border-blue-300';
                        return `<span class="text-xs font-semibold px-3 py-1 rounded-full border ${badgeClass} shadow-sm">${name} (${cell})</span>`;
                    };
                    const formatSatBadge = (workers) => workers.map(formatBadge).join('');
                    const formatSunBadge = (workers) => workers.map(formatBadge).join('');


                    const cardHtml = `
                        <div class="bg-white p-5 rounded-2xl shadow-xl border border-gray-200 flex flex-col min-h-full">
                            <div class="bg-indigo-700 text-white p-4 -m-5 mb-5 rounded-t-xl flex justify-center items-center">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                                <h3 class="text-white font-bold text-lg tracking-wide">
                                    Fim de Semana ${formatDate(satDay)} - ${formatDate(sunDay)}
                                </h3>
                            </div>
                            <div class="flex-1 flex flex-col justify-start space-y-6">
                                ${hasSaturday ?
                                    `
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
                                    </div>
                                    ` : ''}
                                ${hasSunday ?
                                    `
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
                                    </div>
                                    ` : ''}
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


// Lógica de troca de abas
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
                        updateWeekendTable(); // Garante que a tabela de plantão seja atualizada ao mudar para a aba
                    }
                } else {
                    content.classList.add('hidden');
                }
            });
        });
    });
}

// Inicializa a visualização diária
function initDailyView() {
    const slider = document.getElementById('dateSlider');
    slider.addEventListener('input', (e) => {
        // Atualiza a variável global do dia selecionado
        currentDay = parseInt(e.target.value); 
        updateDailyView();
    });
    
    // Define o valor inicial do slider para o dia atual do sistema (limitado aos dias de Novembro)
    const initialDay = Math.min(systemDay, daysInScheduleMonth); 
    slider.value = initialDay;
    currentDay = initialDay; // Garante que a variável de estado corresponda ao valor inicial

    // Inicia o gráfico (será atualizado no updateDailyView inicial)
    const ctx = document.getElementById('dailyChart').getContext('2d');
    dailyChart = new Chart(ctx, { type: 'doughnut', data: { datasets: [{ data: [0, 0, 0, 0] }] }, options: { responsive: true, maintainAspectRatio: false } });
}


// ==========================================
// 5. INICIALIZAÇÃO
// ==========================================
function initGlobal() {
    // Exibe o Mês de Referência da ESCALA (Novembro)
    document.getElementById('headerDate').textContent = `Mês de Referência: ${monthNames[scheduleMonth]} de ${scheduleYear}`;
    
    // Configura o slider para o Mês de Novembro (30 dias)
    document.getElementById('dateSlider').max = daysInScheduleMonth;
    document.getElementById('sliderMaxLabel').textContent = `Dia ${daysInScheduleMonth}`;
    
    initTabs();
    initSelect();
    initDailyView(); // Agora define o slider no dia atual do sistema
    updateDailyView(); // Usa o dia atual do sistema para a primeira visualização
    scheduleMidnightUpdate();
    updateWeekendTable();
    // Se o plantão for atualizado em initGlobal, não é necessário um setInterval tão rápido
    // setInterval(updateWeekendTable, 5 * 60 * 1000); // Manter se necessário
}

function scheduleMidnightUpdate() {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0); 
    const timeToMidnight = midnight.getTime() - now.getTime();
    
    setTimeout(() => {
        updateDailyView();
        // Agenda a próxima atualização para 24 horas depois
        setInterval(updateDailyView, 24 * 60 * 60 * 1000);
    }, timeToMidnight + 1000); // Adiciona 1 segundo para garantir que seja após a meia-noite
}

document.addEventListener('DOMContentLoaded', initGlobal);
