import { initFirebase } from "./firebase.js";
import { initListFeature, updateProgressRing } from "./features/list.js";
import { initRecipesFeature } from "./features/recipes.js";
import { initStoresFeature } from "./features/stores.js";

/* ===== Composer (bottom sheet) ===== */
function openComposer() {
  const composer = document.getElementById('composer');
  if (!composer) return;
  composer.classList.add('open');
  document.body.classList.add('modal-open');
  document.dispatchEvent(new Event('composer:open'));
}
function closeComposer() {
  const composer = document.getElementById('composer');
  if (!composer) return;
  composer.classList.remove('open');
  document.body.classList.remove('modal-open');
  document.dispatchEvent(new Event('composer:close'));
}

/* ===== Global Undo Snackbar API used by list.js ===== */
(function(){
  const host = () => document.getElementById('snackbar');
  let timer = null;

  function clear(){
    if (!host()) return;
    host().innerHTML = '';
    if (timer) { clearTimeout(timer); timer = null; }
  }

  function show(label, onUndo){
    clear();

    const bar = document.createElement('div');
    bar.className = 'snackbar';

    const txt = document.createElement('div');
    txt.className = 'snackbar__label';
    txt.textContent = label || 'Actie uitgevoerd';

    const btn = document.createElement('button');
    btn.className = 'snackbar__btn';
    btn.type = 'button';
    btn.textContent = 'Ongedaan maken';

    btn.addEventListener('click', async () => {
      clear();
      try { await onUndo?.(); } catch (e) { console.warn('Undo failed', e); }
    });

    bar.appendChild(txt);
    bar.appendChild(btn);
    host()?.appendChild(bar);

    // auto-hide
    timer = setTimeout(clear, 3000);
  }

  // expose
  window.GrocifyUndo = { show };
})();

/* ===== Bottom Sheet Controller (Composer) ===== */
const Composer = (() => {
  let root, panel, scrim, closeBtn;

  function open(){ openComposer(); root?.setAttribute('aria-hidden', 'false'); }
  function close(){ closeComposer(); root?.setAttribute('aria-hidden', 'true'); }

  function wire(){
    root = document.getElementById('composer');
    panel = document.querySelector('#composer .sheet__panel');
    scrim = document.getElementById('sheetScrim');
    closeBtn = document.getElementById('sheetClose');
    if(!root || !panel) return;
    scrim?.addEventListener('click', close);
    closeBtn?.addEventListener('click', close);
    panel?.addEventListener('touchmove', (e) => e.stopPropagation(), { passive: true });
  }

  return { open, close, wire };
})();

