import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getFirestore, doc, getDoc, collection, addDoc, query, where, onSnapshot, updateDoc, serverTimestamp, getDocs } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";

// Config (Mesma do app.js)
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

// State
let currentUser = null;
let userProfile = null; // { name: "Nome na Planilha", role: "Cargo" }
let currentSchedule = null;
const currentDate = new Date();
// Ajuste manual ou dinâmico do mês ativo (exemplo fixado em Novembro/2025 para teste, ideal ser dinâmico)
const activeMonthYear = { year: 2025, month: 10 }; // Nov = 10 (0-index)

// --- Auth & Init ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        await loadUserProfile(user.uid);
        if(userProfile) {
            initDashboard();
        } else {
            alert("Perfil de colaborador não encontrado. Contate o administrador.");
            // Opcional: Redirecionar para login ou admin se for o caso
        }
    } else {
        window.location.href = "login.html";
    }
});

document.getElementById('btnLogout').addEventListener('click', () => signOut(auth));

// --- Carregar Perfil ---
async function loadUserProfile(uid) {
    // Tenta buscar na coleção 'users'
    // Se não existir, tentamos inferir do email ou usar um nome padrão para teste
    try {
        const docRef = doc(db, "users", uid);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
            userProfile = docSnap.data();
        } else {
            // FALLBACK PARA TESTES SE A COLEÇÃO USERS NÃO ESTIVER POPULADA
            // Em produção, você deve criar o documento em 'users' para cada colaborador
            console.warn("Usuário sem perfil no Firestore. Usando dados temporários.");
            userProfile = { name: "Usuário Teste", role: "Colaborador", team: "Geral" };
        }

        // Atualiza UI Header
        document.getElementById('userNameDisplay').textContent = userProfile.name;
        document.getElementById('welcomeName').textContent = userProfile.name.split(' ')[0];
        document.getElementById('userRoleDisplay').textContent = userProfile.role || 'Colaborador';

    } catch (e) {
        console.error("Erro ao carregar perfil:", e);
    }
}

// --- Dashboard Logic ---
async function initDashboard() {
    await loadMySchedule();
    setupTabs();
    setupForms();
    listenToRequests();
}

// --- Carregar Escala do Mês ---
async function loadMySchedule() {
    const docId = `escala-${activeMonthYear.year}-${String(activeMonthYear.month+1).padStart(2,'0')}`;
    const docRef = doc(db, "escalas", docId);
    
    try {
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            const data = docSnap.data();
            // Busca a chave correspondente ao nome do usuário
            // A comparação deve ser exata ou conter parte. Aqui assumimos exata.
            const myData = data[userProfile.name]; 
            
            if (myData) {
                renderScheduleGrid(myData);
                updateQuickStats(myData);
                populatePartnerSelect(data);
            } else {
                console.error("Nome não encontrado na escala deste mês:", userProfile.name);
                document.getElementById('myScheduleGrid').innerHTML = '<div class="col-span-full p-4 text-center text-red-400">Escala não encontrada para seu usuário neste mês.</div>';
            }
        }
    } catch (e) {
        console.error("Erro ao ler escala:", e);
    }
}

