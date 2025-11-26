// ==========================================
// CARD DO COLABORADOR (DESIGN PREMIUM)
// ==========================================
function updatePersonalView(name) {
    const employee = scheduleData[name];
    if (!employee) return;
    
    const infoCard = document.getElementById('personalInfoCard');
    const calendarContainer = document.getElementById('calendarContainer');
    
    // Definição de Cores baseada no Grupo (Líder vs Operador)
    const isLeader = employee.info.Grupo === "Líder de Célula";
    
    // Degradê do cabeçalho
    const gradientClass = isLeader 
        ? 'bg-gradient-to-r from-purple-700 to-pink-600' 
        : 'bg-gradient-to-r from-indigo-600 to-blue-600';
        
    // Cor dos ícones internos
    const iconBgClass = isLeader ? 'bg-purple-50 text-purple-600' : 'bg-indigo-50 text-indigo-600';

    // Garante que o container esteja visível e limpa classes antigas de cor sólida
    infoCard.className = `hidden bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden mb-8 transition-all duration-500 ease-out transform translate-y-4 opacity-0`;
    
    // HTML do Novo Card
    infoCard.innerHTML = `
        <div class="${gradientClass} p-6 relative overflow-hidden">
            <div class="absolute top-0 right-0 -mr-10 -mt-10 w-40 h-40 rounded-full bg-white opacity-10 blur-2xl"></div>
            
            <div class="relative z-10 flex items-center gap-5">
                <div class="bg-white/20 backdrop-blur-sm p-3 rounded-full border border-white/30 shadow-inner">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                </div>
                
                <div class="flex-1 text-white">
                    <h2 class="text-2xl md:text-3xl font-bold tracking-tight leading-tight">${name}</h2>
                    <p class="text-white/90 text-sm font-medium uppercase tracking-wider mt-1 opacity-90 border-l-2 border-white/40 pl-2">
                        ${employee.info.Grupo}
                    </p>
                </div>
            </div>
        </div>

        <div class="p-6 md:p-8 grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8 bg-white">
            
            <div class="flex items-start gap-4 p-3 rounded-xl hover:bg-gray-50 transition-colors">
                <div class="p-3 ${iconBgClass} rounded-lg shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                </div>
                <div>
                    <p class="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">Célula / Projeto</p>
                    <p class="text-gray-800 font-bold text-lg leading-tight">${employee.info.Célula}</p>
                </div>
            </div>

            <div class="flex items-start gap-4 p-3 rounded-xl hover:bg-gray-50 transition-colors">
                <div class="p-3 ${iconBgClass} rounded-lg shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                    </svg>
                </div>
                <div>
                    <p class="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">Turno</p>
                    <p class="text-gray-800 font-bold text-lg leading-tight">${employee.info.Turno || 'Padrão'}</p>
                </div>
            </div>

            <div class="flex items-start gap-4 p-3 rounded-xl hover:bg-gray-50 transition-colors">
                <div class="p-3 ${iconBgClass} rounded-lg shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                </div>
                <div>
                    <p class="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">Horário de Trabalho</p>
                    <p class="text-gray-800 font-bold text-lg leading-tight">${employee.info.Horário || '--:--'}</p>
                </div>
            </div>
        </div>
    `;

    infoCard.classList.remove('hidden');
    
    // Animação de entrada suave (Slide up + Fade in)
    setTimeout(() => {
         infoCard.classList.remove('translate-y-4', 'opacity-0'); 
    }, 50);
   
    calendarContainer.classList.remove('hidden');
    updateCalendar(employee.schedule);
}
