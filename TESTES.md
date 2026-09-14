# Verificação da entrega

Data: 13/09/2026. Versão: 1.1.4.

## Testes executados

O comando `npm test` executa 32 testes focados:

- normalização e validação do planejamento;
- exigência de oito briefings e tamanhos corretos;
- penalidades da nota de qualidade;
- geração do planejamento no worker e persistência do resultado;
- composição de um único prompt para as oito imagens separadas;
- remoção local de marcadores de ausência nas especificações;
- consolidação de todas as medidas em uma única especificação;
- preservação de especificações mesmo quando repetem fatos úteis da FAQ;
- ausência dos antigos exemplos de cama nas instruções de FAQ;
- normalização e deduplicação de ASINs;
- reconhecimento de A+ Premium e padrão no HTML público;
- distinção de bloqueio, indisponibilidade e erro;
- classificação de estados do Gerenciador A+;
- captura, consulta simulada e progresso da auditoria no worker.
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
- geração simulada de vários projetos no worker, sem aprovação nem preenchimento automático.

Regressão 1.1.1: o teste do painel inclui sender.tab, como no Chrome. Antes da correção, criar projetos e salvar chave expiravam sem resposta; após a correção passam. Testes adicionais verificam que popup continua autorizado e páginas externas/content scripts/outras extensões continuam bloqueados.

1.1.2: testes do cliente e worker reais conectados por portas simuladas, incluindo handshake de versão, chave, projetos, chamadas concorrentes, desconexão e rejeição de origens externas.

Resultado: **32 aprovados, 0 falhas**. Acrescentados testes de máscara da chave, geração de textos e oito briefings juntos e validação da URL/ASIN com interrupção diante de captcha. Testes com mensagens e DOM simulados; não foi feita validação em navegador real ou conta autenticada nesta correção.

Também passaram a verificação de sintaxe de `planning.js`, `openai.js`, `background.js` e `popup.js`, a leitura do `manifest.json` e a conferência de que todos os IDs usados por `popup.js` existem em `popup.html`.

## Limitações

- Não houve acesso autenticado à conta do usuário. A primeira execução real deve confirmar a estrutura atual das páginas do Seller Central.
- A chamada real à Groq não foi feita; o fluxo de streaming foi simulado no teste do worker.
- Os cenários antigos de navegador com Playwright permanecem no projeto, mas não fazem parte do conjunto focado. O download do Chromium de teste pode depender da rede do ambiente.
- Captcha ou limitação da Amazon podem impedir uma conclusão; a extensão deve marcar esses casos como bloqueados ou inconclusivos.

## Segurança

- A auditoria não lê nem usa a API Key da Groq.
- A chave não é enviada às páginas da Amazon.
- O planejamento e a geração enviam apenas os dados do produto fornecidos pelo usuário à Groq.
- A nota de qualidade é calculada localmente e não consome créditos.

- Regressão 1.5.5: o preenchimento aceita somente a URL canônica do editor A+ Premium e não seleciona outras páginas do Seller Central.
