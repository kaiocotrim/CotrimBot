# Backend do CotrimBot

Edite os arquivos TypeScript em `src/`. A pasta `dist/` é gerada pelo compilador:
alterações feitas nela podem ser sobrescritas na próxima compilação.

O explorador do VS Code oculta `node_modules/`, `backend/generated/` e
`backend/dist/` pelas configurações em `.vscode/settings.json`. As dependências
e o cliente Prisma continuam disponíveis para execução. `npm run dev` não exige
`dist/`; essa pasta é criada ao executar `npm run build` para usar `npm start`.

## Estrutura

| Caminho | Responsabilidade |
| --- | --- |
| `src/server.ts` | Configura Express, CORS, rotas e Socket.IO na porta 3333. |
| `src/routes/` | Associa métodos HTTP e URLs aos controllers. |
| `src/controllers/` | Valida requisições, coordena serviços e responde ao cliente. |
| `src/services/` | Integra Evolution API, bot e microserviço Python. |
| `src/middlewares/upload.ts` | Processa uploads com Multer e mantém os arquivos em memória. |
| `src/lib/` | Compartilha o cliente Prisma e o servidor Socket.IO. |
| `prisma/` | Contém o schema e as migrações do banco. |
| `generated/prisma/` | Cliente gerado pelo Prisma; não editar manualmente. |
| `dist/src/` | JavaScript compilado do backend. |
| `dist/generated/` | Cliente Prisma compilado para execução. |
| `node_modules/` | Dependências instaladas pelo npm. |

Os arquivos `.js.map` de `dist/` permitem relacionar o JavaScript aos arquivos
TypeScript durante a depuração. Eles são esperados e não são código duplicado
que precise ser editado. `dist/`, `generated/` e `node_modules/` são ignorados pelo Git.

## Comandos

Execute dentro da pasta `backend`:

```powershell
npm install
npm run prisma:generate
npm run dev
```

`npm run dev` executa `src/server.ts` com recarregamento automático via `tsx`.
O banco e as variáveis de ambiente do arquivo `.env` devem estar configurados.
O cliente Prisma exige `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_USER`,
`DATABASE_PASSWORD` e `DATABASE_NAME`.

Para compilar e executar o JavaScript gerado:

```powershell
npm run build
npm start
```

`npm run build` compila tanto `src/` quanto o cliente Prisma em `generated/`.
Por isso, o ponto de entrada compilado é `dist/src/server.js`.
Os imports locais nos arquivos TypeScript usam a extensão `.js`, conforme
a configuração ESM/NodeNext do projeto.

## Serviços e upload

O frontend usa `http://localhost:3000`, o backend usa a porta `3333` e
o microserviço Python de transcrição deve responder em `http://localhost:5000`.
Os serviços da Evolution usam `EVOLUTION_API_URL`, `EVOLUTION_API_KEY` e
`EVOLUTION_INSTANCE` do ambiente.

`POST /contacts/:id/send-media` recebe um arquivo no campo `file` de uma
requisição `multipart/form-data`, com `caption` opcional. Atualmente, o controller
valida o contato e devolve os metadados do arquivo. O envio desse arquivo ao
WhatsApp ainda precisa ser implementado.
