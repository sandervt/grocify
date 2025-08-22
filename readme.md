/index.html
/styles.css
/app/main.js                // bootstraps app
/app/firebase.js            // refs to db, auth, collections, helpers (slug, inc, arrAdd...)
/app/state.js               // in-memory state (activeMeals, activeItems, STORES...), uiState sync
/app/ui/common.js           // toast(), badge helpers, utilities
/app/features/list.js       // renderMeals(), renderWeeklies(), renderList(), clear button wiring
/app/features/recipes.js    // recipes UI + CRUD dialog
/app/features/stores.js     // stores UI + CRUD, currentSectionOrder()


### Backlog

# MVP (Sprint 1): P0 + P1(5,6,8)

1. **Single “+” FAB & Overflow Menu**

* **Goal:** Replace dual FABs with one **+**; move “Clear list” to overflow.
* **AC:**

  * Given the main screen, when I tap **+**, then the composer opens.
  * Given the main screen, when I open **…**, I see **Clear list** (no trash FAB visible).
  * Given I tap **Clear list**, then I get a confirm dialog and an **Undo** snackbar after clearing.

2. **Bottom-Sheet Composer (Item first)**

* **Goal:** Composer slides over the list; list remains visible beneath.
* **AC:**

  * Given I tap **+**, then a bottom sheet appears from the bottom.
  * Given the composer is open, when I add an item, then I see it appear in the list behind the sheet instantly.
  * Given inactivity for N seconds (**Assumption:** 3s), the sheet auto-collapses.

3. **Quick-Add Parser**

* **Goal:** Parse qty/unit/category from free text.
* **AC:**

  * “3x bananas” → item=bananas, qty=3, section=Produce.
  * “500g pasta” → item=pasta, qty=500, unit=g, section=Pantry.
  * If parsing fails, item is added as plain text with default section.

4. **Global Undo Snackbar**

* **Goal:** Undo for add/clear/delete.
* **AC:**

  * After add, an **Undo** appears for \~3s; tapping restores previous state.
  * After clear list, **Undo** restores all items and their checked states.

5. **Per-Item Controls (Delete & Qty Edit)**

* **Goal:** Manage items without leaving the list.
* **AC:**

  * Tap “−/+” adjusts quantity by 1 (floors at 0 → remove with Undo).
  * A delete affordance (button or long-press menu) removes the item with Undo.
  * Tap item label → inline qty edit (numeric) and unit (optional) save.

**Definition of Done (MVP):**

* 44–48px touch targets; no layout shift on add.
* Keyboard submit adds item; ESC or swipe-down closes composer.
* Basic tests for parser, undo, and clear-list flows.

---

# M2 (Sprint 2): P1(7) + P2(9–11)

6. **Add Recipe in Composer (with Merge)**

* **Goal:** Add recipe items via composer; dedupe/merge with current list.
* **AC:**

  * Given composer, when I select a recipe and servings, then a summary shows “Merged X, added Y”.
  * If an ingredient already exists, quantities combine (e.g., pasta 500g + 250g → 750g).
  * Undo reverts the entire merge.

7. **Shopping Focus Mode (via Progress Ring)**

* **Goal:** One-tap shop mode; bigger checkboxes; composer tucked.
* **AC:**

  * Given the main screen, when I tap the progress ring, then list enters “Shop” mode (larger checkmarks, composer hidden).
  * Tapping the ring again returns to compose mode.

8. **Auto-Collapse Completed Sections**

* **Goal:** Reduce scrolling in-store.
* **AC:**

  * When all items in a section are checked, the section collapses and shows a “✓ Section done” header.
  * Expanding/collapsing state is remembered during the session.

9. **Gestures on Items**

* **Goal:** Fast in-store adjustments.
* **AC:**

  * Swipe right: qty +1; swipe left: qty −1; reaching 0 prompts remove with Undo.
  * Long-press: menu with Move to section / Substitute / Delete.

---

# M3 (Sprint 3): P3 (12–15) + P4 (selected)

10. **Contextual Suggestions in Composer**

* **Goal:** Surface recents/staples and weekend-biased suggestions.
* **AC:**

  * Composer shows a row of chips/cards with recent items and staples.
  * On Fri–Sun (**Assumption**), recipes appear first; midweek, single items first.

11. **Learned Section Order (Soft Suggestions)**

* **Goal:** Infer store flow from user behavior.
* **AC:**

  * After N sessions (**Assumption:** 3), if check-off order differs from saved order, a non-blocking prompt suggests reordering.
  * Accepting updates the active store’s section order.

12. **Notes (Non-checkable Rows)**

* **Goal:** Add reminders to sections.
* **AC:**

  * “Note” entry creates a stylized row that cannot be checked off, can be edited/deleted, and is pinned to a section.

13. **Joy Layer**

* **Goal:** Subtle delight without slowing actions.
* **AC:**

  * Haptic tick (if supported) on add/check.
  * 150–200ms “drop-in” animation on add.
  * Tiny confetti on “All done”.

14. **Jump-to-Section Index (Long Lists)**

* **Goal:** Quicker navigation.
* **AC:**

  * A floating chip/button opens a section index; tapping jumps to that section.

15. **Import/Export (JSON) in Overflow**

* **Goal:** Utility for backup/sharing.
* **AC:**

  * Export downloads a JSON of items/recipes/stores.
  * Import merges (never silently overwrites) and provides an Undo.

---

## Tech/Design notes & dependencies

* Recipes-in-composer (6) depends on Undo (4) and benefits from Parser (3).
* Shopping focus (7) depends on progress ring presence.
* Learned order (11) depends on tracked check-off sequence.
* Keep “Clear list” accessible only via overflow from MVP onward.

---

If you want, I can convert **MVP stories (1–5)** into Jira-style tickets with ultra-brief acceptance tests next, or draft the **UI skeleton spec** for the bottom-sheet composer.
