# IA assistente no DuoFit (Claude Haiku via Amazon Bedrock)

> **Estado em 2026-11-20:** em uso o Claude Haiku 4.5 via `bedrock-runtime` (cliente `AnthropicBedrock`, modelo `global.anthropic.claude-haiku-4-5-20251001-v1:0`, região `sa-east-1`). O Haiku 5.5 é restrito nesta conta AWS ("not available for this account") e o endpoint Mantle recusa modelos Claude para ela. Usuário IAM `duofit-bedrock` com policy só para `bedrock:InvokeModel` e `bedrock:InvokeModelWithResponseStream` em modelos/profiles `anthropic.claude-haiku-*`. `@anthropic-ai/bedrock-sdk` fixado em 0.x (a 1.x manda uma versão de API que o Bedrock só aceita para Claude 4.7+). O Haiku 4.5 não aceita `effort`, então o client omite esse campo para ele. O texto abaixo é o plano original.

## Context

O DuoFit já registra treinos, séries, recordes, diário alimentar, plano de dieta, metas e peso. A ideia é adicionar uma IA que **auxilia** (não substitui personal/nutricionista):

1. **Analisar semana**: insights sob medida sobre o que melhorar, onde e o que fazer na próxima semana (treino + dieta + peso). Não é um relatório formal, é uma análise acionável.
2. **Revisar dieta**: avaliar o plano de dieta atual contra as metas e sugerir trocas aplicáveis com um toque.
3. **Questionário, depois rascunho de treino e de dieta**: a IA monta uma proposta que o usuário revisa antes de aplicar.

Princípio: **IA propõe, usuário aprova**. Nada é gravado nas tabelas reais sem um "aplicar" explícito. Números críticos (kcal, macros, pisos de segurança) são calculados em código, não pelo modelo. O modelo só referencia IDs do catálogo (exercícios e alimentos), e cada ID é validado.

Decisões já tomadas: Claude Haiku no Amazon Bedrock, autenticação por IAM access key (policy restrita a `bedrock:InvokeModel*`), análise sob demanda (botão).

---

## Fase 0: Infra de IA (base de todas as fases)

### Dependência e credenciais
- `apps/api`: `npm i @anthropic-ai/bedrock-sdk` (o SDK base `@anthropic-ai/sdk` vem junto).
- `src/env.ts`, novos campos em `Bindings`: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `BEDROCK_MODEL_ID?` (opcional; padrão `anthropic.claude-haiku-5-5`).
- `.dev.vars.example`: adicionar as 4 variáveis. Em produção, usar `wrangler secret put`.
- Na AWS: criar um usuário IAM com policy só para `bedrock:InvokeModel` e `bedrock:InvokeModelWithResponseStream` no modelo Haiku, e habilitar o acesso ao modelo na região escolhida.

### `src/lib/ai/client.ts`
- `createAi(env)`: retorna um cliente `AnthropicBedrockMantle` (cliente Mantle recomendado; o `AnthropicBedrock` legado é o fallback) com região e credenciais explícitas vindas de `env`.
- **Verificar na implementação**: os nomes exatos das opções de credencial do construtor Mantle; se o SDK roda no Worker com `nodejs_compat` (o cadeia de credenciais AWS pode puxar módulos de Node); e o ID real do modelo/inference profile na região (ex.: `anthropic.claude-haiku-5-5` vs `us.anthropic...`). Se o SDK não rodar no Worker, plano B: `aws4fetch` (SigV4) + `fetch` direto no endpoint do Bedrock.
- `generateStructured<T>({ system, input, schema: ZodType<T>, maxTokens, effort })`:
  - Envia `system` (com `cache_control` ephemeral, que é estável) e `input` como JSON compacto na mensagem do usuário.
  - Saída estruturada via `output_config.format` (JSON schema gerado por `z.toJSONSchema(schema)` do zod v4). Se o Bedrock não suportar, o fallback é instrução "responda só JSON" + parse.
  - Checa `stop_reason`: `refusal` vira o erro `ai_refused`; `max_tokens` vira `ai_truncated`.
  - `schema.parse(JSON.parse(text))`. Se falhar, retry 1x e depois o erro `ai_invalid_output`.
  - Retorna `{ data, usage: { inputTokens, outputTokens }, model }`.
  - `effort: 'low'` na análise e `'medium'` nos rascunhos. Não mandar `temperature` nem `budget_tokens`.
