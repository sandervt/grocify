import { itemsCol, stateDoc, recipesCol, inc, arrAdd, arrDel, slug } from "../firebase.js";
import { SECTION_ORDER, MEAL_DATA, ITEM_TO_SECTION, inferSection, suggestMatches } from "../data/catalog.js";

/** Local state */
let activeMeals = new Set();            // from uiState.activeMeals
let activeItems = {};                   // { name: { count, sources:Set, checked, unit? } }
let customRecipeDocs = {};              // name -> { id, items: string[] }
let combinedMeals = {};                 // name -> items[] (strings)
let KNOWN_ITEMS = [];
let showCompleted = false;
// Persisted preference key for showing completed items
const SHOW_COMPLETED_KEY = "grocify_showCompleted_v1";

function loadShowCompleted(){
  try {
    const v = localStorage.getItem(SHOW_COMPLETED_KEY);
    return v === "1"; // default false if not set
  } catch { return false; }
}

function saveShowCompleted(val){
  try { localStorage.setItem(SHOW_COMPLETED_KEY, val ? "1" : "0"); } catch {}
}
let lastComplete = false;

/** Recents (STEP-3) */
const RECENTS_KEY = "grocify_recents_v1";
const RECENTS_MAX = 12;
function loadRecents(){
  try { const raw = localStorage.getItem(RECENTS_KEY); const arr = raw ? JSON.parse(raw) : []; return Array.isArray(arr) ? arr.filter(Boolean) : []; } catch { return []; }
}
function saveRecents(list){ try { localStorage.setItem(RECENTS_KEY, JSON.stringify(list.slice(0, RECENTS_MAX))); } catch {} }
function pushRecent(name){
  const n = (name || "").trim();
  if(!n) return;
  const list = loadRecents().filter(x => x.toLowerCase() !== n.toLowerCase());
  list.unshift(n);
  saveRecents(list);
}

// Favorites (persisted like Recents)
const FAVS_KEY = "grocify_favs_v1";

