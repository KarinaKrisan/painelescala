// ==========================================
// ATUALIZAÇÃO DO CARD PESSOAL (AJUSTADO: COR CREME/LARANJA CLARO + NOME MENOR)
// ==========================================
function updatePersonalView(name) {
    const emp = scheduleData[name];
    if (!emp) return;
    const card = document.getElementById('personalInfoCard');
    
    // Dados extraídos ou defaults
    const cargo = emp.info.Cargo || emp.info.Grupo || 'Colaborador';
    const horario = emp.info.Horário || '--:--';
    const celula = emp.info.Célula || emp.info.Celula || emp.info.CELULA || 'Sitelbra/ B2B';
    
    let turno = emp.info.Turno;
    if(!turno && horario !== '--:--') {
        const startH = parseInt(horario.split(':')[0]);
        if(!isNaN(startH)) {
            if(startH >= 18 || startH <= 5) turno = 'Noturno';
            else turno = 'Comercial';
        } else { turno = 'Comercial'; }
    } else if(!turno) { turno = 'Comercial'; }

    // --- LÓGICA DE STATUS DO DIA (BOLINHA) ---
    // Pega o status base (T, F, FE...) do dia selecionado
    let statusToday = emp.schedule[currentDay - 1] || 'F';
    
    // VERIFICAÇÃO PARA EXPEDIENTE ENCERRADO
    const now = new Date();
    const isToday = (now.getDate() === currentDay && now.getMonth() === systemMonth && now.getFullYear() === systemYear);

    if (statusToday === 'T' && isToday) {
        if (!isWorkingTime(emp.info.Horário)) {
            statusToday = 'OFF-SHIFT';
        }
    }

    // Define as cores da bolinha baseadas no status
    let dotClass = "";
    
    switch(statusToday) {
        case 'T': // Trabalhando -> Verde
            dotClass = "bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.8)]";
            break;
        case 'OFF-SHIFT': // Expediente Encerrado -> Roxo
            dotClass = "bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.8)]";
            break;
        case 'F': // Folga -> Amarelo
            dotClass = "bg-yellow-400 shadow-[0_0_8px_rgba(250,204,21,0.8)]";
            break;
        case 'FE': // Férias -> Vermelho
            dotClass = "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]";
            break;
        case 'FS': // Folga Sábado -> Azul Claro
            dotClass = "bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.8)]";
            break;
        case 'FD': // Folga Domingo -> Azul Escuro
            dotClass = "bg-blue-600 shadow-[0_0_8px_rgba(37,99,235,0.8)]";
            break;
        default: // Padrão -> Cinza
            dotClass = "bg-gray-400 shadow-[0_0_8px_rgba(156,163,175,0.8)]";
    }

    // Estilo e Exibição do Card
    // MUDANÇA AQUI: bg-orange-50 (Tom pastel/creme) e border-orange-100
    card.classList.remove('hidden');
    card.className = "mb-8 bg-orange-50 rounded-2xl shadow-xl border border-orange-100 overflow-hidden transform transition-all duration-300";

    card.innerHTML = `
        <div class="px-6 py-4"> 
            <h2 class="text-lg md:text-xl font-extrabold tracking-tight mb-1 text-gray-800">${name}</h2>
            
            <div class="flex items-center gap-2">
                <span class="w-2 h-2 rounded-full ${dotClass}"></span>
                <p class="text-indigo-500 text-xs font-semibold uppercase tracking-widest">${cargo}</p>
            </div>
        </div>

        <div class="h-px w-full bg-orange-200/50"></div>

        <div class="flex flex-row items-center justify-between bg-orange-50/50">
            
            <div class="flex-1 py-4 px-2 text-center border-r border-orange-200/50 hover:bg-orange-100 transition-colors">
                <span class="block text-[10px] md:text-xs text-gray-400 font-bold uppercase mb-1 tracking-wider">Célula</span>
                <span class="block text-xs md:text-sm font-bold text-gray-700 whitespace-nowrap">${celula}</span>
            </div>

            <div class="flex-1 py-4 px-2 text-center border-r border-orange-200/50 hover:bg-orange-100 transition-colors">
                <span class="block text-[10px] md:text-xs text-gray-400 font-bold uppercase mb-1 tracking-wider">Turno</span>
                <span class="block text-xs md:text-sm font-bold text-gray-700 whitespace-nowrap">${turno}</span>
            </div>

            <div class="flex-1 py-4 px-2 text-center hover:bg-orange-100 transition-colors">
                <span class="block text-[10px] md:text-xs text-gray-400 font-bold uppercase mb-1 tracking-wider">Horário</span>
                <span class="block text-xs md:text-sm font-bold text-gray-700 whitespace-nowrap">${horario}</span>
            </div>
        </div>
    `;

    document.getElementById('calendarContainer').classList.remove('hidden');
    updateCalendar(emp.schedule);
}
