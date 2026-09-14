# Configurar a Groq no A+ Studio 1.0

1. Acesse [console.groq.com/keys](https://console.groq.com/keys), entre em sua conta e crie uma API Key.
2. Abra o A+ Studio e expanda **API Key da Groq**.
3. Cole a chave e clique em **Aplicar e salvar chave**.
4. Escolha um modelo disponível em sua conta. O padrão da extensão é `openai/gpt-oss-20b`; também há opções prontas e um campo para outro nome de modelo.
5. Use **Analisar produto e criar plano** ou **Gerar e Preencher**.

A disponibilidade, a cota e os limites dependem da sua conta e do modelo escolhido. A extensão mostra erros e, quando a API fornece essa informação, o tempo para nova tentativa.

Se houver falha, abra **Detalhes do erro da API**, copie o diagnóstico e confira o modelo, o status HTTP e a mensagem. O relatório é sanitizado para não incluir a chave.

Esta extensão é uma instalação nova. Mesmo que sua extensão anterior já tenha uma chave salva, aplique a chave novamente no A+ Studio porque o Chrome mantém os dados de cada extensão separados.
