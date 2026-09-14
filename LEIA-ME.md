# A+ Studio

Versão 1.5.5. Extensão Chrome Manifest V3 para organizar, planejar, gerar, revisar, aprovar, preencher e auditar conteúdo Amazon A+ com roteamento econômico entre KiraAI, Gemini, Groq e DeepSeek.

### Interface 1.5.5

### Correção 1.5.5

- O botão **Preencher aba da Amazon aberta** usa exclusivamente `https://sellercentral.amazon.com/enhanced-content/content-manager/workflow/ebc-premium/content/new/edit`.
- Se essa URL exata já estiver aberta na janela atual, o Studio ativa essa aba. Caso contrário, abre a URL canônica em uma nova aba.
- O worker valida a URL novamente antes de mapear ou escrever qualquer campo; outras páginas do Seller Central são recusadas para preenchimento.
- O conector automático foi restringido à rota A+ Premium e o tempo máximo de carregamento foi ampliado para reduzir falhas em páginas lentas.

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
- Histórico 1.4.2: o botão procurava qualquer aba do Seller Central. Na 1.5.5 esse comportamento foi substituído pela URL A+ Premium canônica.
- As especificações restantes continuam sendo reorganizadas em sequência depois que marcadores vazios ou medidas repetidas são removidos.
- Quatro servidores independentes: Google Gemini, KiraAI.vn, Groq e DeepSeek.
- KiraAI configurado com os identificadores atuais `qwen3.8-flash` e `glm-5.3-free`.
- DeepSeek configurado com a API oficial e o modelo `deepseek-flash`; por ser cobrado por uso, fica por último no modo automático.
- Todas as quatro chaves podem permanecer salvas simultaneamente, inclusive em cópias criptografadas no Chrome Sync.
- O modo automático prioriza o GLM gratuito e alternativas econômicas; se uma rota falhar ou atingir o limite, passa para a próxima chave configurada.

### Ajustes 1.3.0

- Modo automático econômico: GLM 5.3 Free, Gemini e Groq como rotas alternativas quando houver chave configurada.
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

- **Painel em tela cheia:** clique em **Abrir painel A+ Studio 1.1** para trabalhar por etapas.
- **Projetos por ASIN:** cada produto mantém ficha factual, textos, briefings, nota, status e aprovação próprios.
- **Geração em massa:** selecione até 50 projetos e gere os rascunhos em uma fila que preserva o resultado e o erro de cada produto.
- **Revisão antes do preenchimento:** geração, edição, validação, aprovação e preenchimento são ações separadas.
- **Editor campo a campo:** contador de caracteres, provável origem factual e regeneração individual.
- **Planejamento A+ com IA:** diagnóstico do produto, informações ausentes, relações entre características e benefícios e oito briefings de imagem nos tamanhos dos módulos usados.
- **Geração e preenchimento:** gera os textos pelo provedor escolhido ou pelo modo automático e preenche os módulos reconhecidos exclusivamente no editor A+ Premium da URL canônica configurada.
- **Nota de qualidade local:** avalia limites, campos obrigatórios, números sem apoio, linguagem arriscada, repetição e formatação. Essa nota não faz outra chamada à IA.
- **Auditoria do catálogo:** captura ou recebe até 250 ASINs e verifica se há A+ padrão ou Premium publicado na página pública da Amazon Brasil.
- **Exportações:** baixa o planejamento em TXT, os textos em TXT e a auditoria em CSV.
- **Prompt completo:** copia de uma vez as instruções das oito imagens para colar na IA.

Os conceitos de diagnóstico, característica-benefício e briefing visual foram adaptados ao fluxo desta extensão a partir do repositório [nexscope-ai/Amazon-Skills](https://github.com/nexscope-ai/Amazon-Skills). Nenhum dado que não esteja no título ou na descrição deve ser tratado como fato.

## Instalar como nova extensão

1. Extraia o ZIP em uma pasta nova e definitiva, por exemplo `Aplus-Studio-1.1`.
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
3. Configure uma ou mais chaves: KiraAI, Gemini, Groq e/ou DeepSeek.
4. Abra **Planejamento e qualidade** e clique em **Analisar produto e criar plano**.
5. Revise todas as inferências e informações ausentes.
6. Copie os prompts de imagem ou baixe o plano em TXT.

Use **Copiar prompt completo** para reunir as regras gerais e os oito briefings em um único texto. A instrução exige imagens individuais, sem grid, colagem ou mosaico.

O planejamento continua no worker da extensão se o popup for fechado. O Chrome ainda pode interromper workers em certas condições; nesse caso, a interface informa a interrupção para uma nova tentativa.

Os oito briefings cobrem dois banners de 1464 × 600, quatro imagens de 300 × 225 e duas imagens de 650 × 350. Os prompts pedem imagens sem texto, logo, marca d'água, números ou medidas e não geram as imagens dentro da extensão.

## Gerar, preencher e avaliar

### Fluxo recomendado no painel 1.1

1. Abra o painel pelo primeiro botão do popup.
2. Crie um projeto e informe o ASIN, o título e a descrição; ou use **Carregar produto** para tentar importar os dados públicos disponíveis.
3. Complete a ficha factual e mantenha marcados apenas fatos confirmados.
4. Clique em **Gerar rascunho A+**. Para vários produtos, adicione as linhas `ASIN; título; descrição`, marque os projetos e use **Gerar selecionados**.
5. Revise e edite os textos. Use **Regenerar** somente no campo necessário.
6. Valide e corrija os avisos. Se houver menos de quatro especificações, complete com dados reais do título, descrição ou ficha factual.
7. Aprove o produto individualmente.
8. Use **Preencher aba da Amazon aberta**. O Studio ativa uma aba já aberta na URL A+ Premium canônica ou abre essa URL automaticamente.

A fila apenas gera rascunhos. Ela nunca aprova, salva, envia para análise ou publica conteúdo em massa. O upload das imagens continua manual.

### Fluxo rápido pelo popup

1. Abra a URL A+ Premium canônica `https://sellercentral.amazon.com/enhanced-content/content-manager/workflow/ebc-premium/content/new/edit` com os campos visíveis.
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
