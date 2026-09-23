# Verificação da entrega 1.5.24 — 23/09/2026

154 testes de regressão passaram (`npm test`). O novo cenário confirma que **Verificar todos** identifica somente os provedores com chave salva, testa todos os modelos configurados em Textos A+ e Briefings, ativa o uso de aprovados e publica o progresso até a conclusão. A estrutura da interface também verifica que o botão global fica antes da configuração individual do provedor.

Os conectores sensíveis da Amazon (`content.js`, `content-engine.js`, `page-writer.js`, `module-automation.js` e `diagnostics.js`) permanecem binariamente idênticos à 1.5.23. `panel-connection.js` mudou somente para conceder ao novo comando global o mesmo prazo longo já usado no teste individual. APIs externas foram simuladas; nenhuma chave ou cota real foi usada. A verificação visual automatizada não iniciou porque o executável do Chromium não está instalado neste ambiente; a ordem e todos os IDs da nova interface estão cobertos pelos testes estáticos.

## Registro da entrega 1.5.23 — 23/09/2026

153 testes de regressão passaram (`npm test`). Os novos cenários cobrem limite de dois modelos no automático, exclusão efetiva de modelos em quarentena, teste JSON separado para Textos A+ e briefings, aprovação por tarefa, timeout de conexão/fluxo e a política que permite texto visual somente nas Duas imagens.

Os conectores sensíveis da Amazon (`content.js`, `content-engine.js`, `page-writer.js`, `module-automation.js`, `diagnostics.js` e `panel-connection.js`) permanecem binariamente idênticos à 1.5.22. APIs externas foram simuladas; nenhuma chave ou cota real foi usada. A verificação em Chromium não iniciou porque o executável do navegador não está instalado neste ambiente; isso é uma limitação do ambiente, não uma falha encontrada na extensão.

## Registro da entrega 1.5.22 — 23/09/2026

151 testes de regressão passaram (`npm test`). Os novos cenários verificam reaproveitamento de sucesso entre tarefas, prazo adaptativo, quarentena de 30 minutos/6 horas, exclusão de modelos até 8B em tarefas estruturadas, alternância de provedores, chegada ao fallback Groq validado e continuação do catálogo após um modelo devolver 403.

Os conectores de leitura, diagnóstico, montagem e escrita da Amazon permanecem binariamente idênticos à 1.5.21. Provedores externos foram simulados; nenhuma chave real ou cota foi utilizada.

## Registro da entrega 1.5.21 — 22/09/2026

147 testes de regressão passaram (`npm test`). Os novos testes cobrem identificação e IDs da DeepSeek, catálogo oficial, geração mínima por modelo, classificação de modelo funcional, sem acesso e limite temporário, ausência de vazamento da chave e filtragem de opções incompatíveis/aprovadas no modo automático.

Os quatro conectores sensíveis da Amazon (`content.js`, `content-engine.js`, `page-writer.js` e `module-automation.js`) permanecem binariamente idênticos à 1.5.20. Nenhuma conta real, chave externa ou cobrança foi usada: as APIs foram simuladas. A verificação visual automatizada não pôde ser repetida neste ambiente porque o executável Chromium não estava disponível; a estrutura da interface e todos os IDs usados pelo JavaScript estão cobertos pelos testes estáticos.

## Registro da entrega 1.5.20 — 19/09/2026

142 testes de regressão (`npm test`) e 18 grupos de verificações de interface (`npm run test:ui`), sem erros JavaScript não tratados. A interface foi testada no Chromium com as páginas reais da extensão e transporte Chrome simulado, em desktop e a 390 px. Foram geradas 20 capturas de tela para inspeção; os resultados estão em `tests/UI-VERIFICACAO.json`.

Novos cenários: normalização de preços brasileiros; campos desconhecidos distintos de zero; limites de URL; captura de busca e produto em DOM simulado, sem duplicados/ocultos e com detecção de captcha; comparação por unidade somente com quantidade confirmada; composição de kits com custo e estoque calculados localmente; rejeição de SKU inventado/duplicado, estoque insuficiente e quantidades fracionárias; geração das três ferramentas; persistência por produto; relatórios independentes e amostra de origem; aviso de dados alterados; cópia e exportação; preservação em falha/cancelamento; preservação de alterações feitas em outro painel durante a geração.

Comparação binária com a 1.5.19: `content.js`, `content-engine.js`, `page-writer.js` e `module-automation.js` permanecem idênticos. Sem novas permissões ou dependências de produção. Os testes de regressão existentes de mapeamento, diagnóstico e escrita continuam incluídos.

