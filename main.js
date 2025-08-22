import { initFirebase } from "./firebase.js";
import { initListFeature } from "./features/list.js";
import { initRecipesFeature } from "./features/recipes.js";
import { initStoresFeature } from "./features/stores.js";

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

function hoistDialogsToBody(){
  ['addDialog','recipeDialog'].forEach(id => {
    const el = document.getElementById(id);
    if (el && el.parentElement !== document.body) {
      document.body.appendChild(el);
    }
  });
};

window.addEventListener("DOMContentLoaded", async () => {
  await initFirebase();
  initRouter();

  // Hoist the static dialogs out of .app so gutters don’t break
  hoistDialogsToBody();

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
