const clean = (value, max = 18000) => String(value ?? "").normalize("NFC")
  .replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, " ")
  .replace(/\s+/g, " ").trim().slice(0, max);

const fold = value => clean(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

export const STRATEGY_MODES = Object.freeze({
  auto: {label: "Automática recomendada", direction: "Equilibre emoção, clareza e prova factual. Dê prioridade ao que mais ajuda este cliente a decidir."},
  emotional: {label: "Mais emocional", direction: "Destaque a transformação desejada e o alívio no cotidiano, sempre ligados a fatos comprovados."},
  practical: {label: "Mais prática", direction: "Destaque facilidade, rotina, uso e ganho prático. Use emoção apenas como consequência concreta."},
  technical: {label: "Mais técnica", direction: "Dê prioridade a materiais, medidas, funcionamento, compatibilidade e critérios de compra correta."},
  premium: {label: "Mais premium", direction: "Use linguagem refinada e segura, valorizando acabamento, experiência e atenção aos detalhes comprovados."},
  conservative: {label: "Mais segura e conservadora", direction: "Prefira precisão, limites de uso e prevenção de compra errada. Evite qualquer inferência dispensável."},
  custom: {label: "Personalizada", direction: "Siga a direção personalizada informada pelo usuário sem contrariar os fatos do produto."}
});

const sharedAngles = Object.freeze([
  {module: "Banner principal", angle: "Transformação principal", objective: "Abrir com a mudança mais valiosa que o produto pode trazer ao momento de uso."},
  {module: "Quatro imagens · Imagem 1", angle: "Dor principal", objective: "Reconhecer o incômodo do cliente e ligar uma característica real à solução."},
  {module: "Quatro imagens · Imagem 2", angle: "Facilidade no cotidiano", objective: "Mostrar como o produto se encaixa na rotina sem repetir a promessa principal."},
  {module: "Quatro imagens · Imagem 3", angle: "Prova concreta", objective: "Transformar material, construção ou detalhe comprovado em benefício compreensível."},
  {module: "Quatro imagens · Imagem 4", angle: "Situação de uso", objective: "Apresentar um contexto real de uso sustentado pelos dados do produto."},
  {module: "Duas imagens · Imagem 1", angle: "Como funciona", objective: "Explicar o uso com clareza e reduzir o esforço de imaginar o produto em ação."},
  {module: "Duas imagens · Imagem 2", angle: "Objeção de compra", objective: "Responder à dúvida que mais pode impedir a decisão, usando somente informação comprovada."},
  {module: "Banner final", angle: "Recompensa emocional", objective: "Fechar com o sentimento ou resultado cotidiano desejado, sem pedir a compra."},
  {module: "FAQ", angle: "Segurança da decisão", objective: "Responder dúvidas específicas sobre uso, compatibilidade, cuidados e o que está incluído."},
  {module: "Especificações", angle: "Compra correta", objective: "Organizar fatos técnicos e medidas para evitar expectativa errada e devolução."}
]);

const templates = {
  infantil: {
    label: "Infantil e bebê", buyer: "Pais, responsáveis e familiares que querem cuidar da criança com mais tranquilidade",
    pain: "Insegurança sobre conforto, uso correto e adequação do produto à rotina da criança",
    desire: "Sentir que a rotina pode ficar mais tranquila, confortável e bem preparada",
    objections: "Faixa etária, segurança, supervisão, material, medidas, modo de uso e itens inclusos",
    keywords: ["bebe", "infantil", "crianca", "recem nascido", "maternidade", "amamentacao", "fralda", "berco", "cadeirinha"],
    checklist: [
      ["Faixa etária", ["idade", "meses", "anos", "faixa etaria"], "Ajuda o responsável a saber se o produto é adequado para a criança."],
      ["Material", ["material", "algodao", "nylon", "plastico", "silicone", "espuma", "esponja", "aco"], "Apoia a avaliação de conforto, cuidado e durabilidade."],
      ["Dimensões", ["dimens", "medida", "altura", "largura", "comprimento", "profundidade", " cm", " mm"], "Evita dúvida de tamanho, encaixe ou espaço necessário."],
      ["Orientação de segurança", ["segur", "cuidado", "atencao", "nao usar", "restricao"], "Esclarece limites e condições de uso sem criar promessas."],
      ["Itens inclusos", ["inclui", "acompanha", "conteudo da embalagem", "itens inclusos", "unidade"], "Deixa claro o que chega na embalagem."],
      ["Modo ou local de uso", ["modo de uso", "como usar", "instal", "encaix", "uso", "aviao", "carro", "casa"], "Reduz incerteza sobre instalação e rotina."],
      ["Necessidade de supervisão", ["supervis", "adulto", "responsavel", "acompanh"], "Ajuda a comunicar o uso responsável quando aplicável."]
    ],
    angles: ["Conforto percebido", "Rotina mais tranquila", "Uso responsável", "Praticidade para a família"]
  },
  pet: {
    label: "Pet", buyer: "Tutores que procuram bem-estar para o animal e praticidade para cuidar",
    pain: "Dificuldade de manter conforto, cuidado ou organização na rotina com o animal",
    desire: "Cuidar melhor com menos atrito no dia a dia",
    objections: "Porte, espécie, material, medidas, limpeza, resistência e modo de uso",
    keywords: ["pet", "cachorro", "cao", "gato", "felino", "canino", "animal", "coleira", "comedouro", "areia"],
    checklist: [
      ["Animal ou porte indicado", ["cao", "cachorro", "gato", "felino", "canino", "porte", "animal"], "Evita escolher uma opção inadequada ao animal."],
      ["Material", ["material", "nylon", "algodao", "plastico", "silicone", "aco"], "Ajuda a avaliar conforto, resistência e cuidado."],
      ["Dimensões ou capacidade", ["dimens", "medida", "altura", "largura", "comprimento", "capacidade", "litro", " cm"], "Facilita conferir tamanho e adequação."],
      ["Limpeza e conservação", ["lav", "limp", "higien", "conserv"], "Responde uma dúvida frequente de manutenção."],
      ["Modo de uso", ["modo de uso", "como usar", "ajust", "encaix", "instal"], "Ajuda o tutor a imaginar a rotina real."],
      ["Itens inclusos", ["inclui", "acompanha", "conteudo da embalagem", "unidade"], "Evita expectativa errada sobre a embalagem."]
    ],
    angles: ["Bem-estar do animal", "Cuidado mais simples", "Adequação ao porte", "Higiene e manutenção"]
  },
  eletronico: {
    label: "Eletrônicos e informática", buyer: "Pessoas que querem a função certa com compatibilidade e desempenho claros",
    pain: "Receio de incompatibilidade, instalação difícil ou desempenho abaixo do esperado",
    desire: "Usar a tecnologia com confiança e sem retrabalho",
    objections: "Compatibilidade, conexão, alimentação, dimensões, desempenho, instalação e itens inclusos",
    keywords: ["usb", "bluetooth", "wifi", "eletronico", "eletrica", "voltagem", "watt", "carregador", "cabo", "fone", "mouse", "teclado", "monitor"],
    checklist: [
      ["Compatibilidade", ["compativ", "android", "ios", "windows", "mac", "modelo"], "É decisiva para evitar uma compra que não funciona no equipamento."],
      ["Conexões", ["usb", "bluetooth", "wifi", "hdmi", "conector", "porta"], "Esclarece como o produto se comunica ou conecta."],
      ["Alimentação e potência", ["volt", "watt", "mah", "bateria", "alimentacao", "carreg"], "Ajuda a confirmar energia e autonomia quando aplicável."],
      ["Desempenho", ["velocidade", "resolucao", "frequencia", "potencia", "desempenho"], "Dá base objetiva para a decisão."],
      ["Dimensões", ["dimens", "medida", "altura", "largura", "comprimento", " cm", " mm"], "Ajuda a conferir espaço e instalação."],
      ["Itens inclusos", ["inclui", "acompanha", "conteudo da embalagem", "unidade"], "Evita expectativa incorreta sobre cabos e acessórios."]
    ],
    angles: ["Compatibilidade sem dúvida", "Desempenho comprovado", "Instalação clara", "Recursos úteis"]
  },
  moda: {
    label: "Moda e acessórios", buyer: "Pessoas que buscam aparência, conforto e adequação à ocasião",
    pain: "Dúvida sobre caimento, tamanho, material e como a peça ficará no uso real",
    desire: "Sentir-se confortável e bem apresentado na ocasião escolhida",
    objections: "Tamanho, medidas, material, composição, ajuste, cor e cuidados",
    keywords: ["vestido", "camisa", "camiseta", "calca", "saia", "blusa", "tenis", "sapato", "bolsa", "roupa", "tecido", "moda", "casaco", "bermuda", "short", "bone", "boina", "chapeu", "meia"],
    checklist: [
      ["Material ou composição", ["material", "composicao", "algodao", "poliester", "elastano", "couro", "tecido"], "Ajuda a antecipar toque, conforto e cuidado."],
      ["Tamanhos e medidas", ["tamanho", "medida", "busto", "cintura", "quadril", " cm"], "Reduz a chance de escolher o tamanho errado."],
      ["Ajuste ou modelagem", ["ajuste", "modelagem", "caimento", "elastico", "regulavel"], "Ajuda a visualizar o caimento."],
      ["Cor ou acabamento", ["cor", "acabamento", "estampa"], "Alinha expectativa visual."],
      ["Cuidados de lavagem", ["lav", "sec", "passar", "cuidado"], "Orienta conservação da peça."],
      ["Ocasião de uso", ["ocasiao", "casual", "festa", "trabalho", "esporte", "dia a dia"], "Conecta a peça ao momento de compra."]
    ],
    angles: ["Como faz sentir", "Caimento e conforto", "Versatilidade", "Detalhes e acabamento"]
  },
  saude: {
    label: "Saúde e suplementos", buyer: "Pessoas que procuram informação objetiva para uma escolha responsável",
    pain: "Dúvida sobre composição, modo de uso e adequação à própria rotina",
    desire: "Tomar uma decisão informada e incorporar o produto com segurança",
    objections: "Composição, quantidade, dose informada, restrições, modo de uso e responsável técnico",
    keywords: ["suplemento", "vitamina", "capsula", "comprimido", "dose", "saude", "ortoped", "fisioter", "hospitalar"],
    checklist: [
      ["Composição", ["composicao", "ingrediente", "formula", "material"], "Dá a base factual principal para avaliação."],
      ["Quantidade", ["quantidade", "capsula", "comprimido", "ml", "grama", "unidade"], "Esclarece o conteúdo recebido."],
      ["Modo de uso informado", ["modo de uso", "recomendacao de uso", "dose", "utilizar"], "Ajuda a entender a rotina sem prescrever."],
      ["Restrições e cuidados", ["restricao", "cuidado", "advertencia", "nao utilizar"], "Favorece comunicação responsável."],
      ["Registro ou certificação", ["anvisa", "registro", "certific"], "Apoia confiança somente quando há informação comprovada."],
      ["Dimensões ou ajuste", ["dimens", "medida", "tamanho", "ajust", " cm"], "É essencial para produtos de apoio ou uso corporal."]
    ],
    angles: ["Decisão informada", "Uso responsável", "Composição transparente", "Rotina prática"]
  },
  ferramenta: {
    label: "Ferramentas e uso profissional", buyer: "Pessoas que precisam executar uma tarefa com precisão, resistência e menos retrabalho",
    pain: "Perder tempo com ferramenta inadequada, frágil ou incompatível com o serviço",
    desire: "Trabalhar com confiança e obter um resultado consistente",
    objections: "Aplicação, material, medidas, capacidade, compatibilidade, alimentação e itens inclusos",
    keywords: ["ferramenta", "furadeira", "parafusadeira", "chave", "alicate", "broca", "serra", "oficina", "profissional"],
    checklist: [
      ["Aplicação indicada", ["aplicacao", "indicado", "uso", "serve para"], "Mostra se a ferramenta atende ao serviço."],
      ["Material", ["material", "aco", "carbono", "metal", "borracha"], "Ajuda a avaliar resistência e adequação."],
      ["Medidas ou capacidade", ["dimens", "medida", "capacidade", " mm", " cm", "polegada"], "Evita incompatibilidade com a tarefa."],
      ["Compatibilidade", ["compativ", "encaixe", "mandril", "modelo"], "Confirma uso com outros componentes."],
      ["Potência ou alimentação", ["volt", "watt", "bateria", "manual", "pneumatic"], "Esclarece como a ferramenta opera."],
      ["Itens inclusos", ["inclui", "acompanha", "kit", "pecas", "unidade"], "Define o que estará disponível para o trabalho."]
    ],
    angles: ["Resultado do trabalho", "Precisão", "Resistência comprovada", "Compatibilidade"]
  },
  esporte: {
    label: "Esporte e fitness", buyer: "Pessoas que querem manter a atividade com conforto, constância e equipamento adequado",
    pain: "Dificuldade de treinar ou praticar com conforto e segurança na rotina",
    desire: "Sentir-se preparado para praticar com mais constância",
    objections: "Modalidade, nível, ajuste, material, medidas, capacidade e cuidados",
    keywords: ["fitness", "academia", "treino", "esporte", "corrida", "ciclismo", "yoga", "musculacao", "exercicio"],
    checklist: [
      ["Modalidade ou uso", ["treino", "esporte", "corrida", "ciclismo", "yoga", "exercicio", "uso"], "Conecta o produto à atividade correta."],
      ["Material", ["material", "borracha", "nylon", "aco", "espuma"], "Ajuda a avaliar conforto e resistência."],
      ["Medidas e ajuste", ["dimens", "medida", "tamanho", "ajust", " cm"], "Permite conferir adequação ao corpo ou espaço."],
      ["Capacidade ou resistência", ["capacidade", "suporta", "kg", "resistencia"], "Dá um critério objetivo quando comprovado."],
      ["Cuidados", ["lav", "limp", "cuidado", "conserv"], "Ajuda a manter o equipamento."],
      ["Itens inclusos", ["inclui", "acompanha", "kit", "unidade"], "Evita dúvida sobre acessórios."]
    ],
    angles: ["Constância na prática", "Conforto no movimento", "Ajuste correto", "Praticidade antes e depois"]
  },
  automotivo: {
    label: "Automotivo", buyer: "Motoristas que querem encaixe correto, confiança e praticidade no veículo",
    pain: "Receio de comprar uma peça incompatível ou difícil de instalar",
    desire: "Resolver a necessidade do veículo com segurança e sem retrabalho",
    objections: "Modelo e ano, compatibilidade, posição, medidas, material, instalação e itens inclusos",
    keywords: ["automotivo", "carro", "veiculo", "moto", "motocicleta", "volante", "painel", "porta malas", "parachoque"],
    checklist: [
      ["Veículos compatíveis", ["compativ", "veiculo", "carro", "moto", "modelo", "ano"], "Evita a principal causa de compra errada."],
      ["Posição ou aplicação", ["dianteir", "traseir", "lado", "aplicacao", "porta malas", "painel"], "Confirma onde a peça será usada."],
      ["Dimensões", ["dimens", "medida", "altura", "largura", "comprimento", " cm", " mm"], "Ajuda a conferir encaixe."],
      ["Material", ["material", "aco", "plastico", "borracha", "aluminio"], "Apoia avaliação de construção."],
      ["Instalação", ["instal", "encaix", "fixacao", "parafuso"], "Reduz dúvida sobre montagem."],
      ["Itens inclusos", ["inclui", "acompanha", "kit", "unidade"], "Deixa claro o conteúdo recebido."]
    ],
    angles: ["Compatibilidade", "Encaixe e instalação", "Confiança no uso", "Construção comprovada"]
  },
  viagem: {
    label: "Viagem e portáteis", buyer: "Pessoas que querem levar o necessário com menos volume e mais praticidade",
    pain: "Desconforto, excesso de volume ou dificuldade de organizar o trajeto",
    desire: "Viajar com mais leveza, organização e tranquilidade",
    objections: "Peso, dimensões aberto e fechado, portabilidade, compatibilidade, restrições e itens inclusos",
    keywords: ["viagem", "viajar", "portatil", "mala", "bagagem", "aviao", "aeroporto", "dobravel"],
    checklist: [
      ["Peso", ["peso", " kg", "gramas"], "Ajuda a avaliar transporte e bagagem."],
      ["Dimensões", ["dimens", "medida", "altura", "largura", "comprimento", " cm"], "Permite estimar espaço e encaixe."],
      ["Tamanho aberto e fechado", ["aberto", "fechado", "dobrado", "dobravel", "compacto"], "Mostra o ganho real de portabilidade."],
      ["Compatibilidade ou local de uso", ["compativ", "aviao", "carro", "mala", "assento", "uso"], "Evita levar algo inadequado ao trajeto."],
      ["Restrições e cuidados", ["restricao", "cuidado", "companhia aerea", "nao usar"], "Ajuda no planejamento responsável."],
      ["Itens inclusos", ["inclui", "acompanha", "bolsa", "unidade"], "Esclarece o que será levado."]
    ],
    angles: ["Trajeto mais tranquilo", "Portabilidade", "Organização", "Uso durante a viagem"]
  },
  beleza: {
    label: "Beleza e cuidados pessoais", buyer: "Pessoas que querem um cuidado agradável, simples e adequado à própria rotina",
    pain: "Dúvida sobre composição, aplicação e resultado que pode ser esperado com responsabilidade",
    desire: "Sentir-se bem cuidado com uma rotina mais prazerosa",
    objections: "Composição, tipo de pele ou cabelo, quantidade, modo de uso, fragrância e cuidados",
    keywords: ["cosmetico", "beleza", "pele", "cabelo", "shampoo", "creme", "serum", "maquiagem", "perfume", "hidratante"],
    checklist: [
      ["Composição ou ativos", ["composicao", "ingrediente", "ativo", "formula"], "Dá sustentação aos benefícios permitidos."],
      ["Indicação", ["pele", "cabelo", "indicado", "tipo"], "Ajuda a pessoa a avaliar adequação."],
      ["Quantidade", [" ml", " g", "grama", "quantidade", "unidade"], "Esclarece o volume recebido."],
      ["Modo de uso", ["modo de uso", "aplicar", "utilizar", "uso"], "Facilita incorporar o produto à rotina."],
      ["Fragrância ou acabamento", ["fragrancia", "aroma", "acabamento", "textura"], "Ajuda a antecipar a experiência sensorial."],
      ["Cuidados e restrições", ["cuidado", "advertencia", "evitar", "restricao"], "Favorece uso responsável."]
    ],
    angles: ["Ritual de cuidado", "Experiência sensorial", "Aplicação simples", "Adequação à rotina"]
  },
  casa: {
    label: "Casa, organização e decoração", buyer: "Pessoas que querem uma casa mais funcional, organizada e agradável",
    pain: "Desordem, falta de espaço ou uma tarefa doméstica que consome tempo",
    desire: "Perceber o ambiente mais leve, funcional e sob controle",
    objections: "Dimensões, capacidade, material, montagem, limpeza, locais de uso e itens inclusos",
    keywords: ["casa", "cozinha", "banheiro", "quarto", "sala", "organizador", "decoracao", "armario", "prateleira", "tapete", "mesa"],
    checklist: [
      ["Dimensões", ["dimens", "medida", "altura", "largura", "comprimento", "profundidade", " cm"], "Permite conferir se cabe no ambiente."],
      ["Material", ["material", "plastico", "madeira", "metal", "aco", "tecido"], "Ajuda a avaliar aparência, limpeza e resistência."],
      ["Capacidade", ["capacidade", "litro", "suporta", "quantidade"], "Mostra quanto o produto comporta quando aplicável."],
      ["Locais de uso", ["cozinha", "banheiro", "quarto", "sala", "armario", "ambiente"], "Ajuda a imaginar o produto no espaço."],
      ["Limpeza", ["lav", "limp", "higien", "pano"], "Responde uma dúvida prática do cotidiano."],
      ["Montagem ou instalação", ["montag", "instal", "encaix", "fixacao"], "Reduz incerteza antes da compra."],
      ["Itens inclusos", ["inclui", "acompanha", "kit", "unidade"], "Evita expectativa incorreta sobre peças."]
    ],
    angles: ["Ambiente transformado", "Organização visível", "Rotina simplificada", "Uso em diferentes espaços"]
  },
  generic: {
    label: "Produto geral", buyer: "Pessoas que procuram resolver uma necessidade prática com informação clara",
    pain: "Dúvida sobre o que o produto faz, como é usado e se atende à necessidade",
    desire: "Escolher com confiança e perceber utilidade real no cotidiano",
    objections: "Finalidade, material, medidas, modo de uso, compatibilidade e itens inclusos",
    keywords: [],
    checklist: [
      ["Finalidade", ["serve para", "indicado", "funcao", "uso"], "Explica o problema que o produto resolve."],
      ["Material", ["material", "plastico", "metal", "aco", "tecido", "silicone", "nylon"], "Dá base para avaliar construção e cuidado."],
      ["Dimensões", ["dimens", "medida", "altura", "largura", "comprimento", " cm", " mm"], "Ajuda a confirmar tamanho e espaço."],
      ["Modo de uso", ["modo de uso", "como usar", "instal", "encaix", "aplicar"], "Reduz incerteza sobre a utilização."],
      ["Compatibilidade", ["compativ", "modelo", "serve em", "indicado para"], "Evita compra inadequada quando aplicável."],
      ["Itens inclusos", ["inclui", "acompanha", "conteudo da embalagem", "kit", "unidade"], "Define o que será recebido."]
    ],
    angles: ["Problema resolvido", "Uso simples", "Prova factual", "Escolha segura"]
  }
};

export const PRODUCT_TEMPLATES = Object.freeze(Object.fromEntries(Object.entries(templates)
  .map(([id, template]) => [id, Object.freeze({...template})])));

function sourceText({title = "", description = "", facts = []}) {
  return [title, description, ...(Array.isArray(facts) ? facts.filter(item => item?.confirmed !== false && clean(item?.value))
    .flatMap(item => [item?.field, item?.value]) : [])].filter(Boolean).join(" ");
}

function containsTerm(text, term) {
  const target = fold(term);
  if (!target) return false;
  const words = text.split(" ");
  if (target.includes(" ")) return ` ${text} `.includes(` ${target} `);
  return words.some(word => word === target || (target.length >= 5 && word.startsWith(target)));
}

export function detectProductTemplate(input = {}) {
  const requested = clean(input.config?.templateMode || input.templateMode, 40);
  if (requested && requested !== "auto" && PRODUCT_TEMPLATES[requested]) return requested;
  const text = fold(sourceText(input));
  // Categorias sensíveis vencem contextos secundários. Um item infantil para
  // viagem, por exemplo, precisa do checklist infantil antes do checklist de bagagem.
  if (PRODUCT_TEMPLATES.infantil.keywords.some(keyword => containsTerm(text, keyword))) return "infantil";
  if (PRODUCT_TEMPLATES.saude.keywords.some(keyword => containsTerm(text, keyword))) return "saude";
  let winner = "generic", best = 0;
  for (const [id, template] of Object.entries(PRODUCT_TEMPLATES)) {
    if (id === "generic") continue;
    const score = template.keywords.reduce((total, keyword) => total + (containsTerm(text, keyword) ? 1 : 0), 0);
    if (score > best) { winner = id; best = score; }
  }
  return winner;
}

function checklistFor(template, text) {
  const haystack = fold(text);
  return template.checklist.map(([field, aliases, reason]) => {
    const matches = aliases.filter(alias => containsTerm(haystack, alias));
    return {field, found: matches.length > 0, evidence: matches.slice(0, 3).join(", "), reason};
  });
}

export function buildSalesStrategy(input = {}) {
  const category = detectProductTemplate(input);
  const template = PRODUCT_TEMPLATES[category] || PRODUCT_TEMPLATES.generic;
  const requestedMode = clean(input.config?.strategyMode || input.strategyMode, 40);
  const mode = STRATEGY_MODES[requestedMode] ? requestedMode : "auto";
  const customDirection = mode === "custom" ? clean(input.config?.customStrategy || input.customStrategy, 800) : "";
  const focus = template.angles;
  const angles = sharedAngles.map((item, index) => ({...item,
    categoryFocus: focus[index % focus.length]
  }));
  const checklist = checklistFor(template, sourceText(input));
  return {
    category, categoryLabel: template.label, detectedAutomatically: clean(input.config?.templateMode || "auto") === "auto",
    mode, modeLabel: STRATEGY_MODES[mode].label,
    direction: customDirection || STRATEGY_MODES[mode].direction,
    buyer: template.buyer, pain: template.pain, desire: template.desire, objections: template.objections,
    angles, checklist, missingFields: checklist.filter(item => !item.found).map(item => item.field)
  };
}

export function strategyPrompt(strategy) {
  if (!strategy) return "";
  const angleLines = (strategy.angles || []).map(item =>
    `- ${item.module}: ${item.angle}; foco da categoria: ${item.categoryFocus}; objetivo: ${item.objective}`).join("\n");
  const missing = (strategy.missingFields || []).join(", ") || "nenhuma lacuna detectada";
  return `ESTRATÉGIA DE VENDA DEFINIDA AUTOMATICAMENTE
Categoria/modelo de produto: ${strategy.categoryLabel}
Estilo: ${strategy.modeLabel}. ${strategy.direction}
Comprador provável: ${strategy.buyer}
Dor provável a reconhecer com cautela: ${strategy.pain}
Desejo emocional: ${strategy.desire}
Objeções a tratar quando houver fatos: ${strategy.objections}
Informações ainda não detectadas: ${missing}

FUNÇÃO DE CADA MÓDULO
${angleLines}

Use esta estratégia como direção criativa, não como fonte factual. Nenhuma dor, desejo, objeção ou situação pode virar alegação objetiva sem apoio no título ou na descrição.`;
}

export function compactSalesStrategy(strategy) {
  if (!strategy) return null;
  return {
    category: strategy.category, categoryLabel: strategy.categoryLabel, detectedAutomatically: strategy.detectedAutomatically,
    mode: strategy.mode, modeLabel: strategy.modeLabel, direction: strategy.direction,
    buyer: strategy.buyer, pain: strategy.pain, desire: strategy.desire, objections: strategy.objections,
    angles: (strategy.angles || []).map(({module, angle, categoryFocus, objective}) => ({module, angle, categoryFocus, objective}))
  };
}
