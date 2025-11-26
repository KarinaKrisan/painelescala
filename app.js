// app.js - Versão Final (Correção Inteligente de Virada de Ano + Cores Vibrantes)
// Depende de: JSONs mensais em ./data/escala-YYYY-MM.json

// ==========================================
// CONFIGURAÇÕES INICIAIS / UTILITÁRIAS
// ==========================================
const currentDateObj = new Date();
const monthNames = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

const systemYear = currentDateObj.getFullYear();
const systemMonth = currentDateObj.getMonth();
const systemDay = currentDateObj.getDate();

// Ajuste de meses disponíveis
// ATENÇÃO: O mês aqui é zero-indexed (0 = Janeiro, 11 = Dezembro)
const availableMonths = [
    { year: 2025, month: 10 }, // Novembro 2025 (Mês 10)
    { year: 2025, month: 11 }//, // Dezembro 2025 (Mês 11)
    //{ year: 2026, month: 0 }   // Janeiro 2026 (Mês 0)
    // Para adicionar Fevereiro 2026, adicione: { year: 2026, month: 1 }
];

// Tenta encontrar o mês atual, senão pega o primeiro da lista
let selectedMonthObj = availableMonths.find(m => m.year === systemYear && m.month === systemMonth) || availableMonths[0];
let currentDay = systemDay;

let rawSchedule = {};    // JSON carregado por mês
let scheduleData = {};   // Estrutura final processada
let dailyChart = null;

const daysOfWeek = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];
const statusMap = { 'T':'Trabalhando','F':'Folga','FS':'Folga Sáb','FD':'Folga Dom','FE':'Férias','OFF-SHIFT':'Exp.Encerrado', 'F_EFFECTIVE': 'Exp.Encerrado' };

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
            return {};
        }
        const json = await resp.json();
        return json;
    } catch (err) {
        console.error('Erro ao carregar JSON:', err);
        return {};
    }
}

