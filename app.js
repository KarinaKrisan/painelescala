// app.js - Cosmic Edition (Separation Logic)
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getFirestore, doc, getDoc, collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";

// ================= CONFIG =================
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
const appId = 'default-app-id'; // Ajuste conforme seu uso real

// ================= ESTADO GLOBAL =================
let currentUserData = null;
let currentScheduleData = {}; // Dados da escala do mês

// ================= DOM ELEMENTS =================
const adminArea = document.getElementById('adminArea');
const collaboratorArea = document.getElementById('collaboratorArea');
const loadingScreen = document.getElementById('loadingScreen');
const userGreeting = document.getElementById('userGreeting');
const userRoleLabel = document.getElementById('userRoleLabel');

// ================= AUTH & ROUTING =================
onAuthStateChanged(auth, async (user) => {
    if (user) {
        try {
            // 1. Buscar dados do perfil (incluindo nível de acesso e nome para escala)
            const docRef = doc(db, 'artifacts', appId, 'users', user.uid, 'profile', 'data');
            const docSnap = await getDoc(docRef);
            
            if (docSnap.exists()) {
                currentUserData = docSnap.data();
                const role = currentUserData.accessLevel || 'colaborador';
                const userName = user.displayName || currentUserData.displayName || "Usuário";

                // Atualizar Navbar
                userGreeting.textContent = `Olá, ${userName.split(' ')[0]}`;
                userRoleLabel.textContent = role === 'admin' ? 'Administrador' : 'Colaborador';
                
                // Roteamento de Visão
                if (role === 'admin') {
                    initAdminView();
                } else {
                    initCollaboratorView(userName); // Passamos o nome para filtrar a escala pessoal
                }
            } else {
                // Perfil não existe, fallback para colaborador
                initCollaboratorView(user.displayName);
            }
        } catch (e) {
            console.error("Erro ao carregar perfil:", e);
            alert("Erro ao carregar perfil. Verifique console.");
        } finally {
            loadingScreen.classList.add('hidden');
        }
    } else {
        window.location.href = 'login.html';
    }
});

// Botão Logout
document.getElementById('btnLogout').addEventListener('click', () => {
    signOut(auth).then(() => window.location.reload());
});

// ================= LÓGICA DE ADMIN (Mantida Simplificada) =================
function initAdminView() {
    adminArea.classList.remove('hidden');
    collaboratorArea.classList.add('hidden');
    
    // Aqui você carregaria a lógica antiga do dashboard admin (kpis, gráficos, slider)
    // Para brevidade, chamamos a função que carrega os dados (assumindo que existe no escopo global ou importada)
    // loadAdminDashboardData(); // Função hipotética baseada no seu código original
    console.log("Admin View Carregada");
}

// ================= LÓGICA DE COLABORADOR (NOVA) =================
async function initCollaboratorView(userName) {
    adminArea.classList.add('hidden');
    collaboratorArea.classList.remove('hidden');
    
    setupCollaboratorTabs();
    setupRequestForms();
    
    // Carregar Escala Pessoal (Simulação de busca na coleção 'escalas')
    // Na prática, você usaria a mesma lógica do loadDataFromCloud mas filtrando só o usuário
    await loadCollaboratorSchedule(userName);
}

function setupCollaboratorTabs() {
    const tabs = document.querySelectorAll('.collab-tab');
    const contents = document.querySelectorAll('.collab-content');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => {
                t.classList.remove('active', 'bg-purple-600', 'text-white', 'shadow-lg');
                t.classList.add('text-gray-400');
            });
            contents.forEach(c => c.classList.add('hidden'));

            tab.classList.add('active', 'bg-purple-600', 'text-white', 'shadow-lg');
            tab.classList.remove('text-gray-400');
            
            const targetId = tab.dataset.target;
            document.getElementById(targetId).classList.remove('hidden');
        });
    });
}

