import {AUTO_MODEL, XKIRO_AUTO_QUALITY_MODEL, routesFor, freeTaskScore} from './providers.js';

export const GENERATION_LIMIT_MS = 70000;
export const COMBINED_LIMIT_MS = 140000;
export const MODEL_LIMIT_MS = 45000;
export const PURPOSE_LABELS = {texts:'Textos A+', copy:'Redação comercial', technical:'FAQ e especificações', planning:'Briefings das imagens', returns:'Briefings anti-devolução', analysis:'Análise de avaliações', listing:'Otimização do anúncio', research:'Pesquisa de produtos', competitors:'Análise de concorrentes', bundles:'Planejamento de kits'};

export function abortError(signal) { return signal?.reason instanceof Error ? signal.reason : new Error('Operação cancelada.'); }
export function bounded(operation, signal, milliseconds, message) {
  const controller = new AbortController();
  let rejectAbort;
  const stopped = new Promise((_, reject) => { rejectAbort = reject; });
  const stop = () => { const error = abortError(signal); controller.abort(error); rejectAbort(error); };
  if (signal?.aborted) stop(); else signal?.addEventListener('abort', stop, {once:true});
  const timer = setTimeout(() => { const error = Object.assign(new Error(message), {code:'generation_timeout'}); controller.abort(error); rejectAbort(error); }, Math.max(1, milliseconds));
  return Promise.race([stopped, Promise.resolve().then(() => {
    if (controller.signal.aborted) throw abortError(controller.signal);
    return operation(controller.signal);
  })]).finally(() => { clearTimeout(timer); signal?.removeEventListener('abort', stop); });
}

export function failureReason(error) {
  const status = Number(error?.diagnostic?.httpStatus || 0), code = String(error?.code || '');
  const message = String(error?.message || '');
  if (status === 401 || /invalid_api_key|unauthorized/.test(code)) return 'Chave recusada';
  if (status === 403) return 'Modelo sem acesso nesta chave';
  if (status === 429 || /rate_limit/.test(code)) return 'Limite temporário de uso';
  if (status === 404) return 'Modelo indisponível';
  if (code === 'json_validate_failed') return 'Formato inválido do modelo';
  if (/timeout/.test(code) || /excedeu|demorou/.test(message)) return 'Tempo de espera excedido';
  if (/valida|JSON|json|limite.*resposta/i.test(message)) return 'Resposta não passou na validação';
  if (status >= 500) return 'Falha temporária do provedor';
  if (/cancelad/i.test(message)) return 'Operação cancelada';
  return 'Falha na geração ou conexão'; // Never persist API bodies, prompts or keys.
}

