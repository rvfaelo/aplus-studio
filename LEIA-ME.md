# A+ Studio 1.5.15 — interface unificada

Esta atualização aplica um único layout ao painel, popup, configurações de API e histórico de versões. As cinco etapas do A+, a análise de avaliações, a otimização do anúncio, o planejamento e a auditoria do catálogo continuam disponíveis.

## Atualizar preservando os dados

1. Extraia o ZIP em uma pasta temporária.
2. Copie o conteúdo de `aplus-studio-v1.5.15` para **a mesma pasta que o Chrome já usa para esta extensão**, substituindo os arquivos. Guarde uma cópia dos arquivos anteriores se quiser poder voltar ao visual anterior.
3. Em `chrome://extensions`, use **Recarregar** no A+ Studio já instalado. **Não remova a extensão e não limpe seu armazenamento**, pois os projetos e as chaves são locais.
4. Feche as abas antigas do Studio e abra o painel pelo ícone da extensão. O cabeçalho deve mostrar `1.5.15 conectado`.
5. Recarregue a aba do Seller Central antes de executar diagnóstico ou preenchimento para atualizar o conector.

## O que mudou

- Navegação lateral para A+ Content e Avaliações e anúncio, com produtos pesquisáveis.
- Uma mesma identidade visual nas cinco etapas, análise de avaliações, otimização, popup, auditoria, configurações e novidades.
- Destaque para “Criar planejamento + textos A+”, preservando “Gerar somente textos A+”.
- Focos comercial e anti-devolução apresentados em cartões de escolha.
- Campos mais legíveis, alvos principais de 44 px, indicadores de foco, estados de seleção, abas com navegação por setas e nomes acessíveis para controles gerados.
- Layout adaptável a telas menores e respeito à preferência por movimento reduzido.
- Briefings em cartões e sequência dos seis módulos visível na etapa Amazon.

## Funções preservadas

Os scripts existentes de geração, projetos, aprovação, preenchimento, diagnóstico, conectores da Amazon e APIs mantêm o código da versão 1.5.14, com somente a atualização do número da versão. A apresentação fica em `studio-ui.css`, nos HTMLs e no novo `studio-ui.js`; este último não acessa armazenamento, serviços de IA ou campos da Amazon. Nenhuma permissão ou dependência de produção foi adicionada.

Catálogo e mapeamento continuam sendo acessados pelo ícone da extensão **com a aba da Amazon ativa**. O popup usa a aba ativa como destino; abrir uma cópia dele numa aba comum não é o fluxo recomendado para capturar ou preencher.

## Validação desta entrega

- 106 testes automatizados existentes passaram.
- Conferência dos IDs, valores das opções, rotas, permissões e CSP preservados.
- Testes de interface no Chromium: inicialização, mudança de foco comercial/anti-devolução, edição e salvamento, cópia, navegação por teclado, separação do anúncio, diálogo da chave, diagnóstico e relatório copiável, popup, auditoria e ausência de transbordamento horizontal nas sete telas de trabalho a 390 px.
- As capturas da prévia usam dados fictícios. Os testes de interface usam o código real da interface e simulam o transporte da API do Chrome. A instalação da extensão completa, APIs pagas e o Seller Central real **não foram exercitados nesta etapa**.

## Reproduzir os testes

`npm test` executa os 106 testes existentes. Para testar a interface, instale as dependências de desenvolvimento e o Chromium do Playwright, depois use `npm run test:ui`. Se necessário, `APLUS_BROWSER_EXECUTABLE` aceita um executável Chromium existente e `APLUS_UI_OUTPUT` define a pasta de capturas. Os exemplos ficam apenas nos testes e não são importados para seus projetos.

---

# A+ Studio

Versão 1.5.16. Extensão Chrome Manifest V3 para organizar, planejar, gerar, revisar, aprovar, montar, preencher e auditar conteúdo Amazon A+, além de analisar avaliações e otimizar anúncios em uma área independente. Usa roteamento entre OpenAI, xKiro, KiraAI, Gemini e Groq.

