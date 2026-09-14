# Changelog

Todas as mudanças notáveis deste projeto são documentadas neste arquivo.

## [1.5.0]

- Painel reformulado, com hierarquia visual mais clara e melhor aproveitamento da tela.
- Nova cor principal (`#B2E146`), com contraste ajustado para leitura e ações.
- Ficha factual reorganizada como tabela; navegação em cinco etapas mais evidente.
- Popup atualizado para acompanhar a nova identidade visual.

## [1.4.3]

- Corrigido o carregamento automático do conector do Seller Central nas páginas autorizadas, eliminando a falha `An unknown error occurred when fetching the script`.
- A extensão agora localiza a aba da Amazon, a traz para frente e aguarda o carregamento antes de preencher.
- Abas já abertas antes de uma atualização recebem uma tentativa de recuperação automática.

## [1.4.2]

- FAQ e especificações agora podem repetir dados técnicos importantes (medidas, material, quantidade, cor, modelo, capacidade, indicação de uso).
- Aviso de "menos de 4 especificações" deixou de bloquear aprovação/preenchimento, servindo apenas como lembrete de revisão.
- Busca mais flexível por abas abertas do Seller Central na mesma janela.
- Suporte a quatro provedores de IA independentes: Google Gemini, KiraAI, Groq e DeepSeek.
- Todas as chaves de API podem permanecer salvas simultaneamente, inclusive em cópias criptografadas via Chrome Sync.
- Modo automático prioriza rotas gratuitas/econômicas, com fallback para a próxima chave configurada em caso de falha ou limite atingido.

## [1.3.0]

- Modo automático econômico com múltiplas rotas alternativas conforme chaves configuradas.
- Uma API Key independente por provedor.
- Correções de validação passaram a solicitar apenas os campos com problema, preservando os já válidos.
- Projetos aprovados deixaram de ser gerados novamente na fila.
- Ajuste no foco da escrita: priorizar decisão de compra correta e prevenção de devoluções, com SEO natural (2 a 4 termos comprovados).

## [1.1.4]

- Priorização de dados técnicos comprovados em especificações; FAQ e especificações podem repetir fatos importantes quando isso ajuda a decisão de compra.
- FAQ voltada a uso, compatibilidade, instalação e cuidados, sem extrapolar os fatos disponíveis (título, descrição, ficha factual).

## [1.1.3]

- Fluxo de verificação manual por ASIN: abrir o produto na Amazon, concluir a verificação e capturar a página aberta pelo painel.
- Exibição da chave salva com mascaramento (prefixo + asteriscos + últimos 4 caracteres) e opção de substituição.
- Separação entre geração de conteúdo e preenchimento na Amazon.

## [1.1.2]

- Conexão exclusiva do painel com verificação de versão.

## [1.1.1]

- Correção de comunicação entre painel (aberto em aba) e service worker.
