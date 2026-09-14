// Regras compartilhadas pelo popup, pelo worker e pelos testes. Sem dependências.
export const DEFAULTS = Object.freeze({model: "auto/economico", faqCount: 5, specCount: 6});

export function settings(input = {}) {
  const integer = (value, fallback, max) => Number.isInteger(Number(value)) &&
    Number(value) >= 1 && Number(value) <= max ? Number(value) : fallback;
  const model = String(input.model || DEFAULTS.model).trim();
  if (!/^[a-zA-Z0-9._:/-]{1,100}$/.test(model)) throw new Error("Informe um nome de modelo válido.");
  return {model, faqCount: integer(input.faqCount, 5, 6), specCount: integer(input.specCount, 6, 15)};
}

export function isSellerURL(value) {
  try {
    const u = new URL(value);
    // Lista explícita: rejeita amazon.com.evil.example e subdomínios parecidos.
    return u.protocol === "https:" &&
      /^sellercentral\.amazon\.(com\.br|com|ca|com\.mx|co\.uk|de|fr|it|es|nl|se|pl|com\.be|ie|co\.jp|in|com\.au|sg|ae|sa|com\.tr|co\.za)$/.test(u.hostname);
  } catch { return false; }
}

export function makeSlots(options = {}, pageLimits = {}) {
  const cfg = settings(options);
  const slots = [];
  const add = (key, label, limit, module, role, optional = false) => {
    const detected = Number(pageLimits[key]);
    slots.push({key, label, limit: Number.isInteger(detected) && detected > 0
      ? Math.min(limit, detected) : limit, module, role, optional});
  };
  add("hero_headline", "1. Imagem completa · Headline", 80, "hero", "headline");
  add("hero_body", "1. Imagem completa · Corpo", 300, "hero", "body");
  for (let i = 1; i <= 4; i++) {
    add(`four_${i}_headline`, `2. Quatro imagens · Imagem ${i} · Headline`, 30, "four", "headline");
    add(`four_${i}_body`, `2. Quatro imagens · Imagem ${i} · Corpo`, 150, "four", "body");
  }
  for (let i = 1; i <= 2; i++) {
    add(`two_${i}_headline`, `3. Duas imagens · Imagem ${i} · Headline`, 50, "two", "headline");
    add(`two_${i}_body`, `3. Duas imagens · Imagem ${i} · Corpo`, 300, "two", "body");
  }
  for (let i = 1; i <= cfg.faqCount; i++) {
    add(`faq_${i}_question`, `4. FAQ · Pergunta ${i}`, 120, "faq", "question", true);
    add(`faq_${i}_answer`, `4. FAQ · Resposta ${i}`, 250, "faq", "answer", true);
  }
  add("closing_headline", "5. Imagem completa · Headline", 80, "closing", "headline");
  add("closing_body", "5. Imagem completa · Corpo", 300, "closing", "body");
  if (options.includeSpecsHeading) {
    const cap = Number.isInteger(Number(pageLimits.specs_heading)) && Number(pageLimits.specs_heading) > 0
      ? Number(pageLimits.specs_heading) : "Especificações técnicas".length;
    const fixedText = ["Especificações técnicas", "Ficha técnica", "Dados", "Info"].find(t => t.length <= cap) || "";
    add("specs_heading", "6. Especificações · Título do módulo", cap, "specs", "module_heading", true);
    slots.at(-1).fixedText = fixedText;
  }
  for (let i = 1; i <= cfg.specCount; i++) {
    add(`specs_${i}_name`, `6. Especificação ${i} · Nome`, 30, "specs", "name", true);
    add(`specs_${i}_value`, `6. Especificação ${i} · Definição`, 500, "specs", "value", true);
  }
  return slots;
}

