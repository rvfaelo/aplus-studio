# Contribuindo

Obrigado por considerar contribuir com o A+ Studio!

## Como reportar um problema

Abra uma [issue](../../issues) descrevendo:

- O comportamento esperado x o que aconteceu.
- Passos para reproduzir.
- Versão do Chrome e sistema operacional.
- Qualquer mensagem de erro exibida no popup, painel ou console (DevTools).

**Nunca inclua sua API Key** em uma issue, print de tela ou log.

## Como propor uma mudança

1. Faça um fork do repositório.
2. Crie uma branch a partir de `main`: `git checkout -b minha-mudanca`.
3. Faça suas alterações. O projeto é feito em JavaScript puro (sem framework), como uma extensão Manifest V3.
4. Teste manualmente carregando a extensão em modo desenvolvedor (`chrome://extensions`).
5. Abra um Pull Request explicando o que foi alterado e por quê.

## Estilo de código

- Sem dependências externas em produção — mantenha assim sempre que possível.
- Priorize funções pequenas e nomes descritivos.
- Nunca commite chaves de API, tokens ou credenciais reais.
