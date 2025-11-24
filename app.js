// Este script depende das variáveis globais: rawDataFromEscala e employeeMetadata (de escala-data.js)

// ==========================================
// 1. CONFIGURAÇÃO DE DATA
// ==========================================
const currentDateObj = new Date();
const currentYear = currentDateObj.getFullYear();
// Forcing to November (index 10) for data consistency with rawDataFromEscala
const currentMonth = 10; 
const daysInCurrentMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

// Variável para armazenar a escala processada globalmente
let processedSchedule = {}; 
let dailyChart; // Variável para o gráfico

// ==========================================
// 2. FUNÇÕES DE PARSE E GERAÇÃO DA ESCALA
// ==========================================

// Função para processar o texto bruto e extrair os dados de cada colaborador
function processRawSchedule(rawText) {
    const records = rawText.trim().split('*********************************');
    const processedData = {};
    records.forEach(record => {
        const lines = record.trim().split('\n').map(line => line.trim());
        let name = '';
        const data = { T: [], F: [], FS: [], FD: [], FE: [] }; // Alterado para arrays de números

        lines.forEach(line => {
            if (line.startsWith('Nome do colaborador:')) {
                name = line.replace('Nome do colaborador:', '').trim();
            } else if (line.startsWith('Dias trabalhados:')) {
                data.T = parseDays(line.replace('Dias trabalhados:', '').trim());
            } else if (line.startsWith('F:')) {
                data.F = parseDays(line.replace('F:', '').trim());
            } else if (line.startsWith('FS:')) {
                data.FS = parseDays(line.replace('FS:', '').trim());
            } else if (line.startsWith('FD:')) {
                data.FD = parseDays(line.replace('FD:', '').trim());
            } else if (line.startsWith('FE:')) {
                data.FE = parseDays(line.replace('FE:', '').trim());
            }
        });

        if (name) {
            processedData[name] = data;
        }
    });

    return processedData;
}

// Helper para converter a string de dias em um array de números (excluindo vazios)
function parseDays(dayString) {
    return dayString.split(',')
        .map(s => parseInt(s.trim()))
        .filter(n => !isNaN(n) && n > 0 && n <= daysInCurrentMonth);
}

// Função para obter o status de um colaborador em um dia específico
function getStatusForDay(employeeName, day) {
    if (!processedSchedule[employeeName]) return null;

    const data = processedSchedule[employeeName];
    if (data.T.includes(day)) return 'T';
    if (data.F.includes(day)) return 'F';
    if (data.FS.includes(day)) return 'FS';
    if (data.FD.includes(day)) return 'FD';
    if (data.FE.includes(day)) return 'FE';
    
    // Fallback para dias que não estão explicitamente na lista (geralmente T, mas pode ser Faltou, etc. - aqui assumimos 'FD' se não estiver em T e o dia é no mês)
    // No nosso caso, como a lista é robusta, mantemos nulo se não encontrado.
    return null; 
}

// ==========================================
// 3. FUNÇÕES DE VISUALIZAÇÃO
// ==========================================