function loadFavs(){
  try {
    const raw = localStorage.getItem(FAVS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter(Boolean) : [];
  } catch { return []; }
}
function saveFavs(arr){
  try {
    const clean = [...new Set((arr || []).map(s => String(s).trim()).filter(Boolean))];
    localStorage.setItem(FAVS_KEY, JSON.stringify(clean));
  } catch {}
}
function isFav(name){
  const n = String(name || "").trim().toLowerCase();
  return loadFavs().some(x => String(x).trim().toLowerCase() === n);
}
function toggleFav(name){
  const n = String(name || "").trim();
  if (!n) return;
  const favs = loadFavs();
  const i = favs.findIndex(x => String(x).trim().toLowerCase() === n.toLowerCase());
  if (i >= 0) favs.splice(i, 1);
  else favs.unshift(n);
  saveFavs(favs);
}

/** Public for Stores feature to re-render after active store change */
window.renderList = renderList;

/** Init */
export function initListFeature(){
  // Load local preference for showing completed items
  showCompleted = loadShowCompleted();

  // list items live
  itemsCol.onSnapshot(
    snap => setActiveFromCloud(snap.docs.map(d => d.data())),
    err  => console.error("onSnapshot items error", err)
  );

  // meals state live
  stateDoc.onSnapshot(
    doc => {
      const data = doc.data() || {};
      const arr = Array.isArray(data.activeMeals) ? data.activeMeals : [];
      activeMeals = new Set(arr);
      reflectMealPillsFromState();
      updateCounter();
      window.dispatchEvent(new CustomEvent('meals:active-changed', { detail: { activeMeals: [...activeMeals] } }));
      if (Array.isArray(data.readyMeals)) {
        window.dispatchEvent(new CustomEvent('meals:ready', { detail: { readyMeals: data.readyMeals } }));
      }
    },
    err => console.error("onSnapshot state error", err)
  );

  // custom recipes live
  recipesCol.onSnapshot(
    snap => {
      customRecipeDocs = {};
      snap.forEach(d => {
        const data = d.data() || {};
        const name = (data.name || "").trim();
        if (!name) return;
        customRecipeDocs[name] = { id: d.id, items: Array.isArray(data.items) ? data.items : [] };
      });
      recomputeCombinedMeals();
      renderMeals();
    },
    err => console.error("recipes onSnapshot error", err)
  );

  // UI wiring
  recomputeCombinedMeals();
  renderMeals();
  updateCounter();
  wireDetailsSections();
  wireAddDialog();
  wireClearList();
  wireToggleCompleted();
  setClearCtaVisible(false);
  setToggleCompletedVisible(false);

  // Refresh suggestions on composer open (STEP-3)
  document.addEventListener('composer:open', () => {
    refreshSuggestions();
    refreshDraftChips();
  });
}

/* ---------- Known items pool ---------- */
function getKnownItems(){
  const fromMap   = Object.keys(ITEM_TO_SECTION);
  const fromMeals = Object.values(combinedMeals).flatMap(arr => Array.isArray(arr) ? arr : []);
  const all = new Set([...fromMap, ...fromMeals, ...Object.keys(activeItems)]);
  return [...all].sort((a,b) => a.localeCompare(b));
}
function refreshKnownItems(){ KNOWN_ITEMS = getKnownItems(); }

/* ---------- Meals (flat chips in #mealRow, no nesting) ---------- */
function recomputeCombinedMeals(){
  const normalize = (arr) =>
    (Array.isArray(arr) ? arr : [])
      .map(x => typeof x === "string" ? x : (x && x.name))
      .filter(Boolean);

  const builtIns = {};
  Object.entries(MEAL_DATA || {}).forEach(([name, items]) => builtIns[name] = normalize(items));

  const customs = {};
  Object.entries(customRecipeDocs || {}).forEach(([name, doc]) => customs[name] = normalize(doc.items));

  combinedMeals = { ...builtIns, ...customs };
  window.__debugCombinedMeals = combinedMeals; // optional console sanity check
}

/* ---------- Meals (modal: flat chips in #mealRowModal) ---------- */
function renderMeals(){
  const wrap = document.getElementById("mealRowModal");
  if (!wrap) return;               // only render meals inside the add modal
  wrap.innerHTML = "";
  wrap.classList.add("meal-row");  // reuse existing horizontal scroller styling

  const entries = Object.entries(combinedMeals || {});
  if (entries.length === 0) {
    const empty = document.createElement("div");
    empty.className = "muted";
    empty.textContent = "Geen maaltijden gevonden";
    wrap.appendChild(empty);
    return;
  }

  entries
    .sort(([a],[b]) => a.localeCompare(b))
    .forEach(([name]) => {
      const btn = document.createElement("button");
      btn.className = "chip";
      btn.dataset.meal = name;
      btn.textContent = name;
      if (activeMeals.has(name)) btn.classList.add("active");

      btn.addEventListener("click", async () => {
        const turnOn = !btn.classList.contains("active");
        btn.classList.toggle("active", turnOn);
        if (turnOn) { await cloudAddRecipe(name);  activeMeals.add(name); }
        else        { await cloudRemoveRecipe(name); activeMeals.delete(name); }
        await saveMealState();
        updateCounter(); // no-op if #mealCounter isn't present; safe
      });

      wrap.appendChild(btn);
    });
}

function reflectMealPillsFromState(){
  const root = document.getElementById("mealRowModal");
  if (!root) return;
  root.querySelectorAll("button[data-meal]").forEach(btn => {
    const name = btn.dataset.meal || btn.textContent || "";
    btn.classList.toggle("active", activeMeals.has(name));
  });
}

/* ---------- Header counters ---------- */
function updateCounter(){
  const el = document.getElementById("mealCounter");
  if(!el) return;
  const n = activeMeals.size;
  el.textContent = n === 1 ? "1 dag" : `${n} dagen`;
}

export function updateProgressRing(){
  const total = Object.keys(activeItems).length;
  const checked = Object.values(activeItems).filter(i => i.checked).length;
  checkListCompletion(total, checked);

  const svg = document.getElementById('progressRing');
  if (!svg) return;
  const circle = svg.querySelector('.ring-progress');
  if (!circle) return;

  const progress = total ? (checked / total) : 0;
  const onList = document.getElementById('tab-list')?.classList.contains('active');

  svg.toggleAttribute('hidden', !(onList && progress > 0));

  const radius = circle.r.baseVal.value;
  const circumference = 2 * Math.PI * radius;
  circle.style.strokeDasharray = `${circumference}`;
  const offset = circumference - progress * circumference;
  circle.style.strokeDashoffset = offset;
  const complete = total > 0 && checked === total;
  svg.classList.toggle('completed', complete);
  svg.classList.toggle('floating', onList && progress > 0);
}

function checkListCompletion(total, checked){
  const complete = total === 0 || (total > 0 && checked === total);
  if (complete && !lastComplete){
    lastComplete = true;
    if (activeMeals.size > 0){
      const ready = [...activeMeals];
      stateDoc.set({ readyMeals: ready, activeMeals: [] }, { merge: true }).catch(e => console.error('state update failed', e));
    }
  }else if(!complete){
    lastComplete = false;
  }
}

function setActiveFromCloud(cloudDocs){
  activeItems = {};
  cloudDocs.forEach(d => {
    activeItems[d.name] = {
      count: d.count || 1,
      sources: new Set(d.origins || []),
      checked: !!d.checked,
      unit: d.unit || undefined
    };
  });
  refreshKnownItems();
  renderList();
  setClearCtaVisible(cloudDocs.length > 0);
}

// MVP STEP-1: toggle visibility of bottom clear CTA
function setClearCtaVisible(hasItems){
  const btn = document.getElementById('clearListBtn');
  if (!btn) return;
  btn.style.display = hasItems ? 'block' : 'none';
}

function setToggleCompletedVisible(hasChecked){
  const btn = document.getElementById('toggleCompletedBtn');
  if (!btn) return;
  btn.style.display = hasChecked ? 'block' : 'none';
}

function renderList(){
  const ul = document.getElementById("shoppingList");
  if (!ul) return;

  // Clear current DOM
  ul.innerHTML = "";

  const hasChecked = Object.values(activeItems).some(i => i.checked);
  const toggleBtn = document.getElementById('toggleCompletedBtn');
  if (toggleBtn) {
    toggleBtn.textContent = showCompleted ? 'Afgevinkte items verbergen' : 'Afgevinkte items tonen';
  }
  setToggleCompletedVisible(hasChecked);

  // One global click handler to close any open overflow menus
  if (window.__grocifyCloseMenus) {
    document.removeEventListener("click", window.__grocifyCloseMenus);
  }
  window.__grocifyCloseMenus = () => {
    document.querySelectorAll(".item-row .menu").forEach(m => m.setAttribute("hidden",""));
    document.querySelectorAll(".item-row .btn-overflow[aria-expanded='true']")
      .forEach(b => b.setAttribute("aria-expanded","false"));
    document.querySelectorAll(".item-row.menu-open")
      .forEach(r => r.classList.remove("menu-open"));
  };
  document.addEventListener("click", window.__grocifyCloseMenus);

  const order = (typeof window.currentSectionOrder === "function")
    ? window.currentSectionOrder()
    : SECTION_ORDER;

  order.forEach(section => {
    const items = Object.keys(activeItems)
      .filter(name => (ITEM_TO_SECTION[name] || inferSection(name)) === section);

    const uncheckedCount = items.filter(n => !activeItems[n].checked).length;
    const visibleItems = showCompleted ? items : items.filter(n => !activeItems[n].checked);
    if (visibleItems.length === 0) return;

    const li = document.createElement("li");
    li.className = "section";
    li.innerHTML = `
      <div class="section__header">
        <h3>${section}</h3>
        <span class="section__count">
          ${uncheckedCount}/${items.length}
        </span>
      </div>
      <ul class="section__items"></ul>
    `;
    const inner = li.querySelector(".section__items");

    visibleItems.sort((a,b) => a.localeCompare(b)).forEach(name => {
      const data = activeItems[name];
      const row = document.createElement("li");
      row.className = "item-row";
      if (data.checked) {
        row.classList.add("crossed");
      }

      const qtyNum = Number(data.count || 1);
      const qtyStr = data.unit ? `${qtyNum}${data.unit}` : `${qtyNum}`;

      row.innerHTML = `
        <div class="item-row__main">
          <label class="checkbox">
            <input type="checkbox" ${data.checked ? "checked" : ""}/>
            <span class="label">${name}</span><span class="qty">${qtyStr}</span>
          </label>
        </div>
        <div class="item-row__actions">
          <div class="overflow">
            <button class="btn-overflow" aria-haspopup="menu" aria-expanded="false" aria-label="Meer acties">⋮</button>
            <div class="menu" role="menu" hidden>
              <button class="menu__item inc" role="menuitem">Aantal verhogen</button>
              <button class="menu__item dec" role="menuitem">Aantal verlagen</button>
              <button class="menu__item delete" role="menuitem">Verwijderen</button>
            </div>
          </div>
        </div>
      `;

      // Checkbox toggle
      const cb = row.querySelector('input[type="checkbox"]');
      cb.addEventListener("change", async () => {
        if (cb.checked) {
          const rect = row.getBoundingClientRect();
          playConfetti(rect);
        }
        activeItems[name].checked = cb.checked;
        if (cb.checked) {
          const rect = row.getBoundingClientRect();
          playConfetti(rect);
        }
        renderList();
        await cloudToggleCheck(name, cb.checked);
      });

      // Overflow menu
      const ovBtn = row.querySelector(".btn-overflow");
      const menu  = row.querySelector(".menu");
      ovBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const willOpen = menu.hasAttribute("hidden");
        // close all others first
        window.__grocifyCloseMenus();
        if (willOpen) {
          menu.removeAttribute("hidden");
          ovBtn.setAttribute("aria-expanded","true");
          row.classList.add("menu-open");
        }
      });

      row.querySelector(".menu__item.inc")
        .addEventListener("click", () => {
          adjustQty(name, +1);
          window.__grocifyCloseMenus();
        });
      row.querySelector(".menu__item.dec")
        .addEventListener("click", () => {
          adjustQty(name, -1);
          window.__grocifyCloseMenus();
        });

      row.querySelector(".menu__item.delete")
        .addEventListener("click", () => deleteItemWithUndo(name));

      inner.appendChild(row);
    });

    ul.appendChild(li);
  });

  updateProgressRing();
}