### Foco do planejamento 1.5.14

- **Comercial persuasivo · padrão** continua sendo o fluxo normal para benefício, desejo e ocasião de uso.
- **Clareza anti-devolução** muda os textos e os oito briefings de imagem para explicar exatamente o produto, o que acompanha, escala, material, comportamento, uso correto, medição, compatibilidade e limitações comprovadas.
- A escolha é salva por produto e não afeta os demais projetos.
- Reclamações e motivos de devolução podem ser informados manualmente ou importados da análise de avaliações já executada.
- Cada imagem anti-devolução registra qual dúvida responde, qual risco reduz, o que precisa mostrar e o que não pode sugerir.
- Os relatos orientam as dúvidas, mas não são usados para inventar especificações; a ficha factual continua sendo a fonte de verdade.

### Montagem automática 1.5.13

- O botão “Preparar módulos / preencher textos” monta a sequência padrão quando a página está vazia ou contém um prefixo correto.
- A ordem é: Imagem completa, Quatro imagens, Duas imagens, FAQ, Imagem completa e Especificações.
- O FAQ é completado até 5 perguntas e as especificações até 6 linhas.
- Se a estrutura existente estiver fora da ordem, a extensão para sem excluir, mover ou duplicar módulos.
- Depois da montagem, revise a página e clique novamente para preencher os textos.

### Registro da montagem manual (suporte)

- Novo botão **Registrar montagem manual** na etapa Preencher.
- O usuário adiciona uma vez, na ordem, Imagem completa, Quatro imagens, Duas imagens, FAQ, Imagem completa e Especificações.
- O gravador registra somente os controles clicados, os controles visíveis após cada ação, a evolução das contagens e o estado de carregamento.
- O relatório pode ser finalizado, retomado após reabrir o Studio e copiado para desenvolver a adição automática com base no editor real da conta.
- Senhas, cookies, API Keys e valores de campos de texto não são registrados; e-mails, ASINs e números longos são removidos dos rótulos.

### Relatório técnico e teste seguro da ponte 1.5.11

- **Diagnosticar conexão** agora valida a mesma ponte usada para preencher, sem alterar nenhum campo da Amazon.
- Cada tentativa recebe um ID próprio, horários, duração, versão do conector, estado do documento e resumo por código de erro.
- As falhas distinguem autorização ausente, divergente ou expirada, aba incorreta, iframe, documento ausente, timeout, erro de execução, recusa de KAT/Draft.js e texto revertido pela Amazon.
- O resultado destaca a causa dominante e mostra o código em cada campo, além do método de escrita que foi tentado.
- **Copiar diagnóstico técnico** e **Copiar relatório técnico** geram dados prontos para suporte, sem API Keys, token de autorização nem textos completos do produto.

### Autorização de escrita resiliente 1.5.10

- Corrige a falha em massa `Escrita fora da operação ou do documento ativo`.
- A autorização temporária de preenchimento passa a sobreviver à reinicialização do service worker do Chrome, sem deixar de ser vinculada à aba e ao documento corretos.
- A autorização usa um token aleatório com validade curta e é removida ao concluir ou cancelar a tentativa.
- O título fixo do módulo de especificações é preenchido mesmo em projetos antigos que o salvaram vazio.
- Cada caixa do editor de textos possui um ícone para copiar rapidamente seu conteúdo.

### Recuperação de preenchimento 1.5.9

- O diagnóstico continua lendo campos e módulos enquanto uma tentativa real está em andamento; ele não mostra mais `0/38` apenas por causa do bloqueio interno.
- O relatório informa o campo atual, o progresso e há quanto tempo a tentativa está executando.
- Uma operação sem progresso por 30 segundos é considerada abandonada e liberada automaticamente.
- Cada escrita de campo tem limite de 12 segundos e o preenchimento completo é cancelado depois de 3 minutos, evitando travas permanentes.
- O botão de preenchimento mostra `Preenchendo…` e impede um segundo clique ou diagnóstico concorrente no mesmo painel.
- `Bullets atuais` foi renomeado para `Tópicos em destaque atuais (bullets)` e explicado na própria tela.