Limites: sem chamadas a provedores com chaves reais, sem conta Amazon real. A captura foi conferida com páginas simuladas; mudanças do site, captcha, promoções e preços por variação precisam ser verificados no uso real. A qualidade comercial de uma resposta gerada não é medida por esses testes.

## Registro da entrega 1.5.19 — 17/09/2026

128 testes de regressão passaram (`npm test`); 16 grupos de verificações de interface passaram (`npm run test:ui`). O monitor foi conferido visualmente no Chromium. APIs e transporte Chrome simulados, sem credenciais reais. Falha no armazenamento de métricas auxiliares não perde conteúdo validado.

Novos cenários: seleção gratuita com preço zero e catálogo publicado, autenticação via endpoint protegido do OpenRouter, bloqueio de modelo pago, pontuação por tarefa, histórico de sucesso/velocidade, migração dos quatro modelos removidos, padrão xKiro, cancelamento durante requisição, cancelamento de catálogo, limite total, rejeição de resposta tardia, progresso consultável com editor bloqueado, histórico sem segredos e liberação para nova tentativa sem perder o projeto. A chave legada Groq não é enviada ao xKiro por causa da mudança de padrão.

Os conectores de leitura/escrita/montagem da Amazon não foram alterados. A conta real do Seller Central e a disponibilidade dos provedores não foram testadas.

## Registro da entrega 1.5.17

128 testes de regressão passaram (`npm test`). O teste de interface (`npm run test:ui`) passou em 16 grupos de verificações, sem erros JavaScript não tratados. Resultado em `tests/UI-VERIFICACAO.json`.

A checkbox foi reproduzida falhando na 1.5.16: a seleção era perdida após a atualização periódica. O mesmo cenário passa nesta versão, junto com busca, troca de produto, seleção fora do filtro e desmarcação intencional.

Os testes cobrem texto minimalista em ambos os focos, preferência por close-ups, adaptação não destrutiva de prompts anteriores, briefing independente sem reescrever textos ou aprovação, preservação integral do projeto em erro de API e nova tentativa após a falha. A interface verifica a separação entre montagem e preenchimento e a exibição imediata do relatório.

Testes locais usam APIs simuladas. Não foi exercitada a instalação completa da extensão, a conta real do Seller Central ou uma API externa. Não representam uma garantia de funcionamento na Amazon real. Nenhuma chave de usuário foi usada.

## Registros históricos de verificação

# Verificação da interface 1.5.15

106 testes de regressão aprovados. Teste adicional: `npm run test:ui`.
Os cenários visuais usam Chromium, a interface real e respostas simuladas do Chrome, sem contato com Amazon ou provedores de IA. Consulte LEIA-ME.md para escopo e limitações. Os scripts de negócio anteriores foram comparados com a 1.5.14 e diferem somente na versão.

---

# Verificação da entrega

Data: 16/09/2026. Versão: 1.5.14.

## Testes executados

O comando `npm test` executa os testes focados de regressão, incluindo:

