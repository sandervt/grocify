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




Love it — let’s ditch tickets and use a tight **build–show–verify** loop. Here’s a lightweight process that fits your “no big bang” ask and lets you check each increment fast.

# How we’ll work (repeat this per step)

1. **Pick the next tiny step** (≤ \~15 min of code): I’ll state scope, files touched, and acceptance checks.
2. **Ship a patch**: I’ll post a small **diff** + the **updated files** (so you can drop them into your folder).
3. **Run the micro test script**: 4–6 taps/keystrokes you can do in 30–60s to verify.
4. **You say “ok” or “tweak X”** → I iterate.
5. Lock when ✅ and move to the next step.

To make review easy, I’ll tag code with comments like `// MVP STEP-1` so you can find changes fast.

# Dev toggle (so changes don’t disrupt you)

* I’ll add a **dev flag** you can toggle at runtime:

  * In console: `window.GROCIFY_FLAGS = { newComposer: true }`
  * Or add `#newui=1` to the URL.
* Old behavior remains available (`newComposer: false`) until we finish MVP.

---

# Step plan to reach MVP (Direction 1)

## STEP 1 — Move “Clear list” to bottom CTA (no visuals shock)

**Scope:** Remove floating trash FAB; add low-emphasis **“Clear entire list…”** at bottom when list is non-empty; confirm + Undo.
**Files:** `index.html`, `styles.css`, `list.js`, `main.js` (Undo shell).
**Checks:**

* No trash FAB on screen.
* Bottom CTA appears only when list has items.
* Clear → confirm → list empties → **Undo** restores items + checked states.

## STEP 2 — Single “+” FAB and remove the old add dialog

**Scope:** Keep one **+**. Clicking opens the same add flow you have today (temporary), but via our **new bottom sheet container** (empty shell).
**Files:** `index.html`, `styles.css` (sheet shell), `main.js` (open/close), `list.js` (wire).
**Checks:**

* One **+** in bottom-right.
* Tap **+** → bottom sheet slides up; list stays visible behind it.
* Close via swipe down / Esc / tapping scrim.

## STEP 3 — Bottom-sheet “Item” mode with suggestions (parity with today)

**Scope:** Move the current “add item” input + suggestions **into** the bottom sheet. No parser yet.
**Files:** `main.js` (composer UI), `styles.css` (chips, input), `catalog.js` (reuse).
**Checks:**

* Type + Enter adds an item to correct section like today.
* Suggestions row shows “last N” items; tapping adds instantly (Undo visible).

## STEP 4 — Quick-add parser + inline chips (qty, unit, section)

**Scope:** Parse `3x bananas`, `500g pasta`, `milk 2L`; show **inline editable chips** (name/qty/unit/section). Units are **free text**. Default qty=1.
**Files:** `main.js` (parser, chip editor), `styles.css` (inline token UI).
**Checks:**

* `3x bananas` → bananas, qty 3, Produce (if mapped).
* `pasta 500g` → pasta, 500 g, Pantry.
* Unrecognized unit still saved as unit text.
* Tapping a chip lets you edit; Enter to save/add.

## STEP 5 — Global Undo framework (add, delete, clear)

**Scope:** Implement a tiny **Undo stack**; show snackbar for \~3s; wire to add/clear.
**Files:** `main.js` (UndoStack), `styles.css` (snackbar).
**Checks:**

* After add/clear/delete, an Undo appears; clicking it reverts exactly the last change.

## STEP 6 — Per-item overflow menu + qty −/+ on row

**Scope:** Add `⋮` per row with **Delete**; inline `−  qty  +`. Delete is **only** via overflow (per your call).
**Files:** `list.js`, `styles.css`.
**Checks:**

* `+` increments qty, `−` decrements; at 0, item is removed with Undo.
* `⋮ → Delete` removes with Undo.
* No inline trash icons anywhere.

## STEP 7 — Composer polish

**Scope:** Auto-collapse after 3s inactivity; keyboard flows (Enter add, Esc close); focus returns to FAB; ARIA roles + live announcements.
**Files:** `main.js`, `styles.css`.
**Checks:**

* After adding, do nothing → sheet collapses to dock after 3s.
* Screen reader announces “Added N item(s) to Section”.

---

# What you’ll get each step

* A short **“What changed”** note.
* A **diff block** and **updated file(s)** to drop in.
* A **30–60s test script** (tap-by-tap).
* A **rollback note** (toggle `newComposer: false`).

---

If that works for you, say **“Go STEP 1”** and I’ll deliver the first patch (diff + files + quick test) in my next message.