### Avaliações e anúncio 1.5.8

- O seletor superior separa `A+ Content` de `Avaliações e anúncio`.
- `Amazon Review Analyzer` recebe avaliações e motivos internos de devolução, agrupando reclamações, expectativa incorreta, tamanho/compatibilidade e alertas de segurança.
- É possível abrir a página de avaliações e capturar somente os comentários visíveis, inclusive em páginas seguintes, sem fazer coleta automática em segundo plano.
- Avaliações de concorrentes podem ser adicionadas separadamente para comparação opcional.
- `Amazon Listing Optimization` gera título, cinco bullets, descrição e termos de busca prontos para revisão.
- Palavras-chave prioritárias podem ser informadas; quando ausentes, o sistema não inventa volume de busca.
- O otimizador pode usar automaticamente o diagnóstico das avaliações.
- Alterações nessa área não removem a aprovação do conteúdo A+ e nunca são enviadas automaticamente à Amazon.

### Prompts de imagem e OpenAI 1.5.7

- Quando houver mais de uma variação confirmada, o Banner principal e o Banner final mostram todas as variações juntas. A regra é incluída nos briefings individuais e no prompt completo.
- Pessoas entram somente quando ajudam a demonstrar o benefício. Em produtos de uso amplo, os prompts distribuem homens e mulheres entre contextos diferentes; a alternância não é forçada quando não combina com a categoria ou a estratégia.
- OpenAI API oficial disponível com GPT-5.6 Luna, Terra e Sol. No modo automático com prioridade de qualidade, Sol é tentado antes de Terra e Luna quando uma chave OpenAI estiver configurada.
- Toda chave nova precisa passar pelo botão **Testar chave** antes de ser salva. O teste consulta os modelos liberados sem gerar conteúdo.
- A chave da OpenAI deve ser criada na plataforma de API e ter faturamento próprio. ChatGPT Plus não inclui créditos de API.

### Correção de preenchimento 1.5.6

- O preenchimento redescobre um campo quando a Amazon recria o módulo depois de uma alteração, em vez de continuar usando uma referência antiga.
- A confirmação final procura o elemento atual de cada campo. Um campo recriado não é mais marcado como falha somente porque o elemento original foi removido.
- Componentes KAT recebem três estratégias controladas: propriedade do host, input interno no Shadow DOM e handler de mudança do React.
- Draft.js informa qual estratégia confirmou a escrita e retorna um motivo específico quando todas falham.
- O Studio guarda o relatório da última tentativa, com falhas por campo, método, campos recriados e novas tentativas. O relatório pode ser copiado.
- O botão de preenchimento destaca tentativa sem nenhum campo confirmado ou preenchimento parcial.

### Estratégia de venda 1.5.5

- A geração usa automaticamente uma biblioteca de ângulos de venda. Banner principal, quatro imagens, duas imagens, FAQ, fechamento e especificações recebem funções diferentes para reduzir repetição e aumentar persuasão.
- Antes de escrever, o prompt identifica comprador provável, momento de uso, dor, desejo emocional e objeção. Esses elementos orientam a linguagem, mas nunca são tratados como fatos do produto.
- A opção padrão é **Automática recomendada**. Também há ajustes opcionais: mais emocional, prática, técnica, premium, segura/conservadora ou personalizada.
- O modelo do produto é detectado entre infantil, pet, eletrônicos, moda, saúde, ferramentas, esporte, automotivo, viagem, beleza, casa e produto geral. A escolha manual continua disponível para casos fora do padrão.
- O checklist da categoria mostra somente informações encontradas e ausentes. Um botão envia os campos ausentes para a Ficha factual, sem preencher ou inventar os valores.
- Produtos infantis e de saúde têm prioridade quando também pertencem a um contexto secundário, como viagem, para manter os cuidados mais importantes.
- A mesma estratégia orienta textos e briefings de imagem. O prompt completo das imagens inclui direção de venda, cliente e desejo, mantendo as imagens sem texto.