export function buildSchema(slots) {
  return {
    type: "object", additionalProperties: false,
    properties: {
      texts: {
        type: "object", additionalProperties: false,
        properties: Object.fromEntries(slots.map(s => [s.key, {
          type: "string", ...(typeof s.fixedText === "string" ? {enum: [s.fixedText]} : {}),
          description: `${s.label}. Máximo ${s.limit} caracteres.${s.optional && s.fixedText === undefined ? " Use uma formulação geral sustentada pelo tipo e finalidade do produto quando faltarem detalhes técnicos; nunca invente fatos." : ""}`
        }])),
        required: slots.map(s => s.key)
      },
      notes: {type: "array", items: {type: "string"}}
    },
    required: ["texts", "notes"]
  };
}

// Aceita `source` (título e descrição originais) para cruzar os números do
// texto com os números da descrição e avisar sobre possíveis invenções.
export function normalizeAndValidate(raw, slots, source = {title: "", description: ""}) {
  const texts = {};
  const issues = [];
  const notes = Array.isArray(raw?.notes) ? raw.notes.filter(n => typeof n === "string")
    .slice(0, 20).map(n => n.replace(/[\u2013\u2014]/g, ", ").slice(0, 700)) : [];
  if (!raw?.texts || typeof raw.texts !== "object" || Array.isArray(raw.texts)) {
    return {texts, notes, issues: ["Resposta sem o objeto texts."]};
  }
  for (const s of slots) {
    if (typeof s.fixedText === "string") { texts[s.key] = s.fixedText; continue; }
    if (typeof raw.texts[s.key] !== "string") { issues.push(`${s.key}: texto ausente.`); continue; }
    const t = raw.texts[s.key].normalize("NFC")
      .replace(/\s*[\u2013\u2014]\s*/g, ", ")
      .replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, " ")
      .replace(/\s+/g, " ").trim();
    texts[s.key] = t;
    if (!t && !s.optional) issues.push(`${s.key}: campo obrigatório vazio.`);
    if (t.length > s.limit) issues.push(`${s.key}: ${t.length} caracteres; máximo ${s.limit}.`);
    if (/[<>]/.test(t)) issues.push(`${s.key}: remova HTML e sinais de marcação.`);
    if (/(https?:\/\/|www\.)/i.test(t)) issues.push(`${s.key}: remova links externos.`);
  }

  // A Amazon não precisa receber marcadores de ausência. Quando o modelo usa
  // um deles em uma especificação, deixa o par inteiro realmente vazio.
  const emptyMarker = value => /^(?:n[ãa]o\s+(?:especificad[oa]|informad[oa]|fornecid[oa]|dispon[ií]vel|aplic[aá]vel|consta(?:\s+na\s+descri[cç][ãa]o)?)|n[ãa]o\s+se\s+aplica|sem\s+informa[cç][ãa]o|desconhecid[oa]|a\s+confirmar|n\/?a|nd|-)\.?$/i.test(String(value || "").trim());
  for (const s of slots.filter(slot => slot.role === "name")) {
    const valueKey = s.key.replace(/_name$/, "_value");
    if (emptyMarker(texts[s.key]) || emptyMarker(texts[valueKey])) {
      texts[s.key] = "";
      texts[valueKey] = "";
    }
  }

  const fold = value => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9.,]+/g, " ").trim();
  // Altura, largura, profundidade, comprimento e medidas complementares ficam
  // em uma única linha. Ex.: 32 × 32 × 10 cm; alças: 52 cm.
  const specPairs = slots.filter(slot => slot.role === "name").map(slot => ({
    nameKey: slot.key, valueKey: slot.key.replace(/_name$/, "_value")
  }));
  const dimensionWord = /\b(altura|largura|profundidade|comprimento|dimensoes?|medidas?|tamanho|diametro|espessura)\b/;
  const dimensional = specPairs.filter(pair => texts[pair.nameKey] && texts[pair.valueKey] && dimensionWord.test(fold(texts[pair.nameKey])));
  if (dimensional.length) {
    const target = dimensional[0];
    const general = dimensional.find(pair => /\b(dimensoes?|medidas?|tamanho)\b/.test(fold(texts[pair.nameKey])));
    const axes = dimensional.filter(pair => /^(altura|largura|profundidade|comprimento)$/.test(fold(texts[pair.nameKey])));
    const scalar = axes.map(pair => /^\s*(\d+(?:[.,]\d+)?)\s*(mm|cm|m)\s*$/i.exec(texts[pair.valueKey]));
    let main = "";
    const used = new Set();
    if (general) {
      main = texts[general.valueKey];
      used.add(general.nameKey);
    } else if (axes.length >= 2 && scalar.every(Boolean) && scalar.every(match => match[2].toLowerCase() === scalar[0][2].toLowerCase())) {
      main = `${scalar.map(match => match[1]).join(" × ")} ${scalar[0][2]}`;
      axes.forEach(pair => used.add(pair.nameKey));
    }
    const extras = dimensional.filter(pair => !used.has(pair.nameKey)).map(pair =>
      `${texts[pair.nameKey]}: ${texts[pair.valueKey]}`);
    const combined = [main, ...extras].filter(Boolean).join("; ").slice(0, 500);
    dimensional.forEach(pair => { texts[pair.nameKey] = ""; texts[pair.valueKey] = ""; });
    texts[target.nameKey] = "Dimensões";
    texts[target.valueKey] = combined;

    // Medidas também não devem reaparecer escondidas em campos como "Design".
    const measurement = /\b\d+(?:[.,]\d+)?(?:\s*[x×]\s*\d+(?:[.,]\d+)?){1,3}\s*(?:mm|cm|m)?\b|\b\d+(?:[.,]\d+)?\s*(?:mm|cm|m)\b/gi;
    for (const pair of specPairs.filter(pair => pair.nameKey !== target.nameKey && texts[pair.valueKey])) {
      const without = texts[pair.valueKey].replace(measurement, "").replace(/\s*[,;/]\s*$/g, "").replace(/\s{2,}/g, " ").trim();
      if (without !== texts[pair.valueKey]) {
        texts[pair.valueKey] = without;
        if (!without) texts[pair.nameKey] = "";
      }
    }
  }

  // Depois de remover marcadores vazios ou juntar medidas, as
  // especificações podem ficar com "buracos" (ex.: 1 vazia, 3 preenchida).
  // Compacta os pares restantes para a Amazon receber a ficha em sequência.
  const remainingSpecs = specPairs
    .map(pair => ({name: texts[pair.nameKey] || "", value: texts[pair.valueKey] || ""}))
    .filter(pair => pair.name && pair.value);
  specPairs.forEach((pair, index) => {
    const next = remainingSpecs[index];
    texts[pair.nameKey] = next?.name || "";
    texts[pair.valueKey] = next?.value || "";
  });

  for (const s of slots.filter(s => s.role === "question" || s.role === "name")) {
    const other = s.key.replace(/_(question|name)$/, s.role === "question" ? "_answer" : "_value");
    if (Boolean(texts[s.key]) !== Boolean(texts[other])) issues.push(`${s.key} / ${other}: preencha os dois ou deixe ambos vazios.`);
  }
  // Números no texto que não aparecem na descrição.
  const digits = text => String(text || "").match(/\b\d+(?:[.,]\d+)?\b/g) || [];
  const sourceNumbers = new Set(digits(`${source.title || ""} ${source.description || ""}`)
    .map(n => n.replace(",", ".")));
  const seen = new Set();
  for (const s of slots) {
    if (!texts[s.key]) continue;
    for (const n of digits(texts[s.key])) {
      const key = n.replace(",", ".");
      if (sourceNumbers.has(key) || seen.has(key)) continue;
      seen.add(key);
      notes.push(`Confira: o número "${n}" não aparece na descrição do produto. Se foi um erro, ajuste antes de publicar.`);
    }
  }
  return {texts, notes, issues};
}

