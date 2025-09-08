let readyMeals = new Set();

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

