// app.js - Versão com Card de Colaborador Cinza
// ==========================================
// 1. IMPORTAÇÕES FIREBASE (WEB SDK)
// ==========================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";

// ==========================================
// 2. CONFIGURAÇÃO (SUAS CHAVES)
// ==========================================
const firebaseConfig = {
  apiKey: "AIzaSyCBKSPH7lfUt0VsQPhJX3a0CQ2wYcziQvM",
  authDomain: "dadosescala.firebaseapp.com",
  projectId: "dadosescala",
  storageBucket: "dadosescala.firebasestorage.app",
  messagingSenderId: "117221956502",
  appId: "1:117221956502:web:e5a7f051daf3306b501bb7"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// ==========================================
// 3. VARIÁVEIS DE ESTADO
// ==========================================
let isAdmin = false;
let hasUnsavedChanges = false;
let scheduleData = {}; 
let rawSchedule = {};  
let dailyChart = null;
let isTrendMode = false;
let currentDay = new Date().getDate();

const currentDateObj = new Date();
const monthNames = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const systemYear = currentDateObj.getFullYear();
const systemMonth = currentDateObj.getMonth(); 

const availableMonths = [
    { year: 2025, month: 10 }, 
    { year: 2025, month: 11 }, 
    { year: 2026, month: 0 }, 
    { year: 2026, month: 1 }, 
    { year: 2026, month: 2 }, 
    { year: 2026, month: 3 }, 
    { year: 2026, month: 4 }, 
    { year: 2026, month: 5 }, 
    { year: 2026, month: 6 }, 
    { year: 2026, month: 7 }, 
    { year: 2026, month: 8 }, 
    { year: 2026, month: 9 }, 
    { year: 2026, month: 10 }, 
    { year: 2026, month: 11 }  
];

let selectedMonthObj = availableMonths.find(m => m.year === systemYear && m.month === systemMonth) || availableMonths[availableMonths.length-1];

const statusMap = { 'T':'Trabalhando','F':'Folga','FS':'Folga Sáb','FD':'Folga Dom','FE':'Férias','OFF-SHIFT':'Exp.Encerrado', 'F_EFFECTIVE': 'Exp.Encerrado' };
const daysOfWeek = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];

function pad(n){ return n < 10 ? '0' + n : '' + n; }

// ==========================================
// 4. LÓGICA DE AUTENTICAÇÃO (Painel)
// ==========================================
const adminToolbar = document.getElementById('adminToolbar');
const btnOpenLogin = document.getElementById('btnOpenLogin');
const btnLogout = document.getElementById('btnLogout');

// Logout
if(btnLogout) btnLogout.addEventListener('click', () => {
    signOut(auth);
    window.location.reload();
});

// Monitorar Estado do Usuário
onAuthStateChanged(auth, (user) => {
    if (user) {
        // Logado como Admin
        isAdmin = true;
        adminToolbar.classList.remove('hidden');
        if(btnOpenLogin) btnOpenLogin.classList.add('hidden');
        document.getElementById('adminEditHint').classList.remove('hidden');
        
        // CORREÇÃO: Adiciona padding no rodapé para a barra flutuante não cobrir o footer
        document.body.style.paddingBottom = "100px"; 
    } else {
        // Visitante
        isAdmin = false;
        adminToolbar.classList.add('hidden');
        if(btnOpenLogin) btnOpenLogin.classList.remove('hidden');
        document.getElementById('adminEditHint').classList.add('hidden');
        
        document.body.style.paddingBottom = "0";
    }
    updateDailyView();
    const sel = document.getElementById('employeeSelect');
    if(sel && sel.value) updatePersonalView(sel.value);
});

// ==========================================
// 5. CARREGAMENTO DE DADOS (FIRESTORE)
// ==========================================
async function loadDataFromCloud() {
    const docId = `escala-${selectedMonthObj.year}-${String(selectedMonthObj.month+1).padStart(2,'0')}`;
    try {
        const docRef = doc(db, "escalas", docId);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            rawSchedule = docSnap.data();
            processScheduleData(); 
            updateDailyView();
            initSelect();
        } else {
            console.log("Nenhum documento encontrado.");
            rawSchedule = {}; 
            processScheduleData();
            updateDailyView();
        }
    } catch (e) {
        console.error("Erro ao baixar dados:", e);
    }
}

