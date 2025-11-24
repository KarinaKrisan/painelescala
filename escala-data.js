// ==========================================
// ESTRUTURA DE DADOS BRUTA (ESCALA)
// ==========================================
// rawDataFromEscala: Contém a lista de colaboradores e seus dias de trabalho/folga/férias.
const rawDataFromEscala = `
Nome do colaborador: Yan Santos
Dias trabalhados: 3, 4, 5, 6, 7, 10, 11, 12, 13, 17, 18, 19, 20, 24, 25, 26, 27, 28, 15, 16
F: 1, 2, 8, 9, 22, 23, 29, 30
FS: 14
FD: 21
FE:
*********************************
Nome do colaborador: Carlos Diego
Dias trabalhados: 3, 4, 5, 6, 7, 10, 11, 12, 13, 14, 17, 18, 19, 20, 21, 
24, 25, 26, 27, 29, 30
F: 1, 2, 8, 9, 15, 16, 22, 23
FS: 28
FD:
FE:
*********************************
Nome do colaborador: Bruno Capone
Dias trabalhados:1,2,3,4,6,7,10,11,12,13,14,17,18,19,20,21,24,25,26,27,28
F:8,9,15,16,22,23,29,30
FS:
FD:5
FE:
*********************************
Nome do colaborador: Leandra Moura
Dias trabalhados:1,2,3,5,6,7,10,11,12,13,14,17,18,19,20,21,24,25,26,27,28
F:8,9,15,16,22,23,29,30
FE:
FS:
FD:4
*********************************
Nome do colaborador: Carlos Magno
Dias trabalhados:3,4,5,6,7,10,11,12,13,15,16,18,19,20,21,24,25,26,27,28
F:1,2,8,9,22,23,29,30
FE:
FS:14
FD:17
*********************************
Nome do colaborador: Karina Krisan
Dias trabalhados:3,4,5,6,7,10,11,12,13,14,17,18,19,20,22,23,24,25,26,27
F:1,2,8,9,15,16,29,30
FS:21
FD:28
FE:
*********************************
Nome do colaborador: Gabriel Procópio
Dias trabalhados:3,4,5,6,8,9,10,11,12,13,17,18,19,20,21,24,25,26,27,28
F:1,2,15,16,22,23,29,30
FS:7
FD:14
FE:
*********************************
Nome do colaborador: Bruno Roque
Dias trabalhados:3,4,5,6,7,10,11,12,13,14,17,18,19,20,22,23,24,25,26,27
F:1,2,8,9,15,16,29,30
FS:21
FD:25
FE:
*********************************
Nome do colaborador: Johnny Collins
Dias trabalhados:3,4,5,7,8,9,10,12,13,14,17,18,19,20,21,24,25,26,27,28
F:1,2,15,16,22,23,29,30
FS:6
FD:11
FE:
*********************************
Nome do colaborador: Robervan Brahian
Dias trabalhados:3,4,5,6,7,10,11,12,13,14,17,18,19,20,21,
F:fins de semana
FS:
FD:
FE:24/11 até 08/12
**/*******************************
Nome do colaborador: Emanuel Pereira
Dias trabalhados:3,4,5,6,7,10,11,12,13,14,17,18,19,20,21,24,25,27,28,29,30
F:1,2,8,9,15,16,22,23
FS:26
FD:
FE:
*********************************
Nome do colaborador: Felipe Pena
Dias trabalhados:3,4,6,7,8,9,11,12,13,14,17,18,19,19,21,22,23,24,25,27,28
F:1,2,15,16,29,30
FS:5,20
FD:10,26
FE:
*********************************
Nome do colaborador: Bruno Cipola
Dias trabalhados:
F:trabalhados: 12x36 iniciado no dia 2/11
FS:
FD:
FE:
*********************************
Nome do colaborador: Leandro Alves
Dias trabalhados: 12x36 iniciado no dia 1/11
F:
FS:
FD:
FE:
*********************************
Nome do colaborador: Aidan Candido
Dias trabalhados:segunda a sexta
F:fins de semana
FS:
FD:
FE:
*********************************
Nome do colaborador: Patricia Oliveira
Dias trabalhados:segunda a sexta
F:fins de semana
FS:
FD:
FE:03/11 até 03/12
*********************************
Nome do colaborador: Samile Chaga
Dias trabalhados:segunda a sexta
F:fins de semana
FS:
FD:
FE:
*********************************
Nome do colaborador: Joab Santos
Dias trabalhados:segunda a sexta
F:fins de semana
FS:
FD:
FE:
*********************************
Nome do colaborador: Lucas Keller
Dias trabalhados:segunda a sexta
F:fins de semana
FS:
FD:
FE:
*********************************
Nome do colaborador: André Luiz
Dias trabalhados:segunda a sexta
F:fins de semana
FS:
FD:
FE:
*********************************
Nome do colaborador: Tadeu Sidney
Dias trabalhados: segunda a sexta
F:fins de semana
FS:
FD:
FE:
        `;

