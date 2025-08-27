import { recipesCol, itemsCol, stateDoc, arrDel, slug } from "../firebase.js";
import { MEAL_DATA } from "../data/catalog.js";

/** Local */
let customRecipeDocs = {};    // name -> { id, items }
let combinedMeals    = {};    // name -> items[]
let activeMeals      = new Set();
let readyMeals       = new Set();

/** DOM refs in the Recipes tab */
let recipesListEl, newRecipeBtn, recipeDialog, recipeNameInput, recipeItemsInput, recipeSaveBtn, recipeCancelBtn, recipeDeleteBtn, ingSuggestionsBox;

export function initRecipesFeature(){
  // cache DOM
  recipesListEl     = document.getElementById('recipesList');
  newRecipeBtn      = document.getElementById('newRecipeBtn');
  recipeDialog      = document.getElementById('recipeDialog');
  recipeNameInput   = document.getElementById('recipeNameInput');
  recipeItemsInput  = document.getElementById('recipeItemsInput');
  recipeSaveBtn     = document.getElementById('recipeSaveBtn');
  recipeCancelBtn   = document.getElementById('recipeCancelBtn');
  recipeDeleteBtn   = document.getElementById('recipeDeleteBtn');
  ingSuggestionsBox = document.getElementById('ingSuggestions');

  if (newRecipeBtn) newRecipeBtn.addEventListener('click', () => openRecipeDialog(null));
  if (recipeCancelBtn) recipeCancelBtn.addEventListener('click', () => recipeDialog.close());

  // Delete inside dialog
  if (recipeDeleteBtn) recipeDeleteBtn.addEventListener('click', onDialogDelete);

  // Save handler
  if (recipeSaveBtn) recipeSaveBtn.addEventListener('click', onDialogSave);

  // Live snapshots
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
      renderRecipesPage();
    },
    err => console.error("recipes onSnapshot error", err)
  );

  stateDoc.onSnapshot(
    doc => {
      const data = doc.data() || {};
      const arr = Array.isArray(data.activeMeals) ? data.activeMeals : [];
      const readyArr = Array.isArray(data.readyMeals) ? data.readyMeals : [];
      activeMeals = new Set(arr);
      readyMeals = new Set(readyArr);
      renderRecipesPage(); // update badges
    },
    err => console.error("uiState onSnapshot error", err)
  );
}

/* ---------- Data merge ---------- */
function recomputeCombinedMeals(){
  combinedMeals = { ...MEAL_DATA };
  Object.entries(customRecipeDocs).forEach(([name, doc]) => {
    combinedMeals[name] = doc.items || [];
  });
}

/* ---------- Render ---------- */
function renderRecipesPage(){
  if(!recipesListEl) return;
  recipesListEl.innerHTML = "";

  const names = Object.keys(combinedMeals).sort((a,b)=>a.localeCompare(b));
  if(names.length === 0){
    const p = document.createElement('p');
    p.style.color = '#64748b';
    p.style.padding = '0 16px 16px';
    p.textContent = "Nog geen recepten.";
    recipesListEl.appendChild(p);
    return;
  }

  const ready = [];
  const other = [];

  names.forEach(name => {
    const items = combinedMeals[name] || [];
    const isCustom = !!customRecipeDocs[name];
    const isActive = activeMeals.has(name);
    recipesListEl.appendChild(renderCard(name, items, isCustom, isActive));
  });
}

