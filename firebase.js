// Uses Firebase *compat* SDKs that are loaded in index.html

export let db, auth, FieldValue;
export const HOUSEHOLD_ID = "shared";

export let stateDoc;    // households/{id}/meta/uiState
export let itemsCol;    // households/{id}/listItems
export let recipesCol;  // households/{id}/recipes
export let storesCol;   // households/{id}/stores

// Small helpers shared across features
export const inc = (n = 1) => firebase.firestore.FieldValue.increment(n);
export const arrAdd = (v) => firebase.firestore.FieldValue.arrayUnion(v);
export const arrDel = (v) => firebase.firestore.FieldValue.arrayRemove(v);
export const slug   = (name) => String(name||"").toLowerCase().trim().replace(/\s+/g,'-').replace(/[^\w-]/g,'');

export async function initFirebase() {
  if (!firebase.apps || firebase.apps.length === 0) {
    const firebaseConfig = {
      apiKey: "AIzaSyCZWsoDIQYwCF-V2QuvYjxrFGB84gRnHFo",
      authDomain: "grocify-2fd51.firebaseapp.com",
      projectId: "grocify-2fd51",
    };
    firebase.initializeApp(firebaseConfig);
  }
  auth = firebase.auth();
  db   = firebase.firestore();
  FieldValue = firebase.firestore.FieldValue;

  try { await db.enablePersistence({ synchronizeTabs: true }); } catch(e){}

  try { await auth.signInAnonymously(); } catch(e){ console.error("Anon auth failed:", e); }

  const base = db.collection("households").doc(HOUSEHOLD_ID);
  stateDoc   = base.collection("meta").doc("uiState");
  itemsCol   = base.collection("listItems");
  recipesCol = base.collection("recipes");
  storesCol  = base.collection("stores");
}