/* ---------- Parser + chips (STEP-4) ---------- */
function parseDraft(raw){
  const s = (raw || "").trim();
  if (!s) return null;

  // Patterns:
  // 1) 3x bananas
  let m = s.match(/^(\d+)\s*(x|×)\s*(.+)$/i);
  if (m) {
    const qty = parseInt(m[1], 10) || 1;
    const name = m[3].trim();
    return finalizeDraft({ name, qty });
  }

  // 2) 500g pasta  (qty+unit first)
  m = s.match(/^(\d+(?:\.\d+)?)\s*([A-Za-z]+)\s+(.+)$/i);
  if (m) {
    const qty = parseFloat(m[1]) || 1;
    const unit = m[2];
    const name = m[3].trim();
    return finalizeDraft({ name, qty, unit });
  }

  // 3) pasta 500g  (name first)
  m = s.match(/^(.+?)\s+(\d+(?:\.\d+)?)\s*([A-Za-z]+)$/i);
  if (m) {
    const name = m[1].trim();
    const qty = parseFloat(m[2]) || 1;
    const unit = m[3];
    return finalizeDraft({ name, qty, unit });
  }

  // Fallback: name only
  return finalizeDraft({ name: s, qty: 1 });
}

function finalizeDraft(d){
  const name = (d.name || "").trim();
  const qty  = (d.qty == null || isNaN(d.qty)) ? 1 : d.qty;
  const unit = (d.unit || "").trim() || undefined;
  const section = inferSection(name);
  return { name, qty, unit, section };
}

