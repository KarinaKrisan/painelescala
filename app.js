// app.js - Cosmic Dark Edition (Rounded)
// ==========================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { getAuth, onAuthStateChanged, signOut, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";

// 2. CONFIGURAÇÃO
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

// 3. ESTADO
let isAdmin = false;
let hasUnsavedChanges = false;
let scheduleData = {}; 
let rawSchedule = {};  
let sessionLogs = []; 
let unsavedChangesSet = new Set(); 
let currentPhotoString = "";

const ROLE_DEFINITIONS = {
    'master': { label: 'ADM Master', color: 'text-purple-400 bg-purple-900/30 border-purple-500/50', perms: ["Gerenciar usuários e níveis", "Criar/Excluir equipes e unidades", "Acesso total a relatórios", "Configurações globais e auditoria"] },
    'geral': { label: 'ADM Geral', color: 'text-blue-400 bg-blue-900/30 border-blue-500/50', perms: ["Gestão de escalas da unidade", "Cadastrar colaboradores", "Aprovar trocas e férias", "Relatórios operacionais"] },
    'local': { label: 'ADM Local', color: 'text-emerald-400 bg-emerald-900/30 border-emerald-500/50', perms: ["Visualizar e editar equipe", "Registrar atestados", "Aprovar ajustes simples", "Dashboard básico"] }
};

const currentDateObj = new Date();
const monthNames = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
let systemYear = currentDateObj.getFullYear();
let systemMonth = currentDateObj.getMonth(); 
let selectedMonthObj = { year: systemYear, month: systemMonth };
let currentDay = new Date().getDate();

const statusMap = { 'T':'Trabalhando','F':'Folga','FS':'Folga Sáb','FD':'Folga Dom','FE':'Férias','OFF-SHIFT':'Exp.Encerrado', 'F_EFFECTIVE': 'Exp.Encerrado' };
const daysOfWeek = ["Domingo","Segunda","Terça","Quarta","Quinta","Sexta","Sábado"];

function pad(n){ return n < 10 ? '0' + n : '' + n; }

// 4. AUTH & UI
const adminToolbar = document.getElementById('adminToolbar');
const btnOpenLogin = document.getElementById('btnOpenLogin');
const btnLogout = document.getElementById('btnLogout');

if(btnLogout) btnLogout.addEventListener('click', () => { signOut(auth); window.location.reload(); });

onAuthStateChanged(auth, (user) => {
    if (user) {
        isAdmin = true;
        adminToolbar.classList.remove('hidden');
        if(btnOpenLogin) btnOpenLogin.classList.add('hidden');
        document.getElementById('adminEditHint').classList.remove('hidden');
        document.body.style.paddingBottom = "100px"; 
        
        logSessionActivity('login', 'Login no sistema');
        loadAdminProfile(true); 
    } else {
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

// 5. FIRESTORE
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
            rawSchedule = {}; 
            processScheduleData();
            updateDailyView();
        }
    } catch (e) {
        console.error("Erro dados:", e);
    }
}

async function saveToCloud() {
    if(!isAdmin) return;
    const btn = document.getElementById('btnSaveCloud');
    const status = document.getElementById('saveStatus');
    const statusIcon = document.getElementById('saveStatusIcon');
    
    btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> ...';
    
    const docId = `escala-${selectedMonthObj.year}-${String(selectedMonthObj.month+1).padStart(2,'0')}`;
    
    try {
        await setDoc(doc(db, "escalas", docId), rawSchedule, { merge: true });
        hasUnsavedChanges = false;
        status.textContent = "Sincronizado";
        status.className = "text-xs text-gray-300 font-medium transition-colors";
        if(statusIcon) statusIcon.className = "w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]";
        
        // Logs de Salvar
        const profNameInput = document.getElementById('profName');
        const adminName = (profNameInput && profNameInput.value) ? profNameInput.value.split(' ')[0] : "Admin";
        
        if(unsavedChangesSet.size > 0) {
            unsavedChangesSet.forEach(empName => logSessionActivity('save', `${adminName} salvou escala de ${empName}`));
            unsavedChangesSet.clear();
        } else {
            logSessionActivity('save', 'Sincronização manual');
        }

        setTimeout(() => { btn.innerHTML = '<i class="fas fa-cloud-upload-alt mr-2"></i> Salvar'; }, 1000);
    } catch (e) {
        console.error("Erro salvar:", e);
        btn.innerHTML = '<i class="fas fa-exclamation-circle"></i> Erro';
    }
}
document.getElementById('btnSaveCloud').addEventListener('click', saveToCloud);