export function historyKey(purpose, model) { return `${purpose}|${model}`; }
export function performanceAdjustment(record, now = Date.now()) {
  if (!record || now - record.updatedAt > 7 * 86400000) return 0;
  const successes = Number(record.successes || 0), failures = Number(record.failures || 0);
  const reliability = (successes + 2) / (successes + failures + 3);
  return reliability * 30 - Math.min(20, Number(record.averageMs || 0) / 2500) - Math.min(45, Number(record.consecutiveFailures || 0) * 15);
}
export function aggregateModelRecord(history, model, now = Date.now()) {
  const records=Object.values(history||{}).filter(record=>record?.model===model && now-Number(record.updatedAt||0)<=7*86400000);
  if(!records.length)return null;
  const successes=records.reduce((sum,row)=>sum+Number(row.successes||0),0);
  const failures=records.reduce((sum,row)=>sum+Number(row.failures||0),0);
  const valid=records.filter(row=>Number(row.averageMs||0)>0&&Number(row.successes||0)>0);
  const weighted=valid.reduce((sum,row)=>sum+Number(row.averageMs)*Number(row.successes||0),0);
  const weights=valid.reduce((sum,row)=>sum+Number(row.successes||0),0);
  const newest=[...records].sort((a,b)=>Number(b.updatedAt||0)-Number(a.updatedAt||0))[0];
  return {model,successes,failures,averageMs:weights?Math.round(weighted/weights):0,
    consecutiveFailures:Number(newest?.consecutiveFailures||0),updatedAt:Number(newest?.updatedAt||0),cooldownUntil:Number(newest?.cooldownUntil||0),lastReason:String(newest?.lastReason||'')};
}
export function modelPerformance(history,purpose,model,now=Date.now()) {
  const exact=history?.[historyKey(purpose,model)],aggregate=aggregateModelRecord(history,model,now);
  return performanceAdjustment(exact,now)+performanceAdjustment(aggregate,now)*.55;
}
export function attemptLimitMs(history,purpose,model,{generalAuto=false,remaining=GENERATION_LIMIT_MS,now=Date.now()}={}) {
  const exact=history?.[historyKey(purpose,model)],aggregate=aggregateModelRecord(history,model,now);
  const average=Number(exact?.averageMs||aggregate?.averageMs||0);
  const lastReason=String(exact?.lastReason||aggregate?.lastReason||'');
  let limit=generalAuto?28000:40000;
  if(average>0)limit=Math.max(14000,Math.min(MODEL_LIMIT_MS,Math.round(average*1.5+5000)));
  if(/Tempo de espera/i.test(lastReason))limit=Math.min(limit,20000);
  return Math.max(1,Math.min(remaining,limit));
}
export function recordResult(history, purpose, model, success, elapsedMs, reason = '', now = Date.now()) {
  const key = historyKey(purpose, model), old = history[key] || {};
  const nextFailures=success?0:Number(old.consecutiveFailures||0)+1;
  const cooldownMs = /Tempo de espera/i.test(reason) ? (nextFailures>=2?86400000:1800000)
    : /Formato inválido|não passou na validação/i.test(reason) ? (nextFailures>=2?86400000:21600000)
    : /Limite temporário|Falha temporária/i.test(reason) ? 600000 : 120000;
  const next = {...history, [key]:{model,purpose,successes:Number(old.successes||0)+(success?1:0),
    failures:Number(old.failures||0)+(success?0:1),
    averageMs:success ? Math.round(old.averageMs ? old.averageMs * .7 + elapsedMs * .3 : elapsedMs) : Number(old.averageMs||0),
    consecutiveFailures:nextFailures,
    cooldownUntil:success?0:now+cooldownMs, lastReason:success?'Resposta validada':reason,updatedAt:now}};
  return Object.fromEntries(Object.entries(next).sort((a,b)=>b[1].updatedAt-a[1].updatedAt).slice(0,120));
}

