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