// 5.1 PROFILE LOGIC
const profileModal = document.getElementById('profileModal');
const btnOpenProfile = document.getElementById('btnOpenProfile');
const btnCloseProfile = document.getElementById('btnCloseProfile');
const btnCancelProfile = document.getElementById('btnCancelProfile');
const btnSaveProfile = document.getElementById('btnSaveProfile');
const btnChangePassword = document.getElementById('btnChangePassword');

// Photo Logic
const btnChangePhoto = document.getElementById('btnChangePhoto');
const profPhotoInput = document.getElementById('profPhotoInput');
const photoPreview = document.getElementById('photoPreview');
const photoIcon = document.getElementById('photoIcon');

if(btnChangePhoto && profPhotoInput) {
    btnChangePhoto.addEventListener('click', () => profPhotoInput.click());
}
if(profPhotoInput) {
    profPhotoInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (evt) => {
                photoPreview.style.backgroundImage = `url('${evt.target.result}')`;
                photoIcon.classList.add('hidden');
                currentPhotoString = evt.target.result;
            };
            reader.readAsDataURL(file);
        }
    });
}

// TABS LOGIC - CORREÇÃO CRÍTICA
const modalTabs = document.querySelectorAll('.modal-tab');
const tabContents = document.querySelectorAll('.modal-content-tab');

modalTabs.forEach(tab => {
    tab.addEventListener('click', () => {
        // 1. Esconde tudo e reseta estilos
        modalTabs.forEach(t => {
            t.classList.remove('active', 'border-b-2', 'border-purple-500', 'text-purple-400');
            t.classList.add('text-gray-400');
        });
        tabContents.forEach(c => c.classList.add('hidden'));

        // 2. Ativa a atual
        tab.classList.add('active', 'border-b-2', 'border-purple-500', 'text-purple-400');
        tab.classList.remove('text-gray-400');
        
        // 3. Mostra o conteúdo correspondente
        const targetId = tab.getAttribute('data-target');
        const targetContent = document.getElementById(targetId);
        if(targetContent) targetContent.classList.remove('hidden');
    });
});

// Inputs
const inpName = document.getElementById('profName');
const inpEmail = document.getElementById('profEmail');
const inpRegId = document.getElementById('profRegId'); 
const inpRole = document.getElementById('profJob');
const inpUnit = document.getElementById('profUnit');
const inpPhone = document.getElementById('profPhone');

function toggleProfileModal(show) {
    if(show) {
        profileModal.classList.remove('hidden');
        loadAdminProfile();
        updateActivityLogUI(); 
    } else {
        profileModal.classList.add('hidden');
    }
}

if(btnOpenProfile) btnOpenProfile.addEventListener('click', () => toggleProfileModal(true));
if(btnCloseProfile) btnCloseProfile.addEventListener('click', () => toggleProfileModal(false));
if(btnCancelProfile) btnCancelProfile.addEventListener('click', () => toggleProfileModal(false));
if(profileModal) profileModal.addEventListener('click', (e) => { if(e.target === profileModal) toggleProfileModal(false); });

document.getElementById('shortcutDaily').addEventListener('click', () => { toggleProfileModal(false); document.querySelector('button[data-tab="daily"]').click(); });
document.getElementById('shortcutIndividual').addEventListener('click', () => { toggleProfileModal(false); document.querySelector('button[data-tab="personal"]').click(); });

if(btnChangePassword) {
    btnChangePassword.addEventListener('click', async () => {
        const user = auth.currentUser;
        if(user && user.email && confirm(`Enviar link para ${user.email}?`)) {
            try { await sendPasswordResetEmail(auth, user.email); alert("E-mail enviado!"); } catch(e) { alert("Erro: " + e.message); }
        }
    });
}

function updatePermissionsUI(roleKey) {
    const list = document.getElementById('permissionsList');
    const badge = document.getElementById('profRoleBadge');
    const displayInput = document.getElementById('profRoleDisplay');
    const dateDisplay = document.getElementById('lastPermUpdate');

    if(!list) return;
    list.innerHTML = '';

    const safeKey = String(roleKey || 'local').trim().toLowerCase();
    const roleData = ROLE_DEFINITIONS[safeKey] || ROLE_DEFINITIONS['local'];

    if(badge) {
        badge.textContent = roleData.label;
        badge.className = `text-[10px] font-bold px-2 py-0.5 rounded border uppercase ${roleData.color}`;
    }
    if(displayInput) displayInput.value = roleData.label;
    if(dateDisplay) dateDisplay.textContent = new Date().toLocaleDateString();

    roleData.perms.forEach(perm => {
        const li = document.createElement('li');
        li.className = "flex items-start gap-3 animate-fade-in-list";
        li.innerHTML = `<i class="fas fa-check-circle text-emerald-500 mt-0.5 text-xs"></i><span class="text-xs text-gray-300 leading-tight">${perm}</span>`;
        list.appendChild(li);
    });
}

