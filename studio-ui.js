/* Accessibility and in-page navigation only: no storage, API or Amazon writes. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  for (const [selector, dataKey, prefix] of [
    ['.tabs', 'tab', 'tab-'], ['.tool-tabs', 'intelTool', 'intel-']
  ]) {
    const nav = document.querySelector(selector);
    if (!nav) continue;
    nav.setAttribute('role', 'tablist');
    const buttons = [...nav.querySelectorAll('button')];
    const sync = () => {
      for (const button of buttons) {
        const panelId = prefix + button.dataset[dataKey];
        const selected = button.classList.contains('active');
        const tabId = 'nav-' + panelId;
        button.id ||= tabId;
        button.setAttribute('role', 'tab');
        button.setAttribute('aria-controls', panelId);
        button.setAttribute('aria-selected', String(selected));
        button.tabIndex = selected ? 0 : -1;
        const panel = $(panelId);
        if (panel) { panel.setAttribute('role', 'tabpanel'); panel.setAttribute('aria-labelledby', button.id); panel.tabIndex = 0; }
      }
    };
    nav.addEventListener('keydown', event => {
      const index = buttons.indexOf(event.target);
      if (index < 0 || !['ArrowRight','ArrowLeft','Home','End'].includes(event.key)) return;
      event.preventDefault();
      let next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
      if (buttons[next].disabled) return;
      buttons[next].focus(); buttons[next].click();
    });
    const observer = new MutationObserver(sync);
    observer.observe(nav, {subtree:true, attributes:true, attributeFilter:['class']});
    sync();
  }
  const workspaces = [...document.querySelectorAll('[data-workspace]')];
  for (const button of workspaces) {
    const sync = () => button.setAttribute('aria-pressed', String(button.classList.contains('active')));
    new MutationObserver(sync).observe(button, {attributes:true, attributeFilter:['class']}); sync();
  }
  const labelGeneratedFields = root => {
    for (const row of root.querySelectorAll('.text-row')) {
      const area = row.querySelector('textarea');
      const label = row.querySelector('.text-row-head strong');
      if (area && label) area.setAttribute('aria-label', label.textContent);
    }
    for (const row of root.querySelectorAll('.fact-row')) {
      const inputs = row.querySelectorAll('input[type=text]');
      ['Nome do fato','Valor do fato','Origem do fato'].forEach((label,index) => inputs[index]?.setAttribute('aria-label',label));
      row.querySelector('.fact-remove')?.setAttribute('aria-label','Remover fato');
    }
    for (const row of root.querySelectorAll('.project-item')) {
      const name = row.querySelector('.project-open strong')?.textContent || 'produto';
      row.querySelector('.queue-check')?.setAttribute('aria-label',`Selecionar ${name} para geração em lote`);
      row.querySelector('.project-open')?.setAttribute('aria-current',row.classList.contains('active') ? 'true' : 'false');
    }
  };
  for (const id of ['textEditor','facts','projectList']) {
    const root = $(id); if (!root) continue;
    new MutationObserver(() => labelGeneratedFields(root)).observe(root,{childList:true,subtree:true});
    labelGeneratedFields(root);
  }
  const revealAnchor = () => {
    const id = location.hash.slice(1);
    const target = id && $(id); if (!target) return;
    if (target.tagName === 'DETAILS') target.open = true;
    let parent = target.parentElement;
    while (parent) { if (parent.tagName === 'DETAILS') parent.open = true; parent = parent.parentElement; }
    requestAnimationFrame(() => target.scrollIntoView({block:'start'}));
  };
  window.addEventListener('hashchange',revealAnchor);
  document.querySelectorAll('.quick-nav a').forEach(link => link.addEventListener('click', () => setTimeout(revealAnchor,0)));
  revealAnchor();
})();
