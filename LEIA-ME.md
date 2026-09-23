# A+ Studio 1.5.24 — verificação automática de todos os modelos

## Novidade da 1.5.24

- **Verificar todos** aparece no topo de **Chaves de API** e testa, com um único clique, todos os modelos dos provedores que já possuem uma chave salva.
- O painel mostra progresso global e um resumo por provedor. Clicar em um provedor abre os resultados detalhados de Textos A+ e Briefings das imagens.
- Provedores diferentes são verificados em paralelo; os modelos de cada provedor são testados em sequência para reduzir erros de limite. Provedores sem chave são ignorados.
- Após a verificação, o automático passa a usar somente modelos aprovados para a tarefa correspondente nas últimas 24 horas. Chaves, prompts e respostas não são incluídos no histórico.

### Atualizar preservando os dados

1. Extraia o ZIP e copie os arquivos da pasta `aplus-studio-v1.5.24` para a mesma pasta já carregada no Chrome.
2. Em `chrome://extensions`, clique em **Recarregar**. Não remova a extensão e não limpe seus dados.
3. Feche painéis antigos, abra novamente o Studio e confirme `1.5.24 conectado`.
4. Recarregue também a aba do Seller Central antes de usar as funções da Amazon.

## Correção da 1.5.23

- **Verificar modelos** agora valida separadamente JSON de Textos A+ e de briefings. O automático usa somente aprovações das últimas 24 horas para a tarefa correspondente.
- O automático tenta no máximo dois modelos dentro de 70 segundos. Modelos sem resposta, com fluxo parado ou em quarentena deixam de consumir toda a geração.
- Dois timeouts ou formatos inválidos consecutivos suspendem o modelo por 24 horas. Uma falha isolada continua sendo tratada como temporária.
- Se um planejamento completo ultrapassar o limite de saída ou falhar na validação por tamanho, a extensão tenta dois blocos menores de quatro briefings e só salva o conjunto completo.
- O prompt não permite texto no Banner principal, nas Quatro imagens nem no Banner final. Nas Duas imagens, texto é opcional e só deve aparecer quando necessário para instrução, medida, compatibilidade, instalação ou escolha correta.

## Correção da 1.5.22

- O automático geral tenta **provedores diferentes**, em vez de deixar três modelos lentos do mesmo provedor consumirem todo o prazo.
- Um modelo validado em Textos A+ também melhora a prioridade dele em Briefings, e vice-versa. O histórico continua separado por tarefa para o relatório, mas a confiabilidade geral passa a ajudar na escolha.
- Modelos gratuitos explicitamente muito pequenos (até 8B) não são usados automaticamente em tarefas extensas de JSON, evitando respostas incompletas do tipo LFM 2.6B.
- Modelo sem histórico recebe até 32 segundos no automático geral. Modelos já validados ganham prazo proporcional à média real, até 60 segundos. Depois de timeout, a próxima tentativa fica limitada a 22 segundos.
- Um timeout coloca o modelo em pausa por 30 minutos; dois consecutivos, por 6 horas. Formato inválido repetido também recebe pausa longa. Isso é temporário e não remove o modelo.
- O automático geral pode tentar até quatro modelos dentro do limite total de dois minutos. Erro 403 passa a significar **modelo sem acesso nesta chave**, sem acusar incorretamente que a chave inteira foi recusada.
- O histórico mostra quando um modelo está em pausa e até que horário.

Com o histórico apresentado pelo usuário, `qwen/qwen3.8-27b` do Groq — validado em cerca de 3 segundos — passa à frente dos modelos que acumulam timeout. As falhas antigas continuam úteis; não é necessário limpar o histórico.

## Versão 1.5.21 — teste de modelos e DeepSeek

## Novidades da 1.5.21

- **Teste real por modelo:** em **Chaves de API**, escolha o provedor, salve/teste a chave e use **Testar modelos desta chave**. A extensão faz uma geração mínima em cada opção e mostra: funcionando, sem acesso, falha temporária, instável ou erro de chave.
- **Remoção segura:** **Ocultar incompatíveis** remove da lista e do modo automático apenas modelos confirmados como inexistentes ou sem acesso. Limite de uso (429), timeout e falha do servidor não removem modelos automaticamente. **Mostrar todos** desfaz o filtro.
- **Somente aprovados:** a opção **Usar somente modelos aprovados nos testes** restringe o automático aos modelos que responderam corretamente. O resultado é local, por chave/provedor, e representa aquele momento; mudanças de catálogo e limites podem exigir novo teste.
- **DeepSeek oficial:** novo provedor independente, com `deepseek-v4-flash` e `deepseek-v4-pro`, usando a API oficial. A chave da API é separada de ChatGPT Plus e de assinaturas de sites.
- **Espera do painel:** comandos longos de Pesquisa e kits e do teste de modelos agora aguardam até 210 segundos no painel, evitando o falso aviso de ausência de resposta enquanto o worker ainda está executando.