function logSessionActivity(type, description) {
    const now = new Date();
    const timeString = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    sessionLogs.unshift({ type, desc: description, time: timeString });
    if (sessionLogs.length > 20) sessionLogs.pop();
    if (!profileModal.classList.contains('hidden')) updateActivityLogUI();
}

function updateActivityLogUI() {
    const list = document.getElementById('activityLogList');
    if(!list) return;
    list.innerHTML = ''; 
    if(sessionLogs.length === 0) {
        list.innerHTML = '<li class="text-xs text-center text-gray-600 italic py-2">Nenhuma atividade registrada ainda.</li>';
        return;
    }
    sessionLogs.forEach(log => {
        let iconClass = 'fas fa-circle';
        let colorClass = 'text-gray-400';
        let bgClass = 'bg-gray-500/10 border-gray-500/20';
        let descHTML = log.desc;

        if (log.type === 'edit') { iconClass = 'fas fa-pen'; colorClass = 'text-blue-400'; bgClass = 'bg-blue-500/10 border-blue-500/20'; }
        else if (log.type === 'save') { 
            iconClass = 'fas fa-save'; colorClass = 'text-purple-400'; bgClass = 'bg-purple-500/10 border-purple-500/20';
            descHTML = log.desc.replace(/(.*)( salvou a escala de )(.*)/, '<span class="font-bold text-white">$1</span>$2<span class="font-bold text-white">$3</span>');
        } 
        else if (log.type === 'login') { iconClass = 'fas fa-sign-in-alt'; colorClass = 'text-green-400'; bgClass = 'bg-green-500/10 border-green-500/20'; }

        const li = document.createElement('li');
        li.className = "flex items-center gap-3 text-xs animate-fade-in-list"; 
        li.innerHTML = `<div class="w-6 h-6 rounded-full flex items-center justify-center border ${bgClass} ${colorClass} shrink-0"><i class="${iconClass}"></i></div><div class="flex-1 truncate"><p class="text-gray-300">${descHTML}</p></div><span class="text-gray-600 font-mono text-[10px] shrink-0">${log.time}</span>`;
        list.appendChild(li);
    });
}

async function loadAdminProfile(silent = false) {
    const user = auth.currentUser;
    if(!user) return;
    if(!silent) {
        inpEmail.value = user.email; 
        if(btnSaveProfile) btnSaveProfile.disabled = true;
    }
    try {
        const docRef = doc(db, "admins", user.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            const data = docSnap.data();
            if(!silent) {
                inpName.value = data.name || '';
                inpRole.value = data.role || ''; 
                inpUnit.value = data.unit || '';
                inpPhone.value = data.phone || '';
                if(inpRegId) inpRegId.value = data.registrationId || ''; 
                if (data.photoBase64) {
                    currentPhotoString = data.photoBase64;
                    photoPreview.style.backgroundImage = `url('${data.photoBase64}')`;
                    photoIcon.classList.add('hidden');
                }
            }
            updatePermissionsUI(data.systemRole || 'local');
        } else {
            if(!silent) { inpName.value = ''; inpRole.value = ''; }
            updatePermissionsUI('local');
        }
    } catch (e) {
        console.error("Erro perfil:", e);
        updatePermissionsUI('local');
    } finally {
        if(!silent && btnSaveProfile) btnSaveProfile.disabled = false;
    }
}

if(btnSaveProfile) btnSaveProfile.addEventListener('click', async () => {
    const user = auth.currentUser;
    if(!user) return;
    const profileData = {
        name: inpName.value,
        email: user.email,
        role: inpRole.value, 
        unit: inpUnit.value,
        phone: inpPhone.value,
        registrationId: inpRegId ? inpRegId.value : '', 
        photoBase64: currentPhotoString, 
        updatedAt: new Date().toISOString()
    };
    btnSaveProfile.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Salvando...';
    btnSaveProfile.disabled = true;
    try {
        await setDoc(doc(db, "admins", user.uid), profileData, { merge: true });
        loadAdminProfile(); 
        alert("Salvo com sucesso!");
    } catch (e) {
        alert("Erro ao salvar.");
    } finally {
        btnSaveProfile.innerHTML = '<i class="fas fa-save mr-2"></i> Salvar';
        btnSaveProfile.disabled = false;
    }
});

