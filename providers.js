export const AUTO_MODEL = "auto/economico";
export function providerForModel(model) {
  const value=String(model||"");
  if(value===AUTO_MODEL)return "auto";
  if(value.startsWith("openai-api/"))return "openai";
  if(value.startsWith("gemini/"))return "gemini";
  if(value.startsWith("kira/"))return "kira";
  if(value.startsWith("tokenrouter/"))return "kira"; // migração da versão 1.3
  if(value.startsWith("deepseek/"))return "deepseek";
  return "groq";
}
export function modelForRequest(model) {
  const value=String(model||"");
  if(value==="tokenrouter/z-ai/glm-5.3-free")return "glm-5.3-free";
  return value.replace(/^(?:openai-api|kira|deepseek)\//,"");
}
export function automaticCandidates(purpose="texts") {
  return purpose==="planning" ? [
    {provider:"openai",model:"openai-api/gpt-5.6-luna"},
    {provider:"kira",model:"kira/glm-5.3-free"},
    {provider:"kira",model:"kira/qwen3.8-flash"},
    {provider:"gemini",model:"gemini/gemini-3.5-flash"},
    {provider:"groq",model:"openai/gpt-oss-120b"},
    {provider:"groq",model:"openai/gpt-oss-20b"},
    {provider:"deepseek",model:"deepseek/deepseek-flash"}
  ] : [
    {provider:"openai",model:"openai-api/gpt-5.6-luna"},
    {provider:"kira",model:"kira/glm-5.3-free"},
    {provider:"kira",model:"kira/qwen3.8-flash"},
    {provider:"gemini",model:"gemini/gemini-3.5-flash-lite"},
    {provider:"groq",model:"openai/gpt-oss-20b"},
    {provider:"gemini",model:"gemini/gemini-3.5-flash"},
    {provider:"deepseek",model:"deepseek/deepseek-flash"}
  ];
}
export function routesFor(model,keys={},purpose="texts") {
  const provider=providerForModel(model);
  const candidates=provider==="auto"?automaticCandidates(purpose):[{provider,model}];
  return candidates.filter(item=>String(keys[item.provider]||"").trim()).map(item=>({...item,apiKey:String(keys[item.provider]).trim()}));
}