O teste envia apenas uma instrução curta e limita a resposta a oito tokens, mas pode consumir cota ou gerar custo mínimo conforme o provedor. Nenhuma chave ou resposta é gravada no relatório; ficam apenas status, duração, data e uma causa resumida.

### Atualizar preservando os dados

1. Extraia o ZIP e copie os arquivos da pasta `aplus-studio-v1.5.22` para a mesma pasta já carregada no Chrome.
2. Em `chrome://extensions`, clique em **Recarregar**. Não remova a extensão e não limpe seus dados.
3. Feche painéis antigos, abra novamente o Studio e confirme `1.5.22 conectado`.
4. Recarregue também a aba do Seller Central antes de usar as funções da Amazon.

## Versão 1.5.20

## Novidades da 1.5.20

Nova área **Pesquisa e kits**, separada do A+ e de Avaliações e anúncio. Usa as chaves e o gerador adaptativo já existentes, com progresso, cancelamento, prazo total e histórico próprio para cada tarefa. Não muda os textos, a aprovação ou os módulos do A+.

- **Pesquisa de produtos:** examina demanda, concorrência, viabilidade, diferenciação e riscos com base nos dados fornecidos; indica o que falta validar antes de investir.
- **Concorrentes:** compara a amostra, preço por unidade quando a quantidade for confirmada, características, avaliações e oportunidades de melhoria.
- **Kits:** propõe composições com os SKUs informados, considerando estoque, finalidade, cores MIX e orientação de anúncio e imagens. A extensão calcula os kits montáveis e o cenário de custos; rejeita composições com SKU inexistente, quantidade inválida ou estoque conhecido insuficiente.
- **Persistência:** rascunho compartilhado pelas três ferramentas, um relatório independente de cada ferramenta por produto, cópia e exportação TXT. Ao editar os dados, um aviso identifica o relatório antigo, que mantém sua amostra original. Falhas ou cancelamento preservam o relatório anterior.

### Como usar

1. Selecione um produto no Studio (ou crie um projeto) e abra **Pesquisa e kits**.
2. Informe termo e objetivo. **Buscar na Amazon** abre a busca; volte ao Studio, atualize a lista de abas, selecione a página e use **Capturar anúncios**. A captura aceita buscas e páginas de produto da Amazon Brasil, até 20 anúncios na amostra. Repetir a captura atualiza os ASINs existentes sem duplicar nem apagar quantidades revisadas.
3. Confira preços, quantidades e características; adicione concorrentes manualmente ou dados de mercado no campo de evidências, com fonte/data. A quantidade não é presumida pelo título.
4. Para kits, adicione SKU, nome, estoque e custo unitário. Preço a testar, taxas percentuais e outros custos são opcionais. Um campo vazio é desconhecido; zero significa ausência confirmada de custo. O mesmo preço de cenário é aplicado a cada composição proposta.
5. Escolha a ferramenta e gere o relatório. Copie ou exporte o resultado quando estiver revisado.

**Alcance:** a IA analisa dados informados/capturados; não navega na internet nem acessa vendas, BSR, histórico de preços ou volume de buscas ao vivo. A captura não pagina automaticamente e pode exigir revisão quando a Amazon mudar a página. Preço, promoção, frete e variação precisam ser conferidos. A amostra não representa o mercado inteiro.

Os cálculos usam somente os custos preenchidos, não são lucro líquido nem garantia de rentabilidade. Cada composição é um cenário independente: propostas alternativas disputam o mesmo estoque. A disponibilidade de kits virtuais e a possibilidade de usar anúncio/variação existente exigem verificação na conta e no marketplace; nada é publicado automaticamente.

### Origem das metodologias

Adaptação para ferramentas nativas da extensão das skills públicas da Nexscope:

