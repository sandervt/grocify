// features/items.js
import { itemsCatalogCol, storesCol, stateDoc, FieldValue } from "../firebase.js";
import { currentSectionOrder } from "./stores.js"; // export exists in stores.js

let items = [];     // [{id,name,defaultSection,aliases,sectionOverrides,...}]
let stores = {};    // id -> { id, name }
let activeStoreId = null;

/**
 * Mounts the Ingredients manager UI into provided elements.
 * Returns a dispose() function to unsubscribe snapshots & listeners.
 */
function mountItemsUI({ grid, addBtn, search, onDispose }){
  if (!grid) return () => {};

  const onSearch = () => render();

  addBtn?.addEventListener("click", () => openEditor());
  search?.addEventListener("input", onSearch);

  // live stores (for overrides + active store badge)
  const unsubStores = storesCol.onSnapshot(snap => {
    const map = {};
    snap.forEach(d => map[d.id] = { id:d.id, ...(d.data()||{}) });
    stores = map; render();
  });

  // active store
  const unsubState = stateDoc.onSnapshot(doc => {
    activeStoreId = (doc.data()||{}).activeStoreId || null;
    render();
  });

  // live catalog
  const unsubItems = itemsCatalogCol.orderBy("name").onSnapshot(snap => {
    items = snap.docs.map(d => ({ id:d.id, ...(d.data()||{}) }));
    render();
  });

  function render(){
    if(!grid) return;
    grid.innerHTML = "";

    const q = (search?.value || "").toLowerCase().trim();
    const order = currentSectionOrder();

    const filtered = items.filter(it =>
      !q ||
      it.name.toLowerCase().includes(q) ||
      (Array.isArray(it.aliases) && it.aliases.some(a => String(a).toLowerCase().includes(q)))
    );

    // group by resolved section (active store aware)
    const bySec = new Map();
    for(const it of filtered){
      const sec = (it.sectionOverrides?.[activeStoreId]) ?? it.defaultSection ?? "Eigen";
      if(!bySec.has(sec)) bySec.set(sec, []);
      bySec.get(sec).push(it);
    }

    const sections = order.filter(s => bySec.has(s)).concat([...bySec.keys()].filter(s => !order.includes(s)));

    for(const sec of sections){
      const card = document.createElement("div");
      card.className = "store-card";
      const head = document.createElement("header");
      const h = document.createElement("strong");
      h.textContent = sec;
      head.append(h);
      card.append(head);

      const list = document.createElement("div");
      list.style.display = "grid";
      list.style.gap = "8px";

      for(const it of (bySec.get(sec) || [])){
        const row = document.createElement("div");
        row.style.display = "grid";
        row.style.gridTemplateColumns = "1fr auto";
        row.style.alignItems = "center";
        row.style.gap = "8px";

        const left = document.createElement("div");
        left.innerHTML = `<div style="font-weight:600">${it.name}</div>
          <div style="color:#64748b;font-size:.85rem;">
            ${Array.isArray(it.aliases)&&it.aliases.length ? `aliassen: ${it.aliases.join(", ")}` : "—"}
          </div>`;

        const right = document.createElement("div");
        right.style.display = "flex"; right.style.gap = "6px";

        const edit = document.createElement("button");
        edit.className = "btn ghost"; edit.textContent = "Bewerken";
        edit.onclick = () => openEditor(it);

        const del = document.createElement("button");
        del.className = "btn danger"; del.textContent = "Verwijderen";
        del.onclick = async () => {
          if(confirm(`"${it.name}" verwijderen uit catalogus?`)){
            await itemsCatalogCol.doc(it.id).delete();
          }
        };

        right.append(edit, del);
        row.append(left, right);
        list.append(row);
      }

      card.append(list);
      grid.append(card);
    }
  }

  const dispose = () => {
    try { search?.removeEventListener("input", onSearch); } catch {}
    try { unsubStores(); } catch {}
    try { unsubState(); } catch {}
    try { unsubItems(); } catch {}
  };
  if (typeof onDispose === "function") onDispose(dispose);
  return dispose;
}

export function initItemsFeature(){
  const grid  = document.getElementById("itemsGrid");
  const addBtn = document.getElementById("itemAddBtn");
  const search = document.getElementById("itemSearch");
  mountItemsUI({ grid, addBtn, search });
}

