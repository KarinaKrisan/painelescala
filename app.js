// ==========================================
// ATUALIZAÇÃO DO CARD PESSOAL (CORREÇÃO MOBILE)
// ==========================================
function updatePersonalView(name) {
    const emp = scheduleData[name];
    if (!emp) return;
    const card = document.getElementById('personalInfoCard');
    
    // Dados extraídos ou defaults
    const cargo = emp.info.Cargo || emp.info.Grupo || 'Colaborador';
    const horario = emp.info.Horário || '--:--';
    
    // Tenta ler Célula de várias formas para evitar undefined
    const celula = emp.info.Célula || emp.info.Celula || emp.info.CELULA || 'Sitelbra/ B2B';
    
    // Lógica de Turno
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
    
    // Gradiente idêntico ao da foto (Roxo Vibrante)
    card.className = "mb-6 mx-auto w-full max-w-md bg-gradient-to-br from-[#6221ea] to-[#4a148c] rounded-[24px] shadow-2xl overflow-hidden text-white transform transition-all duration-300 ring-1 ring-white/10";

    card.innerHTML = `
        <div class="px-6 pt-6 pb-4">
            <h2 class="text-3xl font-bold tracking-tight mb-2 text-white drop-shadow-md">${name}</h2>
            
            <div class="flex items-center gap-2.5">
                <span class="relative flex h-3 w-3">
                  <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span class="relative inline-flex rounded-full h-3 w-3 bg-green-400 border border-white/30"></span>
                </span>
                
                <p class="text-[11px] font-bold uppercase tracking-widest bg-white/20 px-2 py-1 rounded text-white/90 shadow-sm border border-white/10">
                    ${cargo.toUpperCase()}
                </p>
            </div>
        </div>

        <div class="h-px w-full bg-gradient-to-r from-transparent via-white/20 to-transparent my-1"></div>

        <div class="grid grid-cols-3 divide-x divide-white/10 bg-black/20 backdrop-blur-md">
            
            <div class="py-4 px-1 flex flex-col items-center justify-center min-h-[75px]">
                <span class="text-[10px] text-purple-200 font-bold uppercase tracking-wider mb-1 opacity-80">Célula</span>
                <span class="text-xs md:text-sm font-bold text-white text-center leading-tight px-1 w-full break-words">
                    ${celula}
                </span>
            </div>

            <div class="py-4 px-1 flex flex-col items-center justify-center min-h-[75px]">
                <span class="text-[10px] text-purple-200 font-bold uppercase tracking-wider mb-1 opacity-80">Turno</span>
                <span class="text-xs md:text-sm font-bold text-white text-center leading-tight px-1 w-full break-words">
                    ${turno}
                </span>
            </div>

            <div class="py-4 px-1 flex flex-col items-center justify-center min-h-[75px]">
                <span class="text-[10px] text-purple-200 font-bold uppercase tracking-wider mb-1 opacity-80">Horário</span>
                <span class="text-xs md:text-sm font-bold text-white text-center leading-tight px-1 w-full break-words">
                    ${horario}
                </span>
            </div>
        </div>
    `;

    document.getElementById('calendarContainer').classList.remove('hidden');
    updateCalendar(emp.schedule);
}