### Correções 1.5.4

- O diagnóstico considera projetos aprovados mesmo quando o status já está como **Preenchido**, evitando o falso aviso “necessário aprovar”.
- **Preencher aba da Amazon aberta** permite reaplicar um projeto aprovado depois de uma rodada anterior.
- A detecção de estrutura conta módulos reais da página, espera a Amazon estabilizar e não depende de IDs únicos repetidos.
- As mensagens do diagnóstico deixam de sugerir “expandir” quando a Amazon não oferece expandir/contrair.
- A lista Groq inclui GPT-OSS 20B/120B, Qwen3.6/Qwen3.8 27B, Llama 3.1 8B Instant e Llama 3.3 70B Versatile; o campo **Outro modelo** continua disponível para IDs da sua conta.

### Correção da revisão 1.5.3

- O cálculo de repetição agora compara apenas campos equivalentes: headline com headline e corpo com corpo.
- Especificações técnicas, FAQ e a repetição natural do nome do produto não geram mais alertas de variedade.
- Um texto curto contido em outro texto maior não recebe mais automaticamente 100% de semelhança.
- O botão **Corrigir repetições com IA** reescreve somente os campos realmente repetidos e preserva todos os demais textos.
- Relatórios antigos são recalculados antes de consumir a API; se eram falsos positivos, apenas desaparecem sem gastar tokens.

### Melhorias 1.5.2

- **Mapear campos** começa pronto para receber o primeiro clique e avança automaticamente ao próximo texto depois de cada associação; o botão agora serve apenas para pausar ou continuar.
- Dimensões seguem o padrão `32 cm (largura) x 32 cm (altura) x 10 cm (profundidade)`, com unidade e significado visíveis em cada número.
- A auditoria captura o SKU exibido no catálogo e o exporta imediatamente ao lado do ASIN no CSV.
- A revisão automática mostra o campo, o trecho e a ação recomendada para cada número sem apoio, além dos pares de campos repetidos, percentual de semelhança e termos em comum.
- Números em medidas compactas, como `10x20x30`, passam a ser reconhecidos corretamente na descrição e não geram falso alerta.

### Diagnóstico 1.5.1

- O botão **Diagnosticar conexão** testa o projeto, a aprovação, os textos, as abas do Seller Central, a URL de edição, o carregamento, a versão do conector, login/captcha, erros de reprodução, módulos e campos reconhecidos.
- O relatório explica o bloqueio principal e pode ser copiado sem incluir API Keys, textos do produto, cookies ou parâmetros privados da URL.
- **Preencher aba da Amazon aberta** agora ignora páginas de Catálogo, início e outras seções do Seller Central; somente uma aba real do editor A+ Premium pode ser escolhida.
- A conexão entre a extensão e a aba é identificada pela versão. Uma aba com conector antigo recebe uma tentativa de recuperação automática sem recarregar.

### Interface 1.5.0

- Painel reformulado com hierarquia visual mais clara e melhor aproveitamento da tela.
- Cor principal `#B2E146`, com contraste adequado para leitura e ações.
- Ficha factual organizada como tabela e navegação em cinco etapas mais evidente.
- Popup atualizado para acompanhar a nova identidade visual.

### Correção 1.4.3

- O conector do Seller Central agora é carregado automaticamente nas páginas autorizadas, evitando a falha `An unknown error occurred when fetching the script`.
- O Studio encontra a aba da Amazon, leva essa aba para frente e aguarda o carregamento antes de preencher.
- Abas que já estavam abertas antes da atualização recebem uma tentativa de recuperação. Se o Chrome impedir o acesso, a mensagem pede uma única recarga da edição A+.

### Ajustes 1.4.2

