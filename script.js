// ==========================================
// SUPABASE CLIENT INITIALIZATION
// ==========================================
const supabaseUrl = 'https://udqraywfsemkulraudbd.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkcXJheXdmc2Vta3VscmF1ZGJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQxMzI2NjEsImV4cCI6MjA5OTcwODY2MX0.2VWPvdoJP-bYalmBa56wqqEWX8jPABNgFokYomQo2Rk';
const db = supabase.createClient(supabaseUrl, supabaseKey);


// DOM Elements
const surveyForm = document.getElementById("lunchSurveyForm");
const orderStatusAlert = document.getElementById("orderStatus");
const preferenceModalElement = document.getElementById("preferenceModal");
const preferenceModal = preferenceModalElement ? new bootstrap.Modal(preferenceModalElement) : null;
const submitPreferenceBtn = document.getElementById("submitPreferenceBtn");
const surveySuccessModalElement = document.getElementById("surveySuccessModal");
const surveySuccessModal = surveySuccessModalElement ? new bootstrap.Modal(surveySuccessModalElement) : null;


// ==========================================
// FUNCTIONS
// ==========================================


// 1. Load Weekly Menu Titles & Update Selection Options Dynamically
async function loadWeeklyMenuTitles() {
    try {
        const { data: menus, error } = await db
            .from("weekly_menus")
            .select("*")
            .order("id", { ascending: false });


        if (error) throw error;


        if (menus && menus.length > 0) {
            // Find most recent approved weekly menu
            const latestWeek = menus[0].week_start_date;
            const currentWeekMenus = menus.filter(m => m.week_start_date === latestWeek && m.is_approved);


            const daysMap = {
                Monday: "mondayTitle",
                Tuesday: "tuesdayTitle",
                Wednesday: "wednesdayTitle",
                Thursday: "thursdayTitle",
                Friday: "fridayTitle"
            };


            currentWeekMenus.forEach(menu => {
                const dayKey = menu.day_of_week;
                if (daysMap[dayKey] && menu.restaurant_name) {
                    const el = document.getElementById(daysMap[dayKey]);
                    if (el) {
                        el.textContent = `${dayKey}: ${menu.restaurant_name}`;
                    }


                    // Update corresponding radio label options dynamically if available
                    const optionLabel = document.getElementById(`${dayKey.toLowerCase()}OptionLabel`);
                    if (optionLabel) {
                        optionLabel.textContent = `${menu.restaurant_name} Option`;
                    }
                }
            });
        }
    } catch (err) {
        console.warn("Using default menu titles due to database fetch error:", err);
        // Fallback default titles if menu fetch fails
        const fallbacks = {
            mondayTitle: "Monday: Lunch Option",
            tuesdayTitle: "Tuesday: Lunch Option",
            wednesdayTitle: "Wednesday: Pizza / Lunch Option",
            thursdayTitle: "Thursday: Lunch Option",
            fridayTitle: "Friday Lunch: Bubbakoos"
        };
        for (const [id, title] of Object.entries(fallbacks)) {
            const el = document.getElementById(id);
            if (el) el.textContent = title;
        }
    }
}


// 2. Check and Prompt Diet Preference
function checkUserPreference() {
    const storedPref = localStorage.getItem("dietPreference");
    if (!storedPref && preferenceModal) {
        preferenceModal.show();
    }
}


// Save Diet Preference Modal Event Handler
if (submitPreferenceBtn) {
    submitPreferenceBtn.addEventListener("click", () => {
        const selectedRadio = document.querySelector('input[name="dietPreference"]:checked');
        if (selectedRadio) {
            const pref = selectedRadio.value;
            localStorage.setItem("dietPreference", pref);
            if (preferenceModal) preferenceModal.hide();
        }
    });
}