// Salvar na Nuvem
async function saveToCloud() {
    if(!isAdmin) return;
    const btn = document.getElementById('btnSaveCloud');
    const status = document.getElementById('saveStatus');
    const statusIcon = document.getElementById('saveStatusIcon');
    
    // Estado Carregando
    btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Salvando...';
    btn.classList.add('opacity-75', 'cursor-not-allowed');
    
    const docId = `escala-${selectedMonthObj.year}-${String(selectedMonthObj.month+1).padStart(2,'0')}`;
    
    try {
        await setDoc(doc(db, "escalas", docId), rawSchedule, { merge: true });
        
        hasUnsavedChanges = false;
        
        // Estado Sucesso
        status.textContent = "Sincronizado";
        status.className = "text-xs text-gray-300 font-medium";
        if(statusIcon) statusIcon.className = "w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]";
        
        setTimeout(() => {
            btn.innerHTML = '<i class="fas fa-cloud-upload-alt mr-2 group-hover:-translate-y-0.5 transition-transform"></i> Salvar';
            btn.classList.remove('opacity-75', 'cursor-not-allowed');
        }, 1000);

    } catch (e) {
        console.error("Erro ao salvar:", e);
        alert("Erro ao salvar!");
        btn.innerHTML = '<i class="fas fa-exclamation-circle"></i> Erro';
    }
}

document.getElementById('btnSaveCloud').addEventListener('click', saveToCloud);

