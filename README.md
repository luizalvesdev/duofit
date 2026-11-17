# DuoFit

App de treino e dieta feito para treinar **em dupla**. Cada um registra os próprios treinos, refeições e medidas, e a dupla acompanha a evolução do outro: recordes, histórico e (se quiser compartilhar) a dieta do dia.

Roda como PWA (iPhone e navegador) e como app Android, com o mesmo código.

## O que tem

- **Treinos**: modelos de treino por dia da semana, sessão com cronômetro de descanso, funciona offline e sincroniza depois. Detecta recordes (carga, e1RM, repetições) na hora.
- **Progresso**: histórico de sessões, gráfico de evolução por exercício, recordes e medidas corporais.
- **Dieta**: diário alimentar com a tabela TACO, plano de refeições com check-off, refeições personalizadas e alimentos próprios. Metas de calorias e macros calculadas por Mifflin-St Jeor.
- **Dupla**: campanhas com código de convite, feed de recordes, visão do progresso do parceiro e compartilhamento opcional da dieta.
- **Conta**: login com JWT, senha com PBKDF2 e redefinição de senha por e-mail.

## Stack

| Parte | Tecnologias |
| ----- | ----------- |
| Web / PWA | React 19, Vite, Tailwind CSS 4, React Router, Dexie (IndexedDB offline), vite-plugin-pwa |
| Android | Capacitor |
| API | Hono em Cloudflare Workers, Zod |
| Banco | Postgres (Neon) com Drizzle ORM |
| Deploy | Cloudflare Workers (API e assets estáticos) |

Monorepo com npm workspaces: `apps/web` e `apps/api`.

## Rodando localmente

Requisitos: Node (desenvolvido no 24) e um banco Postgres (o Neon tem plano gratuito).

```bash
npm install

# API
cp apps/api/.dev.vars.example apps/api/.dev.vars   # preencha DATABASE_URL e JWT_SECRET
npm run db:migrate -w api
npm run db:seed -w api          # exercícios
npm run db:seed-foods -w api    # tabela TACO
npm run dev:api                 # http://localhost:8787

# Web
npm run dev:web                 # http://localhost:5173
```

Deploy e build do Android: [docs/deploy.md](docs/deploy.md).

## Próximos passos

Assistente com IA (Claude no Amazon Bedrock) para analisar a semana de treino e dieta, revisar o plano alimentar e sugerir rascunhos de treino a partir de um questionário. A IA sugere, o usuário decide. Ela não substitui um profissional. Plano em [docs/ai.md](docs/ai.md).
