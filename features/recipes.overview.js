let mealStatusEl;
let activeMeals = new Set();
let readyMeals = new Set();

export function initRecipesOverview() {
  mealStatusEl = document.getElementById('mealStatus');
  if (!mealStatusEl) return;

  window.addEventListener('meals:active-changed', (e) => {
    activeMeals = new Set(e.detail?.activeMeals || []);
    render();
  });

  window.addEventListener('meals:ready', (e) => {
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

  allMeals.forEach((meal) => {
    const pill = document.createElement('span');
    pill.className = 'meal-pill';
    if (!readyMeals.has(meal)) pill.classList.add('pending');
    pill.textContent = meal;
    mealStatusEl.appendChild(pill);
  });
}
