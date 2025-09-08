let mealStatusEl;
let activeMeals = new Set();
let readyMeals = new Set();

// Below is legacy
// export function initRecipesOverview() {
//   mealStatusEl = document.getElementById('mealStatus');
//   if (!mealStatusEl) return;

//   stateDoc.onSnapshot(
//     (doc) => {
//       const data = doc.data() || {};
//       activeMeals = new Set(Array.isArray(data.activeMeals) ? data.activeMeals : []);
//       readyMeals = new Set(Array.isArray(data.readyMeals) ? data.readyMeals : []);
//       render();
//     },
//     (err) => console.error('stateDoc onSnapshot error', err)
//   );
// }

export function initRecipesOverview(){
  mealStatusEl = document.getElementById('mealStatus');
  if (!mealStatusEl) return;

  render();

  window.addEventListener('meals:active-changed', e => {
    activeMeals = new Set(e.detail?.activeMeals || []);
    render();
  });

  window.addEventListener('meals:ready', e => {
    readyMeals = new Set(e.detail?.readyMeals || []);
    render();
  });

  render();
}

export function refreshRecipesOverview() {
  render();
}

function render() {
  if (!mealStatusEl) return;
  mealStatusEl.innerHTML = '';

  const allMeals = Array.from(new Set([...activeMeals, ...readyMeals])).sort((a, b) => a.localeCompare(b));

  allMeals.forEach(meal => {
    const pill = document.createElement('span');
    pill.className = 'meal-pill';
    pill.dataset.meal = meal;
    pill.classList.add(readyMeals.has(meal) ? 'ready' : 'pending');
    pill.textContent = meal;
    mealStatusEl.appendChild(pill);
  });
}