function refreshDraftChips(){
  const input = document.getElementById("addInput");
  const host  = document.getElementById("parsedChips");
  if(!input || !host) return;

  const draft = parseDraft(input.value);
  host.innerHTML = "";
  if (!draft) return;

  // Name chip
  host.appendChild(makeChip("Naam", draft.name, async () => {
    const next = prompt("Naam wijzigen:", draft.name);
    if (next != null) {
      input.value = `${next} ${draft.unit ? draft.qty + draft.unit : draft.qty > 1 ? `x${draft.qty}` : ""}`.trim();
      refreshDraftChips();
      refreshSuggestions();
    }
  }));

  // Qty chip
  host.appendChild(makeChip("Aantal", String(draft.qty), async () => {
    const nextStr = prompt("Aantal:", String(draft.qty));
    const next = nextStr == null ? draft.qty : Number(nextStr);
    if (!isNaN(next) && next > 0) {
      const pieces = [draft.name];
      if (draft.unit) pieces.push(`${next}${draft.unit}`);
      else if (next !== 1) pieces.push(`${next}x`);
      input.value = pieces.join(" ");
      refreshDraftChips();
      refreshSuggestions();
    }
  }));

  // Unit chip (free text; optional)
  host.appendChild(makeChip("Eenheid", draft.unit || "—", async () => {
    const next = prompt("Eenheid (vrij tekst, bijv. g, L, pak):", draft.unit || "");
    const pieces = [draft.name];
    const q = draft.qty || 1;
    if (next && next.trim()) pieces.push(`${q}${next.trim()}`);
    else if (q !== 1) pieces.push(`${q}x`);
    input.value = pieces.join(" ");
    refreshDraftChips();
    refreshSuggestions();
  }));

  // Section chip (picker from SECTION_ORDER)
  const secWrap = document.createElement("span");
  secWrap.className = "parsed-chip parsed-select";
  const key = document.createElement("span");
  key.className = "key";
  key.textContent = "Sectie";
  const sel = document.createElement("select");
  SECTION_ORDER.forEach(sec => {
    const opt = document.createElement("option");
    opt.value = sec; opt.textContent = sec;
    if (sec === draft.section) opt.selected = true;
    sel.appendChild(opt);
  });
  sel.addEventListener("change", () => {
    // We don't rewrite the raw input for section; we just apply at add-time.
    sel.blur();
  });
  secWrap.appendChild(key);
  secWrap.appendChild(sel);
  host.appendChild(secWrap);
}