function renderCard(name, items, isCustom, isActive){
  const card = document.createElement('div');
  card.className = 'recipe-card';
  card.classList.add(readyMeals.has(name) ? 'ready' : 'out-of-scope');

  const header = document.createElement('header');
  const title  = document.createElement('strong');
  title.textContent = name;
  const right  = document.createElement('div');
  right.style.display = 'flex';
  right.style.gap = '8px';
  right.style.alignItems = 'center';

  const badgeCount = document.createElement('span');
  badgeCount.className = 'badge';
  badgeCount.textContent = `${items.length} items`;

  const badgeSel = document.createElement('span');
  badgeSel.className = 'badge';
  badgeSel.style.background = isActive ? '#dcfce7' : '#eef2ff';
  badgeSel.textContent = isActive ? 'Geselecteerd' : 'Niet geselecteerd';

  const badgeStatus = document.createElement('span');
  badgeStatus.className = 'badge status';
  badgeStatus.textContent = readyMeals.has(name) ? 'Ready' : 'Out of scope';

  right.append(badgeCount, badgeSel, badgeStatus);
  header.append(title, right);

  const actions = document.createElement('div');
  actions.className = 'actions';

  if(isCustom){
    const editBtn = document.createElement('button');
    editBtn.className = 'btn ghost';
    editBtn.textContent = 'Bewerken';
    editBtn.onclick = () => openRecipeDialog({ name, ...customRecipeDocs[name] });

    const delBtn = document.createElement('button');
    delBtn.className = 'btn danger';
    delBtn.textContent = 'Verwijderen';
    delBtn.onclick = () => deleteRecipe(name);

    actions.append(editBtn, delBtn);
  } else {
    const ro = document.createElement('small');
    ro.style.color = '#64748b';
    ro.textContent = 'Standaard recept';
    actions.append(ro);
  }
  
    card.append(header, tags, actions);

    (readyMeals.has(name) ? ready : other).push(card);
  });

  if(ready.length){
    const h = document.createElement('h3');
    h.textContent = 'Ready to cook';
    h.style.gridColumn = '1 / -1';
    h.style.margin = '0';
    recipesListEl.appendChild(h);
    ready.forEach(card => recipesListEl.appendChild(card));
  }

  if(other.length){
    const h = document.createElement('h3');
    h.textContent = 'Other recipes';
    h.style.gridColumn = '1 / -1';
    h.style.margin = '0';
    recipesListEl.appendChild(h);
    other.forEach(card => recipesListEl.appendChild(card));
  }
}

/* ---------- Dialog ---------- */
let editingRecipeId   = null;
let editingIsNew      = true;

function openRecipeDialog(recipe){
  editingIsNew    = !recipe;
  editingRecipeId = recipe ? recipe.id : null;

  recipeNameInput.value  = recipe ? (recipe.name || '') : '';
  recipeItemsInput.value = recipe ? (recipe.items || []).join('\n') : '';

  // lock name on edit to avoid origin mismatches
  recipeNameInput.disabled = !!recipe;
  recipeDeleteBtn.style.display = recipe ? 'inline-block' : 'none';

  ingSuggestionsBox.innerHTML = "";
  recipeDialog.showModal();
  setTimeout(() => (recipe ? recipeItemsInput : recipeNameInput).focus(), 0);
}

async function onDialogSave(e){
  e.preventDefault();

  const name = (recipeNameInput.value || '').trim();
  const items = parseItems(recipeItemsInput.value);

  if(editingIsNew && !name){ alert("Geef een naam."); return; }
  if(items.length === 0){ alert("Voeg minimaal één ingrediënt toe."); return; }

  const payload = {
    name,
    items,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    ...(editingIsNew ? { createdAt: firebase.firestore.FieldValue.serverTimestamp() } : {})
  };

  try {
    if(editingIsNew){
      const id = slug(name) || ("r-" + Date.now());
      await recipesCol.doc(id).set(payload, { merge:true });
    } else {
      await recipesCol.doc(editingRecipeId).set({ items, updatedAt: payload.updatedAt }, { merge:true });
    }
    recipeDialog.close();
  } catch (err) {
    console.error("save recipe failed", err);
    alert("Opslaan mislukt: " + err.message);
  }
}

async function onDialogDelete(){
  if(!editingRecipeId) return;
  const name = recipeNameInput.value || 'recept';
  if(!confirm(`Verwijder "${name}"?`)) return;

  // If active: remove its items and unselect by reducing counts
  if(activeMeals.has(name)){
    const items = combinedMeals[name] || [];
    for(const it of items){ await cloudRemoveItem(it, name); }
    await stateDoc.set(
      { activeMeals: Array.from(new Set([...activeMeals].filter(x => x !== name))) },
      { merge:true }
    );
  }
  await recipesCol.doc(editingRecipeId).delete();
  recipeDialog.close();
}

/* ---------- Shared helpers ---------- */
export function parseItems(raw){
  return Array.from(new Set(
    (raw || "")
      .split(/[\n,]+/)
      .map(s => s.trim())
      .filter(Boolean)
  ));
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
async function deleteRecipe(name){
  const doc = customRecipeDocs[name];
  if(!doc) return;
  if(!confirm(`Recept "${name}" verwijderen?`)) return;

  // adjust counts if active
  if(activeMeals.has(name)){
    const items = combinedMeals[name] || [];
    for(const item of items){ await cloudRemoveItem(item, name); }
    await stateDoc.set(
      { activeMeals: Array.from(new Set([...activeMeals].filter(x => x !== name))) },
      { merge:true }
    );
  }
  await recipesCol.doc(doc.id).delete();
}
