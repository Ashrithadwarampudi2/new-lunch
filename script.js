// ==========================================
// RESTAURANTS & MENU LOADER (REST Endpoints)
// ==========================================

async function fetchActiveRestaurants() {
  try {
    const response = await fetch('/api/restaurants?active=true');
    if (!response.ok) throw new Error('Failed to fetch restaurants');
    return await response.json();
  } catch (err) {
    console.error("Error fetching active restaurants:", err);
    return [];
  }
}

// Populates the per-day titles on order.html (mondayTitle, tuesdayTitle,
// wednesdayTitle, thursdayTitle, fridayTitle, bagelsTitle). Safe to run on
// other pages too since every target is guarded with `if (el)`.
async function loadWeeklyMenuTitles() {
  try {
    const response = await fetch('/api/weekly-menu');
    if (!response.ok) throw new Error('Failed to fetch weekly menu');
    const menus = await response.json();

    if (menus && menus.length > 0) {
      const daysMap = {
        Monday: "mondayTitle",
        Tuesday: "tuesdayTitle",
        Wednesday: "wednesdayTitle",
        Thursday: "thursdayTitle",
        Friday: "fridayTitle"
      };

      menus.forEach(menu => {
        const dayKey = menu.day_of_week;
        if (dayKey === "Friday") {
          if (menu.meal_type === "Breakfast") {
            const bagelsEl = document.getElementById("bagelsTitle");
            if (bagelsEl) bagelsEl.textContent = `Friday Breakfast: ${menu.restaurant_name}`;
          }
          if (menu.meal_type === "Lunch") {
            const fridayEl = document.getElementById("fridayTitle");
            if (fridayEl) fridayEl.textContent = `Friday Lunch: ${menu.restaurant_name}`;
          }
        } else if (daysMap[dayKey] && menu.restaurant_name) {
          const el = document.getElementById(daysMap[dayKey]);
          if (el) el.textContent = `${dayKey}: ${menu.restaurant_name}`;
        }
      });
    }
  } catch (err) {
    console.warn("Using fallback menu titles due to fetch error:", err);
    const fallbacks = {
      mondayTitle: "Monday: Lunch Option",
      tuesdayTitle: "Tuesday: Lunch Option",
      wednesdayTitle: "Wednesday: Pizza / Lunch Option",
      thursdayTitle: "Thursday: Lunch Option",
      fridayTitle: "Friday Lunch: Option"
    };
    for (const [id, title] of Object.entries(fallbacks)) {
      const el = document.getElementById(id);
      if (el) el.textContent = title;
    }
  }
}

function formatWeekRange(weekStartDateStr) {
  const start = new Date(weekStartDateStr);
  const end = new Date(start);
  end.setDate(start.getDate() + 4); // Monday -> Friday

  const opts = { month: 'short', day: 'numeric' };
  const startStr = start.toLocaleDateString('en-US', opts);
  const endStr = end.toLocaleDateString('en-US', { ...opts, year: 'numeric' });
  return `${startStr} - ${endStr}`;
}