// --- Renderizadores ---
function renderScheduleGrid(userData) {
    const grid = document.getElementById('myScheduleGrid');
    grid.innerHTML = '';
    
    // Recalcula o array de dias (Lógica simplificada baseada no app.js)
    const totalDays = new Date(activeMonthYear.year, activeMonthYear.month+1, 0).getDate();
    // (Implementar a mesma lógica de parser do app.js aqui seria ideal para precisão total)
    // Para simplificar, vamos assumir que 'userData.calculatedSchedule' foi salvo pelo admin
    // Se não, teríamos que replicar a função 'buildFinalScheduleForMonth' do app.js.
    
    // Assumindo que o app.js SALVA o 'calculatedSchedule' no Firebase (recomendado):
    let scheduleArr = userData.calculatedSchedule || [];
    
    // Se não tiver calculado salvo, gera dummy ou precisa copiar a função parser
    if(scheduleArr.length === 0) {
        scheduleArr = new Array(totalDays).fill('?'); 
        // Nota: Recomendo alterar o app.js para salvar o array calculado no Firestore
    }

    const today = new Date().getDate();
    const statusMap = { 'T':'Trabalho','F':'Folga','FS':'Sábado','FD':'Domingo','FE':'Férias','OFF-SHIFT':'Exp.' };
    
    scheduleArr.forEach((status, idx) => {
        const day = idx + 1;
        const isToday = day === today;
        const label = statusMap[status] || status;
        
        let colorClass = "bg-[#1A1C2E] text-gray-400";
        if(status === 'T') colorClass = "bg-[#1A1C2E] text-green-400 border-green-900/30";
        if(status.includes('F')) colorClass = "bg-[#1A1C2E] text-yellow-500 border-yellow-900/30";
        if(status === 'FE') colorClass = "bg-red-900/10 text-red-400 border-red-900/30";
        if(isToday) colorClass = "bg-purple-600/20 border-purple-500 text-white shadow-[0_0_15px_rgba(124,58,237,0.3)] z-10 scale-105";

        const div = document.createElement('div');
        div.className = `p-3 min-h-[80px] border border-[#2E3250] flex flex-col justify-between transition-all hover:bg-[#2E3250] ${colorClass} ${isToday ? 'rounded-lg m-1' : ''}`;
        div.innerHTML = `
            <span class="text-xs font-mono opacity-50">${String(day).padStart(2,'0')}</span>
            <span class="text-xs font-bold text-center uppercase">${label}</span>
        `;
        grid.appendChild(div);
    });

    // Label do Mês
    const monthNames = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
    document.getElementById('currentMonthLabel').textContent = `${monthNames[activeMonthYear.month]}/${activeMonthYear.year}`;
}

function updateQuickStats(userData) {
    // Turno
    document.getElementById('currentShiftDisplay').textContent = userData.Turno || 'Comercial';
    document.getElementById('currentHoursDisplay').textContent = userData.Horário || '--:--';
    document.getElementById('formCurrentShift').textContent = userData.Turno || 'Não definido';

    // Próxima Folga (Dummy logic - pegaria do array real)
    document.getElementById('nextOffDisplay').textContent = "Em breve"; // Implementar lógica de busca no array
}

function populatePartnerSelect(fullData) {
    const sel = document.getElementById('partnerSelect');
    sel.innerHTML = '<option value="">Selecione um colega...</option>';
    
    Object.keys(fullData).sort().forEach(name => {
        if(name !== userProfile.name && name !== 'calculatedSchedule') {
            const opt = document.createElement('option');
            opt.value = name;
            opt.textContent = name;
            sel.appendChild(opt);
        }
    });
}

// --- Interações UI ---
function setupTabs() {
    const tabs = document.querySelectorAll('.nav-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // Remove active styles
            tabs.forEach(t => {
                t.classList.remove('bg-purple-600/20', 'border-purple-500', 'text-purple-400', 'active');
                t.classList.add('text-gray-400', 'border-transparent');
            });
            // Add active to clicked
            tab.classList.remove('text-gray-400', 'border-transparent');
            tab.classList.add('bg-purple-600/20', 'border-purple-500', 'text-purple-400', 'active');

            // Show Content
            document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
            document.getElementById(tab.dataset.target).classList.remove('hidden');
        });
    });
}

function showToast(title, msg, type='success') {
    const t = document.getElementById('toast');
    const i = document.getElementById('toastIcon');
    
    t.classList.remove('translate-y-20', 'opacity-0');
    document.getElementById('toastTitle').textContent = title;
    document.getElementById('toastMsg').textContent = msg;
    
    if(type === 'success') {
        i.className = 'w-8 h-8 rounded-full flex items-center justify-center bg-green-500/20 text-green-500';
        i.innerHTML = '<i class="fas fa-check"></i>';
        t.classList.add('border-green-500/30');
    } else {
        i.className = 'w-8 h-8 rounded-full flex items-center justify-center bg-red-500/20 text-red-500';
        i.innerHTML = '<i class="fas fa-times"></i>';
    }

    setTimeout(() => {
        t.classList.add('translate-y-20', 'opacity-0');
    }, 4000);
}