// Função para atualizar a Visão Diária
function updateDailyView() {
    const selectedDay = parseInt(document.getElementById('dateSlider').value);
    document.getElementById('currentDayDisplay').textContent = selectedDay;
    
    let workingEmployees = 0;
    let weekendFolgaEmployees = 0;
    let dailyFolgaEmployees = 0;
    let feriasEmployees = 0;

    const listContainer = document.getElementById('dailyScheduleList');
    listContainer.innerHTML = '';
    
    // Criamos um mapa para agrupar por Célula
    const groupedByCell = {};

    Object.keys(processedSchedule).forEach(name => {
        const status = getStatusForDay(name, selectedDay);
        const metadata = employeeMetadata[name];

        if (status) {
            // Conta para o gráfico (agora com 4 segmentos)
            if (status === 'T') workingEmployees++;
            if (status === 'FD' || status === 'FS') weekendFolgaEmployees++;
            if (status === 'F') dailyFolgaEmployees++;
            if (status === 'FE') feriasEmployees++;

            // Filtra apenas quem está trabalhando (T)
            if (status === 'T' && metadata) {
                const cell = metadata.Célula || 'Outros';
                if (!groupedByCell[cell]) {
                    groupedByCell[cell] = [];
                }
                groupedByCell[cell].push({
                    name: name,
                    horario: metadata.Horário,
                    turno: metadata.Turno
                });
            }
        }
    });

    // Gera o HTML agrupado por Célula
    if (Object.keys(groupedByCell).length === 0) {
        listContainer.innerHTML = '<p class="text-gray-500 italic">Nenhum colaborador escalado para trabalhar neste dia.</p>';
    } else {
        for (const cell in groupedByCell) {
            let html = `
                <div class="bg-indigo-50 p-4 rounded-lg border border-indigo-200">
                    <h4 class="text-md font-bold text-indigo-800 mb-2">${cell} (${groupedByCell[cell].length} Pessoas)</h4>
                    <ul class="list-disc list-inside space-y-1 ml-4 text-gray-700">
            `;
            groupedByCell[cell].forEach(emp => {
                html += `<li><span class="font-medium">${emp.name}</span> (${emp.horario} - ${emp.turno})</li>`;
            });
            html += `</ul></div>`;
            listContainer.innerHTML += html;
        }
    }


    // Atualiza o gráfico de pizza (doughnut)
    updateDailyChart([workingEmployees, weekendFolgaEmployees, dailyFolgaEmployees, feriasEmployees]);
}

// Função para atualizar o gráfico
function updateDailyChart(data) {
    dailyChart.data.datasets[0].data = data;
    dailyChart.data.labels = ['Trabalhando', 'Folga (FDS/Diferenciada)', 'Folga Padrão', 'Férias/Afastado'];
    dailyChart.data.datasets[0].backgroundColor = ['#4f46e5', '#fde047', '#fed7aa', '#ef4444']; // Índigo, Amarelo, Laranja Claro, Vermelho
    dailyChart.data.datasets[0].borderColor = ['#ffffff', '#ffffff', '#ffffff', '#ffffff'];
    dailyChart.update();
}

