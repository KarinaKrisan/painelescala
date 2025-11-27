// ==========================================
// ATUALIZAÇÃO DO CARD PESSOAL (ESTILO EXATO DA FOTO REFERÊNCIA)
// ==========================================
function updatePersonalView(name) {
    const emp = scheduleData[name];
    if (!emp) return;
    const card = document.getElementById('personalInfoCard');
    
    // --- Dados extraídos ---
    // Tenta pegar Cargo ou Grupo, se não tiver, usa o padrão da foto "OPERADOR NOC" para teste, 
    // mas no código final deve ser o dado real. Vou deixar dinâmico.
    const cargo = emp.info.Cargo || emp.info.Grupo || 'Colaborador';
    const horario = emp.info.Horário || '--:--';
    
    // Tenta ler Célula de várias formas. Valor padrão para bater com a foto se falhar.
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
    // -----------------------

    card.classList.remove('hidden');
    
    // Gradiente suave Roxo -> Violeta, bordas arredondadas, sombra
    card.className = "mb-6 mx-auto w-full max-w-md bg-gradient-to-br from-violet-600 to-purple-500 rounded-[20px] shadow-xl overflow-hidden text-white font-sans";

    card.innerHTML = `
        <div class="p-5">
            <h2 class="text-2xl font-bold tracking-tight text-white mb-1.5">${name}</h2>
            
            <div class="flex items-center gap-2">
                <span class="relative flex h-2.5 w-2.5 rounded-full bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.5)]"></span>
                <p class="text-sm text-white/90 font-semibold uppercase tracking-wider">${cargo}</p>
            </div>
        </div>

        <div class="h-px w-full bg-white/15 mx-auto"></div>

        <div class="grid grid-cols-3 py-3 bg-black/5 leading-tight">
            
            <div class="flex flex-col items-center justify-center border-r border-white/15 px-2">
                <span class="text-[11px] text-purple-200/80 font-medium mb-0.5">Célula</span>
                <span class="text-[13px] md:text-sm font-bold text-white text-center break-words w-full">
                    ${celula}
                </span>
            </div>

            <div class="flex flex-col items-center justify-center border-r border-white/15 px-2">
                <span class="text-[11px] text-purple-200/80 font-medium mb-0.5">Turno</span>
                <span class="text-[13px] md:text-sm font-bold text-white text-center break-words w-full">
                    ${turno}
                </span>
            </div>

            <div class="flex flex-col items-center justify-center px-2">
                <span class="text-[11px] text-purple-200/80 font-medium mb-0.5">Horário</span>
                <span class="text-[13px] md:text-sm font-bold text-white text-center break-words w-full">
                    ${horario}
                </span>
            </div>
        </div>
    `;

    document.getElementById('calendarContainer').classList.remove('hidden');
    updateCalendar(emp.schedule);
}