function handleCellClick(name, dayIndex) { 
    if (!isAdmin) return; 
    const emp = scheduleData[name]; 
    const newStatus = cycleStatus(emp.schedule[dayIndex]); 
    emp.schedule[dayIndex] = newStatus; 
    rawSchedule[name].calculatedSchedule = emp.schedule; 
    hasUnsavedChanges = true; 
    const statusEl = document.getElementById('saveStatus'); 
    const statusIcon = document.getElementById('saveStatusIcon'); 
    if(statusEl) { statusEl.textContent = "Alterado (Não salvo)"; statusEl.className = "text-xs text-orange-400 font-bold"; } 
    if(statusIcon) statusIcon.className = "w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse"; 
    
    unsavedChangesSet.add(name); 
    
    updateCalendar(name, emp.schedule); 
    updateDailyView(); 
    updateProfileStats(); 
    const sel = document.getElementById('employeeSelect'); 
    updateWeekendTable(sel ? sel.value : null); 
}

// ... Funções auxiliares (generate5x2, parseDayList, etc.) mantidas iguais ...
function generate5x2ScheduleDefaultForMonth(monthObj) { const totalDays = new Date(monthObj.year, monthObj.month+1, 0).getDate(); const arr = []; for (let d=1; d<=totalDays; d++){ const dow = new Date(monthObj.year, monthObj.month, d).getDay(); arr.push((dow===0||dow===6) ? 'F' : 'T'); } return arr; }
function parseDayListForMonth(dayString, monthObj) { if (!dayString) return []; if (Array.isArray(dayString)) return dayString; const totalDays = new Date(monthObj.year, monthObj.month+1, 0).getDate(); const days = new Set(); const normalized = String(dayString).replace(/\b(at[eé]|até|a)\b/gi,' a ').replace(/–|—/g,'-').replace(/\s+/g,' ').trim(); const parts = normalized.split(',').map(p=>p.trim()).filter(p=>p.length>0); parts.forEach(part=>{ const simple = part.match(/^(\d{1,2})-(\d{1,2})$/); if (simple) { for(let x=parseInt(simple[1]); x<=parseInt(simple[2]); x++) if(x>=1 && x<=totalDays) days.add(x); return; } const number = part.match(/^(\d{1,2})$/); if (number) { const v=parseInt(number[1]); if(v>=1 && v<=totalDays) days.add(v); return; } if (/fins? de semana|fim de semana/i.test(part)) { for (let d=1; d<=totalDays; d++){ const dow = new Date(monthObj.year, monthObj.month, d).getDay(); if (dow===0||dow===6) days.add(d); } return; } if (/segunda a sexta/i.test(part)) { for (let d=1; d<=totalDays; d++){ const dow = new Date(monthObj.year, monthObj.month, d).getDay(); if (dow>=1 && dow<=5) days.add(d); } return; } }); return Array.from(days).sort((a,b)=>a-b); }
function buildFinalScheduleForMonth(employeeData, monthObj) { const totalDays = new Date(monthObj.year, monthObj.month+1, 0).getDate(); if (employeeData.calculatedSchedule && Array.isArray(employeeData.calculatedSchedule)) return employeeData.calculatedSchedule; const schedule = new Array(totalDays).fill(null); let tArr = []; if(typeof employeeData.T === 'string' && /segunda a sexta/i.test(employeeData.T)) tArr = generate5x2ScheduleDefaultForMonth(monthObj); else if(Array.isArray(employeeData.T)) { const arr = new Array(totalDays).fill('F'); employeeData.T.forEach(x => { if(typeof x === 'number') arr[x-1] = 'T'; }); tArr = arr; } const vacDays = parseDayListForMonth(employeeData.FE, monthObj); vacDays.forEach(d => { if (d>=1 && d<=totalDays) schedule[d-1] = 'FE'; }); const fsDays = parseDayListForMonth(employeeData.FS, monthObj); fsDays.forEach(d => { if(schedule[d-1] !== 'FE') schedule[d-1] = 'FS'; }); const fdDays = parseDayListForMonth(employeeData.FD, monthObj); fdDays.forEach(d => { if(schedule[d-1] !== 'FE') schedule[d-1] = 'FD'; }); for(let i=0; i<totalDays; i++) { if(!schedule[i]) { if(tArr[i] === 'T') schedule[i] = 'T'; else schedule[i] = 'F'; } } return schedule; }
function processScheduleData() { scheduleData = {}; if (!rawSchedule) return; Object.keys(rawSchedule).forEach(name => { const finalArr = buildFinalScheduleForMonth(rawSchedule[name], selectedMonthObj); scheduleData[name] = { info: rawSchedule[name], schedule: finalArr }; rawSchedule[name].calculatedSchedule = finalArr; }); const totalDays = new Date(selectedMonthObj.year, selectedMonthObj.month+1, 0).getDate(); const slider = document.getElementById('dateSlider'); if (slider) { slider.max = totalDays; document.getElementById('sliderMaxLabel').textContent = `Dia ${totalDays}`; if (currentDay > totalDays) currentDay = totalDays; slider.value = currentDay; } }

document.addEventListener('DOMContentLoaded', initGlobal);