// employeeMetadata: Metadados estáticos sobre cada colaborador (Grupo, Célula, Horário, Turno).
const employeeMetadata = {
    "Yan Santos": { Grupo: "Operador Noc", Célula: "Oi", Horário: "8:00 às 17:48", Turno: "Manhã" },
    "Carlos Diego": { Grupo: "Operador Noc", Célula: "Claro / Telmex", Horário: "8:30 às 18:18", Turno: "Manhã" },
    "Bruno Capone": { Grupo: "Operador Noc", Célula: "Outras Operadoras", Horário: "7:30 às 17:18", Turno: "Manhã" },
    "Leandra Moura": { Grupo: "Operador Noc", Célula: "Oi", Horário: "8:00 às 17:48", Turno: "Manhã" },
    "Carlos Magno": { Grupo: "Operador Noc", Célula: "Sitebra / B2B", Horário: "7:30 às 17:18", Turno: "Manhã" },
    "Emanuel Pereira": { Grupo: "Operador Noc", Célula: "Oi", Horário: "8:00 às 17:48", Turno: "Manhã" },
    "Karina Krisan": { Grupo: "Operador Noc", Célula: "Oi", Horário: "08:00 às 17:48", Turno: "Manhã" },
    "Felipe Pena": { Grupo: "Operador Noc", Célula: "Cirion / Vivo / Telebras", Horário: "12:12 às 22:00", Turno: "Tarde" },
    "Robervan Brahian": { Grupo: "Operador Noc", Célula: "Oi", Horário: "8:30 às 18:18", Turno: "Manhã" },
    "Johnny Collins": { Grupo: "Operador Noc", Célula: "Cirion / Vivo / Telebras", Horário: "8:00 às 17:48", Turno: "Manhã" },
    "Gabriel Procópio": { Grupo: "Operador Noc", Célula: "Oi", Horário: "8:00 às 17:48", Turno: "Manhã" },
    "Bruno Roque": { Grupo: "Operador Noc", Célula: "Claro/ Telmex", Horário: "8:30 às 18:18", Turno: "Manhã" },
    "Bruno Cipola": { Grupo: "Operador Noc", Célula: "Atendimento", Horário: "19:30 às 07:30", Turno: "Noturno (12x36)" },
    "Leandro Alves": { Grupo: "Operador Noc", Célula: "Atendimento ", Horário: "19:30 às 07:30", Turno: "Noturno (12x36)" },
    // NOVOS LÍDERES DE CÉLULA
    "Aidan Candido": { Grupo: "Líder de Célula", Célula: "Claro/ Telmex/ Sitelbra/ B2B", Horário: "08:30 às 18:18", Turno: "Comercial" },
    "Samile Chaga": { Grupo: "Líder de Célula", Célula: "Oi", Horário: "08:00 às 17:48", Turno: "Comercial" },
    "Patricia Oliveira": { Grupo: "Líder de Célula", Célula: "Outras Operadoras", Horário: "8:00 às 17:48", Turno: "Comercial" },
    "Joab Santos": { Grupo: "Líder de Célula", Célula: "Cirion/ Vivo/ Telebras", Horário: "08:00 às 17:48", Turno: "Comercial" },
    "Lucas Keller": { Grupo: "Suporte Avançado", Célula: "N2", Horário: "08:30 às 18:18", Turno: "Comercial" },
    "André Luiz": { Grupo: "Suporte Avançado", Célula: "N2", Horário: "08:30 às 18:18", Turno: "Comercial" },
    "Tadeu Sidney": { Grupo: "Gestor Técnico Geral", Célula: "-", Horário: "08:30 às 18:18", Turno: "Comercial" },
};


