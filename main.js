import { initFirebase } from "./firebase.js";
import { initListFeature } from "./features/list.js";
import { initRecipesFeature } from "./features/recipes.js";
import { initStoresFeature } from "./features/stores.js";


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
  await initFirebase();
  initRouter();

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
