// server.js - Commvault Lunch Portal
// Database: SQL Server (via ./db.js + config.ini)
// Note: Authentication removed for direct access until SSO integration.


const express = require("express");
const path = require("path");
const webpush = require("web-push");
const db = require("./db"); // SQL Server pool (mssql)


const app = express();
const PORT = process.env.PORT || 4000;


// VAPID / WEB-PUSH (move keys to env in production!)
const PUBLIC_VAPID_KEY = process.env.PUBLIC_VAPID_KEY || "BLwCm04sZAn5P9Swr-9UBzTujwH8GBL-kLFD6nJNnzNqx1P4nMkA2UQ51d109XSUhXrHx021KMFjV0knlJwcdiM";
const PRIVATE_VAPID_KEY = process.env.PRIVATE_VAPID_KEY || "jX8L-ysZCffyZ8ajIMUO1HzPZo3Vb7N4u6TLfm533aY";


webpush.setVapidDetails("mailto:admin@commvault.com", PUBLIC_VAPID_KEY, PRIVATE_VAPID_KEY);


// ============================================================
// MIDDLEWARE
// ============================================================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname, { index: false }));


// TABLE EXISTENCE CHECK HELPER (SQL Server flavour)
async function tableExists(tableName) {
    try {
        const result = await db.query(
            "SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = ?",
            [tableName]
        );
        return result.recordset && result.recordset.length > 0;
    } catch (err) {
        console.error("[tableExists] error:", tableName, err);
        return false;
    }
}


// ============================================================
// ROOT ROUTE
// ============================================================
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "home.html"));
});


// ============================================================
// 1. LUNCH ORDERS ENDPOINTS
// ============================================================
app.get("/api/orders/:username", async (req, res) => {
    const username = req.params.username;
    try {
        if (!await tableExists("lunch_orders")) {
            return res.json(null);
        }
        const result = await db.query(
            `SELECT username, monday, tuesday AS tuesdayChoice, wednesday AS wednesdayChoice,
             thursday, bagels, Friday AS bubbakoos, icecream, submitted_at AS submittedAt
             FROM dbo.lunch_orders WHERE username = ?`,
            [username]
        );
        const row = result.recordset && result.recordset[0];
        res.json(row || null);
    } catch (err) {
        console.error("[orders GET] Error:", err);
        res.status(500).json({ error: "Database error fetching order." });
    }
});


app.get("/api/orders", async (req, res) => {
    try {
        if (!await tableExists("lunch_orders")) {
            return res.json([]);
        }
        const result = await db.query(
            `SELECT username, monday, tuesday AS tuesdayChoice, wednesday AS wednesdayChoice,
             thursday, bagels, Friday AS bubbakoos, icecream, submitted_at AS submittedAt
             FROM dbo.lunch_orders ORDER BY submitted_at DESC`
        );
        res.json(result.recordset || []);
    } catch (err) {
        console.error("[orders GET all] Error:", err);
        res.status(500).json({ error: "Database error fetching orders." });
    }
});


app.post("/api/orders", async (req, res) => {
    const { username, monday, tuesdayChoice, wednesdayChoice, thursday, bagels, bubbakoos, icecream } = req.body;
    const requestUsername = (username || "Anonymous").trim();


    try {
        if (!await tableExists("lunch_orders")) {
            return res.status(500).json({ error: "Orders table not configured." });
        }


        const existing = await db.query("SELECT id FROM dbo.lunch_orders WHERE username = ?", [requestUsername]);


        if (existing.recordset && existing.recordset.length > 0) {
            await db.query(
                `UPDATE dbo.lunch_orders SET monday = ?, tuesday = ?, wednesday = ?, thursday = ?,
                 bagels = ?, Friday = ?, icecream = ?, submitted_at = GETDATE() WHERE username = ?`,
                [
                    monday || null, tuesdayChoice || null, wednesdayChoice || null,
                    thursday || null, bagels || null, bubbakoos || null,
                    icecream || null, requestUsername
                ]
            );
            return res.status(200).json({ message: "Order updated successfully!" });
        } else {
            await db.query(
                `INSERT INTO dbo.lunch_orders (username, monday, tuesday, wednesday, thursday, bagels, Friday, icecream, submitted_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, GETDATE())`,
                [
                    requestUsername, monday || null, tuesdayChoice || null,
                    wednesdayChoice || null, thursday || null, bagels || null,
                    bubbakoos || null, icecream || null
                ]
            );
            return res.status(201).json({ message: "Order submitted successfully!" });
        }
    } catch (err) {
        console.error("[orders POST] Error:", err);
        res.status(500).json({ error: "Database error submitting order." });
    }
});


