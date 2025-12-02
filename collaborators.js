import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getFirestore, doc, getDoc, collection, addDoc, query, where, onSnapshot, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";

// Configuração Firebase
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

// --- CONFIGURAÇÃO DE DATA AUTOMÁTICA ---
const now = new Date();
const activeMonthYear = { 
    year: now.getFullYear(), 
    month: now.getMonth() // 0 = Janeiro, 11 = Dezembro
}; 
// ATENÇÃO: Se você estiver testando dados antigos (ex: Nov 2025), mude manualmente aqui:
// const activeMonthYear = { year: 2025, month: 10 };

let userProfile = null;

// --- AUTH ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        await loadUserProfile(user.uid);
    } else {
        window.location.href = "login.html";
    }
});

document.getElementById('btnLogout').addEventListener('click', () => signOut(auth));

// --- LOAD USER PROFILE ---
async function loadUserProfile(uid) {
    try {
        const docRef = doc(db, "users", uid);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
            userProfile = docSnap.data();
        } else {
            console.warn("Perfil não encontrado em 'users'. Usando fallback.");
            // IMPORTANTE: Se não tiver perfil, tenta achar um nome padrão ou use o email
            userProfile = { name: "Usuário Teste", role: "Colaborador" };
        }

        document.getElementById('userNameDisplay').textContent = userProfile.name;
        document.getElementById('welcomeName').textContent = userProfile.name.split(' ')[0];
        document.getElementById('userRoleDisplay').textContent = userProfile.role || 'Colaborador';
        
        initDashboard();

    } catch (e) {
        console.error("Erro perfil:", e);
    }
}

// --- DASHBOARD ---
async function initDashboard() {
    await loadMySchedule();
    setupTabs();
    setupForms();
    listenToRequests();
}

// --- CARREGAR ESCALA ---
async function loadMySchedule() {
    // Gera ID: escala-2025-12 (Exemplo)
    const docId = `escala-${activeMonthYear.year}-${String(activeMonthYear.month+1).padStart(2,'0')}`;
    const monthNames = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
    document.getElementById('currentMonthLabel').textContent = `${monthNames[activeMonthYear.month]}/${activeMonthYear.year}`;

    console.log("Buscando escala:", docId);

    try {
        const docRef = doc(db, "escalas", docId);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const data = docSnap.data();
            const myData = data[userProfile.name]; // Busca pelo NOME exato

            if (myData) {
                renderScheduleGrid(myData);
                updateStats(myData);
                populatePartnerSelect(data);
            } else {
                document.getElementById('myScheduleGrid').innerHTML = `<div class="col-span-full text-center text-red-400 p-4">Seu nome (${userProfile.name}) não está nesta escala (${docId}).</div>`;
                console.log("Nomes disponíveis na escala:", Object.keys(data));
            }
        } else {
            document.getElementById('myScheduleGrid').innerHTML = '<div class="col-span-full text-center text-gray-500 p-4">Nenhuma escala publicada para este mês ainda.</div>';
        }
    } catch (e) {
        console.error("Erro escala:", e);
    }
}

function renderScheduleGrid(userData) {
    const grid = document.getElementById('myScheduleGrid');
    grid.innerHTML = '';
    const schedule = userData.calculatedSchedule || []; // Array calculado salvo pelo Admin
    
    // Mapeamento de Status
    const map = { 'T':'Trabalho', 'F':'Folga', 'FS':'Folga Sáb', 'FD':'Folga Dom', 'FE':'Férias', 'OFF-SHIFT':'Exp.' };
    
    schedule.forEach((st, i) => {
        const div = document.createElement('div');
        const isToday = (i+1) === new Date().getDate();
        
        let color = "bg-[#161828] text-gray-500 border border-[#2E3250]";
        if(st === 'T') color = "bg-green-900/20 text-green-400 border-green-900/30";
        if(['F','FS','FD'].includes(st)) color = "bg-yellow-900/20 text-yellow-500 border-yellow-900/30";
        if(isToday) color += " ring-2 ring-purple-500 bg-[#2E3250]";

        div.className = `p-2 rounded flex flex-col items-center justify-center min-h-[60px] ${color}`;
        div.innerHTML = `<span class="text-[10px] opacity-50">${i+1}</span><span class="text-xs font-bold">${map[st]||st}</span>`;
        grid.appendChild(div);
    });
}

function updateStats(data) {
    document.getElementById('currentShiftDisplay').textContent = data.Turno || '--';
    document.getElementById('currentHoursDisplay').textContent = data.Horário || '--:--';
    document.getElementById('formCurrentShift').textContent = data.Turno || '--';
}

