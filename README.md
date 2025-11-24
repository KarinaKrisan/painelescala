[README_ESCALA.md](https://github.com/user-attachments/files/23728628/README_ESCALA.md)

ARQUIVO: Estrutura gerada para Escala por mês (GitHub Pages)
-----------------------------------------------------------
Coloque toda essa pasta no root do seu repositório e publique com GitHub Pages.

Arquivos gerados em /mnt/data:
  - index.html
  - app.js
  - escala-data.js
  - /data/escala-2025-11.json
  - /data/escala-2025-12.json
  - /data/escala-2026-01.json

Como funciona:
  - O app carrega o JSON referente ao mês selecionado via fetch("./data/escala-YYYY-MM.json").
  - Se o JSON não existir, o app usa fallback (segunda a sexta) e mostra aviso no console.
  - Para adicionar/editar meses, edite/adicione arquivos JSON na pasta /data seguindo o formato Option A.

Observações importantes:
  - No GitHub Pages os arquivos devem estar no branch/raiz que o Pages serve (ex: main).
  - Se testar localmente, rode um servidor HTTP (ex: `python -m http.server`) para que fetch funcione.
