import { itemsCol, stateDoc, recipesCol, inc, arrAdd, arrDel, slug } from "../firebase.js";
import { SECTION_ORDER, MEAL_DATA, WEEKLY_GROUPS, ITEM_TO_SECTION, inferSection, suggestMatches } from "../data/catalog.js";

/** Local state */
let activeMeals = new Set();            // from uiState.activeMeals
let activeItems = {};                   // { name: { count, sources:Set, checked } }
let customRecipeDocs = {};              // name -> { id, items }
let combinedMeals = {};                 // built-ins + customs
let KNOWN_ITEMS = [];

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

  // custom recipes live (for pills list + known items pool)
  recipesCol.orderBy('name').onSnapshot(
    snap => {
      const map = {};
      snap.docs.forEach(d => {
        const data = d.data() || {};
        const name = (data.name || "").trim();
        if(!name) return;
        map[name] = { id: d.id, items: Array.isArray(data.items) ? data.items : [] };
      });
      customRecipeDocs = map;
      recomputeCombinedMeals();
    },
    err => console.error("recipes onSnapshot error", err)
  );

  // UI wiring
  renderMeals();
  renderWeeklies();
  updateCounter();
  wireDetailsSections();
  wireAddDialog();
  wireClearList();
  unifyFloatingActions();
}

/* ---------- Known items pool ---------- */
function getKnownItems(){
  const fromMap   = Object.keys(ITEM_TO_SECTION);
  const fromMeals = Object.values(MEAL_DATA).flat();
  const fromWk    = Object.values(WEEKLY_GROUPS).flat();
  const fromCloud = Object.keys(activeItems);
  const fromCustom= Object.values(customRecipeDocs).flatMap(d => d.items || []);
  return Array.from(new Set([...fromMap, ...fromMeals, ...fromWk, ...fromCloud, ...fromCustom]))
    .sort((a,b)=>a.localeCompare(b));
}
function refreshKnownItems(){ KNOWN_ITEMS = getKnownItems(); }

