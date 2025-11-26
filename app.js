// app.js - Versão Definitiva (Cards de FDS Restaurados + Gráfico Tendência + IDs Corrigidos)
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
    //{ year: 2026, month: 0 }//, // Janeiro 2026 (Mês 0)
    // Para adicionar Fevereiro 2026, adicione: { year: 2026, month: 1 }
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
                    ctx.font = '10px