// ============================================================
// 2. ADMIN — ORDERS
// ============================================================
app.get("/api/admin/orders", async (req, res) => {
    try {
        if (!await tableExists("lunch_orders")) return res.json([]);
        const result = await db.query(
            `SELECT username, monday, tuesday AS tuesdayChoice, wednesday AS wednesdayChoice,
             thursday, bagels, Friday AS bubbakoos, icecream, submitted_at AS submittedAt
             FROM dbo.lunch_orders ORDER BY submitted_at DESC`
        );
        res.json(result.recordset || []);
    } catch (err) {
        console.error("[admin/orders] Error:", err);
        res.status(500).json({ error: "Failed to fetch orders." });
    }
});


// ============================================================
// 3. WEEKLY MENU ENDPOINTS
// ============================================================
app.get("/api/weekly-menu", async (req, res) => {
    try {
        if (!await tableExists("weekly_menus")) return res.json([]);
        const result = await db.query("SELECT * FROM dbo.weekly_menus ORDER BY week_start_date DESC, id DESC");
        res.json(result.recordset || []);
    } catch (err) {
        console.error("[weekly-menu GET] Error:", err);
        res.status(500).json({ error: "Database error fetching weekly menu." });
    }
});


app.post("/api/admin/menu", async (req, res) => {
    const { weekStart, monday, mondayNotes, tuesday, tuesdayNotes, wednesday, wednesdayNotes, thursday, thursdayNotes, fridayBagels, fridayLunch, fridayTreat } = req.body;


    if (!weekStart) return res.status(400).json({ error: "weekStart date is required." });


    const schedule = [
        { day_of_week: "Monday", description: monday, notes: mondayNotes },
        { day_of_week: "Tuesday", description: tuesday, notes: tuesdayNotes },
        { day_of_week: "Wednesday", description: wednesday, notes: wednesdayNotes },
        { day_of_week: "Thursday", description: thursday, notes: thursdayNotes },
        { day_of_week: "Friday", description: fridayLunch, notes: `Bagels: ${fridayBagels || "–"} | Treat: ${fridayTreat || "–"}` }
    ];


    try {
        if (!await tableExists("weekly_menus")) {
            return res.status(500).json({ error: "weekly_menus table is not configured." });
        }
        for (const item of schedule) {
            const existing = await db.query(
                "SELECT id FROM dbo.weekly_menus WHERE week_start_date = ? AND day_of_week = ?",
                [weekStart, item.day_of_week]
            );
            if (existing.recordset && existing.recordset.length > 0) {
                await db.query(
                    "UPDATE dbo.weekly_menus SET description = ?, notes = ? WHERE week_start_date = ? AND day_of_week = ?",
                    [item.description || null, item.notes || null, weekStart, item.day_of_week]
                );
            } else {
                await db.query(
                    "INSERT INTO dbo.weekly_menus (week_start_date, day_of_week, description, notes) VALUES (?, ?, ?, ?)",
                    [weekStart, item.day_of_week, item.description || null, item.notes || null]
                );
            }
        }
        res.json({ message: "Weekly menu saved successfully!" });
    } catch (err) {
        console.error("[admin/menu POST] Error:", err);
        res.status(500).json({ error: "Database error saving weekly menu." });
    }
});


// COMPATIBILITY ROUTE FOR MENU-PLANNER.HTML
app.post("/api/weekly-menu", async (req, res) => {
    console.log(">>> Hit POST /api/weekly-menu compatibility route");
    const schedule = req.body.schedule;


    if (!Array.isArray(schedule)) {
        return res.status(400).json({ error: "Schedule array is required." });
    }


    try {
        if (!await tableExists("weekly_menus")) {
            return res.status(500).json({ error: "weekly_menus table is not configured." });
        }


        // Calculate Monday of current week (YYYY-MM-DD)
        const mondayDate = new Date();
        mondayDate.setDate(mondayDate.getDate() - ((mondayDate.getDay() + 6) % 7));
        const weekStart = mondayDate.toISOString().split('T')[0];


        for (const item of schedule) {
            const description = item.restaurant_name || null;
            const notes = item.cuisine ? `Cuisine: ${item.cuisine} | Type: ${item.meal_type || 'Lunch'}` : (item.meal_type || null);


            const existing = await db.query(
                "SELECT id FROM dbo.weekly_menus WHERE week_start_date = ? AND day_of_week = ?",
                [weekStart, item.day_of_week]
            );


            if (existing.recordset && existing.recordset.length > 0) {
                await db.query(
                    "UPDATE dbo.weekly_menus SET description = ?, notes = ? WHERE week_start_date = ? AND day_of_week = ?",
                    [description, notes, weekStart, item.day_of_week]
                );
            } else {
                await db.query(
                    "INSERT INTO dbo.weekly_menus (week_start_date, day_of_week, description, notes) VALUES (?, ?, ?, ?)",
                    [weekStart, item.day_of_week, description, notes]
                );
            }
        }
        res.status(201).json({ message: "Weekly menu saved successfully." });
    } catch (err) {
        console.error("[weekly-menu POST] Error:", err);
        res.status(500).json({ error: err.message || "Database error saving menu." });
    }
});