function makeChip(label, value, onEdit){
  const chip = document.createElement("span");
  chip.className = "parsed-chip";
  const k = document.createElement("span");
  k.className = "key";
  k.textContent = label;
  const v = document.createElement("button");
  v.type = "button";
  v.textContent = value;
  v.addEventListener("click", onEdit);
  chip.appendChild(k);
  chip.appendChild(v);
  return chip;
}

/* ---------- Composer: suggestions & add ---------- */
function refreshSuggestions(){
  const input = document.getElementById("addInput");
  const list  = document.getElementById("suggestions");
  if (!input || !list) return;

  const q = (input.value || "").trim();
  list.innerHTML = "";

  // Helper to render a chip with a star button
  const renderChip = (name) => {
    const li = document.createElement("li");
    li.className = "suggestion-chip";

    // clicking the text = add (or fill input)
    const textBtn = document.createElement("button");
    textBtn.type = "button";
    textBtn.className = "chip-text";
    textBtn.textContent = name;
    textBtn.addEventListener("click", async () => {
      if (INSTANT_ADD_FROM_SUGGESTIONS) {
        await quickAdd(name);
      } else {
        input.value = name;
        input.focus();
        refreshDraftChips();
      }
    });

    // star = toggle favorite (doesn't add)
    const star = document.createElement("button");
    star.type = "button";
    star.className = "star" + (isFav(name) ? " fav" : "");
    star.setAttribute("aria-label", "Markeer als favoriet");
    star.textContent = isFav(name) ? "★" : "☆";
    star.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleFav(name);
      // re-render to reflect new order/appearance
      refreshSuggestions();
    });

    li.append(textBtn, star);
    list.appendChild(li);
  };

  if (!q) {
    // Favorites first, then Recents (deduped)
    const favs = loadFavs();
    const recents = loadRecents();
    const seen = new Set();

    favs.forEach(n => {
      const key = String(n).toLowerCase();
      if (key && !seen.has(key)) { seen.add(key); renderChip(n); }
    });
    recents.forEach(n => {
      const key = String(n).toLowerCase();
      if (key && !seen.has(key)) { seen.add(key); renderChip(n); }
    });
    return;
  }

  // Type-ahead matches (keep stars so you can pin from search)
  const matches = suggestMatches(q, KNOWN_ITEMS, 12);
  matches.forEach(s => renderChip(s));
}

