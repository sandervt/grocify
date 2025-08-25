import { initFirebase } from "./firebase.js";
import { initListFeature } from "./features/list.js";
import { initRecipesFeature } from "./features/recipes.js";
import { initStoresFeature } from "./features/stores.js";
import { openItemsManagerDialog, initItemsFeature } from "./features/items.js";

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

/* ===== Snackbar (utility) ===== */
window.Snackbar = (() => {
  let timer;
  return {
    show(message, { actionLabel, onUndo } = {}){
      const host = document.getElementById('snackbarHost');
      if (!host) return;
      const bar = document.createElement('div');
      bar.className = 'snackbar';
      const msg = document.createElement('div');
      msg.className = 'snackbar__message';
      msg.textContent = message;
      const btn = document.createElement('button');
      btn.className = 'snackbar__btn';
      btn.textContent = actionLabel || 'Ongedaan maken';
      btn.addEventListener('click', async () => {
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

/* ===== Bottom Sheet Controller (Composer) ===== */
const Composer = (() => {
  let root, panel, scrim, closeBtn;

  function open(){
    openComposer();
    root?.setAttribute('aria-hidden', 'false');
  }
  function close(){
    closeComposer();
    root?.setAttribute('aria-hidden', 'true');
  }
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

// Wire FAB early so it feels instant
document.addEventListener('DOMContentLoaded', () => {
  Composer.wire();
  const fab = document.getElementById('fabAdd');
  fab?.addEventListener('click', () => Composer.open());
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
    list:    document.getElementById("tabbtn-list"),
    recipes: document.getElementById("tabbtn-recipes"),
    stores:  document.getElementById("tabbtn-stores"),
  };

  function setActive(name){
    Object.entries(pages).forEach(([k,el]) => el?.classList.toggle("active", k===name));
    Object.entries(buttons).forEach(([k,btn]) => {
      btn?.setAttribute("aria-selected", String(k===name));
      btn?.setAttribute("tabindex", k===name ? "0" : "-1");
    });
    localStorage.setItem(STORAGE_KEY, name);
    location.hash = `#/${name}`;
  }

  function syncFromHash(){
    const hash = (location.hash || "").replace(/^#\//,'');
    const tab = TABS.includes(hash) ? hash : (localStorage.getItem(STORAGE_KEY) || DEFAULT_TAB);
    setActive(tab);
  }

  // Wire buttons (click + keyboard)
  Object.entries(buttons).forEach(([name,btn]) => {
    btn?.addEventListener("click", () => setActive(name));
    btn?.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setActive(name); }
    });
  });

  window.addEventListener("hashchange", syncFromHash);
  syncFromHash();
}

/* ===== App boot ===== */
window.addEventListener("DOMContentLoaded", async () => {
  const panel = document.querySelector('#composer .sheet__panel');

  await initFirebase();
  initRouter();

  // Pull-to-close on mobile
  let startY = null;
  let dragging = false;
  panel && panel.addEventListener('touchstart', (e) => {
    if (panel.scrollTop <= 0) { dragging = true; startY = e.touches[0].clientY; }
  }, { passive: true });
  panel && panel.addEventListener('touchmove', (e) => {
    if (!dragging || startY == null) return;
    const dy = e.touches[0].clientY - startY;
    const atTop = panel.scrollTop <= 0;
    if (dy > 40 && atTop) { closeComposer(); dragging = false; startY = null; }
  }, { passive: true });
  panel && panel.addEventListener('touchend', () => { dragging = false; startY = null; });

  /* === Overflow (⋮) menu wiring === */
const overflowWrap = document.querySelector('.tabbar .overflow');
const overflowBtn  = document.getElementById('overflowBtn');
const overflowMenu = document.getElementById('overflowMenu');

function closeOverflow(){
  if (!overflowWrap) return;
  overflowWrap.classList.remove('is-open');
  overflowBtn?.setAttribute('aria-expanded', 'false');
  document.removeEventListener('click', onDocClick, true);
  document.removeEventListener('keydown', onEsc, true);
}
function onDocClick(e){
  if (!overflowWrap.contains(e.target)) closeOverflow();
}
function onEsc(e){ if (e.key === 'Escape') closeOverflow(); }

overflowBtn?.addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
  if (!overflowWrap) return;
  const willOpen = !overflowWrap.classList.contains('is-open');

  // close any open instance first
  closeOverflow();

  if (willOpen) {
    overflowWrap.classList.add('is-open');
    overflowBtn.setAttribute('aria-expanded', 'true');
    setTimeout(() => {
      document.addEventListener('click', onDocClick, true);
      document.addEventListener('keydown', onEsc, true);
      const first = overflowMenu?.querySelector('button');
      first?.focus();
    }, 0);
  }
});
overflowBtn?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); overflowBtn.click(); }
});

// Launch Ingredients manager dialog (from features/items.js)
import('./features/items.js').then(({ openItemsManagerDialog }) => {
  document.getElementById('miManageIngredients')?.addEventListener('click', () => {
    closeOverflow();
    openItemsManagerDialog();
  });
});

  // Features
  initListFeature();
  initRecipesFeature();
  initItemsFeature(); // harmless if the items tab DOM is absent
  initStoresFeature({
    onActiveStoreChanged(){
      if (typeof window.renderList === "function") window.renderList();
    }
  });
});



