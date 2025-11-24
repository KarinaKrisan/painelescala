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

// Variável para armazenar o dia atualmente selecionado/exibido
// ALTERAÇÃO AQUI: Define o dia inicial como o dia de hoje (currentDateObj.getDate())
let currentDay = currentDateObj.getDate(); 

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
        let isFirstLine = true;
        
        lines.forEach(line => {
            // Se for a primeira linha, é o nome do colaborador
            if (isFirstLine && line.startsWith('Nome do colaborador:')) {
                name = line.substring('Nome do colaborador:'.length).trim();
                isFirstLine = false;
                return;
            }

            // Mapeia o campo atual
            if (line.startsWith('Dias trabalhados:')) {
                currentField = 'T';
                data.T += line.substring('Dias trabalhados:'.length).trim();
            } else if (line.startsWith('F:')) {
                currentField = 'F';
                data.F += line.substring('F:'.length).trim();
            } else if (line.startsWith('FS:')) {
                currentField = 'FS';
                data.FS += line.substring('FS:'.length).trim();
            } else if (line.startsWith('FD:')) {
                currentField = 'FD';
                data.FD += line.substring('FD:'.length).trim();
            } else if (line.startsWith('FE:')) {
                currentField = 'FE';
                data.FE += line.substring('FE:'.length).trim();
            } else if (currentField) {
                // Continuação da linha anterior (dias trabalhados ou folgas)
                data[currentField] += ' ' + line;
            }
        });

        if (name) {
            // Limpa e normaliza as strings de dias
            for (const key in data) {
                // Remove espaços e quebras de linha, divide por vírgula e converte para número
                const dayStrings = data[key].replace(/\s/g, '').split(',').filter(d => d.length > 0);
                data[key] = dayStrings.map(d => parseInt(d)).filter(d => !isNaN(d));
            }
            
            processedData[name] = data;
        }
    });

    return processedData;
}

// ==========================================
// 3. VARIÁVEIS GLOBAIS
// ==========================================
const processedSchedule = processRawSchedule(rawDataFromEscala);
let dailyChart = null; // Para armazenar a instância do Chart.js
const STATUS_MAP = {
    T: 'Trabalhando',
    F: 'Folga',
    FS: 'Folga Semanal',
    FD: 'Folga Desejada',
    FE: 'Férias'
};

// ==========================================
// 4. FUNÇÕES DE RENDERIZAÇÃO E ATUALIZAÇÃO
// ==========================================