// ============================================================
// 4. SUBSCRIBERS
// ============================================================
app.get("/api/admin/subscribers", async (req, res) => {
    try {
        if (!await tableExists("subscribers")) return res.json([]);
        const result = await db.query("SELECT * FROM dbo.subscribers ORDER BY subscribedAt DESC");
        res.json(result.recordset || []);
    } catch (err) {
        console.error("[admin/subscribers] Error:", err);
        res.status(500).json({ error: "Could not fetch subscribers." });
    }
});


app.post("/api/subscribe", async (req, res) => {
    const { phone, username } = req.body;
    const subscriberName = username || "Anonymous";


    if (!phone || phone.trim().length < 10) {
        return res.status(400).json({ error: "Please enter a valid phone number." });
    }
    try {
        const existing = await db.query("SELECT id FROM dbo.subscribers WHERE phone = ?", [phone.trim()]);
        if (existing.recordset && existing.recordset.length > 0) {
            return res.status(400).json({ error: "Phone number is already subscribed." });
        }
        await db.query(
            "INSERT INTO dbo.subscribers (username, phone, subscribedAt) VALUES (?, ?, GETDATE())",
            [subscriberName, phone.trim()]
        );
        res.status(201).json({ message: "Successfully signed up for text alerts!" });
    } catch (err) {
        console.error("[subscribe] Error:", err);
        res.status(500).json({ error: "Failed to enroll subscription." });
    }
});


app.get("/api/subscribers", async (req, res) => {
    try {
        if (!await tableExists("subscribers")) return res.json([]);
        const result = await db.query("SELECT * FROM dbo.subscribers ORDER BY subscribedAt DESC");
        res.json(result.recordset || []);
    } catch (err) {
        console.error("[subscribers GET] Error:", err);
        res.status(500).json({ error: err.message });
    }
});


// ============================================================
// 5. PUSH NOTIFICATIONS
// ============================================================
app.post("/api/save-subscription", async (req, res) => {
    const subscription = req.body;
    if (!subscription?.endpoint || !subscription?.keys) {
        return res.status(400).json({ error: "Invalid subscription payload." });
    }
    if (!await tableExists("push_subscriptions")) {
        return res.status(500).json({ error: "Push notification storage is not configured." });
    }
    const { endpoint, keys } = subscription;
    try {
        const update = await db.query(
            "UPDATE dbo.push_subscriptions SET p256dh = ?, auth = ? WHERE endpoint = ?",
            [keys.p256dh, keys.auth, endpoint]
        );
        const affected = update.rowsAffected?.[0] || 0;
        if (affected === 0) {
            await db.query(
                "INSERT INTO dbo.push_subscriptions (endpoint, p256dh, auth) VALUES (?, ?, ?)",
                [endpoint, keys.p256dh, keys.auth]
            );
        }
        res.status(201).json({ success: true, message: "Push subscription saved successfully." });
    } catch (err) {
        console.error("[save-subscription] Error:", err);
        res.status(500).json({ error: "Failed to save push subscription." });
    }
});


app.post("/api/send-notification", async (req, res) => {
    const { message } = req.body;
    if (!message?.trim()) {
        return res.status(400).json({ error: "Notification message is required." });
    }
    if (!await tableExists("push_subscriptions")) {
        return res.status(500).json({ error: "Push notification storage is not configured." });
    }
    const payload = JSON.stringify({ title: "Commvault Lunch Update", message: message.trim() });
    try {
        const result = await db.query("SELECT * FROM dbo.push_subscriptions");
        const subscriptions = result.recordset || [];
        if (!subscriptions.length) {
            return res.json({ success: true, message: "No active push subscribers to notify." });
        }
        await Promise.all(subscriptions.map(async (subRow) => {
            const pushSub = { endpoint: subRow.endpoint, keys: { p256dh: subRow.p256dh, auth: subRow.auth } };
            try {
                await webpush.sendNotification(pushSub, payload);
            } catch (pushErr) {
                if (pushErr?.statusCode === 410 || pushErr?.statusCode === 404) {
                    await db.query("DELETE FROM dbo.push_subscriptions WHERE endpoint = ?", [subRow.endpoint]);
                } else {
                    console.error("[send-notification] WebPush error:", pushErr);
                }
            }
        }));
        res.json({ success: true, message: `Notification sent to ${subscriptions.length} subscriber(s)!` });
    } catch (err) {
        console.error("[send-notification] DB error:", err);
        res.status(500).json({ error: "Database error fetching subscriptions." });
    }
});


