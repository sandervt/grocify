import { itemsCol, stateDoc, recipesCol, inc, arrAdd, arrDel, slug } from "../firebase.js";
import { SECTION_ORDER, MEAL_DATA, WEEKLY_GROUPS, ITEM_TO_SECTION, inferSection, suggestMatches } from "../data/catalog.js";

/** Local state */
let activeMeals = new Set();            // from uiState.activeMeals
let activeItems = {};                   // { name: { count, sources:Set, checked, unit? } }
let customRecipeDocs = {};              // name -> { id, items: string[] }
let combinedMeals = {};                 // name -> items[] (strings)
let KNOWN_ITEMS = [];

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

/** Public for Stores feature to re-render after active store change */
window.renderList = renderList;

/** Init */
export function initListFeature(){
  // list items live
  itemsCol.onSnapshot(
    snap => setActiveFromCloud(snap.docs.map(d => d.data())),
    err  => console.error("onSnapshot items error", err)
  );

  // meals state live
  stateDoc.onSnapshot(
    doc => {
      const arr = (doc.exists && Array.isArray(doc.data().activeMeals)) ? doc.data().activeMeals : [];
      activeMeals = new Set(arr);
      reflectMealPillsFromState();
      updateCounter();
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
  renderWeeklies();
  updateCounter();
  wireDetailsSections();
  wireAddDialog();
  wireClearList();
  setClearCtaVisible(false);

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

/* ---------- Weekly selections ---------- */
function renderWeeklies(){
  const container = document.getElementById("weeklyGroups");
  if(!container) return;

  container.innerHTML = "";
  Object.entries(WEEKLY_GROUPS).forEach(([group, items]) => {
    const card = document.createElement("div");
    card.className = "weekly-group";
    card.innerHTML = `
      <div class="weekly-group__header">
        <span class="weekly-group__chev">►</span>
        <span class="weekly-group__title">${group}</span>
        <span class="weekly-group__badge">0</span>
      </div>
      <div class="weekly-group__content"></div>
    `;
    const header = card.querySelector(".weekly-group__header");
    header.addEventListener("click", () => {
      card.classList.toggle("open");
      header.classList.toggle("active");
      header.querySelector(".weekly-group__chev").textContent = card.classList.contains("open") ? "▼" : "►";
    });

    const wrap = card.querySelector(".weekly-group__content");
    items.forEach(name => {
      const btn = document.createElement("button");
      btn.textContent = name;
      btn.className = "chip";
      btn.addEventListener("click", async () => {
        const isOn = btn.classList.toggle("active");
        if (isOn) {
          const sec = inferSection(name);
          await cloudAddItem(name, sec, group, 1, undefined);
        } else {
          await cloudRemoveSource(name, group);
        }
      });
      wrap.appendChild(btn);
    });

    container.appendChild(card);
  });
}
function updateAllWeeklyBadges(){
  const weeklyGroups = new Set(Object.keys(WEEKLY_GROUPS));
  const map = {};
  for (const data of Object.values(activeItems)) {
    for (const src of data.sources) {
      if (weeklyGroups.has(src)) map[src] = (map[src] || 0) + 1;
    }
  }
  document.querySelectorAll(".weekly-group").forEach(card => {
    const title = card.querySelector(".weekly-group__title")?.textContent ?? "";
    const badge = card.querySelector(".weekly-group__badge");
    const count = map[title] || 0;
    if (badge) badge.textContent = count;
  });
}
function syncWeeklySelectionsFromCloud(){
  const weeklyGroups = new Set(Object.keys(WEEKLY_GROUPS));
  const active = {};
  for (const [name, data] of Object.entries(activeItems)) {
    for (const src of data.sources) {
      if (weeklyGroups.has(src)) active[`${src}__${name}`] = true;
    }
  }
  document.querySelectorAll(".weekly-group__content button").forEach(btn => {
    const group = btn.closest(".weekly-group")?.querySelector(".weekly-group__title")?.textContent ?? "";
    const key = `${group}__${btn.textContent}`;
    btn.classList.toggle("active", !!active[key]);
  });
}

/* ---------- Meals ---------- */
function recomputeCombinedMeals(){
  // Normalize to: name -> items[] (strings)
  const builtIns = {};
  Object.entries(MEAL_DATA || {}).forEach(([name, items]) => {
    builtIns[name] = Array.isArray(items) ? items : [];
  });
  const customs = {};
  Object.entries(customRecipeDocs || {}).forEach(([name, doc]) => {
    customs[name] = Array.isArray(doc.items) ? doc.items : [];
  });
  combinedMeals = { ...builtIns, ...customs };
}
function renderMeals(){
  const wrap = document.getElementById("mealsWrap");
  if(!wrap) return;

  wrap.innerHTML = "";
  Object.entries(combinedMeals).forEach(([name, items]) => {
    const row = document.createElement("div");
    row.className = "meal-row";
    row.innerHTML = `
      <button class="chip">${name}</button>
      <div class="meal-row__items">${(items || []).map(i => `<span>${i}</span>`).join("")}</div>
    `;
    const btn = row.querySelector("button");
    btn.addEventListener("click", async () => {
      const turnOn = !btn.classList.contains("active");
      btn.classList.toggle("active", turnOn);
      if (turnOn) {
        await cloudAddRecipe(name);
        activeMeals.add(name);
      } else {
        await cloudRemoveRecipe(name);
        activeMeals.delete(name);
      }
      await saveMealState();
      updateCounter();
    });
    if (activeMeals.has(name)) btn.classList.add("active");
    wrap.appendChild(row);
  });
  updateCounter();
  updateAllWeeklyBadges();
}
function reflectMealPillsFromState(){
  document.querySelectorAll(".meal-row button").forEach(btn => {
    const name = btn.textContent || "";
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
function updateWeeklyHeaderCounter(){
  const el = document.getElementById("weeklyCounter");
  if(!el) return;
  const weeklyGroups = new Set(Object.keys(WEEKLY_GROUPS));
  let count = 0;
  for (const data of Object.values(activeItems)) {
    const hasWeeklySource = [...data.sources].some(src => weeklyGroups.has(src));
    if (hasWeeklySource) count++;
  }
  el.textContent = count === 1 ? "1 item" : `${count} items`;
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
  syncWeeklySelectionsFromCloud();
  updateAllWeeklyBadges();
  updateWeeklyHeaderCounter();
  setClearCtaVisible(cloudDocs.length > 0);
}

// MVP STEP-1: toggle visibility of bottom clear CTA
function setClearCtaVisible(hasItems){
  const btn = document.getElementById('clearListBtn');
  if (!btn) return;
  btn.style.display = hasItems ? 'block' : 'none';
}

function renderList(){
  const ul = document.getElementById("shoppingList");
  if(!ul) return;
  ul.innerHTML = "";
  const order = (typeof window.currentSectionOrder === "function")
    ? window.currentSectionOrder()
    : SECTION_ORDER;

  order.forEach(section => {
    const items = Object.keys(activeItems).filter(i => (ITEM_TO_SECTION[i] || inferSection(i)) === section);
    if (items.length === 0) return;

    const li = document.createElement("li");
    li.className = "section";
    li.innerHTML = `
      <div class="section__header">
        <h3>${section}</h3>
        <span class="section__count">${items.filter(i => !activeItems[i].checked).length}/${items.length}</span>
      </div>
      <ul class="section__items"></ul>
    `;
    const inner = li.querySelector(".section__items");
    items.sort((a,b) => a.localeCompare(b)).forEach(name => {
      const row = document.createElement("li");
      row.className = "item-row";
      const data = activeItems[name];
      const qtyStr = data.count > 1 ? `×${data.count}` : "";
      const unitStr = data.unit ? ` <span class="unit">(${data.unit})</span>` : "";
      row.innerHTML = `
        <label class="checkbox">
          <input type="checkbox" ${data.checked ? "checked" : ""}/>
          <span class="label">${name}${unitStr}</span>
          <span class="qty">${qtyStr}</span>
        </label>
      `;
      const cb = row.querySelector("input[type=checkbox]");
      cb.addEventListener("change", async () => {
        await cloudToggleCheck(name, cb.checked);
      });
      inner.appendChild(row);
    });

    ul.appendChild(li);
  });
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
  if(!input || !list) return;

  const q = (input.value || "").trim();
  list.innerHTML = "";

  if (!q) {
    // Show recents as chips
    const recents = loadRecents();
    if (recents.length === 0) return;
    recents.forEach(name => {
      const li = document.createElement("li");
      li.className = "suggestion-chip";
      li.textContent = name;
      li.addEventListener("click", () => {
        input.value = name;
        input.focus();
        refreshDraftChips();
      });
      list.appendChild(li);
    });
    return;
  }

  // Type-ahead matches
  const suggestions = suggestMatches(q, KNOWN_ITEMS, 12);
  suggestions.forEach(s => {
    const li = document.createElement("li");
    li.textContent = s;
    li.addEventListener("click", () => {
      input.value = s;
      input.focus();
      refreshDraftChips();
    });
    list.appendChild(li);
  });
}

function wireDetailsSections(){
  const input = document.getElementById("addInput");
  if(!input) return;
  refreshSuggestions();
  refreshDraftChips();

  input.addEventListener("input", () => {
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

    // STEP-5: Offer Undo for the add
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

    const ok = window.confirm("Weet je zeker dat je de hele lijst wilt leegmaken? Je kunt dit ongedaan maken.");
    if(!ok) return;

    const prevItems = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    let prevMeals = [];
    try {
      const st = await stateDoc.get();
      prevMeals = (st.exists && Array.isArray(st.data().activeMeals)) ? st.data().activeMeals : [];
    } catch(e){ prevMeals = []; }

    await cloudClearList();

    document.querySelectorAll(".meal-row button").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".weekly-group__content button").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".weekly-group").forEach(card => {
      card.classList.remove("open");
      const header = card.querySelector(".weekly-group__header");
      const chev = card.querySelector(".weekly-group__chev");
      if(header) header.classList.remove("active");
      if(chev) chev.textContent = "►";
    });
    updateCounter();

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
  activeMeals = new Set();
  await saveMealState();
}
// ===== STEP-5: Undo helpers =====
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