// Wire FAB early
document.addEventListener('DOMContentLoaded', () => {
  Composer.wire();
  const fab = document.getElementById('fabAdd');
  fab?.addEventListener('click', () => {
    if (document.body.classList.contains('modal-open')) {
      Composer.close();
    } else {
      Composer.open();
    }
  });
  document.addEventListener('composer:request-close', () => Composer.close());
});

  /* ===== Tabs Router ===== */
  function initRouter(){
    const TABS = ["list","recipes","stores"];
    const DEFAULT_TAB = "list";
    const STORAGE_KEY = "ui-active-tab";

    const pages = {
      list:    document.getElementById("tab-list"),
      recipes: document.getElementById("tab-recipes"),
      stores:  document.getElementById("tab-stores"),
    };
    const buttons = {
      list:    document.querySelectorAll('#tabbtn-list'),
      recipes: document.querySelectorAll('#tabbtn-recipes'),
      stores:  document.querySelectorAll('#tabbtn-stores'),
    };

    function setActive(name){
      Object.entries(pages).forEach(([k,el]) => el?.classList.toggle("active", k===name));

      // there are two sets of tab buttons (top + bottom), select all
      Object.entries(buttons).forEach(([k,nodeList]) => nodeList.forEach(btn => {
        btn?.setAttribute("aria-selected", String(k===name));
        btn?.setAttribute("tabindex", k===name ? "0" : "-1");
      }));
      localStorage.setItem(STORAGE_KEY, name);
      location.hash = `#/${name}`;
      updateProgressRing();
    }

    function syncFromHash(){
      const hash = (location.hash || "").replace(/^#\//,'');
      const tab = TABS.includes(hash) ? hash : (localStorage.getItem(STORAGE_KEY) || DEFAULT_TAB);
      setActive(tab);
    }

    // Wire both sets of buttons (top + bottom)
    Object.entries(buttons).forEach(([name,nodeList]) => nodeList.forEach(btn => {
      btn?.addEventListener("click", () => setActive(name));
      btn?.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setActive(name); }
      });
    }));

    window.addEventListener("hashchange", syncFromHash);
    syncFromHash();
  }

  /* ===== App boot ===== */
  window.addEventListener("DOMContentLoaded", async () => {
    const panel = document.querySelector('#composer .sheet__panel');

    await initFirebase();
    initRouter();

    // Pull-to-close on mobile
    let startY = null, dragging = false;
    panel && panel.addEventListener('touchstart', (e) => {
      if (panel.scrollTop <= 0) { dragging = true; startY = e.touches[0].clientY; }
    }, { passive: true });
    panel && panel.addEventListener('touchmove', (e) => {
      if (!dragging || startY == null) return;
      const dy = e.touches[0].clientY - startY;
      if (dy > 40 && panel.scrollTop <= 0) { closeComposer(); dragging = false; startY = null; }
    }, { passive: true });
    panel && panel.addEventListener('touchend', () => { dragging = false; startY = null; });

  /* === Overflow (⋮) bottom-sheet wiring === */
  const overflowWrap  = document.querySelector('.tabbar .overflow');
  const overflowBtn   = document.getElementById('overflowBtn');
  const overflowPanel = document.getElementById('overflowPanel');

  function closeOverflow(){
    if (!overflowWrap) return;
    document.body.classList.remove('overflow-open');
    overflowBtn?.setAttribute('aria-expanded','false');
    document.removeEventListener('click', onDocClick, true);
    document.removeEventListener('keydown', onEsc, true);
  }
  function onDocClick(e){
    // Close when clicking anywhere outside the panel or the trigger
    if (!overflowWrap.contains(e.target)) closeOverflow();
  }
  function onEsc(e){ if (e.key === 'Escape') closeOverflow(); }

  overflowBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();

    const isOpen = document.body.classList.contains('overflow-open');
    if (isOpen) { closeOverflow(); return; }

    document.body.classList.add('overflow-open');
    overflowBtn.setAttribute('aria-expanded','true');

    // defer global listeners to avoid immediate close
    setTimeout(() => {
      document.addEventListener('click', onDocClick, true);
      document.addEventListener('keydown', onEsc, true);
      // focus first action
      overflowPanel?.querySelector('button')?.focus();
    }, 0);
  });
  overflowBtn?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); overflowBtn.click(); }
  });

  /* Integrated FAB inside panel → open composer */
  document.getElementById('fabInOverflow')?.addEventListener('click', () => {
    closeOverflow();
    // Use your existing composer open function
    const evt = new Event('composer:open-request');
    document.dispatchEvent(evt);
    // or directly call Composer.open() if it's in scope:
    if (typeof Composer !== 'undefined' && Composer.open) Composer.open();
  });

  /* Ingredients action */
  document.getElementById('miManageIngredients')?.addEventListener('click', async () => {
    closeOverflow();
    const mod = await import('./features/items.js');
    mod.openItemsManagerDialog?.();
  });

  // Open Winkels from overflow (no tab button needed)
  document.getElementById('miStores')?.addEventListener('click', () => {
    closeOverflow();
    // route to the stores page; the router will pick it up
    location.hash = '#/stores';
  });

  // Features
  initListFeature();
  initRecipesFeature();
  initStoresFeature({
    onActiveStoreChanged(){
      if (typeof window.renderList === "function") window.renderList();
    }
  });
});
