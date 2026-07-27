<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Commvault Lunch Portal | Order</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
    <link rel="stylesheet" href="styles.css">
    <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
</head>

<body>
    <script>
        async function ensureAuth() {
            const storedUsername = localStorage.getItem("username");
            const storedRole = localStorage.getItem("userRole");

            try {
                const response = await fetch("/api/auth/me");
                if (!response.ok) {
                    throw new Error("Not authenticated");
                }

                const data = await response.json();
                localStorage.setItem("username", data.username);
                localStorage.setItem("userRole", data.role);
            } catch (error) {
                if (storedUsername && storedRole) {
                    return;
                }
            }
        }

        ensureAuth();
    </script>

    <nav class="navbar navbar-expand-lg custom-navbar py-3">
        <div class="container">
            <a class="navbar-brand" href="home.html">
                <img src="images/images/commvault-logo.png" alt="Commvault Logo" class="navbar-logo">
            </a>
            <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav">
                <span class="text-dark fw-bold fs-4">☰</span>
            </button>
            <div class="collapse navbar-collapse" id="navbarNav">
                <div class="navbar-nav ms-auto">
                    <a class="nav-link text-white-50" href="home.html">Home</a>
                    <a class="nav-link text-white-50" href="menu.html">Menu</a>
                    <a class="nav-link active-link" href="order.html">Order</a>
                    <a class="nav-link text-white-50" href="contact.html">Contact</a>
                   
                    <a id="adminLink" class="nav-link text-white-50" href="admin-new.html" style="display: none;">Admin</a>
                   
                    <button onclick="logout()" class="btn btn-outline-light">Logout</button>
                </div>
            </div>
        </div>
    </nav>

    <section class="survey-hero">
        <div class="hero-overlay">
            <div class="container text-center">
                <span class="hero-pill">LUNCH ORDER</span>
                <p class="lead mt-3">Submit your lunch preferences for the upcoming week.</p>
            </div>
        </div>
    </section>

    <section class="survey-section py-5">
        <div class="container">
            <div class="survey-card-wrapper bg-white p-5">
                <h2 id="orderWeekHeader" class="fw-bold mb-2">Food Order</h2>
                <p class="text-secondary mb-3">Please pick Veg/Non-Veg/Half+Half/Decline so that we can get the exact count</p>
                <p class="text-muted small mb-4">Hi, <span id="userGreeting">there</span>. When you submit this form, the owner will see your name and email address.</p>

                <div id="orderStatus" class="alert d-none" role="status"></div>

                <form id="lunchSurveyForm">
                    <div class="survey-question">
                        <h5 class="fw-bold">
                            1. <span id="mondayTitle">Monday: Loading menu...</span>
                        </h5>
                        <div class="form-check">
                            <input class="form-check-input" type="radio" name="monday" value="veg" id="mondayVeg">
                            <label class="form-check-label" for="mondayVeg">Veg</label>
                        </div>
                        <div class="form-check">
                            <input class="form-check-input" type="radio" name="monday" value="nonveg" id="mondayNonveg">
                            <label class="form-check-label" for="mondayNonveg">Non-veg</label>
                        </div>
                        <div class="form-check">
                            <input class="form-check-input" type="radio" name="monday" value="halfhalf" id="mondayHalfHalf">
                            <label class="form-check-label" for="mondayHalfHalf">1/2 serving veg <strong>AND</strong> 1/2 serving non-veg</label>
                        </div>
                        <div class="form-check">
                            <input class="form-check-input" type="radio" name="monday" value="skip" id="mondaySkip">
                            <label class="form-check-label" for="mondaySkip">I will decline this</label>
                        </div>
                    </div>

                    <div class="survey-question">
                        <h5 class="fw-bold">
                            2. <span id="tuesdayTitle">Tuesday: Loading menu...</span>
                        </h5>
                        <div class="form-check">
                            <input class="form-check-input" type="radio" name="tuesday" value="veg" id="tuesdayVeg">
                            <label class="form-check-label" for="tuesdayVeg">Veg</label>
                        </div>
                        <div class="form-check">
                            <input class="form-check-input" type="radio" name="tuesday" value="nonveg" id="tuesdayNonveg">
                            <label class="form-check-label" for="tuesdayNonveg">Non-veg</label>
                        </div>
                        <div class="form-check">
                            <input class="form-check-input" type="radio" name="tuesday" value="halfhalf" id="tuesdayHalfHalf">
                            <label class="form-check-label" for="tuesdayHalfHalf">1/2 serving veg <strong>AND</strong> 1/2 serving non-veg</label>
                        </div>
                        <div class="form-check">
                            <input class="form-check-input" type="radio" name="tuesday" value="skip" id="tuesdaySkip">
                            <label class="form-check-label" for="tuesdaySkip">I will decline this</label>
                        </div>
                    </div>

                    <div class="survey-question">
                        <h5 class="fw-bold">
                            3. <span id="wednesdayTitle">Wednesday: Loading menu...</span>
                        </h5>
                        <div class="form-check">
                            <input class="form-check-input" type="radio" name="wednesday" value="veg" id="wednesdayVeg">
                            <label class="form-check-label" for="wednesdayVeg">Veg</label>
                        </div>
                        <div class="form-check">
                            <input class="form-check-input" type="radio" name="wednesday" value="cheese" id="wednesdayCheese">
                            <label class="form-check-label" for="wednesdayCheese">Cheese</label>
                        </div>
                        <div class="form-check">
                            <input class="form-check-input" type="radio" name="wednesday" value="chicken" id="wednesdayChicken">
                            <label class="form-check-label" for="wednesdayChicken">Chicken</label>
                        </div>
                        <div class="form-check">
                            <input class="form-check-input" type="radio" name="wednesday" value="meatlovers" id="wednesdayMeatLovers">
                            <label class="form-check-label" for="wednesdayMeatLovers">Meat Lovers</label>
                        </div>
                        <div class="form-check">
                            <input class="form-check-input" type="radio" name="wednesday" value="skip" id="wednesdaySkip">
                            <label class="form-check-label" for="wednesdaySkip">I will skip this</label>
                        </div>
                        <div class="form-check">
                            <input class="form-check-input" type="radio" name="wednesday" value="salad" id="wednesdaySalad">
                            <label class="form-check-label" for="wednesdaySalad">I want salad ONLY</label>
                        </div>
                    </div>

                    <div class="survey-question">
                        <h5 class="fw-bold">
                            4. <span id="thursdayTitle">Thursday: Loading menu...</span>
                        </h5>
                        <div class="form-check">
                            <input class="form-check-input" type="radio" name="thursday" value="halfhalf" id="thursdayHalfHalf">
                            <label class="form-check-label" for="thursdayHalfHalf">1/2 serving veg <strong>AND</strong> 1/2 serving non-veg</label>
                        </div>
                        <div class="form-check">
                            <input class="form-check-input" type="radio" name="thursday" value="veg" id="thursdayVeg">
                            <label class="form-check-label" for="thursdayVeg">1 serving veg</label>
                        </div>
                        <div class="form-check">
                            <input class="form-check-input" type="radio" name="thursday" value="nonveg" id="thursdayNonveg">
                            <label class="form-check-label" for="thursdayNonveg">1 serving non-veg</label>
                        </div>
                        <div class="form-check">
                            <input class="form-check-input" type="radio" name="thursday" value="skip" id="thursdaySkip">
                            <label class="form-check-label" for="thursdaySkip">I will skip this</label>
                        </div>
                    </div>

                    <div class="survey-question">
                        <h5 class="fw-bold">
                            5. <span id="bagelsTitle">Friday 9 AM: Bagels for breakfast</span>
                        </h5>
                        <div class="form-check">
                            <input class="form-check-input" type="radio" name="bagels" value="yes" id="bagelsYes">
                            <label class="form-check-label" for="bagelsYes">Yes, count me in</label>
                        </div>
                        <div class="form-check">
                            <input class="form-check-input" type="radio" name="bagels" value="no" id="bagelsNo">
                            <label class="form-check-label" for="bagelsNo">No, I will skip this</label>
                        </div>
                    </div>

                    <div class="survey-question">
                        <h5 class="fw-bold">
                            6. <span id="fridayTitle">Friday Lunch: Loading menu...</span>
                        </h5>
                        <div class="form-check">
                            <input class="form-check-input" type="radio" name="bubbakoos" value="halfhalf" id="bubbakoosHalfHalf">
                            <label class="form-check-label" for="bubbakoosHalfHalf">1/2 serving veg <strong>AND</strong> 1/2 serving non-veg</label>
                        </div>
                        <div class="form-check">
                            <input class="form-check-input" type="radio" name="bubbakoos" value="veg" id="bubbakoosVeg">
                            <label class="form-check-label" for="bubbakoosVeg">1 serving veg</label>
                        </div>
                        <div class="form-check">
                            <input class="form-check-input" type="radio" name="bubbakoos" value="nonveg" id="bubbakoosNonveg">
                            <label class="form-check-label" for="bubbakoosNonveg">1 serving non-veg</label>
                        </div>
                        <div class="form-check">
                            <input class="form-check-input" type="radio" name="bubbakoos" value="skip" id="bubbakoosSkip">
                            <label class="form-check-label" for="bubbakoosSkip">I will skip this</label>
                        </div>
                    </div>

                    <div class="survey-question">
                        <h5 class="fw-bold">
                            7. <span id="icecreamTitle">Friday 3:30 PM: Ice Cream</span>
                        </h5>
                        <div class="form-check">
                            <input class="form-check-input" type="radio" name="icecream" value="yes" id="icecreamYes">
                            <label class="form-check-label" for="icecreamYes">Yes, count me in</label>
                        </div>
                        <div class="form-check">
                            <input class="form-check-input" type="radio" name="icecream" value="no" id="icecreamNo">
                            <label class="form-check-label" for="icecreamNo">No, I will skip this</label>
                        </div>
                    </div>

                    <div class="text-center mt-4">
                        <button type="submit" id="orderSubmitBtn" class="btn btn-primary-action px-5 py-3">
                            Submit Order
                        </button>
                    </div>
                </form>
            </div>
        </div>
    </section>

    <div class="modal fade" id="surveySuccessModal" tabindex="-1">
        <div class="modal-dialog modal-dialog-centered">
            <div class="modal-content border-0 shadow">
                <div class="modal-header custom-modal-header text-white">
                    <h5 class="modal-title">Lunch Order Submitted</h5>
                </div>
                <div class="modal-body">
                    <div id="orderSummaryContent"></div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn custom-modal-btn" data-bs-dismiss="modal">Close</button>
                </div>
            </div>
        </div>
    </div>

    <div class="modal fade" id="preferenceModal" data-bs-backdrop="static" data-bs-keyboard="false" tabindex="-1">
        <div class="modal-dialog modal-dialog-centered">
            <div class="modal-content text-center border-0 p-4">
                <div class="modal-body">
                    <h3 class="fw-bold mb-3">Welcome to the Lunch Portal</h3>
                    <p class="text-secondary mb-4">What are your preferences?</p>
                    <div class="d-grid gap-2">
                        <input type="radio" class="btn-check" name="dietPreference" id="prefVeg" value="Vegetarian">
                        <label class="btn btn-outline-custom" for="prefVeg">Vegetarian</label>
                        <input type="radio" class="btn-check" name="dietPreference" id="prefNonVeg" value="Non-Vegetarian">
                        <label class="btn btn-outline-custom" for="prefNonVeg">Non-Vegetarian</label>
                        <input type="radio" class="btn-check" name="dietPreference" id="prefBoth" value="Both" checked>
                        <label class="btn btn-outline-custom" for="prefBoth">Both</label>
                    </div>
                    <button id="submitPreferenceBtn" class="btn btn-primary-action mt-4 px-4">Continue</button>
                </div>
            </div>
        </div>
    </div>

    <footer class="custom-footer py-5 text-white">
        <div class="container">
            <div class="row">
                <div class="col-md-6">
                    <h5 class="fw-bold">Commvault Lunch Portal</h5>
                    <p class="text-white-50">Weekly lunch selections for employees.</p>
                </div>
                <div class="col-md-6 text-md-end">
                    <h6 class="fw-bold mb-3">Quick Links</h6>
                    <a href="home.html" class="text-white-50 text-decoration-none d-block">Home</a>
                    <a href="menu.html" class="text-white-50 text-decoration-none d-block">Menu</a>
                    <a href="order.html" class="text-white-50 text-decoration-none d-block">Order</a>
                    <a href="contact.html" class="text-white-50 text-decoration-none d-block">Contact</a>
                </div>
            </div>
        </div>
        <hr class="border-light opacity-25 my-4">
        <div class="text-center text-white-50 small">
            © 2026 Commvault Lunch Portal. All rights reserved.
        </div>
    </footer>

    <script>
        async function logout() {
            try {
                await fetch("/logout", { method: "POST" });
            } catch (error) {
                console.error("Logout error:", error);
            }

            localStorage.removeItem("userRole");
            localStorage.removeItem("username");
            localStorage.removeItem("dietPreference");
            window.location.href = "login.html";
        }

        window.addEventListener("load", () => {
            const userRole = localStorage.getItem("userRole");
            const username = localStorage.getItem("username");
            if (userRole === "admin") {
                const adminLink = document.getElementById("adminLink");
                if (adminLink) adminLink.style.display = "block";
            }
            const userGreeting = document.getElementById("userGreeting");
            if (userGreeting) userGreeting.textContent = username || "there";
        });
    </script>

    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js"></script>
    <script src="script.js"></script>
</body>

</html>