function populatePartnerSelect(fullData) {
    const sel = document.getElementById('partnerSelect');
    sel.innerHTML = '<option value="">Selecione...</option>';
    Object.keys(fullData).forEach(key => {
        if(key !== 'id' && key !== userProfile.name && typeof fullData[key] === 'object') {
            const opt = document.createElement('option');
            opt.value = key; opt.textContent = key;
            sel.appendChild(opt);
        }
    });
}

// --- UI TABS ---
function setupTabs() {
    document.querySelectorAll('.nav-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.nav-tab').forEach(b => {
                b.classList.remove('bg-purple-600/20','border-purple-500','text-purple-400','active');
                b.classList.add('text-gray-400','border-transparent');
            });
            btn.classList.remove('text-gray-400','border-transparent');
            btn.classList.add('bg-purple-600/20','border-purple-500','text-purple-400','active');
            
            document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
            document.getElementById(btn.dataset.target).classList.remove('hidden');
        });
    });
}

// --- FORMS & REQUESTS ---
function setupForms() {
    // Turno
    document.getElementById('formShiftSwap').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button'); btn.disabled=true; btn.textContent="Enviando...";
        try {
            await addDoc(collection(db, "requests"), {
                type: 'shift_swap', requesterId: auth.currentUser.uid, requesterName: userProfile.name,
                toShift: document.getElementById('targetShift').value, status: 'pending_admin', createdAt: serverTimestamp()
            });
            showToast("Sucesso", "Solicitação enviada!"); e.target.reset();
        } catch(e){ console.error(e); showToast("Erro", "Falha ao enviar."); }
        btn.disabled=false; btn.textContent="Solicitar";
    });

    // Folga
    document.getElementById('formDayOffSwap').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button'); btn.disabled=true; btn.textContent="Enviando...";
        try {
            await addDoc(collection(db, "requests"), {
                type: 'day_off_swap', requesterId: auth.currentUser.uid, requesterName: userProfile.name,
                partnerName: document.getElementById('partnerSelect').value,
                dateToGive: document.getElementById('myDayOffDate').value,
                dateToReceive: document.getElementById('wantedDate').value,
                status: 'pending_partner', createdAt: serverTimestamp()
            });
            showToast("Sucesso", "Proposta enviada ao colega!"); e.target.reset();
        } catch(e){ console.error(e); showToast("Erro", "Falha ao enviar."); }
        btn.disabled=false; btn.textContent="Propor Troca";
    });
}

function listenToRequests() {
    // Histórico
    const q1 = query(collection(db, "requests"), where("requesterId", "==", auth.currentUser.uid));
    onSnapshot(q1, snap => {
        const list = document.getElementById('historyList'); list.innerHTML = '';
        snap.forEach(d => {
            const r = d.data();
            list.innerHTML += `<div class="bg-black/20 p-3 rounded border border-gray-700 text-sm flex justify-between">
                <span>${r.type==='shift_swap'?'Troca Turno':'Troca Folga'}</span>
                <span class="${r.status==='approved'?'text-green-400':'text-orange-400'}">${r.status}</span>
            </div>`;
        });
    });

    // Inbox (Recebidos)
    const q2 = query(collection(db, "requests"), where("partnerName", "==", userProfile.name), where("status", "==", "pending_partner"));
    onSnapshot(q2, snap => {
        const list = document.getElementById('inboxList'); list.innerHTML = '';
        document.getElementById('pendingCount').textContent = snap.size;
        
        if(snap.empty) list.innerHTML = '<div class="text-xs text-center text-gray-500">Nada pendente.</div>';
        
        snap.forEach(d => {
            const r = d.data();
            list.innerHTML += `<div class="bg-gradient-to-r from-orange-900/20 to-transparent p-3 rounded border border-orange-500/30 mb-2">
                <p class="text-xs text-orange-400 font-bold mb-1">${r.requesterName} quer trocar folga</p>
                <div class="flex gap-2 mb-2"><button onclick="window.reply('${d.id}',true)" class="bg-green-600 px-3 py-1 rounded text-xs text-white">Aceitar</button>
                <button onclick="window.reply('${d.id}',false)" class="bg-red-600 px-3 py-1 rounded text-xs text-white">Recusar</button></div>
            </div>`;
        });
    });
}

// Global para botões HTML
window.reply = async (id, accept) => {
    try {
        await updateDoc(doc(db, "requests", id), { 
            status: accept ? 'pending_admin' : 'rejected', partnerActionAt: serverTimestamp() 
        });
        showToast(accept?"Aceito":"Recusado", accept?"Enviado para líder.":"Cancelado.");
    } catch(e){ console.error(e); }
};

function showToast(title, msg) {
    const t = document.getElementById('toast');
    document.getElementById('toastTitle').textContent = title;
    document.getElementById('toastMsg').textContent = msg;
    t.classList.remove('translate-y-20', 'opacity-0');
    setTimeout(() => t.classList.add('translate-y-20', 'opacity-0'), 3000);
}
