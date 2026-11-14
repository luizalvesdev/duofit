# DuoFit — design mobile first

Crie o design de interface do **DuoFit**, um app pessoal de treino e dieta usado por um casal que está começando a treinar juntos na academia. É um PWA instalado na tela inicial (Android e iPhone) e também usado no PC. Todo o texto da interface é em **português do Brasil**.

## Diretrizes gerais

- **Mobile first**: frame base de 390×844 (iPhone 14). Mostre também como as telas principais se adaptam no desktop (1440px), centralizadas numa coluna de até ~480px ou com um layout de duas colunas onde fizer sentido.
- **Uso real na academia**: com uma mão, suado, entre as séries, às vezes sem internet. Alvos de toque de no mínimo 44px, números grandes e legíveis, ações principais ao alcance do polegar (metade inferior da tela) e poucos toques pra registrar uma série.
- **Tema**: escuro por padrão (a academia tem luz baixa e economiza bateria), com uma versão clara. A identidade atual usa fundo zinc-950 com destaque **verde-limão (#a3e635)**. Pode refinar essa identidade, mas mantenha um destaque vibrante e energético.
- **Cores semânticas para tipos de série**: normal (neutro), aquecimento (âmbar), drop set (azul), até a falha (vermelho). PR (personal record) tem um destaque comemorativo próprio, com troféu 🏆.
- **Tipografia**: números tabulares para cargas, repetições e timers. Hierarquia forte, com o número em destaque e a unidade menor.
- **Tom**: motivador, sem infantilizar. Microcopy curta ("Bora!", "Novo PR!").
- Entregue um **mini design system**: cores (escuro e claro), tipografia, espaçamentos, raios, botões (primário, secundário, ghost, destrutivo), inputs numéricos, chips/filtros, cards, barra de navegação inferior, barras de progresso de macros, gráfico de linha, toasts, estados vazios e skeletons de carregamento.

## Navegação

Barra inferior fixa com 5 abas: **Início · Treinos · Dieta · Progresso · Dupla**. Respeite a safe area do iPhone. As telas de fluxo (executar treino, editar ficha, detalhes) abrem em tela cheia, sem a barra inferior, com "Voltar" no topo.

## Telas

### 1. Login e cadastro
- Logo "Duo**Fit**" (o "Fit" na cor de destaque).
- Login: e-mail e senha.
- Cadastro: nome, e-mail, senha (mínimo de 8 caracteres) e **código de convite** (só convidados podem criar conta).
- Erros inline: "E-mail ou senha incorretos", "Código de convite inválido", "Esse e-mail já tem conta".

### 2. Perfil e metas (onboarding e edição)
- Campos: sexo, data de nascimento, altura (cm), peso atual (kg) e nível de atividade (5 opções com descrição).
- Objetivo em 3 botões segmentados: Perder gordura · Manter · Ganhar massa. Peso alvo e data alvo (opcionais).
- **Card de meta calculada ao vivo**: kcal/dia em destaque, metabolismo basal e gasto diário em texto pequeno, e proteína, carbo e gordura (g) editáveis. Quando editados, aparece o link "Voltar para a sugestão".

### 3. Início
- Saudação ("Olá, Paulo").
- Card da meta: objetivo, kcal/dia, proteína/carbo/gordura.
- Card de peso: peso atual × meta.
- Dieta de hoje: kcal consumidas/meta e 3 barras de macros.
- Sugestão: um atalho "Treino de hoje" quando houver ficha marcada pro dia.

### 4. Treinos (lista de fichas)
- Cards de fichas (ex.: "A - Peito e tríceps"): dias da semana, selo "hoje", lista resumida de exercícios, botão **Começar** e link **Editar**.
- "+ Nova ficha" no topo.
- Banner "Em andamento — continuar" quando houver treino aberto.
- Aviso "2 treinos aguardando internet para sincronizar".
- Estado vazio: "Nenhuma ficha ainda".

### 5. Editor de ficha
- Nome e seletor de dias da semana (7 chips: Dom…Sáb).
- Lista de exercícios: miniatura, nome, botões de reordenar (↑ ↓) e remover. Cada um tem 4 campos numéricos compactos: séries, reps mín, reps máx e descanso (s).
- "+ Adicionar exercício", que abre o seletor.
- Salvar e excluir ficha.

### 6. Seletor de exercício (modal de tela cheia)
- Busca, chips de grupo muscular com rolagem horizontal (Peito, Costas, Ombros, Bíceps, Tríceps, Quadríceps, Posterior, Glúteos, Panturrilha, Abdômen…) e lista com foto, nome, músculo e equipamento.
- No fim da lista: "+ Criar exercício" (formulário com nome, músculo principal e equipamento).

### 7. Execução do treino ⭐ (a tela mais importante, capriche)
- **Cabeçalho fixo**: botão pausar/retomar, nome da ficha, cronômetro (ou "Não iniciado" / "pausado") e contagem de séries, além do botão **Finalizar**.
- Antes de iniciar: card "Revise os exercícios e inicie quando for treinar" com o botão grande **▶ Iniciar treino**.
- **Card por exercício**: foto, nome, faixa de reps e descanso. Tabela de séries com as colunas **Série | Anterior | kg | Reps | ✓**.
  - A coluna "Série" mostra o número, ou A/D/F colorido pros tipos especiais. Tocar abre a escolha do tipo e "Remover série".
  - "Anterior" mostra a última vez (ex.: "40 × 10").
  - kg e reps são inputs numéricos grandes. Vazios, mostram em cinza o valor sugerido.
  - ✓ concluído destaca a linha inteira.
  - **Arrastar a linha pra esquerda** revela o botão vermelho "Excluir".
  - "+ Série" no rodapé do card.
- **Celebração de PR**: banner animado "🏆 Novo PR! Maior carga" no card, com o selo do PR na linha da série.
- **Timer de descanso**: barra fixa inferior com contagem regressiva grande, −15 / +15 e pular. Quando o tempo acaba, a barra muda pra cor de destaque com "Bora!".
- Erro inline numa linha: "Preencha a carga (kg)".
- **Tela de conclusão**: "Treino concluído! 💪", total de séries e quantidade de PRs.

### 8. Dieta (diário)
- Navegação de data: ‹ Hoje ›.
- Card de macros: kcal consumidas / meta, com "faltam 420" ou "120 acima" em vermelho, e 3 barras (proteína, carbo, gordura). Cada barra fica vermelha quando passa da meta.
- Seções por refeição (Café da manhã, Almoço, Lanche, Jantar, Ceia), com kcal da refeição.
  - Itens registrados: nome, gramas, kcal. Tocar abre a edição de gramas e "Excluir".
  - Itens **"Do plano"** com estilo pontilhado/esmaecido e botão **Comi**, mais "Comi tudo".
  - "+ Adicionar".
- Link "Meu plano".

### 9. Busca de alimento (modal)
- Busca na tabela TACO, com "Recentes" quando vazia.
- Resultado mostra nome e kcal/P/C/G por 100 g.
- Etapa de quantidade: input em gramas, chips rápidos (1 porção, 50 g, 100 g, 150 g, 200 g), prévia de macros e botão "Adicionar em Almoço".
- "+ Cadastrar alimento da embalagem": porção do rótulo e kcal, proteína, carbo e gordura.

### 10. Meu plano de dieta
- Mesmas seções por refeição, com itens editáveis (gramas e remover).
- Card de macros do plano comparado à meta.
- Salvar plano.

### 11. Progresso (3 abas segmentadas)
- **Histórico**: cards de treino com data, duração, exercícios, séries, volume em kg e "2 PR 🏆". Detalhe do treino: exercícios com séries, tipos coloridos e selos de PR.
- **Recordes**: card "PRs recentes" e lista por exercício (maior carga, 1RM estimado). Detalhe do exercício: gráfico de linha com 1RM estimado e maior carga ao longo do tempo (com tooltip ao tocar) e tabela por data.
- **Corpo**: input rápido "Peso de hoje" + Salvar e "+ Medidas" (cintura, quadril, braço, coxa). Três mini-cards: média de 7 dias, variação na semana e quanto falta. Gráfico com a média móvel (linha forte), as pesagens (pontos) e a linha tracejada da meta. Histórico com opção de apagar.

### 12. Dupla (campanha do casal)
- **Sem campanha**: explicação curta, "Criar campanha" (nome, início, fim opcional) e "Entrar com código" (6 letras).
- **Com campanha**:
  - Nome e datas, código de convite com botão de copiar e toggle "Compartilhar minha dieta".
  - Dois cards de membro ("Você" e o par), ou o placeholder "Passe o código para o seu par entrar".
  - Feed de atividade: PRs recentes com o nome de quem fez e treinos com o nome em destaque.
  - "Sair da campanha".
- **Perfil do par**: objetivo, peso e meta em 3 mini-cards, gráfico de peso, treinos recentes, link Recordes e "Dieta de hoje" (ou "A dieta da Manu é privada").

## Estados a mostrar
- Carregando (skeleton), vazio, erro e **offline**. O offline deve ser sutil, com uma faixa "Sem internet, os treinos continuam funcionando" e os itens pendentes de sincronizar.
- Confirmações destrutivas (descartar treino, excluir ficha, sair da campanha) como bottom sheet, não como alerta do sistema.

## Entregáveis
1. Design system (escuro e claro).
2. Todas as telas acima em 390px, com os estados principais.
3. Fluxo completo da execução do treino: iniciar → preencher série → ✓ → timer → PR → finalizar → conclusão.
4. Duas ou três telas-chave adaptadas pra desktop.
5. Ícone do app (192 e 512 px, versão maskable) e splash screen.
