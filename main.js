import { initFirebase } from "./firebase.js";
import { initListFeature } from "./features/list.js";
import { initRecipesFeature } from "./features/recipes.js";
import { initStoresFeature } from "./features/stores.js";

function openComposer() {
  const composer = document.getElementById('composer');
  if (!composer) return;
  composer.classList.add('open');
  document.body.classList.add('modal-open');

  // let features/list.js refresh suggestions/chips, etc.
  document.dispatchEvent(new Event('composer:open'));
}

function closeComposer() {
  const composer = document.getElementById('composer');
  if (!composer) return;
  composer.classList.remove('open');
  document.body.classList.remove('modal-open');
}

// MVP STEP-1: Simple global Undo snackbar utility
(function(){
  const SNACK_ID = 'snackbar';
  function ensureHost(){
    let el = document.getElementById(SNACK_ID);
    if(!el){
      el = document.createElement('div');
      el.id = SNACK_ID;
      document.body.appendChild(el);
    }
    return el;
  }
  let timer = null;
  window.GrocifyUndo = {
    show(label, onUndo){
      const host = ensureHost();
      host.innerHTML = '';
      const bar = document.createElement('div');
      bar.className = 'snackbar';
      const msg = document.createElement('span');
      msg.className = 'snackbar__label';
      msg.textContent = label;
      const btn = document.createElement('button');
      btn.className = 'snackbar__btn';
      btn.textContent = 'Ongedaan maken';
      btn.addEventListener('click', async () => {
        clearTimeout(timer);
        timer = null;
        host.innerHTML = '';
        try{ await onUndo?.(); }catch(e){ console.error('Undo failed', e); }
      });
      bar.appendChild(msg);
      bar.appendChild(btn);
      host.appendChild(bar);
      clearTimeout(timer);
      timer = setTimeout(()=> { host.innerHTML = ''; }, 3000);
    }
  };
})();

// ===== Bottom Sheet Controller (STEP-2/3) =====
const Composer = (() => {
  let root, panel, scrim, input, closeBtn;

  function ensure() {
    root = root || document.getElementById('composer');
    if (!root) return null;
    panel = root.querySelector('.sheet__panel');
    scrim = root.querySelector('.sheet__scrim');
    input = document.getElementById('addInput');
    closeBtn = document.getElementById('sheetClose');
    return root;
  }

  function open() {
    if (!ensure()) return;
    root.classList.add('open');
    // Small delay to allow paint before focusing
    setTimeout(() => {
      input?.focus();
      // STEP-3: let others refresh suggestions on open
      document.dispatchEvent(new CustomEvent('composer:open'));
    }, 50);
    window.addEventListener('keydown', onKey);
  }

  function close() {
    if (!ensure()) return;
    root.classList.remove('open');
    window.removeEventListener('keydown', onKey);
    document.getElementById('fabAdd')?.focus();
  }

  function onKey(e) {
    if (e.key === 'Escape') close();
  }

  function wire() {
    if (!ensure()) return;
    scrim?.addEventListener('click', close);
    closeBtn?.addEventListener('click', close);
    panel?.addEventListener('touchmove', (e) => e.stopPropagation(), { passive: true });
  }

  return { open, close, wire };
})();

// After Composer.wire() and the FAB binding from Step 2/3:
document.addEventListener('DOMContentLoaded', () => {
  Composer.wire();
  const fab = document.getElementById('fabAdd');
  fab?.addEventListener('click', () => Composer.open());

  // STEP-7: allow other modules to request a close
  document.addEventListener('composer:request-close', () => Composer.close());
});

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
    list:    document.getElementById("tabbtn-list"),
    recipes: document.getElementById("tabbtn-recipes"),
    stores:  document.getElementById("tabbtn-stores"),
  };

  function setActive(name){
    Object.entries(pages).forEach(([k,el]) => el?.classList.toggle("active", k===name));
    Object.entries(buttons).forEach(([k,btn]) => {
      if(!btn) return;
      const isActive = k===name;
      btn.classList.toggle("active", isActive);
      btn.setAttribute("aria-selected", String(isActive));
      btn.setAttribute("tabindex", isActive ? "0" : "-1");
    });
    localStorage.setItem(STORAGE_KEY, name);
  }
  function normalize(hash){
    const key = (hash || "").replace(/^#/, "");
    return TABS.includes(key) ? key : null;
  }
  function syncFromHash(){
    const byHash = normalize(location.hash);
    const remembered = localStorage.getItem(STORAGE_KEY);
    const target = byHash || (TABS.includes(remembered) ? remembered : DEFAULT_TAB);
    if (!byHash) history.replaceState(null, "", "#" + target);
    setActive(target);
  }
  Object.entries(buttons).forEach(([name,btn]) => {
    btn?.addEventListener("click", () => {
      if (location.hash !== "#" + name) location.hash = name;
      else setActive(name);
    });
  });
  window.addEventListener("hashchange", syncFromHash);
  syncFromHash();
}

window.addEventListener("DOMContentLoaded", async () => {

    const fab     = document.getElementById('fabAdd');  
    const scrim   = document.getElementById('sheetScrim');
    const closeBt = document.getElementById('sheetClose');
    const panel   = document.querySelector('#composer .sheet__panel');

  await initFirebase();
  initRouter();

  fab   && fab.addEventListener('click', openComposer);
  scrim && scrim.addEventListener('click', closeComposer);
  closeBt && closeBt.addEventListener('click', closeComposer);


  // Close when features/list.js asks for it (undo timers, etc.)
  document.addEventListener('composer:request-close', closeComposer);

  // ESC to close
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.getElementById('composer')?.classList.contains('open')) {
      closeComposer();
    }
  });

  // Swipe down to close (simple, forgiving)
  let startY = null, dragging = false;
  panel && panel.addEventListener('touchstart', (e) => {
    if (!document.getElementById('composer')?.classList.contains('open')) return;
    startY = e.touches[0].clientY; dragging = true;
  }, { passive: true });

  panel && panel.addEventListener('touchmove', (e) => {
    if (!dragging || startY == null) return;
    const dy = e.touches[0].clientY - startY;
    // only react on downward pull near the top of the sheet
    const atTop = panel.scrollTop <= 0;
    if (dy > 40 && atTop) { closeComposer(); dragging = false; startY = null; }
  }, { passive: true });

  panel && panel.addEventListener('touchend', () => { dragging = false; startY = null; });

  // boot features
  initListFeature();
  initRecipesFeature();
  initStoresFeature({
    onActiveStoreChanged(){
      // Re-render list when active store changes (uses window.renderList provided by List feature)
      if (typeof window.renderList === "function") window.renderList();
    }
  });
});