- normalização e validação do planejamento;
- exigência de oito briefings e tamanhos corretos;
- penalidades da nota de qualidade;
- geração do planejamento no worker e persistência do resultado;
- composição de um único prompt para as oito imagens separadas;
- presença obrigatória de todas as variações confirmadas no primeiro e no último banner;
- escolha contextual e variedade entre homem e mulher nas cenas humanas;
- identificação e roteamento da OpenAI API oficial;
- teste de chave por listagem de modelos, sem geração de conteúdo;
- detecção automática de categoria, inclusive prioridade para produtos infantis e de saúde;
- biblioteca de ângulos diferentes por módulo e direção manual opcional;
- checklist por categoria sem considerar fatos vazios como preenchidos;
- estratégia persuasiva compartilhada entre textos e briefings de imagens;
- redescoberta de campos quando a Amazon recria um módulo durante o preenchimento;
- diagnóstico legível durante um preenchimento e recuperação automática de operação abandonada;
- limites de tempo por campo e para a tentativa completa, sem bloqueio permanente;
- escrita autocontida no MAIN world por KAT, Shadow DOM, React e Draft.js;
- relatório persistente da última tentativa de preenchimento;
- teste da ponte de escrita sem alteração de campos;
- códigos técnicos e ID por tentativa, incluindo autorização ausente e mudança de documento;
- relatório seguro sem token de autorização, API Key ou textos completos;
- início, retomada e finalização do registro de montagem manual;
- ordem estrutural `full > four > two > faq > full > specs`;
- relatório do gravador sem valores dos campos de produto;
- remoção local de marcadores de ausência nas especificações;
- consolidação de todas as medidas em uma única especificação;
- preservação de especificações mesmo quando repetem fatos úteis da FAQ;
- ausência dos antigos exemplos de cama nas instruções de FAQ;
- normalização e deduplicação de ASINs;
- reconhecimento de A+ Premium e padrão no HTML público;
- distinção de bloqueio, indisponibilidade e erro;
- classificação de estados do Gerenciador A+;
- captura, consulta simulada e progresso da auditoria no worker.
- captura e preservação de SKU no catálogo, com a coluna imediatamente depois do ASIN no CSV;
- mapeamento manual contínuo, sem clique de ativação entre os campos;
- dimensões com rótulos por extenso e reconhecimento de valores compactos como `10x20x30`;
- revisão detalhada de números sem apoio e pares de textos repetidos;
- exclusão de headline x corpo, ficha técnica, FAQ e nome do produto do cálculo indevido de repetição;
- cálculo equilibrado que não marca um texto curto contido em outro como 100%;
- correção seletiva com IA, preservando todos os campos não sinalizados;
- criação e normalização de projetos por ASIN;
- envio à IA apenas de fatos confirmados;
- leitura da fila em massa no formato `ASIN; título; descrição`;
- aviso quando há menos de quatro especificações preenchidas;
- indicação da provável origem factual;
- presença das cinco etapas no painel;
- carregamento automático do conector nas páginas autorizadas do Seller Central;
- permissão para localizar e ativar uma aba da Amazon aberta;
- correspondência entre os IDs do painel e o JavaScript;
- separação entre geração, aprovação e preenchimento.
- botão de diagnóstico, relatório copiável e correspondência dos novos controles com o JavaScript;
- seleção exclusiva de uma URL real do editor A+ Premium, sem escolher outras páginas do Seller Central;
- conexão versionada entre o worker e a aba, com diagnóstico de módulos, campos, login, captcha e erros de reprodução;
- geração simulada de vários projetos no worker, sem aprovação nem preenchimento automático.

Regressão 1.1.1: o teste do painel inclui sender.tab, como no Chrome. Antes da correção, criar projetos e salvar chave expiravam sem resposta; após a correção passam. Testes adicionais verificam que popup continua autorizado e páginas externas/content scripts/outras extensões continuam bloqueados.

1.1.2: testes do cliente e worker reais conectados por portas simuladas, incluindo handshake de versão, chave, projetos, chamadas concorrentes, desconexão e rejeição de origens externas.

Resultado da versão 1.5.14: **106 aprovados, 0 falhas**. Foram acrescentados testes para os focos comercial e anti-devolução, persistência por produto, importação dos riscos da análise de avaliações, funções específicas dos oito briefings, prompt visual anti-devolução e revisão automática dessa estrutura. Permanecem cobertos montagem dos módulos, mapeamento, medidas, SKU no CSV, revisão e correção seletiva, diagnóstico detalhado, ponte segura, códigos de causa, recuperação de preenchimento, cópia rápida, APIs, planejamento e validação de URL/ASIN. Os testes de navegador não puderam ser executados neste ambiente porque o binário do Chromium do Playwright não está instalado; os testes focados usam mensagens e DOM simulados e não substituem a validação final em uma conta autenticada da Amazon.

Também passaram a verificação de sintaxe de `planning.js`, `openai.js`, `background.js` e `popup.js`, a leitura do `manifest.json` e a conferência de que todos os IDs usados por `popup.js` existem em `popup.html`.

## Limitações

- Não houve acesso autenticado à conta do usuário. A primeira execução real deve confirmar a estrutura atual das páginas do Seller Central.
- Chamadas reais aos provedores não foram feitas; rede, respostas e streaming foram simulados nos testes.
- Os cenários de navegador com Playwright foram solicitados, mas não executaram porque o ambiente não possui o binário do Chromium. Isso é uma limitação do ambiente de teste, não uma falha observada no código.
- Captcha ou limitação da Amazon podem impedir uma conclusão; a extensão deve marcar esses casos como bloqueados ou inconclusivos.

## Segurança

- A auditoria não lê nem usa as API Keys dos provedores.
- A chave não é enviada às páginas da Amazon.
- O planejamento e a geração enviam apenas os dados do produto fornecidos pelo usuário ao provedor escolhido.
- A nota de qualidade é calculada localmente e não consome créditos.