function wireDetailsSections(){
  const input = document.getElementById("addInput");
  if(!input) return;
  refreshSuggestions();
  refreshDraftChips();

  input.addEventListener("input", () => {
    disarmAutoClose();
    refreshDraftChips();
    refreshSuggestions();
  });
}

function wireAddDialog(){
  const form  = document.getElementById("addForm");
  const input = document.getElementById("addInput");
  const ok    = document.getElementById("addConfirm");
  const secSel = () => document.querySelector(".parsed-select select");
  if(!form || !input || !ok) return;

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    ok.click();
  });

ok.addEventListener("click", async () => {
    const raw = input.value.trim();
    if(!raw) return;

    const draft = parseDraft(raw);
    const chosenSection = secSel()?.value || draft.section;
    const qty = Math.max(1, Number(draft.qty) || 1);

    await addItemFromDraft({ ...draft, section: chosenSection });

    // STEP-7: announce + haptic + arm auto-close
    announce(`Toegevoegd: ${draft.name}`);
    if (navigator.vibrate) { try { navigator.vibrate(10); } catch {} }
    armAutoClose(3000);

    // STEP-5: Undo for add
    showUndo(`Toegevoegd: ${draft.name}`, async () => {
        try { await undoAddItem(draft.name, qty, "Eigen"); }
        catch(e){ console.error("Undo add failed", e); }
    });

    pushRecent(draft.name);
    input.value = "";
    refreshDraftChips();
    refreshSuggestions();
    input.focus();
    });
}

async function addItemFromDraft(draft){
  const name = draft.name;
  const sec  = draft.section;
  const qty  = Math.max(1, Number(draft.qty) || 1);
  const unit = draft.unit || undefined;
  await cloudAddItem(name, sec, "Eigen", qty, unit);
}

/* ---------- Clear list ---------- */
function wireClearList(){
  const btn = document.getElementById("clearListBtn");
  if(!btn) return;
    btn.addEventListener("click", async () => {
    const snap = await itemsCol.get();
    if (snap.empty) return;

    const prevItems = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    let prevMeals = [];
    try {
        const st = await stateDoc.get();
        prevMeals = (st.exists && Array.isArray(st.data().activeMeals)) ? st.data().activeMeals : [];
    } catch(e){ prevMeals = []; }

    await cloudClearList();

    // Reset local UI states
    document.querySelectorAll(".meal-row button").forEach(b => b.classList.remove("active"));
    // Counter will update via state snapshot

    // Undo
    if (window.GrocifyUndo && typeof window.GrocifyUndo.show === "function") {
        window.GrocifyUndo.show("Lijst geleegd", async () => {
        const batch = firebase.firestore().batch();
        prevItems.forEach(it => {
            const ref = itemsCol.doc(it.id);
            const data = Object.assign({}, it);
            delete data.updatedAt;
            batch.set(ref, data, { merge: true });
        });
        await batch.commit();
        try { await stateDoc.set({ activeMeals: prevMeals }, { merge: true }); }
        catch(e) { console.warn("Restore meals failed", e); }
        });
    }
    });

}

function wireToggleCompleted(){
  const btn = document.getElementById('toggleCompletedBtn');
  if(!btn) return;
  btn.addEventListener('click', () => {
    showCompleted = !showCompleted;
    saveShowCompleted(showCompleted);
    renderList();
  });
  btn.textContent = showCompleted ? 'Afgevinkte items verbergen' : 'Afgevinkte items tonen';
}