- [amazon-product-research](https://github.com/nexscope-ai/Amazon-Skills/blob/main/amazon-product-research/SKILL.md)
- [amazon-competitor-analysis](https://github.com/nexscope-ai/Amazon-Skills/blob/main/amazon-competitor-analysis/SKILL.md)
- [amazon-product-bundling](https://github.com/nexscope-ai/Amazon-Skills/blob/main/amazon-product-bundling/SKILL.md)

Os frameworks foram adaptados ao fluxo local, em português, sem serviço Nexscope obrigatório. A extensão não executa arquivos SKILL.md nem instala um agente externo. As sugestões são hipóteses quando não há evidência. Não houve aumento de permissões nem dependências de produção.

## Novidades da 1.5.19

- O modo automático troca de modelo mais rápido quando um modelo gratuito devolve formato JSON inválido.
- Respostas com pequenos erros seguros de JSON, como vírgula final, agora são recuperadas antes de declarar falha.
- O histórico local ficou mais claro: mostra quando o modelo ainda não teve resposta validada e separa demora de formato inválido.
- Falhas por demora/formato deixam o modelo em espera por alguns minutos para não prender a geração na mesma opção instável.


- **Padrão para novos projetos:** xKiro — Melhor modelo gratuito disponível. As escolhas já salvas são preservadas, exceto as quatro opções removidas, que são migradas dentro do mesmo provedor sem alterar textos ou aprovação.
- **Automático geral:** considera adequação à tarefa, sucesso de respostas validadas, falhas recentes e tempo médio. Usa apenas provedores com chave cadastrada. O automático geral ainda pode usar a OpenAI paga se a chave estiver configurada, como antes; a garantia de modelos gratuitos aplica-se às opções xKiro gratuito e OpenRouter gratuito.
- **OpenRouter:** testa a chave em `/api/v1/key`, consulta `/api/v1/models` e escolhe entre variantes `:free` publicadas com preço zero de entrada e saída. O envio também limita o preço do provedor a zero. Não inventa sufixos `:free` e não troca para uma versão paga. O catálogo tem cache de cinco minutos.
- **Escolha por tarefa:** redação A+, briefings comerciais, briefings anti-devolução, análise de avaliações e otimização de anúncio. Ao regenerar um campo, FAQ/especificações recebem prioridade analítica e headline/corpo recebem prioridade comercial. A geração completa dos textos continua em conjunto para preservar coerência e evitar uma requisição por campo.
- **Prazos:** até 120 segundos por geração e 180 segundos para a operação combinada textos + briefings. Na fila, cada produto tem seu próprio prazo. O tempo inclui catálogo, correções e trocas de modelo. Nos modos automáticos, cada modelo tem até 50 segundos, com até três modelos tentados dentro do prazo total e até duas chamadas de geração/correção por modelo. O prazo é um teto de espera, não uma promessa de concluir nesse tempo.
- **Progresso:** mostra tarefa, modelo efetivo, tentativa, etapa, motivo da troca, tempo decorrido e limite total, inclusive enquanto o editor está bloqueado. O botão Cancelar geração continua acessível. O popup também exibe esse monitor.
- **Histórico local:** guarda até 120 registros de modelo/tarefa, contagens de sucesso e falha, média móvel do tempo de respostas válidas e motivo resumido. Mostra os 20 registros recentes. Falhas recebem uma pausa de preferência de dois minutos; dados com mais de sete dias deixam de influenciar a pontuação. Não armazena chaves, prompts, avaliações ou textos dos produtos no histórico.
- **Opções removidas:** Gemini 3.5 Flash-Lite → Flash; Qwen 3.6 27B → Qwen 3.8 27B; Llama 3.1 8B e Llama 3.3 70B → GPT-OSS 120B, no Groq.

O ranking inicial usa uma estimativa de adequação a partir do catálogo, não uma avaliação comprovada de persuasão. O histórico mede confiabilidade e velocidade no seu uso, não qualidade comercial subjetiva. A disponibilidade gratuita pode mudar e os limites do provedor continuam valendo.

### Ativar o OpenRouter

1. Abra Chaves de API e selecione OpenRouter · modelos gratuitos.
2. Cole sua chave, use Testar chave e depois Salvar.
3. No produto, selecione Melhor gratuito para esta tarefa (OpenRouter), ou o Automático geral para permitir alternativas entre suas chaves configuradas.

Esta versão adiciona acesso somente ao domínio `openrouter.ai` às permissões existentes. Não usa sua assinatura ChatGPT como crédito de API. Testar chave valida autenticação e catálogo, mas não garante que uma geração gratuita esteja disponível naquele momento.

Referências técnicas: https://openrouter.ai/docs/guides/routing/model-variants/free ; https://openrouter.ai/docs/api/reference/limits ; https://openrouter.ai/docs/api/api-reference/models/get-models .

### Verificação desta versão

127 testes de regressão passaram; 16 grupos de testes da interface passaram sem erros JavaScript não tratados. Testados prazo total, cancelamento, resultado tardio, troca de modelo, rejeição de chave, bloqueio de modelo pago, migração, preservação de textos e aprovação, checkbox, cópia e ações separadas da Amazon. Falha ao salvar uma métrica auxiliar não invalida o conteúdo gerado. APIs e transporte Chrome foram simulados. Nenhuma chave real ou conta Seller Central foi usada; os testes não garantem disponibilidade externa.

## Atualizar preservando os dados

1. Extraia o ZIP em uma pasta temporária.
2. Copie o conteúdo de `aplus-studio-v1.5.20` para **a mesma pasta que o Chrome já usa para esta extensão**, substituindo os arquivos. Guarde uma cópia dos arquivos anteriores para poder voltar à versão anterior.
3. Em `chrome://extensions`, use **Recarregar** no A+ Studio já instalado. **Não remova a extensão e não limpe seu armazenamento**, pois os projetos e as chaves são locais.
4. Feche as abas antigas do Studio e abra o painel pelo ícone da extensão. O cabeçalho deve mostrar `1.5.20 conectado`.
5. Recarregue a aba do Seller Central antes de usar diagnóstico, montagem ou preenchimento.

## Alterações preservadas da 1.5.17

- **Produtos:** a seleção das checkboxes permanece após atualização automática, busca e troca de produto. O contador inclui produtos selecionados que ficaram ocultos pela busca; a fila usa todos eles. A seleção é da sessão do painel.
- **Prompts:** permitem texto minimalista em português, especialmente nas medidas confirmadas, sem inventar números ou unidades. As quatro imagens priorizam close-ups de quatro detalhes reais distintos, com enquadramento mais amplo quando necessário para explicar uso, escala ou conteúdo.
- **Textos A+:** ícone de cópia pequeno dentro do início de cada caixa, com espaço reservado para não cobrir o texto e indicação acessível.
- **Imagens:** Gerar briefing completo (ou Atualizar briefing completo) gera os oito briefings com o foco escolhido. Não gera arquivos de imagem. Usa a API configurada e preserva os textos A+, a aprovação, as notas e o relatório de preenchimento. Em caso de erro, mantém o plano anterior. O briefing completo pode ser aberto e copiado na mesma aba.
- **Preencher:** Adicionar módulos monta a estrutura; Preencher textos na Amazon aplica os textos salvos e exige aprovação. São ações independentes. Se os módulos já existem, use diretamente o preenchimento. A geração de novos textos continua na aba Produto.
- **Solução de problemas:** diagnóstico e registro de montagem ficam em uma seção separada, recolhida inicialmente. O relatório de preenchimento continua visível na área principal.

A nova política de texto minimalista e close-up também é aplicada ao exibir/copiar prompts antigos, sem regravar o planejamento salvo. Para gerar cenas inteiramente novas, use Atualizar briefing completo.

## Registro da entrega anterior — 1.5.17

A base desta entrega é a 1.5.16, incluindo xKiro e o roteamento automático existente. Não foi adicionada permissão, dependência de produção ou migração de dados. Os conectores e a ponte de escrita da Amazon mantêm sua implementação; a separação dos botões ocorre no painel. Catálogo e mapeamento continuam acessíveis pelo ícone da extensão com a aba da Amazon ativa.

## Validação

- **111 testes de regressão aprovados.**
- Teste de interface no Chromium com o HTML/JS/CSS reais e transporte Chrome simulado: 15 grupos de verificações, sem erros JavaScript não tratados.
- O problema da checkbox foi reproduzido na base 1.5.16; a mesma verificação passa na 1.5.17.
- Verificados: cópia dentro da caixa, preservação da seleção, filtro e fila, geração independente de briefings, preservação do plano após erro, liberação para nova tentativa, aprovação, separação dos comandos e relatório imediato.
- Layout conferido visualmente; sete telas de trabalho verificadas a 390 px sem rolagem horizontal.
- Seller Central real, instalação completa da extensão e APIs externas não foram exercitados. Esses testes não garantem o comportamento de uma página da Amazon modificada posteriormente.

## Reproduzir

`npm test` executa os testes de regressão. Para a interface, instale as dependências de desenvolvimento e o Chromium do Playwright, depois execute `npm run test:ui`. `APLUS_BROWSER_EXECUTABLE` aceita um executável Chromium; `APLUS_UI_OUTPUT` define a pasta de capturas. Os dados fictícios pertencem aos testes e não são importados para seus projetos.

---

# A+ Studio

Versão 1.5.17. Extensão Chrome Manifest V3 para organizar, planejar, gerar, revisar, aprovar, montar, preencher e auditar conteúdo Amazon A+, além de analisar avaliações e otimizar anúncios em uma área independente. Usa roteamento entre OpenAI, xKiro, KiraAI, Gemini e Groq.

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