export async function runAdaptive({model,purpose,keys,history={},signal,deadlineAt=Date.now()+GENERATION_LIMIT_MS,
  catalog,operation,onProgress=()=>{},saveHistory=async()=>{}}) {
  const startedAt = Date.now();
  const auto = [AUTO_MODEL,XKIRO_AUTO_QUALITY_MODEL,'openrouter/auto-free'].includes(model);
  const generalAuto=model===AUTO_MODEL;
  const bases = routesFor(model,keys,purpose);
  if (!bases.length) throw new Error('Cadastre a API Key do provedor selecionado.');
  let current = {status:'running',startedAt,deadlineAt,purpose,stage:'Escolhendo modelo',model:'',attempt:0,reason:''};
  let closed=false;
  const emit = patch => {if(closed)return;current={...current,...patch,updatedAt:Date.now()};onProgress(current);};
  let lastError;
  try {
    return await bounded(async totalSignal => {
      const candidates = [];
      for (const [index, base] of bases.entries()) {
        if (totalSignal.aborted) throw abortError(totalSignal);
        if (base.model === XKIRO_AUTO_QUALITY_MODEL || base.provider === 'openrouter') {
          try {
            emit({stage:'Consultando catálogo gratuito',model:base.provider});
            const models = await bounded(s=>catalog(base.provider,base.apiKey,s),totalSignal,10000,'O catálogo demorou para responder.');
            const automatic = base.model === XKIRO_AUTO_QUALITY_MODEL || base.model === 'openrouter/auto-free';
            const selected = models.filter(item => (automatic || `${base.provider}/${item.id}`===base.model) &&
                (!base.verifiedOnly || base.verifiedModels?.has(`${base.provider}/${item.id}`)))
              .map(item=>({...base,model:`${base.provider}/${item.id}`,metadata:item,quality:freeTaskScore(item,purpose,base.provider)}))
              .filter(item=>Number.isFinite(item.quality)).sort((a,b)=>b.quality-a.quality).slice(0,8);
            candidates.push(...selected);
            if (!selected.length) throw new Error('Nenhum modelo gratuito adequado no catálogo.');
          } catch(error) {
            if (totalSignal.aborted) throw abortError(totalSignal);
            lastError=error;emit({stage:'Catálogo indisponível',reason:failureReason(error)});
          }
        } else candidates.push({...base,quality:55-index});
      }
      if (!candidates.length) throw lastError || new Error('Nenhum modelo gratuito adequado disponível.');
      const now=Date.now();
      if (auto) candidates.sort((a,b)=>{
        const ha=history[historyKey(purpose,a.model)],hb=history[historyKey(purpose,b.model)];
        const coolingA=Number(ha?.cooldownUntil||0)>now,coolingB=Number(hb?.cooldownUntil||0)>now;
        return Number(coolingA)-Number(coolingB) || (b.quality+modelPerformance(history,purpose,b.model,now))-(a.quality+modelPerformance(history,purpose,a.model,now));
      });
      const rejectedProviders=new Set();
      const attemptedProviders=new Set();
      const availableCandidates=auto ? candidates.filter(candidate=>{
        const exact=history[historyKey(purpose,candidate.model)];
        return Number(exact?.cooldownUntil||0)<=now;
      }) : candidates;
      if(!availableCandidates.length)throw Object.assign(new Error('Todos os modelos adequados estão em pausa após falhas recentes. Use Verificar modelos ou aguarde o fim da pausa.'),{code:'models_in_cooldown'});
      let attempts=0;
      for (const candidate of availableCandidates) {
        if (attempts >= (auto?2:1)) break;
        if (rejectedProviders.has(candidate.provider)) continue;
        if (generalAuto && attemptedProviders.has(candidate.provider)) continue;
        if (totalSignal.aborted) throw abortError(totalSignal);
        const remaining=deadlineAt-Date.now();
        if (remaining<=0) throw Object.assign(new Error('Limite total de geração atingido.'),{code:'generation_timeout'});
        attempts++;
        attemptedProviders.add(candidate.provider);
        const attemptStarted=Date.now();
        emit({model:candidate.model,attempt:attempts,stage:'Iniciando geração',reason:attempts>1?current.reason:''});
        try {
          const result=await bounded(async routeSignal=>{
            // No automático, uma falha troca de modelo imediatamente. Repetir a
            // mesma geração costuma apenas consumir o prazo e a cota do provedor.
            routeSignal.generationMaxAttempts=auto?1:2;
            routeSignal.skipRateLimitRetry=auto;
            return operation(candidate.apiKey,candidate.model,message=>{
              if (!routeSignal.aborted) emit({stage:message});
            },routeSignal);
          },totalSignal,auto?attemptLimitMs(history,purpose,candidate.model,{generalAuto,remaining}):remaining,'O modelo excedeu o tempo de espera.');
          history=recordResult(history,purpose,candidate.model,true,Date.now()-attemptStarted);
          await Promise.resolve().then(()=>saveHistory(history)).catch(()=>{});
          emit({status:'done',stage:'Etapa concluída',reason:'Resposta validada'});
          return result;
        } catch(error) {
          if (signal?.aborted) throw abortError(signal);
          lastError=error;
          const reason=failureReason(error);
          history=recordResult(history,purpose,candidate.model,false,Date.now()-attemptStarted,reason);
          await Promise.resolve().then(()=>saveHistory(history)).catch(()=>{});
          const status=Number(error?.diagnostic?.httpStatus||0);
          if ([401,402,429].includes(status)) rejectedProviders.add(candidate.provider);
          emit({stage:'Tentativa não concluída',reason});
          if (totalSignal.aborted) throw abortError(totalSignal);
        }
      }
      throw lastError || new Error('Nenhum modelo respondeu com conteúdo válido.');
    },signal,deadlineAt-Date.now(),'Limite total de geração atingido. Os conteúdos já salvos foram preservados.');
  } catch(error) {
    emit({status:signal?.aborted?'cancelled':'error',stage:failureReason(error),reason:failureReason(error)});
    throw error;
  } finally {closed=true;}
}
