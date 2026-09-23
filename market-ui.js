import {MARKET_TOOLS, normalizeMarketWorkspace, mergeCompetitors, marketReportText, marketSignature, unitPrice} from './market-intelligence.js';

const $=id=>document.getElementById(id);
const element=(tag,text,className='')=>{const node=document.createElement(tag);node.textContent=text;node.className=className;return node;};
const currency=value=>value===null?'—':value.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
export function mountMarketWorkspace({current,changed,save,send,run,toast}) {
  let tool='research';
  const fields={query:'marketQuery',goal:'marketGoal',evidence:'marketEvidence',constraints:'marketConstraints',targetPrice:'marketPrice',feePct:'marketFee',fixedCosts:'marketCosts'};
  const collectRows=type=>[...$(type==='competitors'?'marketCompetitors':'marketInventory').querySelectorAll('tr[data-row]')].map(row=>{
    const result=JSON.parse(row.dataset.metadata||'{}');
    for(const input of row.querySelectorAll('[data-field]')) result[input.dataset.field]=input.value;
    return result;
  });
  function collect(project=current()) {
    const workspace=normalizeMarketWorkspace(project?.market);
    return normalizeMarketWorkspace({...workspace,model:$('marketModel').value||workspace.model,activeTool:tool,
      draft:{...workspace.draft,...Object.fromEntries(Object.entries(fields).map(([key,id])=>[key,$(id).value])),
        competitors:collectRows('competitors'),inventory:collectRows('inventory')}});
  }
  function mark() {changed();updateUnitPrices();showStale();}
  function row(type,data,index) {
    const tr=document.createElement('tr');tr.dataset.row='';tr.dataset.metadata=JSON.stringify(data);
    const columns=type==='competitors'?[['title','Produto'],['asin','ASIN'],['price','Preço total (R$)'],['quantity','Quantidade'],['notes','Características e observações']]:
      [['sku','SKU'],['name','Item'],['stock','Estoque'],['cost','Custo unitário (R$)']];
    for(const [key,label] of columns){
      const td=document.createElement('td'),input=document.createElement(key==='notes'?'textarea':'input');
      input.dataset.field=key;input.value=data[key]??'';input.setAttribute('aria-label',`${label} ${index+1}`);
      input.maxLength=key==='notes'?3000:key==='title'?500:key==='name'?300:80;
      if(['price','quantity','stock','cost'].includes(key)){input.type='number';input.min='0';input.step=['quantity','stock'].includes(key)?'1':'0.01';}
      if(key==='notes')input.rows=2;
      input.addEventListener('input',mark);td.append(input);tr.append(td);
    }
    if(type==='competitors'){
      const unit=element('td','—');unit.dataset.unitPrice='';tr.append(unit);
      const source=element('td','');
      if(data.url){const link=element('a','Fonte');link.href=data.url;link.target='_blank';link.rel='noopener noreferrer';source.append(link);}
      else source.append(element('span','Manual'));
      source.append(element('small',[data.capturedAt?new Date(data.capturedAt).toLocaleString('pt-BR'):'',data.rating,data.reviews].filter(Boolean).join(' · ')));
      tr.append(source);
    }
    const td=document.createElement('td'),remove=element('button','×');remove.type='button';remove.title='Remover item';remove.setAttribute('aria-label',`Remover item ${index+1}`);
    remove.onclick=()=>{tr.remove();mark();};td.append(remove);tr.append(td);return tr;
  }
  function rows(type,values){$(type==='competitors'?'marketCompetitors':'marketInventory').replaceChildren(...values.map((value,index)=>row(type,value,index)));}
  function updateUnitPrices(){
    const values=collect().draft.competitors;
    [...$('marketCompetitors').querySelectorAll('[data-unit-price]')].forEach((cell,index)=>cell.textContent=currency(unitPrice(values[index])));
  }
  function showStale(){
    const project=current(),report=project?.market?.reports?.[tool];
    $('marketStale').hidden=!report || report.inputSignature===marketSignature({...project,market:collect(project)},tool);
  }
  function report(){
    const result=current()?.market?.reports?.[tool];
    $('marketReport').textContent=result?marketReportText(result,tool):'Nenhum relatório gerado para esta ferramenta.';
    $('marketCopy').disabled=!result;$('marketExport').disabled=!result;showStale();
  }
  function switchTool(next){
    tool=Object.hasOwn(MARKET_TOOLS,next)?next:'research';
    for(const button of document.querySelectorAll('[data-market-tool]')){
      const selected=button.dataset.marketTool===tool;button.classList.toggle('active',selected);button.setAttribute('aria-pressed',String(selected));
    }
    $('marketToolTitle').textContent=MARKET_TOOLS[tool];
    $('marketGenerate').textContent={research:'Pesquisar oportunidade',competitors:'Comparar concorrentes',bundles:'Planejar kits'}[tool];
    $('marketKitInputs').hidden=tool!=='bundles';report();
  }
  function render(project){
    const value=normalizeMarketWorkspace(project.market);
    $('marketProductName').textContent=project.title||project.asin||'Produto sem título';
    $('marketModel').value=value.model;
    for(const [key,id] of Object.entries(fields))$(id).value=value.draft[key]??'';
    rows('competitors',value.draft.competitors);rows('inventory',value.draft.inventory);
    switchTool(value.activeTool);updateUnitPrices();
  }
  async function tabs(){
    try{
      const previous=$('marketTab').value,values=await send('marketTabs');
      $('marketTab').replaceChildren(new Option(values.length?'Selecione uma aba…':'Nenhuma busca ou anúncio aberto',''),...values.map(tab=>new Option(tab.title,String(tab.id))));
      if(values.some(tab=>String(tab.id)===previous))$('marketTab').value=previous;
      else if(values.length===1)$('marketTab').value=String(values[0].id);
      $('marketCapture').disabled=!$('marketTab').value;
    }catch(error){toast(error.message,true);}
  }
  for(const id of [...Object.values(fields),'marketModel'])$(id).addEventListener('input',mark);
  for(const button of document.querySelectorAll('[data-market-tool]'))button.onclick=()=>{switchTool(button.dataset.marketTool);mark();};
  for(const [id,type] of [['marketAddCompetitor','competitors'],['marketAddInventory','inventory']])$(id).onclick=()=>{
    const values=collect().draft[type];if(values.length>=20)return toast('Limite de 20 itens por pesquisa.',true);
    rows(type,[...values,{}]);mark();
  };
  $('marketRefreshTabs').onclick=tabs;
  $('marketTab').onchange=()=>$('marketCapture').disabled=!$('marketTab').value;
  $('marketOpenSearch').onclick=async()=>{
    const query=$('marketQuery').value.trim()||current()?.title;
    if(!query)return toast('Informe o produto ou termo de pesquisa.',true);
    try{await save(false);await chrome.tabs.create({url:`https://www.amazon.com.br/s?k=${encodeURIComponent(query)}`});await tabs();}
    catch(error){toast(error.message,true);}
  };
  $('marketCapture').onclick=async()=>{
    const projectId=current()?.id;
    $('marketCapture').disabled=true;
    try{
      const data=await send('marketCapture',{tabId:Number($('marketTab').value)});
      if(current()?.id!==projectId)throw Error('O produto selecionado mudou. Capture novamente no produto desejado.');
      const values=mergeCompetitors(collect().draft.competitors,data.rows);rows('competitors',values);mark();await save(false);
      toast(`${data.rows.length} anúncio(s) lido(s); ${values.length} na amostra. Confira preços e quantidades.`);
    }catch(error){toast(error.message,true);}finally{$('marketCapture').disabled=!$('marketTab').value;}
  };
  $('marketGenerate').onclick=()=>run(tool);
  $('marketSave').onclick=async()=>{try{await save(false);toast('Pesquisa salva neste produto.');}catch(error){toast(error.message,true);}};
  $('marketCopy').onclick=async()=>{
    try{await navigator.clipboard.writeText(marketReportText(current()?.market?.reports?.[tool],tool));toast('Relatório copiado.');}
    catch{toast('Não foi possível copiar o relatório.',true);}
  };
  $('marketExport').onclick=()=>{
    const text=marketReportText(current()?.market?.reports?.[tool],tool);if(!text)return;
    const url=URL.createObjectURL(new Blob(['\ufeff'+text],{type:'text/plain;charset=utf-8'})),link=document.createElement('a');
    link.href=url;link.download=`${current()?.asin||'produto'}-${tool}.txt`;link.click();setTimeout(()=>URL.revokeObjectURL(url),2000);
  };
  return {collect,render,tabs};
}
