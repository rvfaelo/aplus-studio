import {PURPOSE_LABELS} from './generation-policy.js';

// Independent polling: the editor can be inert without hiding generation state.
// This module never changes product forms, drafts or approval.
export function mountGenerationMonitor(send) {
  const panel=document.createElement('section');
  panel.className='generation-monitor'; panel.hidden=true;
  panel.setAttribute('aria-label','Progresso e histórico da geração');
  panel.innerHTML='<div class="generation-heading"><strong data-gen="title">Geração</strong><button type="button" data-gen="cancel" hidden>Cancelar geração</button></div><p data-gen="stage" role="status" aria-live="polite"></p><p data-gen="time" class="muted"></p><details><summary>Histórico local de desempenho</summary><p class="muted">Sucesso significa resposta validada, não uma nota de persuasão. O automático prioriza resultados já validados, alterna provedores e coloca modelos lentos ou inválidos em pausa temporária. Nenhum texto ou chave é registrado aqui.</p><ul data-gen="history"></ul></details>';
  document.querySelector('body > header').after(panel);
  const el=name=>panel.querySelector(`[data-gen="${name}"]`);
  let timer,disposed=false,lastHistory='',lastStage='';
  el('cancel').onclick=async()=>{
    el('cancel').disabled=true;
    try {await send('generationCancel');}
    catch {el('stage').textContent='Não foi possível cancelar. Confira a conexão com a extensão.';}
    finally {el('cancel').disabled=false;}
  };
  async function poll() {
    let running=false;
    try {
      const {progress,history=[]}=await send('generationStatus');
      if (disposed) return;
      panel.hidden=!progress && !history.length;
      running=progress?.status==='running';
      const jobStatus=document.getElementById('jobStatus');
      if (running && jobStatus) jobStatus.textContent=`Gerando · ${PURPOSE_LABELS[progress.purpose]||'conteúdo'}`;
      panel.dataset.state=progress?.status||'idle';
      el('cancel').hidden=!running;
      el('title').textContent=progress ? `${PURPOSE_LABELS[progress.purpose]||'Geração'} · ${running?'em andamento':progress.status==='done'?'concluída':progress.status==='cancelled'?'cancelada':'interrompida'}` : 'Desempenho dos modelos';
      const stage=progress ? [progress.model,progress.attempt?`Modelo ${progress.attempt}`:'',progress.stage,progress.reason].filter(Boolean).join(' · ') : '';
      if (stage!==lastStage) {el('stage').textContent=stage;lastStage=stage;}
      const elapsed=progress?Math.max(0,Math.round(((running?Date.now():progress.updatedAt)-progress.startedAt)/1000)):0;
      const budget=progress?Math.round((progress.deadlineAt-progress.startedAt)/1000):0;
      el('time').textContent=progress?`${elapsed}s decorridos · limite total ${budget}s${running?` · até ${Math.max(0,budget-elapsed)}s restantes`:''}`:'';
      const signature=JSON.stringify(history);
      if (signature!==lastHistory) {
        lastHistory=signature; el('history').replaceChildren();
        for (const record of history) {
          const row=document.createElement('li');
          const pause=Number(record.cooldownUntil||0)>Date.now()?` · em pausa até ${new Date(record.cooldownUntil).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}`:'';
          row.textContent=`${record.model} · ${PURPOSE_LABELS[record.purpose]||record.purpose}: ${record.successes} sucesso(s), ${record.failures} falha(s) · ${record.averageMs?`média quando validou ${Math.round(record.averageMs/1000)}s`:'ainda não teve resposta validada'} · ${record.lastReason||''}${pause}`;
          el('history').append(row);
        }
        if (!history.length) {const row=document.createElement('li');row.textContent='O histórico será formado com suas próximas gerações.';el('history').append(row);}
      }
    } catch { /* Existing connection UI owns errors. No repeated toast on polling. */ }
    if (!disposed) timer=setTimeout(poll,running?700:1500);
  }
  void poll();
  window.addEventListener('pagehide',()=>{disposed=true;clearTimeout(timer);},{once:true});
}