// ============================================================
// 6. CONTACT MESSAGES
// ============================================================
app.post("/api/contact-messages", async (req, res) => {
    const { name, email, message } = req.body;
    if (!name || !email || !message) {
        return res.status(400).json({ error: "Name, email, and message are required." });
    }
    try {
        await db.query(
            "INSERT INTO dbo.contact_messages (name, email, message, status, created_at) VALUES (?, ?, ?, ?, GETDATE())",
            [name, email, message, "Pending"]
        );
        res.status(201).json({ message: "Message submitted successfully." });
    } catch (err) {
        console.error("[contact-messages POST] Error:", err);
        res.status(500).json({ error: "Database error submitting contact message." });
    }
});


app.get("/api/admin/messages", async (req, res) => {
    try {
        if (!await tableExists("contact_messages")) return res.json([]);
        const result = await db.query("SELECT * FROM dbo.contact_messages ORDER BY created_at DESC");
        res.json(result.recordset || []);
    } catch (err) {
        console.error("[admin/messages GET] Error:", err);
        res.status(500).json({ error: "Could not fetch messages." });
    }
});


app.put("/api/contact-messages/:id/responded", async (req, res) => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ error: "Invalid message ID." });
    try {
        const result = await db.query("UPDATE dbo.contact_messages SET status = ? WHERE id = ?", ["Responded", id]);
        if (!result.rowsAffected?.[0]) return res.status(404).json({ error: "Message not found." });
        res.json({ message: "Message marked as responded." });
    } catch (err) {
        console.error("[contact-messages PUT] Error:", err);
        res.status(500).json({ error: "Database error updating contact message." });
    }
});


// ============================================================
// 7. RESTAURANTS
// ============================================================
app.get("/api/restaurants", async (req, res) => {
    try {
        if (!await tableExists("restaurants")) {
            return res.status(404).json({ error: "restaurants table not found." });
        }
        const result = await db.query("SELECT * FROM dbo.restaurants ORDER BY name ASC");
        res.json(result.recordset || []);
    } catch (err) {
        console.error("[restaurants] Error:", err);
        res.status(500).json({ error: "Failed to load restaurants" });
    }
});


// ============================================================
// 8. DEV / DIAGNOSTIC ROUTES
// ============================================================
app.get("/test", (req, res) => res.send("Server is running."));


app.get("/route-check", (req, res) => {
    res.json({ sqlTestExists: true });
});


app.get("/api/sql-test", async (req, res) => {
    try {
        const result = await db.query("SELECT @@SERVERNAME AS ServerName, DB_NAME() AS DatabaseName");
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ message: err.message, code: err.code });
    }
});


app.get('/test-direct-sql', async (req, res) => {
    try {
        const result = await db.query('SELECT TOP 5 * FROM dbo.lunch_orders');
        res.json(result.recordset);
    } catch (err) {
        console.error('DIRECT SQL ERROR:', err);
        res.status(500).json({ error: err.message });
    }
});


app.get('/test-sql', async (req, res) => {
    try {
        const result = await db.query('SELECT TOP 5 * FROM restaurants');
        res.json(result.recordset);
    } catch (err) {
        console.error('test-sql error:', err);
        res.status(500).json({ error: err.message || 'SQL test error' });
    }
});


// ============================================================
// PROCESS MONITORS & LOGGING
// ============================================================
process.on('exit', (code) => {
    console.log('NODE EXITED WITH CODE:', code);
});
process.on('uncaughtException', (err) => {
    console.error('UNCAUGHT EXCEPTION:', err);
});
process.on('unhandledRejection', (err) => {
    console.error('UNHANDLED REJECTION:', err);
});


setInterval(() => {
    console.log('Server heartbeat...');
}, 30000);


function logRegisteredRoutes() {
    if (typeof app === 'undefined' || !app?._router?.stack) {
        console.log('No Express router stack detected.');
        return;
    }
    console.log('Registered Express routes:');
    const routes = [];
    function traverse(stack) {
        stack.forEach(layer => {
            if (layer.route && layer.route.path) {
                const methods = Object.keys(layer.route.methods || {}).map(m => m.toUpperCase()).join(', ');
                routes.push(`${methods} ${layer.route.path}`);
                return;
            }
            if (layer.name === 'router' && layer.handle && layer.handle.stack) {
                traverse(layer.handle.stack);
                return;
            }
            if (layer.regexp && layer.regexp.source) {
                routes.push(`MIDDLEWARE ${layer.regexp.source}`);
            }
        });
    }
    traverse(app._router.stack);
    if (routes.length === 0) {
        console.log('No registered routes found.');
        return;
    }
    routes.forEach(r => console.log('REGISTERED ROUTE:', r));
}


// ============================================================
// START SERVER
// ============================================================
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Commvault Lunch Portal server running on port ${PORT}`);
    logRegisteredRoutes();
    console.log("BOTTOM OF FILE REACHED");
});



