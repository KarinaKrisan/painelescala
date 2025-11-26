// ==========================================
// CALENDÁRIO: VISUAL CARD (LISTA) vs GRID
// ==========================================
function updateCalendar(schedule) {
    const grid = document.getElementById('calendarGrid');
    const isMobile = window.innerWidth <= 767;
    grid.innerHTML = '';
    
    if(isMobile) {
        // --- MODO LISTA (MOBILE) - Estilo Card Arredondado ---
        grid.className = 'flex flex-col space-y-3'; // Espaçamento vertical entre os cards

        schedule.forEach((st, i) => {
            const dayNumber = i + 1;
            const statusText = statusMap[st] || st;

            // Definição de Cores baseada no Status (Borda e Texto)
            let borderClass = 'border-gray-200';
            let textClass = 'text-gray-500';

            if (st === 'T') {
                // Trabalhando: Borda Verde/Teal, Texto Verde
                borderClass = 'border-emerald-300 bg-emerald-50/10'; 
                textClass = 'text-emerald-700';
            } else if (['F', 'FS', 'FD'].includes(st)) {
                // Folga: Borda Laranja/Ambar, Texto Laranja
                borderClass = 'border-amber-300 bg-amber-50/10';
                textClass = 'text-amber-800';
            } else if (st === 'FE') {
                // Férias: Borda Vermelha
                borderClass = 'border-red-300 bg-red-50/10';
                textClass = 'text-red-700';
            } else if (st === 'OFF-SHIFT' || st === 'F_EFFECTIVE') {
                // Exp. Encerrado: Borda Roxa
                borderClass = 'border-purple-300 bg-purple-50/10';
                textClass = 'text-purple-700';
            }

            // HTML do Card Individual
            const cardHtml = `
                <div class="flex justify-between items-center bg-white p-4 rounded-xl border ${borderClass} shadow-sm transition-transform active:scale-[0.99]">
                    <span class="text-gray-700 font-medium text-base">Dia ${dayNumber}</span>
                    <span class="font-bold text-sm uppercase tracking-wide ${textClass}">${statusText}</span>
                </div>
            `;
            
            grid.insertAdjacentHTML('beforeend', cardHtml);
        });

    } else {
        // --- MODO GRID (DESKTOP) ---
        grid.className = 'calendar-grid-container';
        const m = { y: selectedMonthObj.year, mo: selectedMonthObj.month };
        const empty = new Date(m.y, m.mo, 1).getDay();
        
        // Células vazias iniciais
        for(let i=0;i<empty;i++) grid.insertAdjacentHTML('beforeend','<div class="calendar-cell bg-gray-50"></div>');
        
        // Dias do mês
        schedule.forEach((st, i) => {
             grid.insertAdjacentHTML('beforeend', `
                <div class="calendar-cell bg-white border border-gray-100 hover:bg-gray-50 transition-colors">
                    <div class="day-number text-gray-700">${i+1}</div>
                    <div class="day-status-badge status-${st}">${statusMap[st]||st}</div>
                </div>
             `);
        });
    }
}
