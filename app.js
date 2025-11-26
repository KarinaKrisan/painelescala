function updateWeekendTable() {
    const container = document.getElementById('weekendPlantaoContainer');
    if (!container) return;
    container.innerHTML = '';
    
    const m = { y: selectedMonthObj.year, mo: selectedMonthObj.month };
    const total = new Date(m.y, m.mo+1, 0).getDate();
    
    // Helper para formatar data (DD/MM)
    const fmtDate = (d) => `${pad(d)}/${pad(m.mo+1)}`;

    // Helper para criar as tags de nomes (estilo "botão" da imagem)
    const createNameTags = (names, colorClass = 'blue') => {
        if (!names || names.length === 0) return '<span class="text-gray-400 text-sm italic ml-2">Ninguém escalado</span>';
        
        // Define cores baseadas no parametro (azul para sabado, roxo para domingo na imagem)
        const border = colorClass === 'purple' ? 'border-purple-600 text-purple-700' : 'border-blue-600 text-blue-700';
        
        return names.map(n => `
            <div class="border ${border} px-3 py-1 rounded-md text-sm font-medium bg-white shadow-sm whitespace-nowrap">
                ${n}
            </div>
        `).join('');
    };
    
    for (let d=1; d<=total; d++){
        const dow = new Date(m.y, m.mo, d).getDay();
        
        // Encontrou um Sábado (Dia 6)
        if (dow === 6) { 
            const sat = d;
            const sun = d+1 <= total ? d+1 : null; // Verifica se domingo cai no mesmo mês
            
            let satW=[], sunW=[];
            Object.keys(scheduleData).forEach(n=>{
                if(scheduleData[n].schedule[sat-1]==='T') satW.push(n);
                if(sun && scheduleData[n].schedule[sun-1]==='T') sunW.push(n);
            });

            // Se houver alguém escalado no fim de semana, renderiza o card
            if(satW.length || sunW.length) {
                // Formata as Labels com a data solicitada
                const satLabel = `SÁBADO (${fmtDate(sat)})`;
                const sunLabel = sun ? `DOMINGO (${fmtDate(sun)})` : 'DOMINGO (Próx. Mês)';

                // HTML do Card Estilizado
                const cardHTML = `
                <div class="bg-white rounded-xl shadow-lg mb-6 overflow-hidden border border-gray-100 font-sans">
                    <div class="bg-gradient-to-r from-blue-600 to-blue-500 text-white p-4 flex items-center gap-3">
                        <svg class="w-6 h-6 opacity-80" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                        <span class="font-bold text-lg">Fim de Semana ${fmtDate(sat)}</span>
                    </div>

                    <div class="p-6 flex flex-col gap-6">
                        
                        <div class="flex gap-4">
                            <div class="w-1.5 bg-blue-400 rounded-full shrink-0"></div>
                            <div class="flex-1">
                                <h4 class="text-xs font-bold text-blue-600 uppercase tracking-widest mb-3">
                                    ${satLabel}
                                </h4>
                                <div class="flex flex-wrap gap-2">
                                    ${createNameTags(satW, 'blue')}
                                </div>
                            </div>
                        </div>

                        ${sun ? `
                        <div class="border-t border-dashed border-gray-200"></div>

                        <div class="flex gap-4">
                            <div class="w-1.5 bg-purple-400 rounded-full shrink-0"></div>
                            <div class="flex-1">
                                <h4 class="text-xs font-bold text-purple-600 uppercase tracking-widest mb-3">
                                    ${sunLabel}
                                </h4>
                                <div class="flex flex-wrap gap-2">
                                    ${createNameTags(sunW, 'purple')}
                                </div>
                            </div>
                        </div>
                        ` : ''}

                    </div>
                </div>`;
                
                container.insertAdjacentHTML('beforeend', cardHTML);
            }
        }
    }
}