- Erros tipados do SDK (`RateLimitError`, `APIError`) mapeados para HTTP 429/502 nas rotas.

### Banco: migração `0008_ai.sql` (via drizzle-kit, igual às anteriores)
- `aiProfiles` (1 por usuário): `userId` PK, `answers jsonb` (questionário), `consentAt timestamp` (LGPD), `updatedAt`.
- `aiInsights`: `id`, `userId`, `kind` enum (`week_review | diet_review | workout_draft | diet_draft`), `periodStart date?`, `inputHash text`, `output jsonb`, `status` enum (`ready | applied | dismissed`), `model`, `inputTokens`, `outputTokens`, `createdAt`. Índices em `(userId, kind, createdAt)` e unique em `(userId, kind, inputHash)`, que serve de cache.

### `src/lib/ai/guard.ts` (segurança e custo)
- `assertConsent(db, userId)`: sem `consentAt` retorna 403 `ai_consent_required`.
- `safetyBlock(profile, answers)`: retorna o motivo ou `null`. Bloqueia menor de 18 (usar `birthDate`; portar `ageFrom` de `web/src/lib/nutrition.ts`), gravidez/amamentação, histórico de transtorno alimentar, condição médica marcada como relevante. A resposta 422 `ai_safety_block` traz a mensagem "procure um profissional".
- `clampTargets()`: piso calórico (1200 kcal F / 1500 kcal M), déficit máximo de 25% do TDEE, proteína entre 1,6 e 2,2 g/kg.
- `rateLimit(db, userId)`: conta os `aiInsights` das últimas 24h (ex.: 10/dia). Um cache hit não conta.
- `hashInput(obj)`: SHA-256 (`crypto.subtle`) do JSON de entrada, para cache.

### `src/lib/targets.ts`
- Portar `suggestTargets` e `ageFrom` de `web/src/lib/nutrition.ts` para a API (cópia; o web continua com a dele). Usado pelos rascunhos e pelo guard.

### Prompts `src/lib/ai/prompts.ts`
- Um system prompt base, em português, com: papel de "assistente de treino e dieta, educacional, não prescreve"; tom direto e encorajador; nunca diagnosticar; quando algo foge do escopo, recomendar profissional; usar só os dados recebidos e não inventar números.
- Um bloco por tarefa (análise, revisão, rascunho de treino, rascunho de dieta) com o formato esperado. Strings estáveis, para o prompt caching funcionar.
- Nunca enviar nome, e-mail ou ID do usuário ao modelo. Só métricas.

### Rotas `src/routes/ai.ts` (montar em `src/index.ts` como `.route('/ai', aiRoutes)`)
- `GET /ai/profile` e `PUT /ai/profile`: questionário + consentimento.
- `GET /ai/insights?kind=`: histórico.
- `PATCH /ai/insights/:id`: `{ status: 'dismissed' }`.
- As rotas de cada fase estão abaixo.

---

## Fase 1: Analisar semana