// Fetches the published weekly menu and renders it into menu.html
async function renderWeeklyMenu() {
  const dateRangeEl = document.getElementById("week-date-range");
  const lastUpdatedEl = document.getElementById("lastUpdated");
  const tickerEl = document.getElementById("food-ticker-items");
  const cardsContainer = document.getElementById("menu-cards-container");

  try {
    const [menuResponse, restaurants] = await Promise.all([
      fetch('/api/weekly-menu'),
      fetchActiveRestaurants()
    ]);

    if (!menuResponse.ok) throw new Error('Failed to fetch weekly menu');
    const menus = await menuResponse.json();

    if (!menus || menus.length === 0) {
      if (dateRangeEl) dateRangeEl.textContent = "No menu published yet";
      if (lastUpdatedEl) lastUpdatedEl.textContent = "";
      if (tickerEl) tickerEl.innerHTML = "<span>Check back soon for this week's lunch menu.</span>";
      if (cardsContainer) {
        cardsContainer.innerHTML = `<div class="col-12 text-center text-muted py-5">No weekly menu has been published yet.</div>`;
      }
      return;
    }

    // Restaurants come back with an id + cuisine_type; build a lookup so
    // we can show cuisine on each card without changing the weekly_menus schema.
    const restaurantById = {};
    (restaurants || []).forEach(r => { restaurantById[r.id] = r; });

    // Menus are ordered week_start_date DESC, id DESC from the API,
    // so the most recently published week's rows come first.
    const currentWeekStart = menus[0].week_start_date;
    const currentWeekMenus = menus.filter(m => m.week_start_date === currentWeekStart);

    if (dateRangeEl) dateRangeEl.textContent = formatWeekRange(currentWeekStart);
    if (lastUpdatedEl) {
      lastUpdatedEl.textContent = `Last updated: ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
    }

    const dayOrder = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
    const seenDays = new Set();

const uniqueMenus = currentWeekMenus.filter(menu => {
    const key = `${menu.day_of_week}-${menu.meal_type}`;

    if (seenDays.has(key)) {
        return false;
    }

    seenDays.add(key);
    return true;
});

const sortedMenus = uniqueMenus.sort(
    (a, b) =>
        dayOrder.indexOf(a.day_of_week) -
        dayOrder.indexOf(b.day_of_week)
);

    // Ticker: one line per item
    if (tickerEl) {
      tickerEl.innerHTML = sortedMenus
        .map(m => `<span>${m.day_of_week} ${m.meal_type}: ${m.restaurant_name}</span>`)
        .join('');
    }

    // Cards: one per day
    if (cardsContainer) {
      cardsContainer.innerHTML = sortedMenus.map(m => {
        const cuisine = restaurantById[m.meal_id] ? restaurantById[m.meal_id].cuisine_type : null;
        return `
          <div class="col-md-6 col-lg-4">
            <div class="card h-100 border-0 shadow-sm p-3">
              <h5 class="fw-bold mb-1">${m.day_of_week}</h5>
              <span class="badge bg-primary mb-2 align-self-start">${m.meal_type}</span>
              <p class="fw-semibold mb-1">${m.restaurant_name}</p>
              ${cuisine ? `<span class="badge bg-secondary align-self-start">${cuisine}</span>` : ''}
            </div>
          </div>
        `;
      }).join('');
    }

  } catch (err) {
    console.error("Error loading weekly menu:", err);
    if (dateRangeEl) dateRangeEl.textContent = "Unable to load menu dates";
    if (lastUpdatedEl) lastUpdatedEl.textContent = "";
    if (tickerEl) tickerEl.innerHTML = "<span>Menu is temporarily unavailable.</span>";
    if (cardsContainer) {
      cardsContainer.innerHTML = `<div class="col-12 text-center text-danger py-5">Failed to load the weekly menu. Please try again later.</div>`;
    }
  }
}

// Handle Order Submission
const surveyForm = document.getElementById("lunchSurveyForm");
if (surveyForm) {
  surveyForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const statusAlert = document.getElementById("orderStatus");
    if (statusAlert) {
      statusAlert.className = "alert alert-info";
      statusAlert.textContent = "Submitting your order...";
      statusAlert.classList.remove("d-none");
    }

    const formData = new FormData(surveyForm);
    const orderData = Object.fromEntries(formData.entries());
    orderData.username = localStorage.getItem("username") || "Anonymous";

    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(orderData)
      });

      if (response.ok) {
        if (statusAlert) {
          statusAlert.className = "alert alert-success";
          statusAlert.textContent = "Order submitted successfully!";
        }
        const surveySuccessModalElement = document.getElementById("surveySuccessModal");
        if (surveySuccessModalElement) {
          const modal = new bootstrap.Modal(surveySuccessModalElement);
          modal.show();
        }
      } else {
        const err = await response.json();
        if (statusAlert) {
          statusAlert.className = "alert alert-danger";
          statusAlert.textContent = err.error || "Failed to submit order.";
        }
      }
    } catch (err) {
      console.error("Submission error:", err);
      if (statusAlert) {
        statusAlert.className = "alert alert-danger";
        statusAlert.textContent = "Network error while submitting order.";
      }
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  renderWeeklyMenu();     // populates menu.html (date range, ticker, day cards)
  loadWeeklyMenuTitles(); // populates order.html (per-question day titles)
});