/** Simple editor dialog */
function openEditor(item){
  const dlg = document.createElement("dialog");
  dlg.style.border = "none"; dlg.style.borderRadius = "12px"; dlg.style.padding = "16px";
  dlg.style.width = "90%"; dlg.style.maxWidth = "520px";

  const name = item?.name || "";
  const aliases = (item?.aliases || []).join(", ");
  const defSec = item?.defaultSection || "Eigen";
  const overrides = item?.sectionOverrides ? { ...item.sectionOverrides } : {};

  const options = (currentSectionOrder() || [
    "Groente & Fruit","Vega","Brood","Ontbijt & Smeersels","Zuivel",
    "Pasta & Rijst","Kruiden & Specerijen","Chips & Snacks","Non-food","Diepvries","Toiletartikelen","Eigen"
  ]).map(s => `<option ${s===defSec?'selected':''}>${s}</option>`).join("");

  dlg.innerHTML = `
    <form method="dialog" class="recipe-form">
      <h3 style="margin:0 0 8px;">Ingrediënt</h3>
      <input id="iName" type="text" placeholder="Naam" value="${escapeHtml(name)}" ${item?'disabled':''}/>
      <label>Standaard categorie</label>
      <select id="iSection">${options}</select>
      <label>Aliassen (komma-gescheiden)</label>
      <input id="iAliases" type="text" placeholder="bijv. yoghurt, yoghurt naturel" value="${escapeHtml(aliases)}"/>

      <details>
        <summary>Per-winkel overrides</summary>
        <div id="iOverrides" style="display:grid;gap:6px;margin-top:8px;"></div>
      </details>

      <div class="recipe-dialog-actions">
        ${item ? `<button type="button" id="iDelete" class="btn danger" style="margin-right:auto;">Verwijderen</button>` : ""}
        <button value="cancel" type="button" class="btn ghost" id="iCancel">Annuleren</button>
        <button value="ok" class="btn primary" id="iSave">Opslaan</button>
      </div>
    </form>
  `;
  document.body.appendChild(dlg);

  // render overrides (live stores)
  const holder = dlg.querySelector("#iOverrides");
  (async () => {
    const snap = await storesCol.get();
    snap.forEach(d => {
      const s = { id:d.id, ...(d.data()||{}) };
      const row = document.createElement("div");
      row.style.display = "grid";
      row.style.gridTemplateColumns = "1fr auto";
      row.style.gap = "6px";

      const lab = document.createElement("div");
      lab.textContent = s.name || "Winkel";

      const sel = document.createElement("select");
      for(const opt of currentSectionOrder() || []){
        const o = document.createElement("option");
        o.value = opt; o.textContent = opt;
        if(overrides?.[s.id] === opt) o.selected = true;
        sel.appendChild(o);
      }
      sel.addEventListener("change", e => {
        const v = e.currentTarget.value;
        if(!v) delete overrides[s.id];
        else overrides[s.id] = v;
      });

      row.append(lab, sel);
      holder.append(row);
    });
  })();

  dlg.querySelector("#iCancel").onclick = () => { dlg.close(); dlg.remove(); };
  dlg.querySelector("#iSave").onclick = async (e) => {
    e.preventDefault();
    const payload = {
      name: (dlg.querySelector("#iName").value || name).trim(),
      defaultSection: dlg.querySelector("#iSection").value,
      aliases: (dlg.querySelector("#iAliases").value || "")
        .split(",").map(s => s.trim()).filter(Boolean),
      sectionOverrides: overrides,
      updatedAt: FieldValue.serverTimestamp(),
      ...(item ? {} : { createdAt: FieldValue.serverTimestamp() })
    };
    const id = item?.id || slug(payload.name);
    await itemsCatalogCol.doc(id).set(payload, { merge:true });
    dlg.close(); dlg.remove();
  };

  if(item){
    dlg.querySelector("#iDelete")?.addEventListener("click", async () => {
      if(confirm(`"${item.name}" verwijderen?`)){
        await itemsCatalogCol.doc(item.id).delete();
        dlg.close(); dlg.remove();
      }
    });
  }

  dlg.showModal();
}

function slug(name){ return String(name||"").toLowerCase().trim().replace(/\s+/g,'-').replace(/[^\w-]/g,''); }
function escapeHtml(s){ return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }

/** Open the Ingredients manager as a dialog from the overflow menu. */
export function openItemsManagerDialog(){
  const dlg = document.createElement("dialog");
  dlg.className = "items-manager";
  dlg.style.border = "none"; dlg.style.borderRadius = "12px"; dlg.style.padding = "0";
  dlg.style.width = "min(720px, 96vw)";

  dlg.innerHTML = `
    <header style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border-bottom:1px solid #e2e8f0;">
      <strong>🥕 Ingrediënten beheren</strong>
      <div style="display:flex;gap:8px;">
        <input id="imSearch" type="search" placeholder="Zoek…" style="padding:8px 10px;border:1px solid #e2e8f0;border-radius:10px;">
        <button id="imAdd" class="btn primary">Nieuw</button>
        <button id="imClose" class="btn ghost">Sluiten</button>
      </div>
    </header>
    <div class="body" style="padding:12px 14px;max-height:70vh;overflow:auto;">
      <div id="imGrid" class="stores-grid" style="display:grid;gap:12px;"></div>
    </div>
  `;

  document.body.appendChild(dlg);

  const grid = dlg.querySelector("#imGrid");
  const addBtn = dlg.querySelector("#imAdd");
  const search = dlg.querySelector("#imSearch");
  const closeBtn = dlg.querySelector("#imClose");

  let dispose = () => {};
  dispose = mountItemsUI({ grid, addBtn, search, onDispose: (d)=>dispose=d });

  closeBtn.addEventListener("click", () => dlg.close());
  dlg.addEventListener("close", () => { try { dispose?.(); } catch{} dlg.remove(); });

  dlg.showModal();
}