// Função para atualizar a tabela de Plantão Fim de Semana
function updateWeekendTable() {
    const container = document.getElementById('weekendPlantaoContainer');
    container.innerHTML = '';
    
    // Encontrar o próximo Sábado e Domingo a partir de hoje
    const today = new Date();
    // Se hoje for Sábado (6) ou Domingo (0), pega o fim de semana atual. Senão, pega o próximo.
    let nextSaturday = new Date(today);
    nextSaturday.setDate(today.getDate() + (6 - today.getDay() + 7) % 7);

    // Ajusta se for o Sábado ou Domingo atual
    if (today.getDay() === 0) { // Domingo
        nextSaturday.setDate(today.getDate() - 1); // Volta pro Sábado
    } else if (today.getDay() > 0 && today.getDay() < 6) { // Durante a semana
        nextSaturday.setDate(today.getDate() + (6 - today.getDay()));
    } // Se for Sábado, já está em today.getDay() == 6, então está correto.


    const nextSunday = new Date(nextSaturday);
    nextSunday.setDate(nextSaturday.getDate() + 1);

    const satDay = nextSaturday.getDate();
    const sunDay = nextSunday.getDate();

    // Filtra colaboradores do grupo "Operador Noc" que estão escalados para o plantão (FS ou T)
    const weekendShift = {};

    Object.keys(processedSchedule).forEach(name => {
        const metadata = employeeMetadata[name];
        if (metadata && metadata.Grupo === 'Operador Noc') {
            const statusSat = getStatusForDay(name, satDay);
            const statusSun = getStatusForDay(name, sunDay);
            
            // Consideramos plantão se o status for T (Trabalhando) ou FS (Folga Sábado/Domingo - para casos onde a regra da escala dita isso)
            if (statusSat === 'T' || statusSun === 'T' || statusSat === 'FS' || statusSun === 'FS') {
                weekendShift[name] = {
                    metadata,
                    statusSat,
                    statusSun
                };
            }
        }
    });

    // Grupos/Slots fixos para a apresentação do plantão (exemplo)
    const shiftGroups = {
        'Sábado - Manhã': [],
        'Sábado - Noturno': [],
        'Domingo - Manhã': [],
        'Domingo - Noturno': []
    };
    
    // Distribui os operadores nos grupos
    Object.keys(weekendShift).forEach(name => {
        const data = weekendShift[name];
        const statusSat = data.statusSat;
        const statusSun = data.statusSun;
        const turno = data.metadata.Turno;

        if (statusSat === 'T' || statusSat === 'FS') {
            const shiftKey = turno.includes('Noturno') ? 'Sábado - Noturno' : 'Sábado - Manhã';
            shiftGroups[shiftKey].push({ name, ...data.metadata });
        }
        
        if (statusSun === 'T' || statusSun === 'FS') {
            const shiftKey = turno.includes('Noturno') ? 'Domingo - Noturno' : 'Domingo - Manhã';
            shiftGroups[shiftKey].push({ name, ...data.metadata });
        }
    });

    // Cria o HTML para cada grupo
    const daysOfWeek = ['Sábado', 'Domingo'];
    
    daysOfWeek.forEach(dayName => {
        const dayNumber = dayName === 'Sábado' ? satDay : sunDay;
        const dayDate = dayName === 'Sábado' ? nextSaturday : nextSunday;
        
        ['Manhã', 'Noturno'].forEach(time => {
            const key = `${dayName} - ${time}`;
            const group = shiftGroups[key];
            
            let employeeListHtml = '';
            if (group.length > 0) {
                employeeListHtml = group.map(emp => `
                    <li class="flex justify-between items-center text-sm border-b py-2 last:border-b-0">
                        <span class="font-medium">${emp.name}</span>
                        <span class="text-xs text-gray-500">${emp.Horário}</span>
                    </li>
                `).join('');
            } else {
                 employeeListHtml = '<p class="text-sm text-gray-500 italic">Ninguém escalado.</p>';
            }

            container.innerHTML += `
                <div class="bg-white p-5 rounded-xl border border-gray-200 shadow-md">
                    <h3 class="text-lg font-bold text-indigo-600 mb-3 border-b pb-2">${dayName} (${dayNumber}/${dayDate.toLocaleDateString('pt-BR', { month: '2-digit' })}) - ${time}</h3>
                    <ul class="divide-y divide-gray-100">
                        ${employeeListHtml}
                    </ul>
                </div>
            `;
        });
    });
}


// NOVO: Função para atualizar a Visão Individual
function updateIndividualScale() {
    const select = document.getElementById('employeeSelect');
    const selectedName = select.value;

    const calendarContainer = document.getElementById('individualCalendarGrid');
    const nameDisplay = document.getElementById('calendarEmployeeName');
    const detailsDisplay = document.getElementById('employeeDetails');
    calendarContainer.innerHTML = '';
    nameDisplay.textContent = '';
    detailsDisplay.innerHTML = '';

    if (!selectedName || !processedSchedule[selectedName]) {
        // Se nada estiver selecionado, limpa a tela e sai
        return;
    }

    const scheduleData = processedSchedule[selectedName];
    const metadata = employeeMetadata[selectedName] || { Célula: 'N/A', Horário: 'N/A', Turno: 'N/A' };
    
    // 1. Atualiza Nome e Detalhes
    nameDisplay.textContent = selectedName;
    detailsDisplay.innerHTML = `
        <p><strong>Grupo:</strong> ${metadata.Grupo || 'N/A'}</p>
        <p><strong>Célula:</strong> ${metadata.Célula}</p>
        <p><strong>Horário:</strong> ${metadata.Horário}</p>
        <p><strong>Turno:</strong> ${metadata.Turno}</p>
    `;

    // 2. Cria as células do calendário
    const firstDayOfMonth = new Date(currentYear, currentMonth, 1).getDay(); // 0 = Dom, 6 = Sáb
    
    // Adiciona células vazias para preencher o início da semana
    for (let i = 0; i < firstDayOfMonth; i++) {
        calendarContainer.innerHTML += `<div class="calendar-cell empty-cell"></div>`;
    }

    const todayDay = currentDateObj.getDate();

    for (let day = 1; day <= daysInCurrentMonth; day++) {
        const status = getStatusForDay(selectedName, day);
        const isCurrentDay = day === todayDay;
        
        let statusClass = '';
        let statusText = '';

        switch (status) {
            case 'T':
                statusClass = 'status-T';
                statusText = 'Trab';
                break;
            case 'F':
                statusClass = 'status-F';
                statusText = 'Folga P';
                break;
            case 'FS':
                statusClass = 'status-FS';
                statusText = 'Folga FD';
                break;
            case 'FD':
                statusClass = 'status-FD';
                statusText = 'Folga D';
                break;
            case 'FE':
                statusClass = 'status-FE';
                statusText = 'Férias';
                break;
            default:
                statusClass = 'status-Nulo';
                statusText = 'N/A';
        }
        
        const currentDayClass = isCurrentDay ? 'current-day' : '';

        calendarContainer.innerHTML += `
            <div class="calendar-cell ${currentDayClass}">
                <div class="calendar-date">${day}</div>
                <div class="calendar-status ${statusClass}">${statusText}</div>
            </div>
        `;
    }
}


