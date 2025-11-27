function updatePersonalView(name) {
    const emp = scheduleData[name];
    if (!emp) return;
    const card = document.getElementById('personalInfoCard');
    
    // Dados extraídos ou defaults
    const cargo = emp.info.Cargo || emp.info.Grupo || 'Colaborador';
    const horario = emp.info.Horário || '--:--';
    
    // Leitura de Célula
    const celula = emp.info.Célula || emp.info.Celula || emp.info.CELULA || 'Sitelbra/ B2B';
    
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
    card.className = "mb-8 bg-gradient-to-r from-violet-700 to-purple-600 rounded-2xl shadow-xl overflow-hidden text-white transform transition-all duration-300";

    // --- ALTERAÇÕES DE TAMANHO AQUI ---
    card.innerHTML = `
        <div class="px-6 py-4"> <h2 class="text-xl md:text-2xl font-extrabold tracking-tight mb-1">${name}</h2>
            
            <div class="flex items-center gap-2">
                <span class="w-2 h-2 rounded-full bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.8)]"></span>
                <p class="text-purple-200 text-xs font-semibold uppercase tracking-widest">${cargo}</p>
            </div>
        </div>

        <div class="h-px w-full bg-white opacity-20"></div>

        <div class="flex flex-row items-center justify-between bg-black/10 backdrop-blur-sm">
            
            <div class="flex-1 py-3 px-2 text-center border-r border-white/10 hover:bg-white/5 transition-colors">
                <span class="block text-[10px] text-purple-200 font-bold uppercase mb-1 tracking-wider opacity-80">Célula</span>
                <span class="block text-xs md:text-sm font-bold text-white whitespace-nowrap">${celula}</span>
            </div>

            <div class="flex-1 py-3 px-2 text-center border-r border-white/10 hover:bg-white/5 transition-colors">
                <span class="block text-[10px] text-purple-200 font-bold uppercase mb-1 tracking-wider opacity-80">Turno</span>
                <span class="block text-xs md:text-sm font-bold text-white whitespace-nowrap">${turno}</span>
            </div>

            <div class="flex-1 py-3 px-2 text-center hover:bg-white/5 transition-colors">
                <span class="block text-[10px] text-purple-200 font-bold uppercase mb-1 tracking-wider opacity-80">Horário</span>
                <span class="block text-xs md:text-sm font-bold text-white whitespace-nowrap">${horario}</span>
            </div>
        </div>
    `;

    document.getElementById('calendarContainer').classList.remove('hidden');
    updateCalendar(emp.schedule);
}