/* ---------- Cloud writes ---------- */
async function cloudAddItem(name, section, origin){
  try{
    const id = slug(name);
    await itemsCol.doc(id).set({
      name, section,
      count: inc(),
      origins: arrAdd(origin),
      checked: false,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge:true });
  }catch(err){
    console.error("cloudAddItem failed", err);
    alert("Kon item niet toevoegen: " + err.message);
  }
}
async function cloudRemoveItem(name, origin){
  const id = slug(name);
  await firebase.firestore().runTransaction(async tx => {
    const ref = itemsCol.doc(id);
    const snap = await tx.get(ref);
    if(!snap.exists) return;
    const data = snap.data();
    const newCount = (data.count || 0) - 1;
    if(newCount <= 0) tx.delete(ref);
    else tx.update(ref, { count: newCount, origins: arrDel(origin) });
  });
}
async function cloudToggleChecked(name, checked){
  await itemsCol.doc(slug(name)).set({ checked }, { merge:true });
}
async function saveMealState(){
  try{
    await stateDoc.set({ activeMeals: Array.from(activeMeals) }, { merge:true });
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

/* ---------- Meals dataset = built-ins + customs ---------- */
function recomputeCombinedMeals(){
  combinedMeals = { ...MEAL_DATA };
  Object.entries(customRecipeDocs).forEach(([name, doc]) => {
    combinedMeals[name] = doc.items || [];
  });
  refreshKnownItems();
  renderMeals();
}

/* ---------- Meals UI (pills) ---------- */
function renderMeals(){
  const row = document.getElementById("mealRow");
  if(!row) return;
  row.innerHTML = "";
  const names = Object.keys(combinedMeals).sort((a,b)=>a.localeCompare(b));
  names.forEach(meal => {
    const btn = document.createElement("button");
    btn.textContent = meal;
    btn.dataset.meal = meal;
    btn.classList.toggle("active", activeMeals.has(meal));
    btn.onclick = async () => {
      const willActivate = !btn.classList.contains("active");
      const items = combinedMeals[meal] || [];
      if(willActivate){
        activeMeals.add(meal);
        for(const item of items){
          const sec = inferSection(item);
          cloudAddItem(item, sec, meal);
        }
      }else{
        activeMeals.delete(meal);
        for(const item of items){
          cloudRemoveItem(item, meal);
        }
      }
      btn.classList.toggle("active", willActivate);
      updateCounter();
      await saveMealState();
    };
    row.appendChild(btn);
  });
}
function reflectMealPillsFromState(){
  const row = document.getElementById("mealRow");
  if(!row) return;
  row.querySelectorAll("button[data-meal]").forEach(btn => {
    const meal = btn.dataset.meal;
    btn.classList.toggle("active", activeMeals.has(meal));
  });
}

/* ---------- Weeklies Accordion UI ---------- */
function renderWeeklies(){
  const container = document.getElementById("weeklyAccordion");
  if(!container) return;
  container.innerHTML = "";
  Object.keys(WEEKLY_GROUPS).forEach(group => {
    const card = document.createElement("div");
    card.className = "weekly-group";
    card.dataset.group = group;

    const header = document.createElement("button");
    header.className = "weekly-group__header";
    header.onclick = () => toggleWeeklyGroupAccordion(group);

    const titleWrap = document.createElement("span");
    titleWrap.className = "weekly-group__title";

    const chev = document.createElement("span");
    chev.className = "weekly-group__chev";
    chev.textContent = "►";

    const title = document.createElement("span");
    title.textContent = group;

    titleWrap.append(chev, title);

    const badge = document.createElement("span");
    badge.className = "weekly-group__badge";
    badge.textContent = "0 geselecteerd";

    header.append(titleWrap, badge);

    const content = document.createElement("div");
    content.className = "weekly-group__content";
    content.id = `group-${group}`;

    WEEKLY_GROUPS[group].forEach(item => {
      const b = document.createElement("button");
      b.textContent = item;
      b.dataset.item = item;
      b.onclick = () => {
        const active = b.classList.toggle("active");
        if(active){
          const sec = inferSection(item);
          cloudAddItem(item, sec, group);
        }else{
          cloudRemoveItem(item, group);
        }
        updateWeeklyBadge(group);
      };
      content.appendChild(b);
    });

    card.append(header, content);
    container.appendChild(card);
    updateWeeklyBadge(group);
  });
  syncWeeklySelectionsFromCloud();
}
function toggleWeeklyGroupAccordion(groupName){
  const cards = document.querySelectorAll(".weekly-group");
  cards.forEach(card => {
    const header = card.querySelector(".weekly-group__header");
    const chev = card.querySelector(".weekly-group__chev");
    const isTarget = card.dataset.group === groupName;
    if(isTarget){
      const willOpen = !card.classList.contains("open");
      card.classList.toggle("open", willOpen);
      chev.textContent = willOpen ? "▼" : "►";
      header.classList.toggle("active", willOpen);
      if(willOpen) card.scrollIntoView({ behavior:"smooth", block:"start" });
    }else{
      card.classList.remove("open");
      header.classList.remove("active");
      const otherChev = card.querySelector(".weekly-group__chev");
      if(otherChev) otherChev.textContent = "►";
    }
  });
}
function updateWeeklyBadge(groupName){
  const count = Object.entries(activeItems)
    .filter(([_, data]) => data.sources.has(groupName))
    .length;
  const card = document.querySelector(`.weekly-group[data-group="${CSS.escape(groupName)}"]`);
  if(!card) return;
  const badge = card.querySelector(".weekly-group__badge");
  badge.textContent = count === 1 ? "1 geselecteerd" : `${count} geselecteerd`;
}
function updateAllWeeklyBadges(){
  Object.keys(WEEKLY_GROUPS).forEach(updateWeeklyBadge);
}
function syncWeeklySelectionsFromCloud(){
  Object.keys(WEEKLY_GROUPS).forEach(group => {
    const content = document.getElementById(`group-${group}`);
    if(!content) return;
    content.querySelectorAll("button").forEach(btn => {
      const item = btn.dataset.item;
      const cloud = activeItems[item];
      const shouldBeActive = !!(cloud && cloud.sources.has(group));
      btn.classList.toggle("active", shouldBeActive);
    });
    updateWeeklyBadge(group);
  });
  updateWeeklyHeaderCounter();
}

/* ---------- Shopping list ---------- */
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
      checked: !!d.checked
    };
  });
  refreshKnownItems();
  renderList();
  syncWeeklySelectionsFromCloud();
  updateAllWeeklyBadges();
  updateWeeklyHeaderCounter();
}
function renderList(){
  const ul = document.getElementById("shoppingList");
  if(!ul) return;
  ul.innerHTML = "";
  const order = (typeof window.currentSectionOrder === "function")
    ? window.currentSectionOrder()
    : SECTION_ORDER;

  order.forEach(section => {
    const items = Object.keys(activeItems).filter(i => (ITEM_TO_SECTION[i] || "Eigen") === section);
    if(items.length > 0){
      const header = document.createElement("li");
      header.className = "section-header";
      header.textContent = section;
      ul.appendChild(header);
      items.forEach(name => {
        const data = activeItems[name];
        const li = document.createElement("li");
        const label = data.count > 1 ? `${name} (${data.count}x)` : name;
        const span = document.createElement("span");
        span.textContent = label;
        const small = document.createElement("small");
        small.textContent = Array.from(data.sources).join(", ");
        li.append(span, small);
        li.classList.toggle("crossed", !!data.checked);
        li.onclick = () => cloudToggleChecked(name, !li.classList.contains("crossed"));
        ul.appendChild(li);
      });
    }
  });
}