// --- Lógica de Formulários (Solicitações) ---
function setupForms() {
    // 1. Troca de Turno
    document.getElementById('formShiftSwap').addEventListener('submit', async (e) => {
        e.preventDefault();
        const targetShift = document.getElementById('targetShift').value;
        const currentShift = document.getElementById('formCurrentShift').textContent;
        const btn = e.target.querySelector('button');

        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';

        try {
            await addDoc(collection(db, "requests"), {
                type: 'shift_swap',
                requesterId: auth.currentUser.uid,
                requesterName: userProfile.name,
                fromShift: currentShift,
                toShift: targetShift,
                status: 'pending_admin', // Vai direto pro admin
                createdAt: serverTimestamp()
            });
            showToast('Sucesso', 'Solicitação de turno enviada à liderança.');
            e.target.reset();
        } catch (error) {
            console.error(error);
            showToast('Erro', 'Falha ao enviar solicitação.', 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Solicitar à Liderança';
        }
    });

    // 2. Troca de Folga
    document.getElementById('formDayOffSwap').addEventListener('submit', async (e) => {
        e.preventDefault();
        const myDate = document.getElementById('myDayOffDate').value;
        const partnerName = document.getElementById('partnerSelect').value;
        const wantedDate = document.getElementById('wantedDate').value;
        
        if(!partnerName) return showToast('Atenção', 'Selecione um parceiro.', 'error');

        const btn = e.target.querySelector('button');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Propondo...';

        try {
            await addDoc(collection(db, "requests"), {
                type: 'day_off_swap',
                requesterId: auth.currentUser.uid,
                requesterName: userProfile.name,
                partnerName: partnerName, // Nota: Ideal seria ter o ID do parceiro também
                dateToGive: myDate,
                dateToReceive: wantedDate,
                status: 'pending_partner', // Precisa do aceite do parceiro primeiro
                createdAt: serverTimestamp()
            });
            showToast('Proposta Enviada', `Aguardando aceite de ${partnerName}.`);
            e.target.reset();
        } catch (error) {
            console.error(error);
            showToast('Erro', 'Falha ao enviar proposta.', 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Propor Troca';
        }
    });
}

// --- Listeners de Solicitações (Realtime) ---
function listenToRequests() {
    if(!userProfile) return;

    // 1. Minhas Solicitações (Enviadas)
    const qHistory = query(collection(db, "requests"), where("requesterId", "==", auth.currentUser.uid));
    
    // 2. Solicitações Recebidas (Onde eu sou o Parceiro)
    // Nota: Como estamos salvando partnerName (string), buscamos por string.
    const qInbox = query(collection(db, "requests"), where("partnerName", "==", userProfile.name), where("status", "==", "pending_partner"));

    // Listener Histórico
    onSnapshot(qHistory, (snapshot) => {
        const list = document.getElementById('historyList');
        list.innerHTML = '';
        
        if(snapshot.empty) {
            list.innerHTML = '<p class="text-gray-600 text-sm text-center">Nenhum histórico.</p>';
            return;
        }

        snapshot.forEach(doc => {
            const r = doc.data();
            const statusColors = {
                'pending_partner': 'text-orange-400 border-orange-500/30 bg-orange-500/10',
                'pending_admin': 'text-blue-400 border-blue-500/30 bg-blue-500/10',
                'approved': 'text-green-400 border-green-500/30 bg-green-500/10',
                'rejected': 'text-red-400 border-red-500/30 bg-red-500/10'
            };
            const statusLabels = {
                'pending_partner': 'Aguardando Parceiro',
                'pending_admin': 'Em Análise (Líder)',
                'approved': 'Aprovado',
                'rejected': 'Recusado'
            };

            const html = `
                <div class="bg-[#1A1C2E] p-4 rounded-xl border border-[#2E3250] flex justify-between items-center">
                    <div>
                        <span class="text-[10px] font-bold uppercase text-gray-500 block mb-1">
                            ${r.type === 'shift_swap' ? 'Troca de Turno' : 'Troca de Folga'}
                        </span>
                        <div class="text-sm text-gray-300">
                            ${r.type === 'shift_swap' 
                                ? `Mudança para <b>${r.toShift}</b>` 
                                : `Troca com <b>${r.partnerName}</b> (${r.dateToGive} ↔ ${r.dateToReceive})`}
                        </div>
                    </div>
                    <span class="px-2 py-1 rounded text-[10px] font-bold border ${statusColors[r.status] || 'text-gray-500'}">
                        ${statusLabels[r.status] || r.status}
                    </span>
                </div>
            `;
            list.insertAdjacentHTML('beforeend', html);
        });
    });

    // Listener Inbox (Recebidos)
    onSnapshot(qInbox, (snapshot) => {
        const inbox = document.getElementById('inboxList');
        inbox.innerHTML = '';
        
        document.getElementById('pendingCount').textContent = snapshot.size;

        if(snapshot.empty) {
            inbox.innerHTML = '<div class="text-center py-6 text-gray-600 text-sm bg-[#1A1C2E] rounded-xl border border-dashed border-gray-700">Nada pendente.</div>';
            return;
        }

        snapshot.forEach(docSnap => {
            const r = docSnap.data();
            const id = docSnap.id;

            const html = `
                <div class="bg-gradient-to-r from-orange-900/10 to-[#1A1C2E] p-4 rounded-xl border border-orange-500/30 relative">
                    <div class="flex justify-between items-start mb-3">
                        <div>
                            <span class="text-[10px] font-bold uppercase text-orange-400 mb-1 block">Proposta de Troca</span>
                            <h4 class="font-bold text-white text-sm">${r.requesterName} quer trocar folga</h4>
                        </div>
                        <i class="fas fa-exclamation-circle text-orange-500 animate-pulse"></i>
                    </div>
                    
                    <div class="flex gap-4 mb-4 text-xs text-gray-400 bg-black/20 p-2 rounded-lg">
                        <div>
                            <span class="block font-bold">Ele cede:</span>
                            ${r.dateToGive.split('-').reverse().join('/')}
                        </div>
                        <div class="border-l border-gray-700 pl-4">
                            <span class="block font-bold">Você cede:</span>
                            ${r.dateToReceive.split('-').reverse().join('/')}
                        </div>
                    </div>

                    <div class="grid grid-cols-2 gap-2">
                        <button onclick="window.handleRequest('${id}', false)" class="bg-gray-800 hover:bg-red-900/30 text-gray-300 hover:text-red-400 py-2 rounded-lg text-xs font-bold transition-colors">
                            Recusar
                        </button>
                        <button onclick="window.handleRequest('${id}', true)" class="bg-green-600 hover:bg-green-500 text-white py-2 rounded-lg text-xs font-bold shadow-lg shadow-green-900/20">
                            Aceitar
                        </button>
                    </div>
                </div>
            `;
            inbox.insertAdjacentHTML('beforeend', html);
        });
    });
}

// Global handler para os botões do Inbox (precisa estar no window pois é module)
window.handleRequest = async (docId, accepted) => {
    const btnText = accepted ? 'Aceitando...' : 'Recusando...';
    // Em produção, adicione loading UI aqui
    
    try {
        const ref = doc(db, "requests", docId);
        await updateDoc(ref, {
            status: accepted ? 'pending_admin' : 'rejected', // Se aceitar, vai pro admin. Se recusar, morre.
            partnerActionAt: serverTimestamp()
        });
        showToast(accepted ? 'Aceito' : 'Recusado', accepted ? 'Enviado para aprovação do líder.' : 'Solicitação removida.');
    } catch (e) {
        console.error(e);
        showToast('Erro', 'Falha ao atualizar solicitação', 'error');
    }
}