// Função que atualiza a visualização diária (lista e gráfico)
function updateDailyView() {
    // 1. Atualiza o cabeçalho do dia
    document.getElementById('currentDayHeader').textContent = `Dia ${currentDay} de ${monthNames[currentMonth]}`;
    
    // 2. Atualiza o slider (se existir)
    const dateSlider = document.getElementById('dateSlider');
    if (dateSlider) {
        dateSlider.value = currentDay;
    }
    
    // 3. Filtra e agrega os dados para o dia atual
    const dayStats = { T: 0, F: 0, FS: 0, FD: 0, FE: 0 };
    const dayEmployees = { T: [], F: [], FS: [], FD: [], FE: [] };
    
    // Filtra apenas os colaboradores do grupo 'Operador Noc' para a contagem principal
    const nocOperators = Object.keys(processedSchedule).filter(name => 
        employeeMetadata[name] && employeeMetadata[name].Grupo === 'Operador Noc'
    );
    
    // Itera apenas sobre os Operadores Noc
    nocOperators.forEach(name => {
        const schedule = processedSchedule[name];
        for (const status in schedule) {
            if (schedule[status].includes(currentDay)) {
                dayStats[status]++;
                dayEmployees[status].push({ name, ...employeeMetadata[name] });
                break; // Um colaborador só pode ter um status por dia
            }
        }
    });
    
    // 4. Atualiza o gráfico de Doughnut
    if (dailyChart) {
        dailyChart.data.datasets[0].data = [dayStats.T, dayStats.F, dayStats.FS + dayStats.FD, dayStats.FE];
        dailyChart.data.labels = [
            `Trabalhando (${dayStats.T})`, 
            `Folga (${dayStats.F})`, 
            `Folga Semanal/Desejada (${dayStats.FS + dayStats.FD})`, 
            `Férias (${dayStats.FE})`
        ];
        dailyChart.update();
    }
    
    // 5. Atualiza a lista de colaboradores (detalhes por status)
    const container = document.getElementById('dailyEmployeeList');
    container.innerHTML = ''; // Limpa o conteúdo anterior

    ['T', 'F', 'FS', 'FD', 'FE'].forEach(statusKey => {
        if (dayEmployees[statusKey].length > 0) {
            const statusLabel = STATUS_MAP[statusKey];
            const employees = dayEmployees[statusKey].sort((a, b) => a.name.localeCompare(b.name));

            const statusSection = document.createElement('div');
            statusSection.className = 'mb-6 p-4 rounded-lg shadow-sm border ' + 
                                      (statusKey === 'T' ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200');
            
            statusSection.innerHTML = `
                <h3 class="text-lg font-semibold mb-3 ${statusKey === 'T' ? 'text-green-700' : 'text-gray-700'}">${statusLabel} (${employees.length})</h3>
                <ul class="space-y-2">
                    ${employees.map(emp => `
                        <li class="flex items-center justify-between text-sm py-1 border-b last:border-b-0 border-gray-100">
                            <span class="font-medium text-gray-800">${emp.name}</span>
                            <span class="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">${emp.Célula}</span>
                        </li>
                    `).join('')}
                </ul>
            `;
            container.appendChild(statusSection);
        }
    });
    
    // 6. Atualiza o realce do dia atual no calendário
    updateCalendarHighlight();
}

// Inicializa a instância do Chart.js
function initDailyView() {
    const ctx = document.getElementById('dailyChart').getContext('2d');
    dailyChart = new Chart(ctx, { 
        type: 'doughnut', 
        data: { 
            datasets: [{ 
                data: [0, 0, 0, 0],
                backgroundColor: ['#10b981', '#fcd34d', '#3b82f6', '#f472b6'], // Green, Yellow, Blue, Pink (para Férias)
                hoverBackgroundColor: ['#059669', '#fbbd24', '#2563eb', '#ec4899']
            }],
            labels: ['Trabalhando', 'Folga', 'Folga Semanal/Desejada', 'Férias']
        }, 
        options: { 
            responsive: true, 
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                }
            }
        } 
    });
}

// Funções de manipulação do DOM e eventos
function initTabs() {
    // ... (código para inicializar as abas - não alterado)
}
function initSelect() {
    // ... (código para inicializar a seleção - não alterado)
}
function updateCalendarHighlight() {
    // ... (código para realçar o dia - não alterado)
}
function updateWeekendTable() {
    // ... (código para atualizar a tabela de fim de semana - não alterado)
}
function scheduleMidnightUpdate() {
    // ... (código para agendar a atualização da meia-noite - não alterado)
}

// ==========================================
// 5. INICIALIZAÇÃO
// ==========================================
function initGlobal() {
    document.getElementById('headerDate').textContent = `Mês de Referência: ${monthNames[currentMonth]} de ${currentYear}`;
    
    const dateSlider = document.getElementById('dateSlider');
    if (dateSlider) {
        dateSlider.max = daysInCurrentMonth;
        // ALTERAÇÃO AQUI: Define o valor inicial do slider para o dia atual (currentDay)
        dateSlider.value = currentDay; 
        document.getElementById('sliderMaxLabel').textContent = `Dia ${daysInCurrentMonth}`;
        
        // Adiciona o listener para o slider
        dateSlider.addEventListener('input', (event) => {
            currentDay = parseInt(event.target.value);
            updateDailyView();
        });
    }

    initTabs();
    initSelect();
    initDailyView();
    // Garante que a primeira visualização seja a do dia atual
    updateDailyView(); 
    scheduleMidnightUpdate();
    updateWeekendTable();
    // Se o plantão for atualizado em initGlobal, não é necessário um setInterval tão rápido
    // setInterval(updateWeekendTable, 5 * 60 * 1000); // Manter se necessário
}

document.addEventListener('DOMContentLoaded', initGlobal);