/* --- Unified floating tray (icon-only) --- */
function unifyFloatingActions(){
  const fab   = document.getElementById('fabAdd');
  const clear = document.getElementById('clearListBtn');
  if (!fab || !clear) return;

  const fabLabel   = 'Item toevoegen';
  const clearLabel = 'Lijst leegmaken';
  fab.innerHTML   = '<span aria-hidden="true">＋</span><span class="sr-only">'+fabLabel+'</span>';
  clear.innerHTML = '<span aria-hidden="true">🗑️</span><span class="sr-only">'+clearLabel+'</span>';
  fab.setAttribute('aria-label', fabLabel)
  clear.setAttribute('aria-label', clearLabel);
}

/* ---------- Cloud ops ---------- */
async function cloudAddItem(name, section, source, qty=1, unit){
  const ref = itemsCol.doc(slug(name));
  await ref.set({
    name,
    section,
    count: inc(qty),
    unit: unit
      ? unit
      : (firebase.firestore.FieldValue.delete
          ? firebase.firestore.FieldValue.delete()
          : undefined),
    origins: arrAdd(source),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
}
async function cloudRemoveSource(name, source){
  const ref = itemsCol.doc(slug(name));
  const doc = await ref.get();
  if (!doc.exists) return;
  const data = doc.data();
  const next = (data.origins || []).filter(x => x !== source);
  if (next.length === 0) {
    await ref.delete();
  } else {
    await ref.set({ origins: next }, { merge: true });
  }
}
async function cloudRemoveRecipe(recipeName){
  const items = combinedMeals[recipeName] || [];
  const batch = firebase.firestore().batch();
  items.forEach(n => {
    const ref = itemsCol.doc(slug(n));
    batch.set(ref, { origins: arrDel(recipeName) }, { merge: true });
  });
  await batch.commit();
}
async function cloudAddRecipe(recipeName){
  const items = combinedMeals[recipeName] || [];
  const batch = firebase.firestore().batch();
  items.forEach(n => {
    const ref = itemsCol.doc(slug(n));
    batch.set(ref, {
      name: n,
      section: inferSection(n),
      count: inc(1),
      origins: arrAdd(recipeName),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  });
  await batch.commit();
}
async function cloudToggleCheck(name, checked){
  const ref = itemsCol.doc(slug(name));
  await ref.set({ checked: !!checked }, { merge: true });
}
async function saveMealState(){
  try{
    await stateDoc.set({ activeMeals: [...activeMeals] }, { merge: true });
  }catch(e){ console.error("saveMealState failed", e); }
}
async function cloudClearList(){
  const snap = await itemsCol.get();
  const batch = firebase.firestore().batch();
  snap.forEach(doc => batch.delete(doc.ref));
  await batch.commit();
}
// ===== HELPERS =====
// Toggle one-tap add for suggestion chips
const INSTANT_ADD_FROM_SUGGESTIONS = true;

async function quickAdd(name){
  const draft = finalizeDraft({ name, qty: 1 });
  await addItemFromDraft(draft);
  announce(`Toegevoegd: ${name}`);
  pushRecent(name);
}

// Undo helpers
async function undoAddItem(name, qty, source){
  const ref = itemsCol.doc(slug(name));
  const snap = await ref.get();
  if(!snap.exists) return;

  const data = snap.data() || {};
  const current = Number(data.count || 0);
  const next = current - (Number(qty) || 1);

  if (next <= 0) {
    // If this add created the item, remove it entirely
    await ref.delete();
    return;
  }

  // Otherwise decrement and remove this source tag
  await ref.set({
    count: inc(-Math.max(1, Number(qty) || 1)),
    origins: arrDel(source)
  }, { merge: true });
}

function showUndo(label, onUndo){
  if (window.GrocifyUndo && typeof window.GrocifyUndo.show === "function") {
    window.GrocifyUndo.show(label, onUndo);
  }
}

// a11y announcer + auto-close timer =====
let __autoCloseTimer = null;

function announce(msg){
  const el = document.getElementById('ariaLive');
  if (!el) return;
  // Toggle text to retrigger SR announcement
  el.textContent = '';
  // small delay helps some SRs pick it up
  setTimeout(() => { el.textContent = msg; }, 10);
}

function armAutoClose(ms = 3000){
  clearTimeout(__autoCloseTimer);
  __autoCloseTimer = setTimeout(() => {
    document.dispatchEvent(new CustomEvent('composer:request-close'));
  }, ms);
}

function disarmAutoClose(){
  clearTimeout(__autoCloseTimer);
  __autoCloseTimer = null;
}

// ===== STEP-6: Qty & delete helpers =====
async function adjustQty(name, delta){
  const ref = itemsCol.doc(slug(name));
  // Use local cache for speed; fallback to fetch
  const current = activeItems[name]?.count ?? (await ref.get()).data()?.count ?? 1;

  if (delta < 0 && current <= 1) {
    // Removing the last one = delete with Undo
    return deleteItemWithUndo(name);
  }

  await ref.set({ count: inc(delta) }, { merge: true });
}

async function deleteItemWithUndo(name){
  const ref = itemsCol.doc(slug(name));
  const snap = await ref.get();
  if (!snap.exists) return;
  const prev = { id: snap.id, ...snap.data() };

  await ref.delete();

  // Offer Undo to restore full previous doc
  showUndo(`Verwijderd: ${name}`, async () => {
    const data = { ...prev };
    // Remove server-only timestamp fields that could conflict
    delete data.updatedAt;
    await ref.set(data, { merge: true });
  });
}

/* ---- Joyful micro-animations ---- */
function playBalloon(rect){
  const host = document.createElement('div');
  host.className = 'balloon';
  host.style.position = 'fixed';
  host.style.left = `${rect.left + rect.width / 2}px`;
  host.style.top = `${rect.top}px`;
  host.style.pointerEvents = 'none';
  host.style.zIndex = 1000;
  host.style.fontSize = '24px';
  host.textContent = '🎈';
  document.body.appendChild(host);
  requestAnimationFrame(() => {
    host.style.transition = 'transform .8s ease-out, opacity .8s';
    host.style.transform = 'translateY(-40px)';
    host.style.opacity = '0';
  });
  setTimeout(() => host.remove(), 800);
}

function playStars(rect){
  const wrap = document.createElement('div');
  wrap.className = 'stars';
  wrap.style.left = `${rect.left}px`;
  wrap.style.top = `${rect.top}px`;
  wrap.style.width = `${rect.width || 40}px`;
  wrap.style.height = `${rect.height || 40}px`;
  document.body.appendChild(wrap);
  const colors = ['#facc15', '#fcd34d', '#fde68a'];
  for (let i = 0; i < 8; i++) {
    const s = document.createElement('span');
    s.textContent = '★';
    s.style.left = `${Math.random() * rect.width}px`;
    s.style.fontSize = `${8 + Math.random() * 6}px`;
    s.style.color = colors[Math.floor(Math.random() * colors.length)];
    s.style.setProperty('--dx', `${Math.random() * 40 - 20}px`);
    s.style.animationDelay = `${Math.random() * 100}ms`;
    wrap.appendChild(s);
  }
  setTimeout(() => wrap.remove(), 800);
}

function playConfetti(rect){
  const r = Math.random();
  if (r < 0.33) return playBalloon(rect);
  if (r < 0.66) return playStars(rect);
  const wrap = document.createElement('div');
  wrap.className = 'confetti';
  wrap.style.position = 'fixed';
  wrap.style.pointerEvents = 'none';
  wrap.style.zIndex = 1000;
  wrap.style.left = `${rect.left}px`;
  wrap.style.top = `${rect.top}px`;
  wrap.style.width = `${rect.width || 40}px`;
  wrap.style.height = `${rect.height || 40}px`;
  document.body.appendChild(wrap);
  const colors = ['#ef4444', '#22c55e', '#3b82f6', '#eab308'];
  for (let i = 0; i < 12; i++) {
    const piece = document.createElement('span');
    piece.style.position = 'absolute';
    piece.style.width = '4px';
    piece.style.height = '8px';
    piece.style.left = `${Math.random() * rect.width}px`;
    piece.style.background = colors[Math.floor(Math.random() * colors.length)];
    piece.style.setProperty('--dx', `${Math.random() * 40 - 20}px`);
    piece.style.animation = 'star-fall 0.8s linear forwards';
    wrap.appendChild(piece);
  }
  setTimeout(() => wrap.remove(), 800);
}