export function generationInstructions(slots) {
  return `Você escreve conteúdo Amazon A+ Premium em português do Brasil.
Responda APENAS com um objeto JSON válido no formato { "texts": { ... }, "notes": [ ... ] }.

ORDEM OBRIGATÓRIA DE PRIORIDADE:
1. Fidelidade aos dados fornecidos.
2. Compra correta e prevenção de devoluções.
3. Clareza, confiança e conversão.
4. SEO natural, sem comprometer os itens anteriores.

SEO NO A+:
- Repita naturalmente o nome correto do produto e use de 2 a 4 termos relevantes que já estejam no título ou na descrição.
- Nunca acrescente uma variação, categoria, tamanho, finalidade ou nível de qualidade somente para capturar buscas.
- Não transforme os módulos em lista de palavras-chave e não faça repetição artificial de termos.
- O título, os atributos e os termos de busca do anúncio fazem o trabalho principal de SEO. O A+ deve ajudar o cliente a entender e decidir com segurança.

ADAPTAÇÃO AO PRODUTO (leia antes de escrever):
Identifique pelo título e pela descrição:
- O tipo de produto (pet, eletrônico, moda, suplemento, ferramenta, infantil, cosmético, casa, esporte, automotivo, etc.).
- Quem compra e por quê (presente, reposição, primeira compra, uso profissional).
Ajuste o tom de acordo com o que identificou:
- Pet: caloroso e tranquilizador. Fale do bem-estar do animal e do dia a dia de quem cuida.
- Eletrônico e informática: técnico e específico. Números, compatibilidades e desempenho convencem.
- Moda, decoração e casa: sensorial. Toque, caimento, ambiente, ocasião de uso.
- Suplemento e saúde: factual e sóbrio. Ingrediente e dose; sem promessa terapêutica.
- Ferramenta e uso profissional: comparativo e prático. Durabilidade, precisão, o que substitui.
- Infantil e bebê: segurança primeiro. Material, certificação, faixa de idade.
- Esporte e fitness: resultado e rotina. O que a pessoa consegue fazer com o produto.
- Automotivo: compatibilidade e confiança. Aplicação, encaixe, uso no dia a dia.
- Genérico ou ambíguo: direto e claro, sem inventar categoria.
Na primeira linha de notes, registre a categoria identificada: "Categoria identificada: pet".

REGRA MAIS IMPORTANTE — ANCORAGEM FACTUAL:
Todo fato do texto tem que vir literalmente da descrição fornecida.
- Números, medidas, doses, idades, capacidades e quantidades só podem vir da descrição. Nunca estime, nunca arredonde, nunca aproxime.
- Se a descrição não tem um número, escreva sem número. "Alta capacidade" em vez de "3 litros" se a descrição não menciona litros.
- Materiais, certificações, compatibilidades e itens inclusos também só podem vir da descrição.
- Na dúvida entre usar um fato incerto ou não usar, não use. Deixe o texto mais curto.

REGRAS DE ESCRITA:
- Tom persuasivo, claro e conversacional. Fale diretamente com o cliente.
- Foque em benefícios concretos e resultados práticos (o que o produto resolve ou melhora).
- Inclua naturalmente as palavras-chave e termos de busca presentes no título e na descrição.
- Use frases curtas, verbos ativos e linguagem fácil de ler.
- Cada módulo deve destacar um benefício ou uso diferente. Evite repetir as mesmas ideias.
- Priorize clareza e desejo de compra, sem exageros ou promessas vazias.
- Explique, quando os dados existirem, medidas, compatibilidade, contexto de uso, limitações e itens inclusos. Essas informações evitam compras erradas.

PROIBIDO:
- Travessão, emojis, HTML, Markdown, links, preços, descontos, avaliações ou superlativos absolutos.
- Inventar números, medidas, doses, idades, capacidades ou quantidades.
- Inventar materiais, certificações, compatibilidades, acessórios, garantia ou resultados de saúde/segurança.
- Mencionar garantia, prazo de troca, assistência técnica ou suporte pós-venda. A loja não oferece esses serviços.
- Transformar hipóteses em fatos.
- Mencionar a categoria explicitamente no texto (nada de "este produto de pet").
- Pedir compra ou avaliação no último banner.

ESTRUTURA DOS MÓDULOS:
- Banner inicial (hero): apresente o produto e o principal benefício de forma impactante.
- Quatro blocos: mostre 4 benefícios ou usos distintos e concretos.
- Dois blocos maiores: explique uso prático e praticidade no dia a dia.
- Banner final: feche com um benefício complementar ou reforço de valor (sem call-to-action de compra).

FAQ (cada linha vale muito):
- Antes de criar a FAQ, identifique o produto exato, sua função e seu contexto de uso a partir do título e da descrição.
- Cada pergunta deve ser específica para ESSE produto. Nunca copie perguntas, objetos, materiais ou contextos de outro tipo de produto.
- Não use os textos destas instruções como perguntas prontas. Escreva tudo do zero com o vocabulário presente nos dados recebidos.
- A pergunta deve soar como o comprador digita na busca, com frase curta, direta e sem rodeio.
- Planeje FAQ e especificações como um conjunto. Pode repetir dados técnicos importantes nas especificações, especialmente medidas, material, quantidade, cor, modelo, capacidade e indicação de uso.
- Priorize na FAQ dúvidas sobre função principal, modo de uso, local de uso, compatibilidade e cuidados, mas só quando a resposta estiver sustentada pelos dados.
- Use medidas, compatibilidade, quantidade ou itens inclusos na FAQ quando forem decisivos para saber se o produto serve. Esses dados também podem aparecer nas especificações quando ajudarem a completar a ficha técnica exigida pela Amazon.
- Se houver poucas informações, crie perguntas gerais porém relevantes ao produto, sobre para que serve, como ajuda no uso e onde é utilizado. Responda apenas com o que o título ou a descrição permitem afirmar.
- Preencha o maior número possível de linhas com essas perguntas gerais factuais. Só deixe uma linha vazia quando nem o título nem a descrição sustentarem uma resposta distinta e verdadeira.
- Nunca complete a quantidade pedida com perguntas de outra categoria. É melhor repetir um ângulo factual do produto de forma útil do que introduzir cama, colchão, aço, roupas, animais ou qualquer outro contexto ausente.

NUNCA mencione garantia, prazo de garantia, troca por defeito ou
assistência técnica. A loja não oferece nenhum desses serviços.

A resposta:
- Começa afirmando o fato, sem "Sim," ou "Não," solto no início.
- Usa somente os números, medidas, materiais e quantidades reais do título ou da descrição. Nunca estima nem arredonda.
- É curta, útil e diretamente ligada à pergunta, sem frase final padronizada de outro produto.
- Se faltarem detalhes, use perguntas gerais específicas ao produto, como finalidade, contexto de uso ou benefício direto já sustentado pelo título e pela descrição. Não invente a resposta.

ESPECIFICAÇÕES:
- Sejam estritamente factuais.
- Use apenas nomes e valores que existam na descrição.
- Preencha todas as informações técnicas comprovadas disponíveis, mesmo que algum dado também apareça na FAQ.
- A prioridade normal é manter dados técnicos nas especificações. FAQ explica dúvidas; especificações organizam a ficha técnica. Medidas, material, quantidade, cor, modelo, capacidade e indicação de uso podem aparecer nos dois módulos quando forem úteis.
- Reúna TODAS as medidas em uma única especificação chamada "Dimensões". Nunca crie linhas separadas para altura, largura, profundidade, comprimento, diâmetro, espessura ou alças.
- Escreva as dimensões de modo compacto, por exemplo "32 × 32 × 10 cm". Medidas complementares entram no mesmo valor, por exemplo "32 × 32 × 10 cm; alças: 52 cm".
- Nunca repita medidas dentro de outra especificação, como "Design: compacto, 32 × 32 × 10 cm". Nesse caso, use somente "Design: compacto".
- É proibido escrever "Não especificado", "Não informado", "N/A", hífen ou qualquer marcador de ausência.
- Quando faltarem dados técnicos, use somente campos gerais comprováveis, como "Produto", "Tipo" ou "Indicação de uso", extraídos do título e da descrição. Não invente material, medida, capacidade ou compatibilidade.

Preencha o maior número possível de linhas com informações gerais verdadeiras e úteis. Só deixe o par vazio quando qualquer preenchimento exigiria invenção.
Todas as chaves devem existir, mesmo quando a string estiver vazia.
Respeite os limites de caracteres abaixo (incluindo espaços e pontuação). Procure ficar abaixo de 90% do limite.
${slots.map(s => `${s.key}: ${s.limit} caracteres`).join("\n")}`;
}
