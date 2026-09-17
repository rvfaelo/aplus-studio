// O identificador legado é mantido para não quebrar projetos salvos em versões anteriores.
// A interface agora apresenta este modo como "Automático — priorizar qualidade".
export const AUTO_MODEL = "auto/economico";
export const XKIRO_AUTO_QUALITY_MODEL = "xkiro/auto-quality";

export function providerForModel(model) {
  const value=String(model||"");
  if(value===AUTO_MODEL)return "auto";
  if(value.startsWith("openai-api/"))return "openai";
  if(value.startsWith("gemini/"))return "gemini";
  if(value.startsWith("kira/"))return "kira";
  if(value.startsWith("tokenrouter/"))return "kira"; // migração da versão 1.3
  if(value.startsWith("xkiro/"))return "xkiro";
  return "groq";
}

export function modelForRequest(model) {
  const value=String(model||"");
  if(value==="tokenrouter/z-ai/glm-5.3-free")return "glm-5.3-free";
  // xKiro exige o ID completo do catálogo (vendor/model). O prefixo xkiro/
  // existe apenas dentro da extensão para distinguir o provedor.
  return value.replace(/^(?:openai-api|kira|xkiro)\//,"");
}

function modelText(model={}) {
  return `${model.id||""} ${model.display_name||""}`.toLowerCase();
}

// Heurística deliberadamente voltada a QUALIDADE para o catálogo gratuito do xKiro.
// Não usa preço como desempate: o modo automático só considera access_tier=free.
// O catálogo ao vivo continua sendo a fonte de verdade; assim, modelos novos podem
// ser escolhidos sem exigir uma atualização da extensão.
export function xkiroQualityScore(model={}) {
  if(String(model.access_tier||"").toLowerCase()!=="free")return Number.NEGATIVE_INFINITY;
  const text=modelText(model);
  let score=0;
  const context=Number(model.context_length||0), output=Number(model.max_output_tokens||0);
  if(model.capabilities?.reasoning)score+=32;
  if(model.capabilities?.vision)score+=2;
  if(context>=1_000_000)score+=14;else if(context>=250_000)score+=11;else if(context>=128_000)score+=8;else if(context>=64_000)score+=4;
  if(output>=32_000)score+=9;else if(output>=16_000)score+=7;else if(output>=8_000)score+=4;

  if(/\bmax\b/.test(text))score+=24;
  if(/\bpro\b/.test(text))score+=20;
  if(/\bplus\b/.test(text))score+=12;
  if(/\bpreview\b/.test(text))score+=2;
  if(/\bflash\b/.test(text))score+=3;
  if(/\bhighspeed\b|\bturbo\b/.test(text))score-=2;
  if(/\bcoder\b|\bcode\b/.test(text))score-=10; // A+ é redação/planejamento, não programação.
  if(/\bmini\b|\blite\b|\bsmall\b/.test(text))score-=14;

  const sizes=[...text.matchAll(/(?:^|[^\d])(\d{1,3}(?:\.\d+)?)b(?:\b|[^a-z])/g)].map(match=>Number(match[1])).filter(Number.isFinite);
  const size=sizes.length?Math.max(...sizes):0;
  if(size>=100)score+=22;else if(size>=70)score+=18;else if(size>=32)score+=14;else if(size>=20)score+=9;else if(size>0&&size<=10)score-=8;

  // Pequeno desempate para gerações mais recentes quando a família expõe versão no nome.
  const versions=[...text.matchAll(/\b(\d+)\.(\d+)\b/g)].map(match=>Number(match[1])*10+Number(match[2]));
  if(versions.length)score+=Math.min(8,Math.max(...versions)/10);
  return score;
}

export function chooseXkiroQualityModel(models=[]) {
  const free=(Array.isArray(models)?models:[]).filter(item=>String(item?.access_tier||"").toLowerCase()==="free" && String(item?.id||"").includes("/"));
  return free.sort((a,b)=>xkiroQualityScore(b)-xkiroQualityScore(a) || Number(b.context_length||0)-Number(a.context_length||0) || String(a.id).localeCompare(String(b.id)))[0]||null;
}

export function automaticCandidates(purpose="texts") {
  // Qualidade primeiro. Dentro do xKiro, o modelo é escolhido no catálogo ao vivo
  // entre os modelos GRATUITOS, evitando uso pago acidental.
  return purpose==="planning" ? [
    {provider:"openai",model:"openai-api/gpt-5.6-sol"},
    {provider:"xkiro",model:XKIRO_AUTO_QUALITY_MODEL},
    {provider:"groq",model:"openai/gpt-oss-120b"},
    {provider:"kira",model:"kira/glm-5.3-free"},
    {provider:"gemini",model:"gemini/gemini-3.5-flash"},
    {provider:"kira",model:"kira/qwen3.8-flash"},
    {provider:"groq",model:"qwen/qwen3.8-27b"},
    {provider:"openai",model:"openai-api/gpt-5.6-terra"},
    {provider:"openai",model:"openai-api/gpt-5.6-luna"}
  ] : [
    {provider:"openai",model:"openai-api/gpt-5.6-sol"},
    {provider:"xkiro",model:XKIRO_AUTO_QUALITY_MODEL},
    {provider:"groq",model:"openai/gpt-oss-120b"},
    {provider:"kira",model:"kira/glm-5.3-free"},
    {provider:"gemini",model:"gemini/gemini-3.5-flash"},
    {provider:"kira",model:"kira/qwen3.8-flash"},
    {provider:"groq",model:"qwen/qwen3.8-27b"},
    {provider:"openai",model:"openai-api/gpt-5.6-terra"},
    {provider:"openai",model:"openai-api/gpt-5.6-luna"},
    {provider:"groq",model:"openai/gpt-oss-20b"}
  ];
}

export function routesFor(model,keys={},purpose="texts") {
  const provider=providerForModel(model);
  const candidates=provider==="auto"?automaticCandidates(purpose):[{provider,model}];
  return candidates.filter(item=>String(keys[item.provider]||"").trim()).map(item=>({...item,apiKey:String(keys[item.provider]).trim()}));
}