/* ---------- UI state for details sections ---------- */
function wireDetailsSections(){
  const mealsDetails    = document.getElementById('sec-meals');
  const weekliesDetails = document.getElementById('sec-weeklies');
  if(!mealsDetails || !weekliesDetails) return;

  if (localStorage.getItem('sec-weeklies-open') === null && window.innerWidth < 768) {
    weekliesDetails.removeAttribute('open');
  }
  const s1 = localStorage.getItem('sec-meals-open');
  if (s1 !== null) mealsDetails.toggleAttribute('open', s1 === 'true');
  const s2 = localStorage.getItem('sec-weeklies-open');
  if (s2 !== null) weekliesDetails.toggleAttribute('open', s2 === 'true');

  function wire(detailsEl){
    const summary = detailsEl.querySelector('summary .section__chev');
    const update = () => { if (summary) summary.textContent = detailsEl.open ? '▼' : '►'; };
    update();
    detailsEl.addEventListener('toggle', () => {
      update();
      const key = detailsEl.id + '-open';
      localStorage.setItem(key, String(detailsEl.open));
    });
  }
  wire(mealsDetails);
  wire(weekliesDetails);
}

/* ---------- Add item dialog + FAB ---------- */
function wireAddDialog(){
  const fab        = document.getElementById("fabAdd");
  const dlg        = document.getElementById("addDialog");
  const addInput   = document.getElementById("addInput");
  const addConfirm = document.getElementById("addConfirm");
  const addCancel  = document.getElementById("addCancel");
  const suggBox    = document.getElementById("suggestions");
  if(!fab || !dlg) return;

  function refreshKnownItemsAndClearDialog(){
    refreshKnownItems();
    suggBox.innerHTML = "";
    addInput.value = "";
  }

  fab.addEventListener("click", () => {
    refreshKnownItemsAndClearDialog();
    dlg.showModal();
    setTimeout(()=> addInput.focus(), 0);
  });
  addCancel.addEventListener("click", () => dlg.close());
  addInput.addEventListener("input", () => {
    const q = addInput.value;
    const matches = suggestMatches(q, KNOWN_ITEMS);
    suggBox.innerHTML = "";
    matches.forEach(name => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = name + " · " + inferSection(name);
      b.addEventListener("click", async () => {
        await addName(name);
        addInput.value = ""; dlg.close();
      });
      suggBox.appendChild(b);
    });
  });
  addInput.addEventListener("keydown", async (e) => {
    if(e.key === "Enter"){
      e.preventDefault();
      if(!addInput.value.trim()) return;
      await addName(addInput.value.trim());
      addInput.value = "";
      dlg.close();
    }
  });
  addConfirm.addEventListener("click", async (e) => {
    e.preventDefault();
    if(!addInput.value.trim()) return;
    await addName(addInput.value.trim());
    addInput.value = "";
    dlg.close();
  });
  async function addName(name){
    const sec = inferSection(name);
    await cloudAddItem(name, sec, "Eigen");
  }
}

/* ---------- Clear list ---------- */
function wireClearList(){
  const btn = document.getElementById("clearListBtn");
  if(!btn) return;
  btn.addEventListener("click", async () => {
    await cloudClearList();
    document.querySelectorAll(".meal-row button").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".weekly-group__content button").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".weekly-group").forEach(card => {
      card.classList.remove("open");
      card.querySelector(".weekly-group__header").classList.remove("active");
      card.querySelector(".weekly-group__chev").textContent = "►";
    });
    updateCounter();
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
  fab.setAttribute('aria-label', fabLabel);
  clear.setAttribute('aria-label', clearLabel);
  fab.setAttribute('title', fabLabel);
  clear.setAttribute('title', clearLabel);

  const existing = document.getElementById('fabTray');
  if (existing) return; // already wrapped

  const tray = document.createElement('div');
  tray.className = 'fab-tray';
  tray.id = 'fabTray';
  tray.appendChild(fab);
  tray.appendChild(clear);
  document.body.appendChild(tray);
}
