// app.js - Versão Final Robusta (Card Pessoal Estilo Premium Roxo)
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
const availableMonths = [
    { year: 2025, month: 10 }, // Novembro 2025 (Mês 10)
    { year: 2025, month: 11 }//, // Dezembro 2025 (Mês 11)
];

let selectedMonthObj = availableMonths.find(m => m.year === systemYear && m.month === systemMonth) || availableMonths[0];
let currentDay = systemDay;

let rawSchedule = {};    
let scheduleData = {};   
let dailyChart = null;
let isTrendMode = false; // Estado do Gráfico

const daysOfWeek = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];
const statusMap = { 'T':'Trabalhando','F':'Folga','FS':'Folga Sáb','FD':'Folga Dom','FE':'Férias','OFF-SHIFT':'Exp.Encerrado', 'F_EFFECTIVE': 'Exp.Encerrado' };

function pad(n){ return n < 10 ? '0' + n : '' + n; }

// ==========================================
// CARREGAMENTO JSON
// ==========================================
async function loadMonthlyJson(year, month) {
    const filePath = `./data/escala-${year}-${String(month+1).padStart(2,'0')}.json`;
    try {
        const resp = await fetch(filePath);
        if (!resp.ok) return {};
        return await resp.json();
    } catch (err) {
        console.error('Erro ao carregar JSON:', err);
        return {};
    }
}

