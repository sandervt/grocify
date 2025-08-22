// Uses Firebase *compat* SDK that you already include in index.html <head>
// Exposes db/auth + the collections the Stores feature needs.

export let db, auth, FieldValue;
export const HOUSEHOLD_ID = "shared";

export let stateDoc;   // households/{id}/meta/uiState
export let storesCol;  // households/{id}/stores

export async function initFirebase() {
  // Prevent double-init on hot reload or multiple calls
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

  try {
    await firebase.firestore().enablePersistence({ synchronizeTabs: true });
  } catch (e) {
    // ok if unsupported (Safari private, etc.)
  }

  try {
    await auth.signInAnonymously();
  } catch (e) {
    console.error("Anonymous auth failed:", e);
  }

  const base = db.collection("households").doc(HOUSEHOLD_ID);
  stateDoc  = base.collection("meta").doc("uiState");
  storesCol = base.collection("stores");
}