// 3. Handle Order Form Submission
if (surveyForm) {
    surveyForm.addEventListener("submit", async (e) => {
        e.preventDefault();


        const username = localStorage.getItem("username") || "Anonymous";
        const formData = new FormData(surveyForm);


        // Gather selections
        const orderData = {
            username: username,
            monday: formData.get("monday") || "None",
            tuesday: formData.get("tuesday") || "None",
            wednesday: formData.get("wednesday") || "None",
            thursday: formData.get("thursday") || "None",
            bagels: formData.get("bagels") || "No",
            bubbakoos: formData.get("bubbakoos") || "None",
            icecream: formData.get("icecream") || "No",
            created_at: new Date().toISOString()
        };


        const submitBtn = document.getElementById("orderSubmitBtn");
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = "Submitting...";
        }


        try {
            // Check if user already submitted an order to update or insert
            const { data: existingOrders } = await db
                .from("lunch_orders")
                .select("id")
                .eq("username", username);


            let resultError;
            if (existingOrders && existingOrders.length > 0) {
                // Update existing order
                const { error } = await db
                    .from("lunch_orders")
                    .update(orderData)
                    .eq("username", username);
                resultError = error;
            } else {
                // Insert new order
                const { error } = await db
                    .from("lunch_orders")
                    .insert([orderData]);
                resultError = error;
            }


            if (resultError) throw resultError;


            // Show order summary modal
            const summaryContainer = document.getElementById("orderSummaryContent");
            if (summaryContainer) {
                summaryContainer.innerHTML = `
                    <p class="lead">Thank you, <strong>${username}</strong>! Your order was submitted successfully.</p>
                    <ul class="list-group list-group-flush text-start">
                        <li class="list-group-item"><strong>Monday:</strong> ${orderData.monday}</li>
                        <li class="list-group-item"><strong>Tuesday:</strong> ${orderData.tuesday}</li>
                        <li class="list-group-item"><strong>Wednesday:</strong> ${orderData.wednesday}</li>
                        <li class="list-group-item"><strong>Thursday:</strong> ${orderData.thursday}</li>
                        <li class="list-group-item"><strong>Friday Bagels:</strong> ${orderData.bagels}</li>
                        <li class="list-group-item"><strong>Friday Lunch:</strong> ${orderData.bubbakoos}</li>
                        <li class="list-group-item"><strong>Friday Ice Cream:</strong> ${orderData.icecream}</li>
                    </ul>
                `;
            }


            if (surveySuccessModal) {
                surveySuccessModal.show();
            }


            if (orderStatusAlert) {
                orderStatusAlert.className = "alert alert-success";
                orderStatusAlert.textContent = "Your order has been recorded successfully!";
                orderStatusAlert.classList.remove("d-none");
            }
        } catch (err) {
            console.error("Error submitting lunch order:", err);
            if (orderStatusAlert) {
                orderStatusAlert.className = "alert alert-danger";
                orderStatusAlert.textContent = "Failed to submit order. Please try again.";
                orderStatusAlert.classList.remove("d-none");
            }
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = "Submit Order";
            }
        }
    });
}


async function loadMenuPage() {
    const menuContainer = document.getElementById("menu-cards-container");

    if (!menuContainer) return;

    try {
        const { data: menus, error } = await db
            .from("weekly_menus")
            .select("*")
            .eq("is_approved", true)
            .order("week_start_date", { ascending: false });

        if (error) throw error;

        if (!menus || menus.length === 0) {
            menuContainer.innerHTML =
                '<p class="text-center text-danger">No published menus found.</p>';
            return;
        }

        const latestWeek = menus[0].week_start_date;

        const currentMenus = menus.filter(
            m => m.week_start_date === latestWeek
        );

        const dateLabel = document.getElementById("week-date-range");
        if (dateLabel) {
            dateLabel.textContent = `Week of ${latestWeek}`;
        }

        const updated = document.getElementById("lastUpdated");
        if (updated) {
            updated.textContent = new Date().toLocaleString();
        }

        const ticker = document.getElementById("food-ticker-items");
        if (ticker) {
            ticker.innerHTML = currentMenus
                .map(menu => `<span>${menu.restaurant_name}</span>`)
                .join("");
        }

        menuContainer.innerHTML = currentMenus
            .map(menu => `
                <div class="col-md-4">
                    <div class="card h-100 shadow-sm">
                        <div class="card-body">
                            <h5 class="card-title">${menu.day_of_week}</h5>
                            <p class="card-text">
                                <strong>${menu.meal_type}</strong><br>
                                ${menu.restaurant_name}
                            </p>
                        </div>
                    </div>
                </div>
            `)
            .join("");

    } catch (err) {
        console.error("Menu load error:", err);

        menuContainer.innerHTML =
            '<p class="text-center text-danger">Failed to load menu.</p>';
    }
}



document.addEventListener("DOMContentLoaded", () => {
    loadWeeklyMenuTitles();
    loadMenuPage();
    checkUserPreference();
});