// ==========================================
// LÓGICA DE PARSE E GERAÇÃO DE ESCALA
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
    const normalized = String(dayString).replace(/\b(at[eé]|até|a)\b/gi,' a ').replace(/–|—/g,'-').replace(/\s+/g,' ').trim();
    const parts = normalized.split(',').map(p=>p.trim()).filter(p=>p.length>0);

    parts.forEach(part=>{
        const dateRange = part.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s*(?:a|-)\s*(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
        if (dateRange) {
            let [, sD, sM, sY, eD, eM, eY] = dateRange;
            sD = parseInt(sD,10); sM = parseInt(sM,10)-1; eD = parseInt(eD,10); eM = parseInt(eM,10)-1;
            let sYear = sY ? parseInt(sY,10) : monthObj.year;
            let eYear = eY ? parseInt(eY,10) : monthObj.year;
            
            // Correção virada de ano
            if (!sY && !eY && sM > eM) {
                if (monthObj.month <= eM) { sYear--; eYear = monthObj.year; } 
                else { sYear = monthObj.year; eYear++; }
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
            const d = parseInt(single[1],10), m = parseInt(single[2],10)-1;
            const y = single[3] ? parseInt(single[3],10) : monthObj.year;
            if (m === monthObj.month && y === monthObj.year) days.add(d);
            return;
        }
        
        const simple = part.match(/^(\d{1,2})-(\d{1,2})$/);
        if (simple) { for(let x=parseInt(simple[1]); x<=parseInt(simple[2]); x++) if(x>=1 && x<=totalDays) days.add(x); return; }
        
        const number = part.match(/^(\d{1,2})$/);
        if (number) { const v=parseInt(number[1]); if(v>=1 && v<=totalDays) days.add(v); return; }

        if (/fins? de semana|fim de semana/i.test(part)) {
            for (let d=1; d<=totalDays; d++){ const dow = new Date(monthObj.year, monthObj.month, d).getDay(); if (dow===0||dow===6) days.add(d); }
            return;
        }
        if (/segunda a sexta/i.test(part)) {
            for (let d=1; d<=totalDays; d++){ const dow = new Date(monthObj.year, monthObj.month, d).getDay(); if (dow>=1 && dow<=5) days.add(d); }
            return;
        }
    });
    return Array.from(days).sort((a,b)=>a-b);
}

function buildFinalScheduleForMonth(employeeData, monthObj) {
    const totalDays = new Date(monthObj.year, monthObj.month+1, 0).getDate();
    const schedule = new Array(totalDays).fill(null);

    const parseTtoArray = (t) => {
        if (!t) return [];
        if (Array.isArray(t) && t.length === totalDays && typeof t[0] === 'string') return t;
        if (typeof t === 'string' && /12x36/i.test(t)) {
            const m = t.match(/iniciado no dia\s*(\d{1,2})/i);
            return generate12x36Schedule(m ? parseInt(m[1]) : 1, totalDays);
        }
        if (typeof t === 'string' && /segunda a sexta/i.test(t)) return generate5x2ScheduleDefaultForMonth(monthObj);
        if (typeof t === 'string') {
            const parsed = parseDayListForMonth(t, monthObj);
            if(parsed.length){ const a=new Array(totalDays).fill('F'); parsed.forEach(d=>a[d-1]='T'); return a; }
        }
        if (Array.isArray(t)) {
            const arr = new Array(totalDays).fill('F');
            let hasValid = false;
            const baseStr = t.find(x=>typeof x==='string');
            if(baseStr) { const b=parseTtoArray(baseStr); for(let k=0;k<totalDays;k++) if(b[k]==='T') arr[k]='T'; hasValid=true; }
            t.filter(x=>typeof x==='number').forEach(d=>{ if(d>=1 && d<=totalDays){ arr[d-1]='T'; hasValid=true; }});
            if(hasValid) return arr;
        }
        return [];
    };

    const vacDays = parseDayListForMonth(employeeData.FE, monthObj);
    vacDays.forEach(d => { if (d>=1 && d<=totalDays) schedule[d-1] = 'FE'; });

    const tParsed = parseTtoArray(employeeData.T);
    if (Array.isArray(tParsed) && tParsed.length === totalDays) {
        for (let i=0; i<totalDays; i++) { if (schedule[i] !== 'FE' && tParsed[i] === 'T') schedule[i] = 'T'; }
    }

    parseDayListForMonth(employeeData.FD, monthObj).forEach(d => { if(schedule[d-1]!=='FE') schedule[d-1]='FD'; });
    parseDayListForMonth(employeeData.FS, monthObj).forEach(d => { if(schedule[d-1]!=='FE' && schedule[d-1]!=='FD') schedule[d-1]='FS'; });
    parseDayListForMonth(employeeData.F, monthObj).forEach(d => { if(schedule[d-1]!=='FE') schedule[d-1]='F'; });

    for (let i=0;i<totalDays;i++) if (!schedule[i]) schedule[i] = employeeData.T ? 'T' : 'F';
    return schedule;
}

function parseSingleTimeRange(rangeStr) {
    if (!rangeStr || typeof rangeStr !== 'string') return null;
    const m = rangeStr.match(/(\d{1,2}):(\d{2})\s*às\s*(\d{1,2}):(\d{2})/);
    if (!m) return null;
    return { startTotal: parseInt(m[1])*60 + parseInt(m[2]), endTotal: parseInt(m[3])*60 + parseInt(m[4]) };
}

function isWorkingTime(timeRange) {
    if (!timeRange || /12x36/i.test(timeRange)) return true;
    const now = new Date();
    const curr = now.getHours()*60 + now.getMinutes();
    const ranges = Array.isArray(timeRange) ? timeRange : [timeRange];
    
    for (const r of ranges) {
        const p = parseSingleTimeRange(r);
        if (!p) continue;
        if (p.startTotal > p.endTotal) { if (curr >= p.startTotal || curr <= p.endTotal) return true; }
        else { if (curr >= p.startTotal && curr <= p.endTotal) return true; }
    }
    return false;
}

function rebuildScheduleDataForSelectedMonth() {
    const monthObj = { year: selectedMonthObj.year, month: selectedMonthObj.month };
    scheduleData = {};
    if (!rawSchedule) return;

    Object.keys(rawSchedule).forEach(name => {
        scheduleData[name] = {
            info: rawSchedule[name],
            schedule: buildFinalScheduleForMonth(rawSchedule[name], monthObj)
        };
    });

    const totalDays = new Date(monthObj.year, monthObj.month+1, 0).getDate();
    const slider = document.getElementById('dateSlider');
    if (slider) {
        slider.max = totalDays;
        document.getElementById('sliderMaxLabel').textContent = `Dia ${totalDays}`;
        if (currentDay > totalDays) currentDay = totalDays;
        slider.value = currentDay;
    }
    initSelect();
}

// ==========================================
// FUNÇÕES DE GRÁFICO (DONUT E LINHA)
// ==========================================

function toggleChartMode() {
    isTrendMode = !isTrendMode;
    const btn = document.getElementById("btnToggleChart");
    const title = document.getElementById("chartTitle");
    
    if (isTrendMode) {
        if(btn) btn.textContent = "Ver Visão Diária";
        if(title) title.textContent = "Tendência de Capacidade (Mês)";
        renderMonthlyTrendChart();
    } else {
        if(btn) btn.textContent = "Ver Tendência Mensal";
        if(title) title.textContent = "Capacidade Operacional Atual";
        updateDailyView();
    }
}

const centerTextPlugin = {
    id: 'centerTextPlugin',
    beforeDraw: (chart) => {
        if (chart.config.type !== 'doughnut') return;
        const { ctx, width, height, data } = chart;
        const total = data.datasets[0].data.reduce((a, b) => a + b, 0);
        const wIdx = data.labels.findIndex(l => l.includes('Trabalhando'));
        const wCount = wIdx !== -1 ? data.datasets[0].data[wIdx] : 0;
        const pct = total > 0 ? ((wCount / total) * 100).toFixed(0) : 0;
        
        ctx.save();
        ctx.font = 'bolder 3rem sans-serif';
        ctx.fillStyle = pct >= 75 ? '#10b981' : '#ef4444';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${pct}%`, width/2, height/2 - 15);
        ctx.font = '500 0.8rem sans-serif';
        ctx.fillStyle = '#6b7280';
        ctx.fillText('CAPACIDADE', width/2, height/2 + 25);
        ctx.restore();
    }
};

function renderMonthlyTrendChart() {
    const monthObj = { year: selectedMonthObj.year, month: selectedMonthObj.month };
    const totalDays = new Date(monthObj.year, monthObj.month + 1, 0).getDate();
    
    const labels = [];
    const dataPoints = [];
    const pointColors = [];

    for (let d = 1; d <= totalDays; d++) {
        let working = 0;
        let totalStaff = 0;

        Object.keys(scheduleData).forEach(name => {
            const employee = scheduleData[name];
            if(!employee.schedule) return;
            const status = employee.schedule[d-1];
            
            if (status === 'T') working++;
            if (status !== 'FE') totalStaff++;
        });

        const percentage = totalStaff > 0 ? ((working / totalStaff) * 100).toFixed(0) : 0;
        labels.push(d);
        dataPoints.push(percentage);
        pointColors.push(percentage < 75 ? '#ef4444' : '#10b981');
    }

    const ctx = document.getElementById('dailyChart').getContext('2d');
    if (dailyChart) { dailyChart.destroy(); dailyChart = null; }

    dailyChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Capacidade (%)',
                data: dataPoints,
                borderColor: '#4f46e5',
                backgroundColor: 'rgba(79, 70, 229, 0.1)',
                pointBackgroundColor: pointColors,
                pointRadius: 4,
                pointHoverRadius: 7,
                fill: true,
                tension: 0.3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: (c) => ` ${c.raw}% da Equipe` } },
                centerTextPlugin: false
            },
            scales: {
                y: { min: 0, max: 100, ticks: { callback: v => v+'%' }, grid: { color: '#f3f4f6' } },
                x: { grid: { display: false } }
            },
            onClick: (e, activeEls) => {
                if(activeEls.length > 0) {
                    const day = activeEls[0].index + 1;
                    currentDay = day;
                    const slider = document.getElementById('dateSlider');
                    if(slider) slider.value = day;
                    toggleChartMode();
                }
            }
        },
        plugins: [{
            id: 'targetLine',
            beforeDraw: (chart) => {
                const { ctx, chartArea: { left, right }, scales: { y } } = chart;
                const yValue = y.getPixelForValue(75);
                if(yValue) {
                    ctx.save();
                    ctx.beginPath();
                    ctx.strokeStyle = '#9ca3af';
                    ctx.lineWidth = 1;
                    ctx.setLineDash([5, 5]);
                    ctx.moveTo(left, yValue);
                    ctx.lineTo(right, yValue);
                    ctx.stroke();
                    ctx.fillStyle = '#6b7280';
                    ctx.font = '10px sans-serif';
                    ctx.fillText('Meta 75%', left + 5, yValue - 5);
                    ctx.restore();
                }
            }
        }]
    });
}

function updateDailyChartDonut(working, off, offShift, vacation) {
    const labels = [`Trabalhando (${working})`, `Folga (${off})`, `Encerrado (${offShift})`, `Férias (${vacation})`];
    const rawColors = ['#10b981','#fcd34d','#f9a8d4','#ef4444'];
    const fData=[], fLabels=[], fColors=[];
    [working, off, offShift, vacation].forEach((d,i)=>{ 
        if(d>0 || (working+off+offShift+vacation)===0){ fData.push(d); fLabels.push(labels[i]); fColors.push(rawColors[i]); }
    });

    const ctx = document.getElementById('dailyChart').getContext('2d');
    if (dailyChart) {
        if (dailyChart.config.type !== 'doughnut') {
            dailyChart.destroy();
            dailyChart = null;
        }
    }

    if (!dailyChart) {
        dailyChart = new Chart(ctx, {
            type: 'doughnut',
            data: { labels: fLabels, datasets:[{ data: fData, backgroundColor: fColors, hoverOffset:4 }] },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '70%',
                plugins: { legend: { position:'bottom', labels:{ padding:15, boxWidth: 10 } } }
            },
            plugins: [centerTextPlugin]
        });
    } else {
        dailyChart.data.labels = fLabels;
        dailyChart.data.datasets[0].data = fData;
        dailyChart.data.datasets[0].backgroundColor = fColors;
        dailyChart.update();
    }
}

function updateDailyView() {
    if (isTrendMode) {
        isTrendMode = false;
        const btn = document.getElementById("btnToggleChart");
        if(btn) btn.textContent = "Ver Tendência Mensal";
        const title = document.getElementById("chartTitle");
        if(title) title.textContent = "Capacidade Operacional Atual";
    }

    const currentDateLabel = document.getElementById('currentDateLabel');
    const monthObj = { year: selectedMonthObj.year, month: selectedMonthObj.month };
    const dayOfWeekIndex = new Date(monthObj.year, monthObj.month, currentDay).getDay();
    const now = new Date();
    const isToday = (now.getDate() === currentDay && now.getMonth() === systemMonth && now.getFullYear() === systemYear);
    
    currentDateLabel.textContent = `${daysOfWeek[dayOfWeekIndex]}, ${pad(currentDay)}/${pad(monthObj.month+1)}/${monthObj.year}`;

    let w=0, o=0, v=0, os=0;
    let wH='', oH='', vH='', osH='';

    if (Object.keys(scheduleData).length === 0) {
        updateDailyChartDonut(0,0,0,0);
        return;
    }

    Object.keys(scheduleData).forEach(name=>{
        const emp = scheduleData[name];
        let status = emp.schedule[currentDay-1] || 'F';
        let display = status;

        if (status === 'FE') { v++; display='FE'; }
        else if (isToday && status === 'T') {
            if (!isWorkingTime(emp.info.Horário)) { os++; display='OFF-SHIFT'; status='F_EFFECTIVE'; }
            else w++;
        }
        else if (status === 'T') w++;
        else o++; 

        const row = `
            <li class="flex justify-between items-center text-sm p-3 rounded hover:bg-indigo-50 border-b border-gray-100 last:border-0 transition-colors">
                <div class="flex flex-col"><span class="font-semibold text-gray-700">${name}</span><span class="text-xs text-gray-400">${emp.info.Horário||''}</span></div>
                <span class="day-status status-${display}">${statusMap[display]||display}</span>
            </li>`;

        if (status==='T') wH+=row;
        else if (status==='F_EFFECTIVE') osH+=row;
        else if (['FE'].includes(status)) vH+=row;
        else oH+=row;
    });

    document.getElementById('kpiWorking').textContent = w;
    document.getElementById('kpiOffShift').textContent = os;
    document.getElementById('kpiOff').textContent = o;
    document.getElementById('kpiVacation').textContent = v;

    document.getElementById('listWorking').innerHTML = wH || '<li class="text-gray-400 text-sm text-center py-4">Ninguém.</li>';
    document.getElementById('listOffShift').innerHTML = osH || '<li class="text-gray-400 text-sm text-center py-4">Ninguém.</li>';
    document.getElementById('listOff').innerHTML = oH || '<li class="text-gray-400 text-sm text-center py-4">Ninguém.</li>';
    document.getElementById('listVacation').innerHTML = vH || '<li class="text-gray-400 text-sm text-center py-4">Ninguém.</li>';

    updateDailyChartDonut(w, o, os, v);
}

// ==========================================
// VIEWS PESSOAL & INICIALIZAÇÃO
// ==========================================
function initSelect() {
    const select = document.getElementById('employeeSelect');
    if (!select) return;
    select.innerHTML = '<option value="">Selecione seu nome</option>';
    Object.keys(scheduleData).sort().forEach(name=>{
        const opt = document.createElement('option'); opt.value=name; opt.textContent=name; select.appendChild(opt);
    });
    const newSelect = select.cloneNode(true);
    select.parentNode.replaceChild(newSelect, select);
    newSelect.addEventListener('change', e => {
        const name = e.target.value;
        if(name) updatePersonalView(name);
        else document.getElementById('personalInfoCard').classList.add('hidden');
    });
}

// ==========================================
// ATUALIZAÇÃO DO CARD PESSOAL (NOVO ESTILO PREMIUM)
// ==========================================
function updatePersonalView(name) {
    const emp = scheduleData[name];
    if (!emp) return;
    const card = document.getElementById('personalInfoCard');
    
    // Dados extraídos ou defaults
    const cargo = emp.info.Cargo || emp.info.Grupo || 'Colaborador';
    const horario = emp.info.Horário || '--:--';
    
    // Fallback para Célula e Turno
    const celula = emp.info.Celula || 'Sitelbra/ B2B';
    
    let turno = emp.info.Turno;
    if(!turno && horario !== '--:--') {
        const startH = parseInt(horario.split(':')[0]);
        if(!isNaN(startH)) {
            if(startH >= 18 || startH <= 5) turno = 'Noturno';
            else turno = 'Comercial';
        } else { turno = 'Comercial'; }
    } else if(!turno) { turno = 'Comercial'; }

    // Estilo e Exibição do Card
    card.classList.remove('hidden');
    // Usando gradient from-violet-600 to-purple-600 para dar o tom da imagem
    card.className = "mb-8 bg-gradient-to-r from-violet-700 to-purple-600 rounded-2xl shadow-xl overflow-hidden text-white transform transition-all duration-300";

    card.innerHTML = `
        <div class="px-6 py-5">
            <h2 class="text-3xl font-extrabold tracking-tight mb-1">${name}</h2>
            <div class="flex items-center gap-2">
                <span class="w-2 h-2 rounded-full bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.8)]"></span>
                <p class="text-purple-200 text-sm font-semibold uppercase tracking-widest">${cargo}</p>
            </div>
        </div>

        <div class="h-px w-full bg-white opacity-20"></div>

        <div class="flex flex-row items-center justify-between bg-black/10 backdrop-blur-sm">
            
            <div class="flex-1 py-4 px-2 text-center border-r border-white/10 hover:bg-white/5 transition-colors">
                <span class="block text-[10px] md:text-xs text-purple-200 font-bold uppercase mb-1 tracking-wider opacity-80">Célula</span>
                <span class="block text-sm md:text-lg font-bold text-white whitespace-nowrap">${celula}</span>
            </div>

            <div class="flex-1 py-4 px-2 text-center border-r border-white/10 hover:bg-white/5 transition-colors">
                <span class="block text-[10px] md:text-xs text-purple-200 font-bold uppercase mb-1 tracking-wider opacity-80">Turno</span>
                <span class="block text-sm md:text-lg font-bold text-white whitespace-nowrap">${turno}</span>
            </div>

            <div class="flex-1 py-4 px-2 text-center hover:bg-white/5 transition-colors">
                <span class="block text-[10px] md:text-xs text-purple-200 font-bold uppercase mb-1 tracking-wider opacity-80">Horário</span>
                <span class="block text-sm md:text-lg font-bold text-white whitespace-nowrap">${horario}</span>
            </div>
        </div>
    `;

    document.getElementById('calendarContainer').classList.remove('hidden');
    updateCalendar(emp.schedule);
}

// ==========================================
// ATUALIZAÇÃO DO CALENDÁRIO (MOBILE EM PÍLULAS)
// ==========================================
function updateCalendar(schedule) {
    const grid = document.getElementById('calendarGrid');
    const isMobile = window.innerWidth <= 767;
    grid.innerHTML = '';
    
    if(isMobile) {
        grid.className = 'space-y-3 mt-4'; // Espaçamento entre as pílulas
        schedule.forEach((st, i) => {
            // Definição de classes base para a pílula
            let pillClasses = "flex justify-between items-center p-3 px-5 rounded-full border shadow-sm transition-all hover:shadow-md";
            
            // Aplicação de cores conforme o status, com destaque para 'T' (Trabalhando)
            if(st === 'T') {
                pillClasses += " bg-green-100 text-green-800 border-green-200"; // Estilo Trabalhando
            } else if (st.startsWith('F') && st !== 'FE') { // Folga, Folga Sáb, Folga Dom
                pillClasses += " bg-orange-100 text-orange-800 border-orange-200"; // Estilo Folga (Laranja/Amarelo)
            } else if (st === 'FE') {
                pillClasses += " bg-red-100 text-red-800 border-red-200"; // Estilo Férias
            } else {
                pillClasses += " bg-gray-100 text-gray-800 border-gray-200"; // Outros
            }

            grid.insertAdjacentHTML('beforeend', `
                <div class="${pillClasses}">
                    <span class="font-medium">Dia ${i+1}</span>
                    <span class="font-bold">${statusMap[st]||st}</span>
                </div>
            `);
        });
    } else {
        // Visualização Desktop (mantida)
        grid.className = 'calendar-grid-container';
        const m = { y: selectedMonthObj.year, mo: selectedMonthObj.month };
        const empty = new Date(m.y, m.mo, 1).getDay();
        for(let i=0;i<empty;i++) grid.insertAdjacentHTML('beforeend','<div class="calendar-cell bg-gray-50"></div>');
        schedule.forEach((st, i) => {
             grid.insertAdjacentHTML('beforeend', `<div class="calendar-cell bg-white border"><div class="day-number">${i+1}</div><div class="day-status-badge status-${st}">${statusMap[st]||st}</div></div>`);
        });
    }
}

// ==========================================
// FUNÇÃO ATUALIZADA - CARD DE FIM DE SEMANA
// ==========================================
function updateWeekendTable() {
    const container = document.getElementById('weekendPlantaoContainer');
    if (!container) return;
    container.innerHTML = '';
    const m = { y: selectedMonthObj.year, mo: selectedMonthObj.month };
    const total = new Date(m.y, m.mo+1, 0).getDate();
    
    // Helper simples para formatar DD/MM
    const fmtDate = (d) => `${pad(d)}/${pad(m.mo+1)}`;

    for (let d=1; d<=total; d++){
        const dow = new Date(m.y, m.mo, d).getDay();
        
        // Verifica se é Sábado (dow === 6)
        if (dow === 6) { 
            const satDate = d;
            const sunDate = d+1 <= total ? d+1 : null;
            
            let satW=[], sunW=[];
            
            Object.keys(scheduleData).forEach(n=>{
                if(scheduleData[n].schedule[satDate-1]==='T') satW.push(n);
                if(sunDate && scheduleData[n].schedule[sunDate-1]==='T') sunW.push(n);
            });
            
            // Se houver alguém trabalhando no fds, monta o card
            if(satW.length || sunW.length) {
                
                // Função auxiliar para gerar as tags
                const makeTags = (list, bgColorClass, borderColorClass, textColorClass) => {
                    if(!list.length) return '<span class="text-gray-400 text-sm italic pl-1">Sem escala</span>';
                    return list.map(name => 
                        // Uso de ${bgColorClass} garantindo a cor dentro
                        `<span class="inline-block ${bgColorClass} border ${borderColorClass} ${textColorClass} px-3 py-1 rounded-full text-sm font-medium shadow-sm mb-2 mr-2">${name}</span>`
                    ).join('');
                };

                // Definição das cores INTENSIFICADAS (blue-100 / purple-100)
                const satTags = makeTags(satW, 'bg-blue-100', 'border-blue-300', 'text-blue-800');
                const sunTags = makeTags(sunW, 'bg-purple-100', 'border-purple-300', 'text-purple-800');
                
                // Strings formatadas conforme solicitado
                const labelSat = `sábado (${fmtDate(satDate)})`;
                const labelSun = sunDate ? `domingo (${fmtDate(sunDate)})` : 'domingo';

                const cardHTML = `
                <div class="bg-white rounded-xl shadow-lg overflow-hidden border border-gray-100 mb-8 max-w-md mx-auto md:mx-0">
                    <div class="bg-gradient-to-r from-blue-600 to-blue-500 p-4 flex items-center justify-center text-white shadow-md">
                        <svg class="w-5 h-5 mr-2 opacity-90" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                        <h3 class="font-bold text-lg tracking-wide">Fim de Semana ${fmtDate(satDate)}</h3>
                    </div>

                    <div class="p-6">
                        <div class="flex items-start mb-6">
                            <div class="w-1 self-stretch bg-blue-400 rounded-full mr-4 opacity-70 flex-shrink-0"></div> 
                            <div class="flex-1">
                                <h4 class="text-blue-600 font-bold text-xs uppercase tracking-wider mb-3">${labelSat}</h4>
                                <div class="flex flex-wrap">
                                    ${satTags}
                                </div>
                            </div>
                        </div>

                        ${sunDate ? `
                        <div class="flex items-start">
                            <div class="w-1 self-stretch bg-purple-400 rounded-full mr-4 opacity-70 flex-shrink-0"></div>
                            <div class="flex-1">
                                <h4 class="text-purple-600 font-bold text-xs uppercase tracking-wider mb-3">${labelSun}</h4>
                                <div class="flex flex-wrap">
                                    ${sunTags}
                                </div>
                            </div>
                        </div>
                        ` : ''}
                    </div>
                </div>`;
                
                container.insertAdjacentHTML('beforeend', cardHTML);
            }
        }
    }
}

function initTabs() {
    document.querySelectorAll('.tab-button').forEach(b => {
        b.addEventListener('click', () => {
            document.querySelectorAll('.tab-button').forEach(x=>x.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(x=>x.classList.add('hidden'));
            b.classList.add('active');
            document.getElementById(`${b.dataset.tab}View`).classList.remove('hidden');
            if(b.dataset.tab==='personal') updateWeekendTable();
        });
    });
}

function initGlobal() {
    loadMonthlyJson(selectedMonthObj.year, selectedMonthObj.month).then(json => {
        rawSchedule = json;
        initTabs();
        
        const header = document.querySelector('header');
        if(!document.getElementById('monthSel')) {
            const sel = document.createElement('select'); sel.id='monthSel';
            sel.className = 'mt-2 p-2 rounded border';
            availableMonths.forEach(m => {
                const opt = document.createElement('option'); opt.value=`${m.year}-${m.month}`;
                opt.textContent = `${monthNames[m.month]}/${m.year}`;
                if(m.month===selectedMonthObj.month) opt.selected=true;
                sel.appendChild(opt);
            });
            sel.addEventListener('change', e=>{
                const [y,mo] = e.target.value.split('-').map(Number);
                selectedMonthObj={year:y, month:mo};
                initGlobal(); 
            });
            header.appendChild(sel);
        }

        rebuildScheduleDataForSelectedMonth();
        
        const ds = document.getElementById('dateSlider');
        if (ds) ds.addEventListener('input', e => { currentDay = parseInt(e.target.value); updateDailyView(); });

        updateDailyView();
        
        const now = new Date(), night = new Date(now);
        night.setHours(24,0,0,0);
        setTimeout(() => location.reload(), night - now);
    });
}

document.addEventListener('DOMContentLoaded', initGlobal);