// ==========================================
// 6. PROCESSAMENTO DE DADOS
// ==========================================
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
    if (Array.isArray(dayString)) return dayString; 

    const totalDays = new Date(monthObj.year, monthObj.month+1, 0).getDate();
    const days = new Set();
    const normalized = String(dayString).replace(/\b(at[eé]|até|a)\b/gi,' a ').replace(/–|—/g,'-').replace(/\s+/g,' ').trim();
    const parts = normalized.split(',').map(p=>p.trim()).filter(p=>p.length>0);

    parts.forEach(part=>{
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
    
    if (employeeData.calculatedSchedule && Array.isArray(employeeData.calculatedSchedule)) {
        return employeeData.calculatedSchedule;
    }

    const schedule = new Array(totalDays).fill(null);
    let tArr = [];
    if(typeof employeeData.T === 'string' && /segunda a sexta/i.test(employeeData.T)) tArr = generate5x2ScheduleDefaultForMonth(monthObj);
    else if(Array.isArray(employeeData.T)) {
        const arr = new Array(totalDays).fill('F');
        employeeData.T.forEach(x => { if(typeof x === 'number') arr[x-1] = 'T'; });
        tArr = arr;
    }

    const vacDays = parseDayListForMonth(employeeData.FE, monthObj);
    vacDays.forEach(d => { if (d>=1 && d<=totalDays) schedule[d-1] = 'FE'; });

    const fsDays = parseDayListForMonth(employeeData.FS, monthObj);
    fsDays.forEach(d => { if(schedule[d-1] !== 'FE') schedule[d-1] = 'FS'; });

    const fdDays = parseDayListForMonth(employeeData.FD, monthObj);
    fdDays.forEach(d => { if(schedule[d-1] !== 'FE') schedule[d-1] = 'FD'; });

    for(let i=0; i<totalDays; i++) {
        if(!schedule[i]) {
            if(tArr[i] === 'T') schedule[i] = 'T';
            else schedule[i] = 'F';
        }
    }
    return schedule;
}

function processScheduleData() {
    scheduleData = {};
    if (!rawSchedule) return;

    Object.keys(rawSchedule).forEach(name => {
        const finalArr = buildFinalScheduleForMonth(rawSchedule[name], selectedMonthObj);
        scheduleData[name] = {
            info: rawSchedule[name],
            schedule: finalArr
        };
        rawSchedule[name].calculatedSchedule = finalArr;
    });

    const totalDays = new Date(selectedMonthObj.year, selectedMonthObj.month+1, 0).getDate();
    const slider = document.getElementById('dateSlider');
    if (slider) {
        slider.max = totalDays;
        document.getElementById('sliderMaxLabel').textContent = `Dia ${totalDays}`;
        if (currentDay > totalDays) currentDay = totalDays;
        slider.value = currentDay;
    }
}

// ==========================================
// 7. INTERFACE E GRÁFICOS
// ==========================================
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

window.toggleChartMode = function() {
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
    const totalDays = new Date(selectedMonthObj.year, selectedMonthObj.month + 1, 0).getDate();
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
            plugins: { legend: { display: false }, centerTextPlugin: false },
            scales: {
                y: { min: 0, max: 100, ticks: { callback: v => v+'%' }, grid: { color: '#f3f4f6' } },
                x: { grid: { display: false } }
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
        if (dailyChart.config.type !== 'doughnut') { dailyChart.destroy(); dailyChart = null; }
    }
    if (!dailyChart) {
        dailyChart = new Chart(ctx, {
            type: 'doughnut',
            data: { labels: fLabels, datasets:[{ data: fData, backgroundColor: fColors, hoverOffset:4 }] },
            options: { responsive: true, maintainAspectRatio: false, cutout: '70%', plugins: { legend: { position:'bottom', labels:{ padding:15, boxWidth: 10 } } } },
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
    if (isTrendMode) window.toggleChartMode();

    const currentDateLabel = document.getElementById('currentDateLabel');
    const dayOfWeekIndex = new Date(selectedMonthObj.year, selectedMonthObj.month, currentDay).getDay();
    const now = new Date();
    const isToday = (now.getDate() === currentDay && now.getMonth() === selectedMonthObj.month && now.getFullYear() === selectedMonthObj.year);
    
    currentDateLabel.textContent = `${daysOfWeek[dayOfWeekIndex]}, ${pad(currentDay)}/${pad(selectedMonthObj.month+1)}/${selectedMonthObj.year}`;

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
// 8. VISÃO PESSOAL E EDIÇÃO (ADMIN)
// ==========================================

function initSelect() {
    const select = document.getElementById('employeeSelect');
    if (!select) return;
    select.innerHTML = '<option value="">Selecione um colaborador</option>';
    Object.keys(scheduleData).sort().forEach(name=>{
        const opt = document.createElement('option'); opt.value=name; opt.textContent=name; select.appendChild(opt);
    });
    
    // Clonar para limpar listeners antigos
    const newSelect = select.cloneNode(true);
    select.parentNode.replaceChild(newSelect, select);
    
    newSelect.addEventListener('change', e => {
        const name = e.target.value;
        if(name) {
            updatePersonalView(name);
        } else {
            // SE NÃO TIVER SELEÇÃO (vazio), ESCONDE TUDO
            document.getElementById('personalInfoCard').classList.add('hidden');
            document.getElementById('calendarContainer').classList.add('hidden');
        }
    });
}

function updatePersonalView(name) {
    const emp = scheduleData[name];
    if (!emp) return;
    const card = document.getElementById('personalInfoCard');
    
    const cargo = emp.info.Cargo || emp.info.Grupo || 'Colaborador';
    const horario = emp.info.Horário || '--:--';
    const celula = emp.info.Célula || emp.info.Celula || emp.info.CELULA || 'Sitelbra/ B2B';
    let turno = emp.info.Turno || 'Comercial';

    let statusToday = emp.schedule[currentDay - 1] || 'F';
    let displayStatus = statusToday;

    // Lógica para Expediente Encerrado (Roxo)
    const now = new Date();
    const isToday = (now.getDate() === currentDay && 
                     now.getMonth() === selectedMonthObj.month && 
                     now.getFullYear() === selectedMonthObj.year);

    if (isToday && statusToday === 'T') {
        if (!isWorkingTime(emp.info.Horário)) {
            displayStatus = 'OFF-SHIFT';
        }
    }

    // Mapa de Cores da Bolinha
    const colorClasses = {
        'T': 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.8)]',
        'F': 'bg-yellow-400 shadow-[0_0_8px_rgba(250,204,21,0.8)]',
        'FS': 'bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.8)]',
        'FD': 'bg-blue-700 shadow-[0_0_8px_rgba(29,78,216,0.8)]',
        'FE': 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]',
        'OFF-SHIFT': 'bg-fuchsia-500 shadow-[0_0_8px_rgba(217,70,239,0.8)]'
    };

    let dotClass = colorClasses[displayStatus] || 'bg-gray-400 shadow-none';

    card.classList.remove('hidden');
    // ALTERAÇÃO AQUI: CARD CINZA (bg-gray-200) e Borda Cinza (border-gray-300)
    card.className = "mb-8 bg-gray-200 rounded-2xl shadow-xl overflow-hidden transform transition-all duration-300 border border-gray-300";

    card.innerHTML = `
        <div class="px-6 py-4">
            <h2 class="text-xl md:text-2xl font-extrabold tracking-tight mb-1 text-gray-800">${name}</h2>
            <div class="flex items-center gap-2">
                <span class="w-2 h-2 rounded-full ${dotClass}"></span>
                <p class="text-indigo-600 text-xs font-semibold uppercase tracking-widest">${cargo}</p>
            </div>
        </div>
        <div class="h-px w-full bg-gray-300"></div>
        <div class="flex flex-row items-center justify-between bg-gray-300/50">
            <div class="flex-1 py-4 px-2 text-center border-r border-gray-300">
                <span class="block text-[10px] md:text-xs text-gray-600 font-bold uppercase mb-1 tracking-wider">Célula</span>
                <span class="block text-xs md:text-sm font-bold text-gray-800 whitespace-nowrap">${celula}</span>
            </div>
            <div class="flex-1 py-4 px-2 text-center border-r border-gray-300">
                <span class="block text-[10px] md:text-xs text-gray-600 font-bold uppercase mb-1 tracking-wider">Turno</span>
                <span class="block text-xs md:text-sm font-bold text-gray-800 whitespace-nowrap">${turno}</span>
            </div>
            <div class="flex-1 py-4 px-2 text-center">
                <span class="block text-[10px] md:text-xs text-gray-600 font-bold uppercase mb-1 tracking-wider">Horário</span>
                <span class="block text-xs md:text-sm font-bold text-gray-800 whitespace-nowrap">${horario}</span>
            </div>
        </div>
    `;

    document.getElementById('calendarContainer').classList.remove('hidden');
    updateCalendar(name, emp.schedule);
}

// ----------------------------------------------------
// Lógica de Edição: CICLO (Modo Simples)
// ----------------------------------------------------

function cycleStatus(current) {
    const sequence = ['T', 'F', 'FS', 'FD', 'FE'];
    let idx = sequence.indexOf(current);
    if(idx === -1) return 'T';
    return sequence[(idx + 1) % sequence.length];
}

async function handleCellClick(name, dayIndex) {
    if (!isAdmin) return;
    
    // 1. Atualiza Status
    const emp = scheduleData[name];
    const newStatus = cycleStatus(emp.schedule[dayIndex]);
    emp.schedule[dayIndex] = newStatus;
    rawSchedule[name].calculatedSchedule = emp.schedule;
    
    // 2. Feedback na Nova Barra
    hasUnsavedChanges = true;
    const statusEl = document.getElementById('saveStatus');
    const statusIcon = document.getElementById('saveStatusIcon');
    if(statusEl) {
        statusEl.textContent = "Alterações pendentes...";
        statusEl.className = "text-xs text-amber-400 font-medium transition-colors";
    }
    if(statusIcon) {
        statusIcon.className = "w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse shadow-[0_0_8px_rgba(251,191,36,0.6)] transition-all";
    }
    
    // 3. Atualizações Visuais
    updateCalendar(name, emp.schedule);
    updateDailyView();
    
    // 4. ATUALIZAÇÃO FORÇADA DOS CARDS DE FIM DE SEMANA
    const sel = document.getElementById('employeeSelect');
    const currentSelection = sel ? sel.value : null;
    updateWeekendTable(currentSelection);
}

function updateCalendar(name, schedule) {
    const grid = document.getElementById('calendarGrid');
    const isMobile = window.innerWidth <= 767;
    grid.innerHTML = '';
    
    if(isMobile) {
        grid.className = 'space-y-3 mt-4';
        schedule.forEach((st, i) => {
            let pillClasses = "flex justify-between items-center p-3 px-5 rounded-full border shadow-sm transition-all";
            if(isAdmin) pillClasses += " cursor-pointer hover:scale-105 active:scale-95";

            if(st === 'T') pillClasses += " bg-green-100 text-green-800 border-green-200";
            else if (st === 'FS') pillClasses += " bg-sky-100 text-sky-800 border-sky-200";
            else if (st === 'FD') pillClasses += " bg-blue-100 text-blue-800 border-blue-200";
            else if (st === 'F') pillClasses += " bg-yellow-100 text-yellow-800 border-yellow-200";
            else if (st === 'FE') pillClasses += " bg-red-100 text-red-800 border-red-200";
            else pillClasses += " bg-gray-100 text-gray-800 border-gray-200";

            const el = document.createElement('div');
            el.className = pillClasses;
            el.innerHTML = `<span class="font-medium">Dia ${i+1}</span><span class="font-bold">${statusMap[st]||st}</span>`;
            if(isAdmin) el.onclick = () => handleCellClick(name, i);
            grid.appendChild(el);
        });
    } else {
        grid.className = 'calendar-grid-container';
        const m = { y: selectedMonthObj.year, mo: selectedMonthObj.month };
        const empty = new Date(m.y, m.mo, 1).getDay();
        for(let i=0;i<empty;i++) grid.insertAdjacentHTML('beforeend','<div class="calendar-cell bg-gray-50"></div>');
        
        schedule.forEach((st, i) => {
            const cell = document.createElement('div');
            cell.className = "calendar-cell bg-white border relative transition-colors duration-150";
            
            const badge = document.createElement('div');
            badge.className = `day-status-badge status-${st}`;
            badge.textContent = statusMap[st]||st;
            
            if(isAdmin) {
                badge.classList.add('cursor-pointer', 'hover:opacity-80', 'ring-2', 'ring-transparent', 'hover:ring-indigo-300', 'transition-all');
                badge.title = "Clique para alternar (Ciclo)";
                badge.onclick = () => handleCellClick(name, i);
            }

            cell.innerHTML = `<div class="day-number">${i+1}</div>`;
            cell.appendChild(badge);
            
            grid.appendChild(cell);
        });
    }
}

// ==========================================
// 9. INICIALIZAÇÃO
// ==========================================
function initGlobal() {
    initTabs();
    
    const header = document.querySelector('header');
    if(!document.getElementById('monthSel')) {
        const sel = document.createElement('select'); sel.id='monthSel';
        sel.className = 'mt-3 md:mt-0 md:ml-4 px-4 py-2 rounded-lg border border-gray-300 shadow-sm text-gray-700 bg-white font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer hover:bg-gray-50 transition-colors';
        
        availableMonths.forEach(m => {
            const opt = document.createElement('option'); 
            opt.value = `${m.year}-${m.month}`;
            opt.textContent = `${monthNames[m.month]}/${m.year}`;
            if(m.month === selectedMonthObj.month && m.year === selectedMonthObj.year) {
                opt.selected = true;
            }
            sel.appendChild(opt);
        });
        
        sel.addEventListener('change', e=>{
            const [y,mo] = e.target.value.split('-').map(Number);
            selectedMonthObj={year:y, month:mo};
            loadDataFromCloud(); 
        });
        const container = header.querySelector('.mt-4') || header;
        container.appendChild(sel);
    }

    const ds = document.getElementById('dateSlider');
    if (ds) ds.addEventListener('input', e => { currentDay = parseInt(e.target.value); updateDailyView(); });

    loadDataFromCloud();
}

function initTabs() {
    document.querySelectorAll('.tab-button').forEach(b => {
        b.addEventListener('click', () => {
            document.querySelectorAll('.tab-button').forEach(x=>x.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(x=>x.classList.add('hidden'));
            b.classList.add('active');
            document.getElementById(`${b.dataset.tab}View`).classList.remove('hidden');
            if(b.dataset.tab==='personal') {
                const sel = document.getElementById('employeeSelect');
                if(sel && sel.value) updateWeekendTable(sel.value); 
                else updateWeekendTable(null);
            }
        });
    });
}

function updateWeekendTable(specificName) {
    const container = document.getElementById('weekendPlantaoContainer');
    if (!container) return;
    container.innerHTML = '';
    const m = { y: selectedMonthObj.year, mo: selectedMonthObj.month };
    const total = new Date(m.y, m.mo+1, 0).getDate();
    const fmtDate = (d) => `${pad(d)}/${pad(m.mo+1)}`;

    for (let d=1; d<=total; d++){
        const dow = new Date(m.y, m.mo, d).getDay();
        if (dow === 6) { 
            const satDate = d;
            const sunDate = d+1 <= total ? d+1 : null;
            let satW=[], sunW=[];
            Object.keys(scheduleData).forEach(n=>{
                if(scheduleData[n].schedule[satDate-1]==='T') satW.push(n);
                if(sunDate && scheduleData[n].schedule[sunDate-1]==='T') sunW.push(n);
            });

            if(satW.length || sunW.length) {
                const makeTags = (list, bg, brd, txt) => {
                    if(!list.length) return '<span class="text-gray-400 text-sm italic pl-1">Sem escala</span>';
                    return list.map(name => `<span class="inline-block ${bg} border ${brd} ${txt} px-3 py-1 rounded-full text-sm font-medium shadow-sm mb-2 mr-2">${name}</span>`).join('');
                };
                const satTags = makeTags(satW, 'bg-blue-100', 'border-blue-300', 'text-blue-800');
                const sunTags = makeTags(sunW, 'bg-purple-100', 'border-purple-300', 'text-purple-800');
                const labelSat = `sábado (${fmtDate(satDate)})`;
                const labelSun = sunDate ? `domingo (${fmtDate(sunDate)})` : 'domingo';

                const cardHTML = `
                <div class="bg-white rounded-xl shadow-lg overflow-hidden border border-gray-100 mb-8 max-w-md mx-auto md:mx-0">
                    <div class="bg-gradient-to-r from-blue-600 to-blue-500 p-4 flex items-center justify-center text-white shadow-md">
                        <i class="fas fa-calendar-check mr-2"></i> <h3 class="font-bold text-lg tracking-wide">Fim de Semana ${fmtDate(satDate)}</h3>
                    </div>
                    <div class="p-6">
                        <div class="flex items-start mb-6">
                            <div class="w-1 self-stretch bg-blue-400 rounded-full mr-4 opacity-70 flex-shrink-0"></div> 
                            <div class="flex-1"><h4 class="text-blue-600 font-bold text-xs uppercase tracking-wider mb-3">${labelSat}</h4><div class="flex flex-wrap">${satTags}</div></div>
                        </div>
                        ${sunDate ? `<div class="flex items-start"><div class="w-1 self-stretch bg-purple-400 rounded-full mr-4 opacity-70 flex-shrink-0"></div><div class="flex-1"><h4 class="text-purple-600 font-bold text-xs uppercase tracking-wider mb-3">${labelSun}</h4><div class="flex flex-wrap">${sunTags}</div></div></div>` : ''}
                    </div>
                </div>`;
                container.insertAdjacentHTML('beforeend', cardHTML);
            }
        }
    }
}

document.addEventListener('DOMContentLoaded', initGlobal);