// ==========================================
// GERAÇÃO DE PADRÕES E PARSE DE DIAS (COM CORREÇÃO DE ANO)
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
        // Verifica range DD/MM a DD/MM
        const dateRange = part.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s*(?:a|-)\s*(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
        if (dateRange) {
            let [, sD, sM, sY, eD, eM, eY] = dateRange;
            sD = parseInt(sD,10); sM = parseInt(sM,10)-1; eD = parseInt(eD,10); eM = parseInt(eM,10)-1;
            
            // Define o ano padrão como o ano que estamos visualizando no calendário
            let sYear = sY ? parseInt(sY,10) : monthObj.year;
            let eYear = eY ? parseInt(eY,10) : monthObj.year;
            
            // --- LÓGICA DE CORREÇÃO DE VIRADA DE ANO ---
            // Se o usuário não digitou o ano (ex: "18/12 a 01/01") e o mês final é menor que o inicial
            if (!sY && !eY && sM > eM) {
                // Cenário A: Estamos visualizando Janeiro/Fevereiro (início do ano)
                // O "18/12" se refere ao ano passado.
                if (monthObj.month <= eM) {
                    sYear--; // Início foi ano passado
                    eYear = monthObj.year; // Fim é este ano
                } 
                // Cenário B: Estamos visualizando Dezembro (fim do ano)
                // O "01/01" se refere ao ano que vem.
                else {
                    sYear = monthObj.year; // Início é este ano
                    eYear++; // Fim é ano que vem
                }
            }
            
            const start = new Date(sYear, sM, sD);
            const end = new Date(eYear, eM, eD);
            
            // Loop para preencher os dias
            for (let dt = new Date(start); dt <= end; dt.setDate(dt.getDate()+1)){
                // Só adicionamos ao Set se o dia cair dentro do mês/ano que estamos visualizando na tela
                if (dt.getFullYear() === monthObj.year && dt.getMonth() === monthObj.month) {
                    days.add(dt.getDate());
                }
            }
            return;
        }

        // Verifica dia único DD/MM
        const single = part.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
        if (single) {
            const d = parseInt(single[1],10);
            const m = parseInt(single[2],10)-1;
            // Se tiver ano, valida. Se não, assume mês atual.
            const y = single[3] ? parseInt(single[3],10) : monthObj.year;
            
            if (m === monthObj.month && y === monthObj.year) days.add(d);
            return;
        }

        // Verifica range simples 5-10
        const simple = part.match(/^(\d{1,2})-(\d{1,2})$/);
        if (simple) {
            const s = parseInt(simple[1],10), e = parseInt(simple[2],10);
            for (let x=s; x<=e; x++) if (x>=1 && x<=totalDays) days.add(x);
            return;
        }

        // Verifica número simples
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

    // Helper: transforma T (string ou array) em array de dias 'T'
    const parseTtoArray = (t) => {
        if (!t) return [];
        // Se já é array de strings ('T','F'...) de tamanho completo
        if (Array.isArray(t) && t.length === totalDays && typeof t[0] === 'string') return t;
        
        // Se é string '12x36...'
        if (typeof t === 'string' && /12x36/i.test(t)) {
            const m = t.match(/iniciado no dia\s*(\d{1,2})/i);
            const start = m ? parseInt(m[1],10) : 1;
            return generate12x36Schedule(start, totalDays);
        }
        // Se é string 'segunda a sexta'
        if (typeof t === 'string' && /segunda a sexta|segunda à sexta/i.test(t)) {
            return generate5x2ScheduleDefaultForMonth(monthObj);
        }
        // Se é string complexa de dias
        if (typeof t === 'string') {
            const parsedDays = parseDayListForMonth(t, monthObj);
            if (parsedDays.length > 0) {
                const arr = new Array(totalDays).fill('F');
                parsedDays.forEach(d=> { if (d>=1 && d<=totalDays) arr[d-1] = 'T'; });
                return arr;
            }
        }
        // Se é array de NÚMEROS (dias trabalhados)
        if (Array.isArray(t) && t.length && typeof t[0] === 'number') {
            const arr = new Array(totalDays).fill('F');
            t.forEach(d => { if (d>=1 && d<=totalDays) arr[d-1] = 'T'; });
            return arr;
        }
        // Se é array misto (strings e numeros) - Ex: ["segunda a sexta", 29, 30]
        if (Array.isArray(t)) {
             const arr = new Array(totalDays).fill('F');
             let hasValid = false;
             
             // Processa string base se houver (ex: "segunda a sexta")
             const baseString = t.find(x => typeof x === 'string');
             if (baseString) {
                  const baseArr = parseTtoArray(baseString);
                  for(let k=0; k<totalDays; k++) if(baseArr[k]==='T') arr[k]='T';
                  hasValid = true;
             }
             
             // Processa numeros individuais
             t.filter(x => typeof x === 'number').forEach(d => {
                 if (d>=1 && d<=totalDays) { arr[d-1] = 'T'; hasValid = true; }
             });

             if (hasValid) return arr;
        }

        return [];
    };

    // 1) Prioridade: Férias (FE)
    const vacDays = parseDayListForMonth(employeeData.FE, monthObj);
    vacDays.forEach(d => { if (d>=1 && d<=totalDays) schedule[d-1] = 'FE'; });

    // 2) Tenta montar a escala de trabalho (T)
    const tParsed = parseTtoArray(employeeData.T);
    
    // Se tParsed for um array de 'T'/'F'
    if (Array.isArray(tParsed) && tParsed.length === totalDays) {
        for (let i=0; i<totalDays; i++) {
            if (schedule[i] === 'FE') continue; // não sobrescreve férias
            if (tParsed[i] === 'T') schedule[i] = 'T';
        }
    }

    // 3) Overrides de Folgas Específicas (FD, FS)
    parseDayListForMonth(employeeData.FD, monthObj).forEach(d => { 
        if (d>=1 && d<=totalDays && schedule[d-1] !== 'FE') schedule[d-1] = 'FD'; 
    });
    parseDayListForMonth(employeeData.FS, monthObj).forEach(d => { 
        if (d>=1 && d<=totalDays && schedule[d-1] !== 'FE' && schedule[d-1] !== 'FD') schedule[d-1] = 'FS'; 
    });

    // 4) Folgas Gerais (F) - Elas sobrescrevem T se colidirem, exceto Férias
    parseDayListForMonth(employeeData.F, monthObj).forEach(d => { 
        if (d>=1 && d<=totalDays && !['FE'].includes(schedule[d-1])) schedule[d-1] = 'F'; 
    });

    // 5) Preenche buracos com 'T' se necessário (fallback) ou F
    for (let i=0;i<totalDays;i++){
        if (!schedule[i]) {
            if (employeeData.T) schedule[i] = 'T'; 
            else schedule[i] = 'F'; 
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
// REBUILD (LÊ DO JSON CARREGADO)
// ==========================================
function rebuildScheduleDataForSelectedMonth() {
    const monthObj = { year: selectedMonthObj.year, month: selectedMonthObj.month };
    const totalDays = new Date(monthObj.year, monthObj.month+1, 0).getDate();

    scheduleData = {};
    
    // Se o JSON estiver vazio
    if (!rawSchedule || Object.keys(rawSchedule).length === 0) {
        console.warn("Sem dados para este mês.");
        updateDailyView();
        return;
    }

    Object.keys(rawSchedule).forEach(name => {
        const empData = rawSchedule[name];
        
        const metaInfo = {
            Grupo: empData.Grupo || 'Indefinido',
            Célula: empData.Célula || '-',
            Horário: empData.Horário || empData.Horario || '',
            Turno: empData.Turno || ''
        };

        scheduleData[name] = {
            info: metaInfo,
            schedule: buildFinalScheduleForMonth(empData, monthObj)
        };
    });

    // Ajusta slider
    const slider = document.getElementById('dateSlider');
    if (slider) {
        slider.max = totalDays;
        const sliderMaxLabel = document.getElementById('sliderMaxLabel');
        if (sliderMaxLabel) sliderMaxLabel.textContent = `Dia ${totalDays}`;
        
        // Se mudou de mês e o dia selecionado é maior que o total (ex: 31 -> 30)
        if (currentDay > totalDays) currentDay = totalDays;
        slider.value = currentDay;
    }
    
    // Atualiza o select de nomes na aba pessoal
    initSelect();
}

// ==========================================
// VISUALIZAÇÃO / CHART
// ==========================================
const centerTextPlugin = {
    id: 'centerTextPlugin',
    beforeDraw: (chart) => {
        const { ctx, width, height, data } = chart;
        const total = data.datasets[0].data.reduce((a, b) => a + b, 0);
        const workingIndex = data.labels.findIndex(l => l.includes('Trabalhando'));
        const workingCount = workingIndex !== -1 ? data.datasets[0].data[workingIndex] : 0;
        const workingPct = total > 0 ? ((workingCount / total) * 100).toFixed(0) : 0;
        
        const slaGoal = 75; 
        const isSlaMet = workingPct >= slaGoal;
        // Cores vibrantes para o texto central também
        const primaryColor = isSlaMet ? '#16a34a' : '#dc2626';
        
        ctx.save();
        const centerX = width / 2;
        const centerY = height / 2;
        
        ctx.font = 'bolder 3rem sans-serif';
        ctx.fillStyle = primaryColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${workingPct}%`, centerX, centerY - 15);

        ctx.font = '500 0.8rem sans-serif';
        ctx.fillStyle = '#6b7280';
        ctx.fillText('CAPACIDADE ATIVA', centerX, centerY + 25);
        ctx.restore();
    }
};

function updateChart(working, off, offShift, vacation) {
    const total = working + off + offShift + vacation;
    const dataPoints = [working, off, offShift, vacation];
    
    const chartTitleElement = document.querySelector('#dailyView section h3');
    if (chartTitleElement) chartTitleElement.textContent = "Capacidade Operacional Atual";

    const labels = [
        `Trabalhando (${working})`,
        `Folga Programada (${off})`,
        `Expediente Encerrado (${offShift})`,
        `Férias (${vacation})`
    ];
    
    // CORES VIBRANTES E CONTRASTANTES AQUI:
    // Trabalhando: Green-600 (vibrante)
    // Folga: Amber-500 (amarelo ouro forte)
    // Exp. Encerrado: Fuchsia-600 (roxo vibrante)
    // Férias: Red-600 (vermelho intenso)
    const colors = ['#16a34a', '#f59e0b', '#c026d3', '#dc2626']; 
    
    const filteredData = [], filteredLabels = [], filteredColors = [];
    dataPoints.forEach((d,i)=>{ 
        if (d>0 || total===0){ 
            filteredData.push(d); 
            filteredLabels.push(labels[i]); 
            filteredColors.push(colors[i]); 
        }
    });
    
    if (dailyChart) {
        dailyChart.data.datasets[0].data = filteredData;
        dailyChart.data.datasets[0].backgroundColor = filteredColors;
        dailyChart.data.labels = filteredLabels;
        dailyChart.update();
        return;
    }

    const data = { labels: filteredLabels, datasets:[{ data: filteredData, backgroundColor: filteredColors, hoverOffset:4 }]};
    const config = {
        type: 'doughnut',
        data,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '65%', 
            animation: { animateRotate: true, duration: 900 },
            plugins: {
                legend: { position: 'bottom', labels: { padding: 15, font: { size: 13 } } },
                tooltip: {
                    callbacks: {
                        label: function(ctx) {
                            const totalVal = ctx.dataset.data.reduce((a,b)=>a+b,0) || 1;
                            const pct = ((ctx.raw / totalVal) * 100).toFixed(1);
                            return `${pct}% — ${ctx.label}`;
                        }
                    }
                }
            }
        },
        plugins: [centerTextPlugin]
    };

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

    if (Object.keys(scheduleData).length === 0) {
        kpiWorking.textContent = 0; kpiOffShift.textContent = 0; kpiOff.textContent = 0; kpiVacation.textContent = 0;
        listWorking.innerHTML = ''; listOffShift.innerHTML = ''; listOff.innerHTML = ''; listVacation.innerHTML = '';
        updateChart(0,0,0,0);
        return;
    }

    Object.keys(scheduleData).forEach(name=>{
        const employee = scheduleData[name];
        const status = employee.schedule[currentDay-1] || 'F';
        let kpiStatus = status;
        let displayStatus = status;

        if (kpiStatus === 'FE') {
            vacationCount++; displayStatus = 'FE';
        } else if (isToday && kpiStatus === 'T') {
            const horarioRaw = employee.info.Horário || '';
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
                    <span class="text-xs text-gray-400">${employee.info.Horário || ''}</span>
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

    kpiWorking.textContent = workingCount;
    kpiOffShift.textContent = offShiftCount;
    kpiOff.textContent = offCount;
    kpiVacation.textContent = vacationCount;

    listWorking.innerHTML = workingHtml || '<li class="text-gray-400 text-sm text-center py-4">Ninguém em expediente.</li>';
    listOffShift.innerHTML = offShiftHtml || '<li class="text-gray-400 text-sm text-center py-4">Ninguém fora de expediente.</li>';
    listOff.innerHTML = offHtml || '<li class="text-gray-400 text-sm text-center py-4">Nenhuma folga.</li>';
    listVacation.innerHTML = vacationHtml || '<li class="text-gray-400 text-sm text-center py-4">Ninguém de férias.</li>';

    updateChart(workingCount, offCount, offShiftCount, vacationCount);
}

// ==========================================
// VIEWS PESSOAL
// ==========================================
function initSelect() {
    const select = document.getElementById('employeeSelect');
    if (!select) return;
    
    select.innerHTML = '<option value="">Selecione seu nome</option>';
    
    const names = Object.keys(scheduleData).sort();
    names.forEach(name=>{
        const opt = document.createElement('option'); 
        opt.value = name; 
        opt.textContent = name; 
        select.appendChild(opt);
    });

    // Remove listener anterior se existir
    const newSelect = select.cloneNode(true);
    select.parentNode.replaceChild(newSelect, select);
    newSelect.addEventListener('change', handleSelectChange);
}

function handleSelectChange(e) {
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

    infoCard.className = `hidden ${bgColor} p-4 rounded-xl mb-6 shadow-lg text-white flex flex-col transition-opacity duration-300 opacity-0`;
    infoCard.innerHTML = `
        <div class="flex items-center space-x-3 mb-3 border-b border-white/20 pb-2">
            <svg class="h-8 w-8 ${mainColor} flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                 ${isLeader ? '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20v-2c0-.656-.126-1.283-.356-1.857M9 20l3-3m0 0l-3-3m3 3h6m-3 3v-2.5M10 9a2 2 0 012-2h4a2 2 0 012 2v4a2 2 0 01-2 2h-4a2 2 0 01-2-2v-4zm-9 3a2 2 0 012-2h4a2 2 0 012 2v4a2 2 0 01-2 2H3a2 2 0 01-2-2v-4z" />' : '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />'}
            </svg>
            <div class="flex-1 min-w-0">
                <p class="text-lg font-extrabold">${employeeName}</p>
                <p class="text-xs font-semibold ${mainColor}">${employee.info.Grupo}</p>
            </div>
        </div>
        <div class="flex justify-between items-center text-xs font-semibold">
            <div class="flex-1 text-center border-r border-white/20">
                <p class="${mainColor}">Célula</p>
                <p class="font-bold">${employee.info.Célula}</p>
            </div>
            <div class="flex-1 text-center border-r border-white/20">
                <p class="${mainColor}">Turno</p>
                <p class="font-bold">${turnoDisplay}</p>
            </div>
            <div class="flex-1 text-center">
                <p class="${mainColor}">Horário</p>
                <p class="font-bold">${employee.info.Horário || '-'}</p>
            </div>
        </div>
    `;

    infoCard.classList.remove('hidden','opacity-0'); infoCard.classList.add('opacity-100');
    calendarContainer.classList.remove('hidden');
    updateCalendar(employee.schedule);
}

function updateCalendar(schedule) {
    const grid = document.getElementById('calendarGrid');
    const dowHeader = grid.previousElementSibling; 
    if (!grid) return;
    grid.innerHTML = '';
    const monthObj = { year: selectedMonthObj.year, month: selectedMonthObj.month };
    const firstDay = new Date(monthObj.year, monthObj.month, 1).getDay();
    const totalDays = schedule.length;
    const todayDay = systemDay;
    const isCurrentMonth = (systemMonth === monthObj.month && systemYear === monthObj.year);
    const isMobile = window.innerWidth <= 767;

    if (isMobile) {
        if (dowHeader) dowHeader.classList.add('hidden');
        grid.classList.remove('calendar-grid-container');
        
        const listWrapper = document.createElement('div');
        listWrapper.className = 'space-y-3';

        for (let d=1; d<=totalDays; d++) {
            const status = schedule[d-1];
            const displayStatus = statusMap[status] || status;
            const isToday = isCurrentMonth && d === todayDay;

            const li = document.createElement('div');
            const todayClass = isToday ? 'border-2 border-indigo-500 shadow-md' : 'border border-gray-100';
            
            li.className = `flex items-center justify-between bg-white p-3 rounded-xl shadow-sm transition-shadow ${todayClass}`;
            
            const left = document.createElement('div');
            const dayOfWeekIndex = new Date(monthObj.year, monthObj.month, d).getDay();

            left.innerHTML = `
                <div class="text-sm font-extrabold text-gray-800">${pad(d)} / ${pad(monthObj.month+1)}</div>
                <div class="text-xs text-gray-500">${daysOfWeek[dayOfWeekIndex]}</div>
            `;
            
            const badge = document.createElement('span');
            badge.className = `day-status status-${status}`;
            badge.textContent = displayStatus;
            
            li.appendChild(left);
            li.appendChild(badge);
            listWrapper.appendChild(li);
        }
        grid.appendChild(listWrapper);
        
    } else {
        if (dowHeader) dowHeader.classList.remove('hidden');
        grid.classList.add('calendar-grid-container');
        
        for (let i=0;i<firstDay;i++) grid.insertAdjacentHTML('beforeend','<div class="calendar-cell bg-gray-50 border-gray-100"></div>');
        for (let i=0;i<schedule.length;i++){
            const dayNumber = i+1;
            const status = schedule[i];
            const displayStatus = statusMap[status] || status;
            const currentDayClass = isCurrentMonth && dayNumber === todayDay ? 'current-day' : '';
            const cellHtml = `
                <div class="calendar-cell ${currentDayClass} border-gray-200">
                    <div class="day-number">${dayNumber}</div>
                    <div class="day-status-badge status-${status}">${displayStatus}</div>
                </div>
            `;
            grid.insertAdjacentHTML('beforeend', cellHtml);
        }
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
            const isSaturday = dow === 6;
            const satDay = isSaturday ? day : (day - 1);
            const sunDay = isSaturday ? (day + 1) : day;
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
// TABS E INICIALIZAÇÃO GLOBAL
// ==========================================
function initTabs() {
    const tabButtons = document.querySelectorAll('.tab-button');
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

function initMonthSelect() {
    const existing = document.getElementById('monthSelectWrapper');
    if(existing) existing.remove();

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
    const container = document.createElement('div'); 
    container.id = 'monthSelectWrapper';
    container.className = 'mt-3'; 
    container.appendChild(select); 
    header.appendChild(container);

    select.addEventListener('change', (e) => {
        const [y, mo] = e.target.value.split('-').map(Number);
        selectedMonthObj = { year: y, month: mo };
        
        loadMonthlyJson(y, mo).then(json => {
            rawSchedule = json;
            rebuildScheduleDataForSelectedMonth();
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
    // Carrega o mês selecionado inicialmente
    loadMonthlyJson(selectedMonthObj.year, selectedMonthObj.month).then(json => {
        rawSchedule = json;
        
        initMonthSelect();
        rebuildScheduleDataForSelectedMonth();
        
        document.getElementById('headerDate').textContent = `Mês de Referência: ${monthNames[selectedMonthObj.month]} de ${selectedMonthObj.year}`;
        
        initTabs(); 
        initDailyView();
        
        const monthObj = { year: selectedMonthObj.year, month: selectedMonthObj.month };
        const totalDays = new Date(monthObj.year, monthObj.month+1, 0).getDate();
        currentDay = Math.min(systemDay, totalDays);
        
        const ds = document.getElementById('dateSlider'); if (ds) ds.value = currentDay;
        
        updateDailyView();
        scheduleMidnightUpdate();
        updateWeekendTable();
    });

    window.addEventListener('resize', () => {
        const select = document.getElementById('employeeSelect');
        if (select && select.value) {
            updatePersonalView(select.value);
        }
    });
}

document.addEventListener('DOMContentLoaded', initGlobal);