- FAQ e especificações agora podem repetir dados técnicos importantes, como medidas, material, quantidade, cor, modelo, capacidade e indicação de uso.
- A mensagem de menos de 4 especificações deixou de bloquear a aprovação e o preenchimento; agora é apenas um aviso para revisar a ficha.
- O botão do Studio procura uma aba aberta do Seller Central na mesma janela, em vez de exigir que a aba ativa seja a Amazon.
- As especificações restantes continuam sendo reorganizadas em sequência depois que marcadores vazios ou medidas repetidas são removidos.
- Servidores independentes: OpenAI, xKiro, Google Gemini, KiraAI.vn e Groq.
- KiraAI configurado com os identificadores atuais `qwen3.8-flash` e `glm-5.3-free`.
- Todas as cinco chaves podem permanecer salvas simultaneamente, inclusive em cópias criptografadas no Chrome Sync.
- O modo automático prioriza modelos de maior qualidade; se uma rota falhar ou atingir o limite, passa para a próxima chave configurada. No xKiro, a seleção automática fica restrita aos modelos gratuitos do catálogo ao vivo.

### Ajustes 1.3.0

- Modo automático com prioridade de qualidade: seleciona modelos mais fortes primeiro. No xKiro, consulta o catálogo ao vivo e escolhe somente entre modelos gratuitos.
- Uma API Key independente por provedor, todas podendo permanecer salvas ao mesmo tempo.
- Correções de validação solicitam somente os campos com problema, preservando os campos válidos.
- Projetos já aprovados não são gerados novamente na fila.
- Escrita voltada primeiro à compra correta e prevenção de devoluções; SEO natural usa somente 2 a 4 termos comprovados.

### Ajustes 1.1.4

- Dados técnicos comprovados têm prioridade em **Especificações técnicas**. FAQ e especificações podem repetir fatos importantes quando isso ajuda a compra correta.
- A FAQ continua orientada para uso, compatibilidade, instalação e cuidados, sem inventar fatos fora do título, descrição ou ficha factual.

### Ajustes 1.1.3

- Quando a consulta por ASIN pedir verificação: use **Abrir produto na Amazon**, conclua a verificação manualmente, aguarde o produto aparecer e volte ao painel para **Capturar página aberta**. A extensão lê somente a aba aberta por esse botão e confere o ASIN. Se a página continuar bloqueada, informe título e descrição manualmente.
- A API Key salva aparece em campo cinza, com prefixo, asteriscos e os quatro caracteres finais. **Substituir chave** abre a entrada para outra chave.
- **Criar planejamento + textos A+** gera e salva os textos primeiro, depois os oito briefings de imagens, e abre Textos A+. São duas gerações na API. Se os prompts falharem, os textos já salvos permanecem disponíveis. **Gerar somente textos A+** continua disponível.
- O preenchimento da Amazon permanece separado da geração.

1.1.2: conexão exclusiva do painel com verificação de versão. Ao abrir, o topo deve mostrar “A+ Studio · 1.1.2 conectado”. Se não mostrar, copie a mensagem visível no topo, sem enviar sua API Key. Feche o painel antigo, substitua os arquivos dentro da pasta instalada (onde está manifest.json), recarregue a extensão e abra o painel pelo popup.

Correção 1.1.1: o painel aberto em aba agora pode se comunicar com o worker. Para atualizar mantendo os dados, substitua os arquivos na mesma pasta instalada, recarregue a extensão e feche/reabra o painel. Não remova a extensão do Chrome.

Ela foi criada como uma extensão separada, usando como base técnica a extensão A+ Premium fornecida pelo usuário. Pode coexistir com a anterior desde que seja extraída em outra pasta.

## Funções

- **Painel em tela cheia:** clique em **Abrir painel A+ Studio 1.5** para trabalhar por etapas.
- **Projetos por ASIN:** cada produto mantém ficha factual, textos, briefings, nota, status e aprovação próprios.
- **Geração em massa:** selecione até 50 projetos e gere os rascunhos em uma fila que preserva o resultado e o erro de cada produto.
- **Revisão antes do preenchimento:** geração, edição, validação, aprovação e preenchimento são ações separadas.
- **Editor campo a campo:** contador de caracteres, provável origem factual e regeneração individual.
- **Planejamento A+ com IA:** diagnóstico do produto, informações ausentes, relações entre características e benefícios e oito briefings de imagem nos tamanhos dos módulos usados.
- **Geração e preenchimento:** gera os textos pelo provedor escolhido ou pelo modo automático e preenche os módulos reconhecidos na edição aberta do Seller Central.
- **Nota de qualidade local:** avalia limites, campos obrigatórios, números sem apoio, linguagem arriscada, repetição e formatação. Essa nota não faz outra chamada à IA.
- **Auditoria do catálogo:** captura ou recebe até 250 ASINs e verifica se há A+ padrão ou Premium publicado na página pública da Amazon Brasil.
- **Exportações:** baixa o planejamento em TXT, os textos em TXT e a auditoria em CSV.
- **Prompt completo:** copia de uma vez as instruções das oito imagens para colar na IA.