function setupRequestForms() {
    // Alternar entre formulários na aba Solicitações
    const typeBtns = document.querySelectorAll('.req-type-btn');
    const forms = document.querySelectorAll('.req-form');

    typeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            typeBtns.forEach(b => {
                b.classList.remove('active', 'border-purple-500', 'text-white', 'bg-[#2E3250]');
                b.classList.add('border-[#2E3250]', 'text-gray-400', 'bg-[#1A1C2E]');
                // Reset icon color logic if needed
            });
            forms.forEach(f => f.classList.add('hidden'));

            btn.classList.add('active', 'border-purple-500', 'text-white', 'bg-[#2E3250]');
            btn.classList.remove('border-[#2E3250]', 'text-gray-400', 'bg-[#1A1C2E]');

            const targetForm = btn.dataset.form;
            document.getElementById(targetForm).classList.remove('hidden');
        });
    });

    // Envio do Form de Troca (Exemplo)
    const swapForm = document.getElementById('form-swap');
    if(swapForm) {
        swapForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            // Lógica de envio para Firestore
            const btn = swapForm.querySelector('button[type="submit"]');
            const originalText = btn.textContent;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';
            btn.disabled = true;

            try {
                await addDoc(collection(db, "requests"), {
                    requesterUid: auth.currentUser.uid,
                    requesterName: auth.currentUser.displayName,
                    type: 'swap',
                    status: 'pending',
                    createdAt: serverTimestamp(),
                    // Campos do form...
                    description: "Solicitação de troca enviada via Painel Colaborador" 
                });
                alert("Solicitação enviada com sucesso! Aguarde aprovação.");
                swapForm.reset();
            } catch (error) {
                console.error("Erro ao enviar:", error);
                alert("Erro ao enviar solicitação.");
            } finally {
                btn.innerHTML = originalText;
                btn.disabled = false;
            }
        });
    }
}

// Simulação de carregamento de dados pessoais para preencher o Dashboard
async function loadCollaboratorSchedule(userName) {
    // 1. Determinar mês atual
    const date = new Date();
    const docId = `escala-${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`;
    
    try {
        const docRef = doc(db, "escalas", docId);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const rawData = docSnap.data();
            // Buscar dados específicos do usuário pelo nome (assumindo que a chave no objeto é o nome)
            const myScheduleData = rawData[userName]; // Ajuste essa lógica se a chave for UID ou outro ID
            
            if (myScheduleData) {
                renderCollaboratorDashboard(myScheduleData);
            } else {
                document.getElementById('currentScheduleType').textContent = "Não encontrado na escala";
            }
        }
    } catch (e) {
        console.error("Erro ao carregar escala pessoal:", e);
    }
}

function renderCollaboratorDashboard(userData) {
    // Preencher Cards
    document.getElementById('currentScheduleType').textContent = userData.Horário || "Padrão";
    
    // Lógica simples para achar próximo plantão (T)
    const today = new Date().getDate();
    // Supondo que 'schedule' seja o array calculado (voce precisaria rodar a função buildFinalScheduleForMonth do código original aqui)
    // Para simplificar, vou colocar valores dummy, mas você integraria com sua função 'buildFinalScheduleForMonth'
    
    document.getElementById('nextShiftDay').textContent = String(today + 1).padStart(2, '0'); // Amanhã
    document.getElementById('nextShiftDate').textContent = "Amanhã";
    document.getElementById('nextShiftTime').textContent = userData.Horário || "08:00 às 18:00";
    
    // Renderizar Grid Calendário (Simplificado)
    const grid = document.getElementById('collabCalendarGrid');
    grid.innerHTML = '';
    for(let i=1; i<=30; i++) {
        // Exemplo visual apenas
        const div = document.createElement('div');
        div.className = "h-8 bg-[#0F1020] rounded flex items-center justify-center text-xs text-gray-500 border border-[#2E3250]";
        div.textContent = i;
        if(i === today) div.className += " border-purple-500 text-purple-400 font-bold";
        grid.appendChild(div);
    }
}