### Contexto `src/lib/ai/context.ts`: `weekContext(db, userId, weekStart)`
Monta um JSON compacto da semana (seg a dom) e da semana anterior, para comparação. Reusar `src/lib/stats.ts`:
- **Treino**: sessões feitas vs. planejadas (`workoutTemplates.weekdays`), duração, séries úteis e volume por sessão (usar a lógica de `listSessions`, adicionando um filtro `from/to`); **séries por grupo muscular** (query nova: join `sessionSets` com `exercises.primaryMuscle`, sem aquecimento); exercícios estagnados (o e1RM de `exerciseBests`/`exerciseProgress` sem melhora em 3 ou mais sessões); PRs da semana (`recentRecords` filtrado por data).
- **Dieta**: totais diários de `foodLogs` (kcal/P/C/G), dias registrados, média vs. `currentGoal`, aderência ao plano (logs com `planItemId` / itens do plano).
- **Corpo**: pesos de `listBodyLogs` das últimas 4 semanas, tendência kg/semana vs. objetivo.
- **Perfil**: objetivo, nível, dias disponíveis (do questionário, se existir).

### Saída (zod)
```ts
{ summary: string,
  highlights: string[],          // o que foi bem
  improvements: { area: 'treino'|'dieta'|'recuperacao'|'consistencia', issue: string, why: string, action: string }[],
  nextWeek: string[],            // ações concretas p/ próxima semana
  score?: { consistency: 0-10, training: 0-10, diet: 0-10 } }
```

### Rota
- `POST /ai/week-review { weekStart?: isoDate }`: guard (consent, rateLimit), contexto, hash e cache, `generateStructured`, salva em `aiInsights` e retorna.
- Semana sem dados mínimos (0 treinos e menos de 2 dias de diário): retornar `insufficient_data` sem chamar a IA.

### Web
- `web/src/pages/ai/WeekReviewPage.tsx` na rota `/ia/semana`: seletor de semana, botão "Analisar semana", cards (resumo, o que foi bem, o que melhorar com área/porquê/ação, próxima semana). Disclaimer fixo no rodapé.
- Card de entrada na `HomePage.tsx` ("Analisar minha semana").
- Usar `api()`/`useApi` de `web/src/lib` e os componentes de `components/ui.tsx`.

---

## Fase 2: Revisar dieta

### Contexto: `dietPlanContext(db, userId)`
Itens do plano por refeição (alimento, gramas, macros calculados), totais vs. meta, fibra, variedade, e restrições/preferências do questionário.

### Saída
```ts
{ summary: string,
  issues: { issue: string, why: string }[],
  swaps: { planItemId: uuid, reason: string, newFoodId: uuid, grams: number }[],   // max ~6
  tips: string[] }
```
- `newFoodId` vem de uma **lista de candidatos enviada no input**: para cada item, até 5 alternativas da mesma `category` com perfil de macro próximo, montadas em código a partir de `foods`. Validar que cada ID retornado está nessa lista.
- Recalcular em código os macros resultantes de cada troca e mostrar o antes e depois.

### Rotas
- `POST /ai/diet-review`.
- `POST /ai/insights/:id/apply { swapIndexes: number[] }`: atualiza `mealPlanItems` (foodId, grams) num `db.batch`, valida a posse do item e marca `applied`.

### Web
- Botão "Revisar com IA" em `pages/diet/PlanPage.tsx`, que abre `pages/ai/DietReviewPage.tsx`: lista de trocas com checkbox, delta de macros e "Aplicar selecionadas".

---

## Fase 3: Questionário + rascunho de treino

### Questionário
`pages/ai/QuestionnairePage.tsx` (`/ia/questionario`), em etapas, com o consentimento LGPD como primeiro passo. Campos (`answers` jsonb, validados por zod na API):
- experiência (iniciante/intermediário/avançado), dias por semana (2 a 6), minutos por treino, local/equipamentos (mapear para `equipmentEnum`), lesões/limitações (texto + checkboxes por região), foco muscular, cardio.
- dieta: refeições por dia, restrições (vegetariano, sem lactose, sem glúten...), alergias, alimentos que não come, orçamento.
- triagem de segurança: gravidez/amamentação, transtorno alimentar, condição médica, uso de medicação relevante.
- `sex`/`birthDate`/`height`/`activity`/`objective` já existem em `profiles`/`goals`; não perguntar de novo.

