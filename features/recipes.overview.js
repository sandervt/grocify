import { stateDoc } from '../firebase.js';

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
  updatePills();
  window.addEventListener('meals:ready', e => {
    readyMeals = new Set(e.detail?.readyMeals || []);
    updatePills();
  });
}

function updatePills(){
  document.querySelectorAll('.meal-pill').forEach(pill => {
    const name = pill.dataset.meal || pill.textContent.trim();
    const isReady = readyMeals.has(name);
    pill.classList.toggle('ready', isReady);
    pill.classList.toggle('pending', !isReady);
  });
}

export function refreshRecipesOverview() {
  render();
}

function render() {
  if (!mealStatusEl) return;
  mealStatusEl.innerHTML = '';

  const allMeals = Array.from(new Set([...activeMeals, ...readyMeals])).sort((a, b) => a.localeCompare(b));

  allMeals.forEach((meal) => {
    const pill = document.createElement('span');
    pill.className = 'meal-pill';
    if (!readyMeals.has(meal)) pill.classList.add('pending');
    pill.textContent = meal;
    mealStatusEl.appendChild(pill);
  });
}