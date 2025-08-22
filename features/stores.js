import { db, FieldValue, stateDoc, storesCol } from "../firebase.js";

/**
 * Stores (Winkels) feature
 * - Store CRUD
 * - Active store selector persisted in stateDoc.activeStoreId
 * - Reorders categories via currentSectionOrder()
 * - Optimistic UI + tiny toast
 */

const DEFAULT_SECTION_ORDER = [
  "Groente & Fruit","Vega","Brood","Ontbijt & Smeersels","Zuivel",
  "Pasta & Rijst","Kruiden & Specerijen","Chips & Snacks","Non-food","Diepvries","Toiletartikelen","Eigen"
];

// Local caches
let STORES = {};          // id -> { id, name, order[], ... }
let activeStoreId = null;

// Public helper so legacy code can reuse the order.
// We export it AND attach on window for backward compatibility.
export function currentSectionOrder() {
  const s = activeStoreId && STORES[activeStoreId];
  const order = (s && Array.isArray(s.order) && s.order.length) ? s.order : DEFAULT_SECTION_ORDER;
  return order;
}
window.currentSectionOrder = currentSectionOrder;

// --- Firestore helpers ---
async function createStore(name) {
  const payload = {
    name: String(name || "").trim() || "Winkel",
    order: [...DEFAULT_SECTION_ORDER],
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  const ref = await storesCol.add(payload);
  return ref.id;
}
async function updateStore(id, patch) {
  await storesCol.doc(id).set(
    { ...patch, updatedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );
}
async function deleteStore(id) {
  await storesCol.doc(id).delete();
  if (activeStoreId === id) {
    await stateDoc.set({ activeStoreId: FieldValue.delete() }, { merge: true });
  }
}
async function setActiveStore(idOrNull) {
  await stateDoc.set(
    { activeStoreId: idOrNull ?? FieldValue.delete() },
    { merge: true }
  );
}

// --- Tiny toast ---
function toast(msg, ms = 1200) {
  const t = document.createElement("div");
  t.textContent = msg;
  Object.assign(t.style, {
    position: "fixed",
    left: "50%",
    bottom: "72px",
    transform: "translateX(-50%)",
    background: "rgba(17,24,39,.92)",
    color: "#fff",
    padding: "8px 12px",
    borderRadius: "10px",
    fontSize: ".9rem",
    zIndex: 9999,
  });
  document.body.appendChild(t);
  setTimeout(() => t.remove(), ms);
}

// --- UI root / renderers ---
function ensureStoresTabSkeleton() {
  const container = document.getElementById("tab-stores");
  if (!container) return null;

  container.innerHTML = `
    <div class="stores-wrap" style="padding:16px">
      <div class="stores-header" style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin:6px 0 12px;">
        <h2 style="margin:0">🏬 Winkels</h2>
        <button id="storeAddBtn" class="btn primary sm">Nieuwe winkel</button>
      </div>
      <div id="storesGrid" class="stores-grid" style="display:grid;gap:12px;padding:0;"></div>
    </div>
  `;
  return container;
}

function renderStoresPage() {
  const container = ensureStoresTabSkeleton();
  if (!container) return;

  const addBtn = container.querySelector("#storeAddBtn");
  addBtn.onclick = async () => {
    const name = prompt("Naam van de winkel (bijv. Jumbo, AH XL)?");
    if (!name || !name.trim()) return;
    const id = await createStore(name.trim());
    openStoreEditor(id);
  };

  const grid = container.querySelector("#storesGrid");
  grid.innerHTML = "";

  const ids = Object.keys(STORES).sort((a, b) =>
    (STORES[a].name || "").localeCompare(STORES[b].name || "")
  );

  if (ids.length === 0) {
    const p = document.createElement("p");
    p.style.color = "#64748b";
    p.style.margin = "4px 0 0";
    p.textContent = "Nog geen winkels. Voeg er één toe.";
    grid.appendChild(p);
    return;
  }

  ids.forEach((id) => {
    const s = STORES[id];

    const card = document.createElement("div");
    card.className = "store-card";
    card.style.border = "1px solid #e2e8f0";
    card.style.borderRadius = "12px";
    card.style.background = "#fff";
    card.style.padding = "12px";

    const head = document.createElement("header");
    head.style.display = "flex";
    head.style.justifyContent = "space-between";
    head.style.alignItems = "center";
    head.style.gap = "8px";
    head.style.marginBottom = "8px";

    const title = document.createElement("strong");
    title.textContent = s.name || "Onbenoemd";

    const right = document.createElement("div");
    right.style.display = "flex";
    right.style.gap = "8px";

    const badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = `${s.order?.length || 0} categorieën`;
    styleBadge(badge);

    const activeBadge = document.createElement("span");
    activeBadge.className = "badge";
    styleBadge(activeBadge, activeStoreId === id);
    activeBadge.textContent = activeStoreId === id ? "Actief" : "Niet actief";

    right.append(badge, activeBadge);
    head.append(title, right);

    const actions = document.createElement("div");
    actions.className = "actions";
    actions.style.display = "flex";
    actions.style.gap = "8px";
    actions.style.flexWrap = "wrap";

    const setActive = document.createElement("button");
    setActive.className = "btn ghost";
    setActive.textContent = activeStoreId === id ? "Deactiveer" : "Maak actief";
    setActive.onclick = async (e) => {
      const btn = e.currentTarget;
      const targetId = activeStoreId === id ? null : id;

      // Optimistic UI
      const prev = activeStoreId;
      activeStoreId = targetId;
      renderStoresPage();
      // Let other parts (List) know the order may have changed
      window.dispatchEvent(new CustomEvent("store:active-changed", { detail: { activeStoreId } }));

      // Busy state
      btn.disabled = true;
      const prevLabel = btn.textContent;
      btn.textContent = "Bezig…";

      try {
        await setActiveStore(targetId);
        toast(targetId ? "Winkel actief" : "Winkel gedeactiveerd");
      } catch (err) {
        console.error("setActiveStore failed", err);
        activeStoreId = prev; // revert
        renderStoresPage();
        alert("Kon actieve winkel niet opslaan: " + (err.message || err));
      } finally {
        btn.disabled = false;
        btn.textContent = prevLabel;
      }
    };

    const edit = document.createElement("button");
    edit.className = "btn ghost";
    edit.textContent = "Bewerken";
    edit.onclick = () => openStoreEditor(id);

    const del = document.createElement("button");
    del.className = "btn danger";
    del.textContent = "Verwijderen";
    del.onclick = async () => {
      if (confirm(`Winkel "${s.name || "zonder naam"}" verwijderen?`)) {
        await deleteStore(id);
      }
    };

    actions.append(setActive, edit, del);
    card.append(head, actions);
    grid.appendChild(card);
  });
}

function styleBadge(el, isActive = false) {
  el.style.background = isActive ? "#dcfce7" : "#eef2ff";
  el.style.borderRadius = "999px";
  el.style.padding = "2px 8px";
  el.style.fontSize = ".75rem";
  el.style.color = "#0f172a";
}

// --- Simple editor dialog (reorder Up/Down) ---
function openStoreEditor(id) {
  const s = STORES[id];
  if (!s) return alert("Winkel niet gevonden");

  const dlg = document.createElement("dialog");
  dlg.style.border = "none";
  dlg.style.borderRadius = "12px";
  dlg.style.padding = "16px";
  dlg.style.width = "90%";
  dlg.style.maxWidth = "520px";

  dlg.innerHTML = `
    <form method="dialog" class="recipe-form">
      <h3 style="margin:0 0 8px;">Winkel bewerken</h3>
      <input id="storeName" type="text" placeholder="Naam" value="${(s.name || "").replace(/"/g, "&quot;")}" />
      <div style="font-weight:600; margin-top:6px;">Categorievolgorde</div>
      <div id="orderList" style="display:grid; gap:6px; max-height:260px; overflow:auto; border:1px solid #e2e8f0; border-radius:10px; padding:8px; background:#fff;"></div>
      <div class="recipe-dialog-actions" style="display:flex; gap:8px; justify-content:flex-end; margin-top:10px;">
        <button value="cancel" type="button" class="btn ghost" id="storeCancel">Annuleren</button>
        <button value="ok" class="btn primary" id="storeSave">Opslaan</button>
      </div>
    </form>
  `;
  document.body.appendChild(dlg);

  const nameInput = dlg.querySelector("#storeName");
  const listEl = dlg.querySelector("#orderList");

  let order = Array.isArray(s.order) && s.order.length ? [...s.order] : [...DEFAULT_SECTION_ORDER];

  function renderOrder() {
    listEl.innerHTML = "";
    order.forEach((sec, idx) => {
      const row = document.createElement("div");
      row.style.display = "grid";
      row.style.gridTemplateColumns = "1fr auto auto";
      row.style.alignItems = "center";
      row.style.gap = "6px";

      const label = document.createElement("div");
      label.textContent = sec;

      const up = document.createElement("button");
      up.type = "button";
      up.className = "btn ghost";
      up.textContent = "▲";
      up.disabled = idx === 0;
      up.onclick = () => {
        [order[idx - 1], order[idx]] = [order[idx], order[idx - 1]];
        renderOrder();
      };

      const down = document.createElement("button");
      down.type = "button";
      down.className = "btn ghost";
      down.textContent = "▼";
      down.disabled = idx === order.length - 1;
      down.onclick = () => {
        [order[idx], order[idx + 1]] = [order[idx + 1], order[idx]];
        renderOrder();
      };

      row.append(label, up, down);
      listEl.appendChild(row);
    });
  }
  renderOrder();

  dlg.querySelector("#storeCancel").onclick = () => {
    dlg.close();
    dlg.remove();
  };

  dlg.querySelector("#storeSave").onclick = async (e) => {
    e.preventDefault();

    const saveBtn = e.currentTarget;
    saveBtn.disabled = true;
    const orig = saveBtn.textContent;
    saveBtn.textContent = "Opslaan…";

    const name = (nameInput.value || "").trim() || "Winkel";

    // Optimistically update local cache so the tab feels instant
    STORES[id] = { ...(STORES[id] || {}), name, order: [...order] };
    renderStoresPage();

    try {
      await updateStore(id, { name, order: [...order] });
      toast("Winkel opgeslagen");
      dlg.close();
      dlg.remove();
    } catch (err) {
      console.error("updateStore failed", err);
      alert("Opslaan mislukt: " + (err.message || err));
      saveBtn.disabled = false;
      saveBtn.textContent = orig;
    }
  };

  dlg.showModal();
}

// --- Live Firestore sync + public init ---
export function initStoresFeature({ onActiveStoreChanged } = {}) {
  // Stores live
  storesCol.orderBy("name").onSnapshot(
    (snap) => {
      const map = {};
      snap.forEach((d) => (map[d.id] = { id: d.id, ...(d.data() || {}) }));
      STORES = map;
      renderStoresPage();
    },
    (err) => console.error("stores onSnapshot error", err)
  );

  // uiState live (active store id)
  stateDoc.onSnapshot(
    (doc) => {
      const d = doc.data() || {};
      activeStoreId = d.activeStoreId || null;
      renderStoresPage();
      if (typeof onActiveStoreChanged === "function") {
        onActiveStoreChanged(activeStoreId);
      }
      // Also broadcast as a DOM event for loose coupling
      window.dispatchEvent(new CustomEvent("store:active-changed", { detail: { activeStoreId } }));
    },
    (err) => console.error("uiState onSnapshot error", err)
  );

  // Initial paint in case snapshots are slow
  renderStoresPage();
}