### Rascunho de treino
- Input: respostas, nível, e o **catálogo filtrado** de `exercises` visíveis ao usuário (sistema + próprios), filtrado por equipamento disponível e sem regiões lesionadas: `{id, name, primaryMuscle, equipment}`. Também os bests atuais (`exerciseBests`), para sugerir carga inicial nas notas.
- Saída: `{ rationale, split, templates: [{ name, weekdays: number[], exercises: [{ exerciseId, sets, repMin, repMax, restSeconds, notes? }] }] }`.
- Validação: `allExercisesVisible` (`src/lib/access.ts`), `repMin <= repMax`, limites de séries/descanso iguais ao `templateSchema` de `routes/templates.ts`, e dias da semana sem colisão.
- `POST /ai/drafts/workout`, depois o rascunho é salvo.
- `POST /ai/insights/:id/apply`: cria `workoutTemplates` + `templateExercises`. **Extrair** a lógica de insert de `routes/templates.ts` (por volta das linhas 56 e 73) para `src/lib/templates.ts` e reusar nos dois lugares.
- Web: `pages/ai/WorkoutDraftPage.tsx`: preview de cada treino, edição leve (remover/trocar exercício com `ExercisePicker`) e "Criar treinos".

---

## Fase 4: Rascunho de dieta (mais arriscada, por último)

- **Metas em código**: `suggestTargets` + `clampTargets` + o peso mais recente. A IA não decide kcal nem macros.
- Input: metas, número de refeições, restrições, e uma lista de **~150 alimentos candidatos** montada em código (os mais usados pelo usuário em `foodLogs` + uma lista curada de TACO comuns por categoria, filtrada por restrições), `{id, name, category, per100g}`.
- Saída: `{ rationale, meals: [{ name, items: [{ foodId, grams }] }] }`.
- **Pós-processamento em código**: validar os IDs contra os candidatos, recalcular os macros e escalar as porções proporcionalmente até ficar a ±5% da kcal-alvo (e checar a proteína). Se não convergir, retornar com aviso.
- Apply: mapear as refeições para `meals` existentes (criar se faltar, respeitando `MAX_MEALS`) e substituir `mealPlanItems`. Reusar a lógica de `PUT /diet/plan` (`routes/diet.ts`, por volta da linha 233), extraída para um helper.
- Web: `pages/ai/DietDraftPage.tsx`: preview por refeição com totais vs. meta (reusar `MacroBars`) e "Usar como meu plano" (com aviso de que substitui o plano atual).

---

## Fora do escopo (agora)
- Cron automático, análise do parceiro na Dupla (dá para fazer depois respeitando o opt-in existente), chat livre com a IA e streaming.

## Ordem de execução
Fase 0 → 1 (validar custo, qualidade do prompt e UX com usuários reais) → 2 → 3 → 4. Um commit por fase.

## Verificação
- **Infra**: script/rota dev `POST /ai/_ping` (só em dev) chamando o Haiku, para confirmar credenciais, região, ID do modelo e que o SDK roda no `wrangler dev`.
- `npm run typecheck`/build em `apps/api` e `apps/web`.
- `drizzle-kit migrate` local; conferir as tabelas novas.
- **Fase 1**: com seed (ou conta real) contendo 1 semana de treinos e diário, gerar a análise; conferir que a 2ª chamada sem mudança é cache hit (sem tokens novos), que a semana vazia retorna `insufficient_data` e que o 11º pedido do dia retorna 429.
- **Guardrails**: perfil com menos de 18 anos ou triagem positiva retorna 422 e não chama o modelo; sem consentimento retorna 403.
- **Fases 2-4**: garantir que IDs inválidos/inventados são rejeitados (forçar com uma resposta mockada); que o apply cria templates/plano corretos e aparecem em `/treinos` e `/dieta/plano`; e que o rascunho de dieta fica a ±5% da kcal-alvo.
- Logar `usage` por chamada e estimar o custo por análise.
