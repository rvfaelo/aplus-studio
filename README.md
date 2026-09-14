# A+ Studio

Extensão para Chrome (Manifest V3) que organiza, planeja, gera, revisa, aprova e preenche conteúdo A+ da Amazon, com roteamento entre múltiplos provedores de IA (Google Gemini, Groq, DeepSeek e KiraAI).

> Projeto pessoal, mantido de forma independente. Não possui vínculo oficial com a Amazon, Google, Groq ou DeepSeek.

## ✨ Funcionalidades

- **Painel em tela cheia** para trabalhar o fluxo por etapas.
- **Projetos por ASIN**, cada um com ficha factual, textos, briefings de imagem, nota de qualidade e status de aprovação próprios.
- **Geração em massa**: selecione até 50 projetos e gere rascunhos em fila, preservando resultado e erro de cada produto individualmente.
- **Roteamento econômico entre provedores**: Google Gemini, Groq, DeepSeek e KiraAI, com fallback automático caso uma rota falhe ou atinja limite.
- **Chaves de API por provedor**, armazenadas localmente no navegador (nunca no código-fonte).
- **Sincronização opcional e criptografada** das chaves via Chrome Sync, usando AES-GCM com derivação de chave por PBKDF2-SHA-256.
- **Auditoria de catálogo** e validação de conteúdo antes do preenchimento na Seller Central.
- **Preenchimento automatizado** da edição A+ diretamente na Amazon Seller Central (múltiplos marketplaces suportados).

## 🔒 Privacidade e segurança

- Nenhuma chave de API vem embutida na extensão — cada usuário insere e gerencia as suas próprias.
- As chaves ficam salvas em `chrome.storage.local` (armazenamento local do próprio navegador) e, opcionalmente, de forma criptografada em `chrome.storage.sync`.
- O código não envia dados para nenhum servidor além das APIs oficiais dos provedores de IA escolhidos e da própria Amazon (para leitura/preenchimento da página).

## 📦 Instalação (modo desenvolvedor)

1. Baixe ou clone este repositório.
2. Abra `chrome://extensions` no Chrome (ou navegador baseado em Chromium).
3. Ative o **Modo do desenvolvedor** (canto superior direito).
4. Clique em **Carregar sem compactação** e selecione a pasta do projeto.
5. Abra o popup da extensão e configure a chave de API do provedor desejado (Gemini, Groq, DeepSeek ou KiraAI).

## 🧩 Provedores de IA suportados

| Provedor | Observação |
|---|---|
| Google Gemini | Requer chave da Google AI Studio |
| Groq | Requer chave da Groq Cloud |
| DeepSeek | Cobrado por uso da API oficial |
| KiraAI | Modelos gratuitos e econômicos |

Você pode manter chaves de múltiplos provedores salvas simultaneamente; o modo automático escolhe a rota mais econômica disponível.

## 🌎 Marketplaces suportados

Seller Central: Brasil, Estados Unidos, Canadá, México, Reino Unido, Alemanha, França, Itália, Espanha, Holanda, Suécia, Polônia, Bélgica, Irlanda, Japão, Índia, Austrália, Singapura, Emirados Árabes, Arábia Saudita, Turquia e África do Sul.

## 🗂️ Estrutura do projeto

```
├── manifest.json           # Configuração da extensão (Manifest V3)
├── background.js           # Service worker: orquestração, roteamento de IA, fila de geração
├── content.js               # Content script: interação com a página da Amazon
├── content-engine.js        # Motor de preenchimento e leitura da página A+
├── product-page.js          # Extração de dados da página de produto
├── popup.html / popup.js / popup.css     # Interface do popup da extensão
├── dashboard.html / dashboard.js / dashboard.css   # Painel principal em tela cheia
├── panel-connection.js      # Comunicação entre painel e service worker
├── planning.js              # Geração do planejamento (textos + briefings de imagem)
├── openai.js                 # Cliente das APIs de IA (Gemini, Groq, DeepSeek, KiraAI)
├── providers.js             # Mapeamento e seleção de provedores/modelos
├── key-sync.js               # Criptografia e sincronização de chaves via Chrome Sync
├── catalog-audit.js          # Auditoria de catálogo/conteúdo
├── projects.js               # Gestão de projetos por ASIN
├── diagnostics.js            # Diagnóstico e mensagens de erro
├── shared.js                  # Utilitários compartilhados
└── icons/                     # Ícones da extensão
```

## 🤝 Contribuindo

Sugestões, correções e pull requests são bem-vindos. Abra uma *issue* descrevendo o problema ou a melhoria antes de enviar mudanças maiores.

## 📄 Licença

Distribuído sob a licença MIT. Veja [LICENSE](LICENSE) para mais detalhes.