Os conceitos de diagnóstico, característica-benefício e briefing visual foram adaptados ao fluxo desta extensão a partir do repositório [nexscope-ai/Amazon-Skills](https://github.com/nexscope-ai/Amazon-Skills). Nenhum dado que não esteja no título ou na descrição deve ser tratado como fato.

## Instalar como nova extensão

1. Extraia o ZIP em uma pasta nova e definitiva, por exemplo `Aplus-Studio-1.5.14`.
2. Abra `chrome://extensions` no Chrome.
3. Ative **Modo do desenvolvedor**.
4. Clique em **Carregar sem compactação**.
5. Selecione a pasta que contém `manifest.json`.
6. Fixe **A+ Studio | Planejar, Gerar e Auditar** no menu de extensões.

Não extraia por cima da pasta da extensão antiga. Configure separadamente as chaves dos provedores que pretende usar. É necessário Chrome 120 ou superior; não é necessário instalar Node para usar.

## Preparar o conteúdo A+

Na edição A+ Premium, adicione e abra os módulos abaixo nesta ordem:

| Ordem | Módulo | Imagens | Campos de texto |
| --- | --- | --- | --- |
| 1 | Imagem completa | 1464 × 600 | Headline 80; corpo 300 |
| 2 | Quatro imagens com texto | 300 × 225 cada | Headline 30; corpo 150 |
| 3 | Duas imagens com texto | 650 × 350 cada | Headline 50; corpo 300 |
| 4 | Perguntas e respostas | — | Pergunta 120; resposta 250 |
| 5 | Imagem completa | 1464 × 600 | Headline 80; corpo 300 |
| 6 | Especificações técnicas | — | Nome 30; definição 500 |

Se a página informar um limite menor, a extensão usa o limite detectado. A extensão preenche os módulos existentes, mas não cria módulos nem envia imagens.

## Planejar o A+

1. Abra a extensão em qualquer página.
2. Informe o título e uma descrição factual completa, com medidas, materiais, compatibilidade, usos e itens inclusos conhecidos.
3. Configure uma ou mais chaves: xKiro, KiraAI, Gemini, Groq e/ou OpenAI.
4. Abra **Planejamento e qualidade** e clique em **Analisar produto e criar plano**.
5. Revise todas as inferências e informações ausentes.
6. Copie os prompts de imagem ou baixe o plano em TXT.

Use **Copiar prompt completo** para reunir as regras gerais e os oito briefings em um único texto. A instrução exige imagens individuais, sem grid, colagem ou mosaico.

O planejamento continua no worker da extensão se o popup for fechado. O Chrome ainda pode interromper workers em certas condições; nesse caso, a interface informa a interrupção para uma nova tentativa.

Os oito briefings cobrem dois banners de 1464 × 600, quatro imagens de 300 × 225 e duas imagens de 650 × 350. Os prompts pedem imagens sem texto, logo, marca d'água, números ou medidas e não geram as imagens dentro da extensão.

## Gerar, preencher e avaliar

### Fluxo recomendado no painel 1.5

1. Abra o painel pelo primeiro botão do popup.
2. Crie um projeto e informe o ASIN, o título e a descrição; ou use **Carregar produto** para tentar importar os dados públicos disponíveis.
3. Complete a ficha factual e mantenha marcados apenas fatos confirmados.
4. Clique em **Gerar rascunho A+**. Para vários produtos, adicione as linhas `ASIN; título; descrição`, marque os projetos e use **Gerar selecionados**.
5. Revise e edite os textos. Use **Regenerar** somente no campo necessário.
6. Valide e corrija os avisos. Se houver menos de quatro especificações, complete com dados reais do título, descrição ou ficha factual.
7. Aprove o produto individualmente.
8. Abra a edição A+ no Seller Central em outra aba da mesma janela, volte ao Studio e use **Preencher aba da Amazon aberta**.

Se o botão não localizar ou preencher a aba, use **Diagnosticar conexão**. O teste é somente leitura e indica separadamente URL incorreta, aba carregando, conector desatualizado, login/verificação, erro de reprodução de módulo, módulos ausentes e campos não reconhecidos.

A fila apenas gera rascunhos. Ela nunca aprova, salva, envia para análise ou publica conteúdo em massa. O upload das imagens continua manual.

### Fluxo rápido pelo popup

1. Abra a edição do A+ no Seller Central com os campos visíveis.
2. Preencha título e descrição na extensão.
3. Clique em **Gerar e Preencher**.
4. Confira o relatório e revise o conteúdo antes de salvar na Amazon.
5. Em **Planejamento e qualidade**, clique em **Avaliar textos gerados**.

A nota vai de 0 a 100 e é uma verificação automática local, não uma aprovação da Amazon. Ela verifica somente sinais mensuráveis no conteúdo disponível e não confirma elegibilidade, políticas, qualidade visual ou publicação.

As perguntas da FAQ devem ser recriadas para o produto informado. Quando houver poucos dados, a extensão pede perguntas gerais ligadas à função e ao uso real do item. Nas especificações, pares sem informação ficam vazios; a extensão remove marcadores como “Não especificado”, “Não informado” e “N/A”.

Todas as medidas são concentradas em uma única especificação chamada **Dimensões**, por exemplo `32 × 32 × 10 cm; alças: 52 cm`. A extensão pode manter essas medidas também na FAQ quando isso ajudar o cliente a comprar corretamente.

Se algum campo não for reconhecido, use **Analisar campos** e depois **Mapear campos**. Após concluir o mapeamento na página, use **Preencher novamente** para reaproveitar os textos sem nova chamada à API. **Desfazer** restaura os campos da última rodada quando ainda for seguro fazê-lo.

## Identificar produtos sem A+

1. Abra **Catálogo → Gerenciar todos os produtos** no Seller Central.
2. Abra **Produtos sem A+** e clique em **Capturar da página**.
3. Repita a captura em outras páginas, se necessário, ou cole ASINs na caixa.
4. Clique em **Verificar A+ publicado**.
5. Filtre os resultados e use **Baixar CSV**.

A lista aceita até 250 ASINs. Capturar 250 depende de a página do Seller Central ter carregado esses 250 produtos no HTML. A verificação continua em segundo plano quando você muda de aba ou fecha o popup, desde que o Chrome mantenha a extensão ativa.

“Sem A+ publicado” significa que a página pública consultada não exibiu módulos A+. Um projeto pode continuar como rascunho, em análise ou rejeitado no Seller Central. Captcha, bloqueio e indisponibilidade são apresentados como inconclusivos, sem adivinhação.

## Dados e permissões

- A chave permanece no armazenamento local da extensão até ser removida; não é enviada para páginas da Amazon.
- Título, descrição, configurações, planejamentos e auditorias ficam no navegador.
- Projetos, fichas factuais, textos editados, aprovações e resultados da fila também ficam no navegador.
- A Groq recebe título e descrição somente quando você solicita geração ou planejamento.
- A auditoria não usa IA; consulta a página pública de cada ASIN na Amazon Brasil.
- `activeTab` e `scripting` permitem analisar e preencher a página após sua ação; `storage` mantém configurações e progresso.

## Desenvolvimento

Os testes focados usam Node 20 ou superior:

```bash
npm test
```

Consulte `TESTES.md` para o escopo da validação desta entrega.
