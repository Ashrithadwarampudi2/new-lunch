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
    loadWeeklyMenuTitles();
});