// ==========================================
// 4. INICIALIZAÇÃO DE COMPONENTES
// ==========================================

function initTabs() {
    document.querySelectorAll('.tab-button').forEach(button => {
        button.addEventListener('click', () => {
            const tab = button.getAttribute('data-tab');
            
            // Remove 'active' de todos os botões e 'hidden' de todos os conteúdos
            document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(content => content.classList.add('hidden'));

            // Adiciona 'active' ao botão clicado e remove 'hidden' do conteúdo correspondente
            button.classList.add('active');
            document.getElementById(tab + 'View').classList.remove('hidden');

            // Tratamento especial para o 'individualScale'
            if (tab === 'individual') {
                 document.getElementById('individualScale').classList.remove('hidden');
            }
        });
    });
}

function initSelect() {
    const select = document.getElementById('employeeSelect');
    const sortedNames = Object.keys(employeeMetadata).sort();
    
    // Opção inicial
    let optionsHtml = '<option value="">Selecione um colaborador...</option>';

    sortedNames.forEach(name => {
        optionsHtml += `<option value="${name}">${name}</option>`;
    });

    select.innerHTML = optionsHtml;
    
    // Adiciona o listener para atualizar a escala individual ao mudar a seleção
    select.addEventListener('change', updateIndividualScale);

    // Tenta carregar o primeiro colaborador por padrão após a inicialização
    if (sortedNames.length > 0) {
        select.value = sortedNames[0]; // Seleciona o primeiro
        updateIndividualScale(); // Chama a função para exibir
    }
}

function initDailyView() {
    // Inicializa o slider
    const dateSlider = document.getElementById('dateSlider');
    const initialDay = currentDateObj.getDate() > daysInCurrentMonth ? 1 : currentDateObj.getDate();
    dateSlider.value = initialDay; // Define o valor inicial para o dia atual

    dateSlider.addEventListener('input', updateDailyView);

    // Inicializa o Chart.js com 4 segmentos para refletir a nova estrutura.
    const ctx = document.getElementById('dailyChart').getContext('2d');
    dailyChart = new Chart(ctx, { type: 'doughnut', data: { datasets: [{ data: [0, 0, 0, 0] }] }, options: { responsive: true, maintainAspectRatio: false } });
}


// ==========================================
// 5. INICIALIZAÇÃO
// ==========================================
function initGlobal() {
    // Processa os dados brutos
    processedSchedule = processRawSchedule(rawDataFromEscala);

    document.getElementById('headerDate').textContent = `Mês de Referência: ${monthNames[currentMonth]} de ${currentYear}`;
    document.getElementById('dateSlider').max = daysInCurrentMonth;
    document.getElementById('sliderMaxLabel').textContent = `Dia ${daysInCurrentMonth}`;
    
    initTabs();
    initSelect();
    initDailyView();
    updateDailyView();
    scheduleMidnightUpdate();
    updateWeekendTable();
    setInterval(updateWeekendTable, 5 * 60 * 1000); // Atualiza o plantão a cada 5 minutos
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
    }, timeToMidnight);
}

// Inicia a aplicação
document.addEventListener('DOMContentLoaded', initGlobal);
