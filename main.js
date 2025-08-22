import { initFirebase } from "./firebase.js";
import { initStoresFeature } from "./features/stores.js";

window.addEventListener("DOMContentLoaded", async () => {
  await initFirebase();

  // Boot the Stores feature (Winkels)
  initStoresFeature({
    // Optional hook: if your List feature exposes window.renderList,
    // call it whenever the active store changes so the list re-sorts.
    onActiveStoreChanged() {
      if (typeof window.renderList === "function") {
        window.renderList();
      }
    },
  });

  // If you later split other features:
  // initListFeature();
  // initRecipesFeature();
});
