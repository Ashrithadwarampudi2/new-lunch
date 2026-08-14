// ============================================================
// script.js — Commvault Lunch Portal Frontend Helper
// ============================================================


// 1. Fetch active restaurants list
async function fetchActiveRestaurants() {
    try {
        const response = await fetch('/api/restaurants');
        if (!response.ok) throw new Error('Failed to fetch restaurants');
        return await response.json();
    } catch (err) {
        console.error("Error fetching active restaurants:", err);
        return [];
    }
}


// 2. Format Date Range (e.g., Aug 17 - Aug 21, 2026)
function formatWeekRange(weekStartDateStr) {
    if (!weekStartDateStr) return "Current Week";
    const start = new Date(weekStartDateStr);
    const end = new Date(start);
    end.setDate(start.getDate() + 4); // Monday -> Friday


    const opts = { month: 'short', day: 'numeric' };
    const startStr = start.toLocaleDateString('en-US', opts);
    const endStr = end.toLocaleDateString('en-US', { ...opts, year: 'numeric' });
    return `${startStr} – ${endStr}`;
}


// 3. Populate per-day titles on order.html
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
                        if (bagelsEl) bagelsEl.textContent = `Friday Breakfast: ${menu.restaurant_name || menu.description || ''}`;
                    }
                    if (menu.meal_type === "Lunch") {
                        const fridayEl = document.getElementById("fridayTitle");
                        if (fridayEl) fridayEl.textContent = `Friday Lunch: ${menu.restaurant_name || menu.description || ''}`;
                    }
                } else if (daysMap[dayKey]) {
                    const el = document.getElementById(daysMap[dayKey]);
                    if (el) el.textContent = `${dayKey}: ${menu.restaurant_name || menu.description || ''}`;
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


// 4. Render Weekly Menu on menu.html
async function renderWeeklyMenu() {
    const dateRangeEl = document.getElementById("week-date-range");
    const lastUpdatedEl = document.getElementById("lastUpdated");
    const tickerEl = document.getElementById("food-ticker-items");
    const cardsContainer = document.getElementById("menu-cards-container");


    if (!cardsContainer) return; // Not on menu.html


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
            cardsContainer.innerHTML = '<div class="col-12 text-center text-muted py-5">No weekly menu has been published yet.</div>';
            return;
        }


        // Restaurant lookup by ID
        const restaurantById = {};
        (restaurants || []).forEach(r => { restaurantById[r.id] = r; });


        // Filter items for the latest week_start_date
        const currentWeekStart = menus[0].week_start_date;
        const currentWeekMenus = menus.filter(m => m.week_start_date === currentWeekStart);


        if (dateRangeEl) dateRangeEl.textContent = formatWeekRange(currentWeekStart);
        if (lastUpdatedEl) {
            lastUpdatedEl.textContent = `Last updated: ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
        }


        // Group meals by day
        const dayOrder = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
        const groupedByDay = {};
        dayOrder.forEach(day => groupedByDay[day] = []);


        currentWeekMenus.forEach(item => {
            if (groupedByDay[item.day_of_week]) {
                groupedByDay[item.day_of_week].push(item);
            }
        });


        // Ticker output
        if (tickerEl) {
            tickerEl.innerHTML = currentWeekMenus
                .map(m => `<span>• ${m.day_of_week} (${m.meal_type || 'Lunch'}): <strong>${m.restaurant_name || m.description || 'TBD'}</strong></span>`)
                .join(" ");
        }


        // Render Day Cards
        cardsContainer.innerHTML = dayOrder.map(day => {
            const dayItems = groupedByDay[day];
            let innerContent = "";


            if (dayItems.length === 0) {
                innerContent = `<p class="text-muted italic small mb-0">No menu scheduled</p>`;
            } else {
                innerContent = dayItems.map(item => {
                    const badgeClass = item.meal_type === "Breakfast" ? "bg-warning text-dark" : "bg-primary";
                    const cuisine = restaurantById[item.meal_id]?.cuisine_type;
                    const cuisineBadge = cuisine ? `<span class="badge bg-secondary ms-2">${cuisine}</span>` : "";


                    return `
                        <div class="mb-3 pb-2 border-bottom last-border-0">
                            <span class="badge ${badgeClass} mb-1">${item.meal_type || 'Lunch'}</span>
                            <h5 class="fw-bold text-dark mb-1">${item.restaurant_name || item.description || 'TBD'} ${cuisineBadge}</h5>
                            ${item.notes ? `<p class="text-secondary small mb-0">${item.notes}</p>` : ''}
                        </div>
                    `;
                }).join('');
            }


            return `
                <div class="col-md-6 col-lg-4 mb-4">
                    <div class="card h-100 border-0 shadow-sm p-3">
                        <div class="card-body d-flex flex-column">
                            <h4 class="fw-bold text-primary mb-3">${day}</h4>
                            ${innerContent}
                        </div>
                    </div>
                </div>
            `;
        }).join('');


    } catch (err) {
        console.error("Error loading weekly menu:", err);
        if (dateRangeEl) dateRangeEl.textContent = "Unable to load menu dates";
        if (lastUpdatedEl) lastUpdatedEl.textContent = "";
        if (tickerEl) tickerEl.innerHTML = "<span>Menu is temporarily unavailable.</span>";
        cardsContainer.innerHTML = '<div class="col-12 text-center text-danger py-5">Failed to load the weekly menu. Please try again later.</div>';
    }
}


// 5. Handle Order Submission (for order.html)
function initOrderForm() {
    const surveyForm = document.getElementById("lunchSurveyForm");
    if (!surveyForm) return;


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
                if (surveySuccessModalElement && typeof bootstrap !== "undefined") {
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


// 6. DOM Initialization
document.addEventListener("DOMContentLoaded", () => {
    renderWeeklyMenu();      // Populates menu.html
    loadWeeklyMenuTitles();  // Populates order.html titles
    initOrderForm();         // Prepares order submission
});



