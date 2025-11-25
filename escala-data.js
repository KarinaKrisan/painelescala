// ==========================================
// escala-data.js (CORREÇÃO FINAL)
// ==========================================

const rawDataFromEscala = null; // manter definido para compatibilidade, mas não usado.

const employeeMetadata = {
    // OPERADORES NOC - COMUM
    "Yan Santos": { Grupo: "Operador Noc", Célula: "Oi", Horário: "8:00 às 17:48", Turno: "Manhã" },
    "Carlos Diego": { Grupo: "Operador Noc", Célula: "Claro / Telmex", Horário: "8:00 às 17:48", Turno: "Manhã" },
    "Bruno Capone": { Grupo: "Operador Noc", Célula: "Outras Operadoras", Horário: "7:30 às 17:18", Turno: "Manhã" },
    "Leandra Moura": { Grupo: "Operador Noc", Célula: "Oi", Horário: "8:00 às 17:48", Turno: "Manhã" },
    "Carlos Magno": { Grupo: "Operador Noc", Célula: "Sitebra / B2B", Horário: "7:30 às 17:18", Turno: "Manhã" },
    "Emanuel Pereira": { Grupo: "Operador Noc", Célula: "Oi", Horário: "8:00 às 17:48", Turno: "Manhã" },
    "Karina Krisan": { Grupo: "Operador Noc", Célula: "Oi", Horário: "08:00 às 17:48", Turno: "Manhã" },
    "Felipe Pena": { Grupo: "Operador Noc", Célula: "Cirion / Vivo / Telebras", Horário: "12:12 às 22:00", Turno: "Tarde" },
    "Robervan Brahian": { Grupo: "Operador Noc", Célula: "Oi", Horário: "8:30 às 18:18", Turno: "Manhã" },
    "Johnny Collins": { Grupo: "Operador Noc", Célula: "Cirion / Vivo / Telebras", Horário: "7:30 às 17:18", Turno: "Manhã" },
    "Gabriel Procópio": { Grupo: "Operador Noc", Célula: "Oi", Horário: "7:30 às 17:18", Turno: "Manhã" },
    "Bruno Roque": { Grupo: "Operador Noc", Célula: "Sitelbra/ B2B", Horário: "7:30 às 17:18", Turno: "Manhã" },
    
    // PLANTÕES 12X36 NOTURNO
    "Bruno Cipola": { Grupo: "Operador Noc", Célula: "Atendimento", Horário: "19:30 às 07:30", Turno: "Noturno (12x36)" },
    "Leandro Alves": { Grupo: "Operador Noc", Célula: "Atendimento ", Horário: "19:30 às 07:30", Turno: "Noturno (12x36)" },
    
    // NOVOS PLANTÕES 12X36 DIURNO (CORRIGIDOS E ADICIONADOS)
    "Rafael Batista": { Grupo: "Operador Noc", Célula: "Atendimento", Horário: "07:00 às 19:00", Turno: "Diurno (12x36)" },
    "Ivan Gabriel": { Grupo: "Operador Noc", Célula: "Atendimento", Horário: "07:00 às 19:00", Turno: "Diurno (12x36)" },
    "Nilton Santos": { Grupo: "Operador Noc", Célula: "Atendimento", Horário: "07:00 às 19:00", Turno: "Diurno (12x36)" },
    "Diego Mendonça": { Grupo: "Operador Noc", Célula: "Atendimento", Horário: "07:00 às 19:00", Turno: "Diurno (12x36)" },
    "Bruno Messias": { Grupo: "Operador Noc", Célula: "Atendimento", Horário: "07:00 às 19:00", Turno: "Diurno (12x36)" },
    "Carlos Eduardo": { Grupo: "Operador Noc", Célula: "Atendimento", Horário: "07:00 às 19:00", Turno: "Diurno (12x36)" },

    // LÍDERES E SUPORTE (Turno Comercial 5x2)
    "Aidan Candido": { Grupo: "Líder de Célula", Célula: "Sitelbra/ B2B", Horário: "08:00 às 17:48", Turno: "Comercial" },
    "Raquel Nascimento": { Grupo: "Líder de Célula", Célula: "Claro / Telmex", Horário: "08:00 às 17:48", Turno: "Comercial" },
    "Samile Chaga": { Grupo: "Líder de Célula", Célula: "Oi", Horário: "08:00 às 17:48", Turno: "Comercial" },
    "Patricia Oliveira": { Grupo: "Líder de Célula", Célula: "Outras Operadoras", Horário: "8:00 às 17:48", Turno: "Comercial" },
    "Joab Santos": { Grupo: "Líder de Célula", Célula: "Cirion/ Vivo/ Telebras", Horário: "08:00 às 17:48", Turno: "Comercial" },
    "Lucas Keller": { Grupo: "Suporte Avançado", Célula: "N2", Horário: "08:30 às 18:18", Turno: "Comercial" },
    "André Luiz": { Grupo: "Suporte Avançado", Célula: "N2", Horário: "08:30 às 18:18", Turno: "Comercial" },
    // CORRIGIDO: Tadeu Sidnei (correto)
    "Tadeu Sidnei": { Grupo: "Gestor Técnico Geral", Célula: "-", Horário: "08:30 às 18:18", Turno: "Comercial" }
};
