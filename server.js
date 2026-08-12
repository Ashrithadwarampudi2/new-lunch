// ==========================================
// DEPENDENCIES & INITIALIZATION
// ==========================================
const express = require("express");
const path = require("path");
// authentication removed temporarily for SSO integration
// auth-related packages were removed from runtime usage during SSO migration
const webpush = require("web-push");
const db = require('./db');


const app = express();
const PORT = 4000;

// ==========================================
// VAPID & WEB-PUSH CONFIGURATION
// ==========================================
const PUBLIC_VAPID_KEY = process.env.PUBLIC_VAPID_KEY || "BLwCm04sZAn5P9Swr-9UBzTujwH8GBL-kLFD6nJNnzNqx1P4nMkA2UQ5ldlO9XSUhXrHxO2lKMFjV0knlJwcdiM";
const PRIVATE_VAPID_KEY = process.env.PRIVATE_VAPID_KEY || "jX8L-ysZCffyZ8ajIMUO1HzPZo3Vb7N4u6TLfm533aY";


webpush.setVapidDetails(
    "mailto:admin@commvault.com",
    PUBLIC_VAPID_KEY,
    PRIVATE_VAPID_KEY
);




// ==========================================
// MIDDLEWARE CONFIGURATION
// ==========================================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));



// Database: using SQL Server via ./db.js (no local SQLite initialization)



// Authentication temporarily disabled so the app can be used without login.
// `authenticateToken` will attach a default guest user to requests.
function authenticateToken(req, res, next) {
    req.user = { username: "Guest", role: "user" };
    next();
}

function requireAdmin(req, res, next) {
    // Allow access during SSO migration. Admin-restrictions should be
    // re-applied when SSO is integrated.
    next();
}

async function tableExists(tableName) {
    try {
        const result = await db.query(
            "SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = ?",
            [tableName]
        );
        return result.recordset && result.recordset.length > 0;
    } catch (err) {
        console.error('[tableExists] error checking table', tableName, err);
        return false;
    }
}


// ==========================================
// 1. AUTHENTICATION ENDPOINTS
// ==========================================


// NOTE: /api/login removed while SSO integration is prepared.


// Check Current User Authentication Status (returns a guest user while auth is disabled)
app.get("/api/auth/me", authenticateToken, (req, res) => {
    res.json({ username: req.user.username, role: req.user.role });
});



// NOTE: Registration endpoint removed while auth is disabled.


// Logout Endpoint (keeps behavior but no longer depends on cookie parsing)
app.post("/logout", (req, res) => {
    try {
        res.clearCookie("auth_token");
    } catch (e) { }
    res.json({ message: "Logged out successfully" });
});


// Admin user inspection helper routes may still exist for migration diagnostics
app.get("/api/admin/users", async (req, res) => {
    try {
        if (!await tableExists('users')) {
            return res.status(404).json({ error: "users table not found" });
        }
        const result = await db.query('SELECT id, username, role, createdAt FROM dbo.users ORDER BY username ASC');
        res.json(result.recordset);
    } catch (err) {
        console.error('Could not fetch users list:', err);
        res.status(500).json({ error: "Could not fetch users list." });
    }
});


// ==========================================
// 2. ADMIN USER ENDPOINTS
// ==========================================



// Get subscribers list (Admin view - temporarily open)
app.get("/api/admin/subscribers", (req, res) => {
    (async () => {
        try {
            const result = await db.query('SELECT * FROM subscribers ORDER BY subscribedAt DESC');
            res.json(result.recordset);
        } catch (err) {
            console.error('Could not fetch subscribers:', err);
            res.status(500).json({ error: "Could not fetch subscribers." });
        }
    })();
});



// ==========================================
// 3. SUBSCRIBER ENDPOINTS (TEXT ALERTS & PUSH)
// ==========================================


// Phone text alert subscription
app.post("/api/subscribe", (req, res) => {
    const { phone } = req.body;
    if (!phone || phone.trim().length < 10) {
        return res.status(400).json({ error: "Please enter a valid phone number." });
    }
    (async () => {
        try {
            await db.query('INSERT INTO subscribers (phone) VALUES (?)', [phone.trim()]);
            res.status(201).json({ message: "Successfully signed up for text alerts!" });
        } catch (err) {
            console.error('Failed to enroll subscription:', err);
            const msg = err && err.message ? err.message : '';
            if (msg.includes('UNIQUE') || msg.includes('duplicate') || msg.includes('Violation')) {
                return res.status(400).json({ error: "Phone number is already subscribed." });
            }
            return res.status(500).json({ error: "Failed to enroll subscription." });
        }
    })();
});


app.get("/api/subscribers", async (req, res) => {
    try {
        if (!await tableExists('subscribers')) {
            return res.json([]);
        }
        const result = await db.query('SELECT * FROM dbo.subscribers ORDER BY subscribedAt DESC');
        res.json(result.recordset);
    } catch (err) {
        console.error('Error fetching subscribers:', err);
        return res.status(500).json({ error: err.message });
    }
});



// Browser Web Push Subscription Endpoint (Called by home.html)
app.post("/api/save-subscription", async (req, res) => {
    const subscription = req.body;


    if (!subscription || !subscription.endpoint || !subscription.keys) {
        return res.status(400).json({ error: "Invalid subscription payload." });
    }

    if (!await tableExists('push_subscriptions')) {
        return res.status(500).json({ error: 'Push notification storage is not configured.' });
    }

    const { endpoint, keys } = subscription;

    try {
        const update = await db.query('UPDATE dbo.push_subscriptions SET p256dh = ?, auth = ? WHERE endpoint = ?', [keys.p256dh, keys.auth, endpoint]);
        const rowsAffected = update.rowsAffected && update.rowsAffected[0] ? update.rowsAffected[0] : 0;
        if (rowsAffected === 0) {
            await db.query('INSERT INTO dbo.push_subscriptions (endpoint, p256dh, auth) VALUES (?, ?, ?)', [endpoint, keys.p256dh, keys.auth]);
        }
        res.status(201).json({ success: true, message: "Push subscription saved successfully." });
    } catch (err) {
        console.error("Error saving push subscription:", err);
        return res.status(500).json({ error: "Failed to save push subscription." });
    }
});



// Dispatch Notifications Endpoint (Called by Admin Dashboard)
app.post("/api/send-notification", async (req, res) => {
    const { message } = req.body;


    if (!message || message.trim() === "") {
        return res.status(400).json({ error: "Notification message is required." });
    }

    if (!await tableExists('push_subscriptions')) {
        return res.status(500).json({ error: 'Push notification storage is not configured.' });
    }


    const payload = JSON.stringify({
        title: "🍱 Commvault Lunch Update",
        message: message.trim()
    });


    try {
        const result = await db.query('SELECT * FROM push_subscriptions');
        const subscriptions = result.recordset || [];

        if (subscriptions.length === 0) {
            return res.json({ success: true, message: "No active push subscribers to notify." });
        }

        const dispatchPromises = subscriptions.map((subRow) => {
            const pushSubscription = {
                endpoint: subRow.endpoint,
                keys: {
                    p256dh: subRow.p256dh,
                    auth: subRow.auth
                }
            };

            return webpush.sendNotification(pushSubscription, payload).catch(async (pushErr) => {
                // If subscription has expired or is invalid (404/410), delete it from SQL Server
                if (pushErr && (pushErr.statusCode === 410 || pushErr.statusCode === 404)) {
                    try {
                        await db.query('DELETE FROM push_subscriptions WHERE endpoint = ?', [subRow.endpoint]);
                    } catch (delErr) {
                        console.error('Failed to delete expired subscription:', delErr);
                    }
                } else {
                    console.error("WebPush delivery error:", pushErr);
                }
            });
        });

        await Promise.all(dispatchPromises);
        return res.json({ success: true, message: `Notification sent to ${subscriptions.length} subscriber device(s)!` });
    } catch (err) {
        console.error('Database error fetching subscriptions.', err);
        return res.status(500).json({ error: 'Database error fetching subscriptions.' });
    }
});



// ==========================================
// Restaurants endpoint (SQL Server)
// ==========================================
app.get('/test', (req, res) => {
    res.send('test works');
});
console.log("Restaurants route loaded");

app.post('/api/orders', async (req, res) => {
    const { username = 'Anonymous', monday, tuesday, wednesday, thursday, bagels, bubbakoos, icecream } = req.body;

    try {
        await db.query(
            'INSERT INTO dbo.lunch_orders (username, monday, tuesday, wednesday, thursday, bagels, Friday, icecream, submitted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, GETDATE())',
            [username, monday || null, tuesday || null, wednesday || null, thursday || null, bagels || null, bubbakoos || null, icecream || null]
        );
        res.status(201).json({ message: 'Order submitted successfully.' });
    } catch (err) {
        console.error('[orders] SQL Server error inserting order:', err);
        res.status(500).json({ error: 'Database error submitting order.' });
    }
});

app.get('/api/orders', async (req, res) => {
    try {
        if (!await tableExists('lunch_orders')) {
            return res.json([]);
        }

        const result = await db.query(
            'SELECT * FROM dbo.lunch_orders ORDER BY submitted_at DESC'
        );

        res.json(result.recordset);
    } catch (err) {
        console.error('[orders] SQL Server error fetching orders:', err);
        res.status(500).json({ error: 'Database error fetching orders.' });
    }
});

app.get('/api/contact-messages', async (req, res) => {
    try {
        if (!await tableExists('contact_messages')) {
            return res.json([]);
        }
        const result = await db.query('SELECT * FROM dbo.contact_messages ORDER BY created_at DESC');
        res.json(result.recordset);
    } catch (err) {
        console.error('[contact-messages] SQL Server error fetching messages:', err);
        res.status(500).json({ error: 'Database error fetching contact messages.' });
    }
});

app.post('/api/contact-messages', async (req, res) => {
    const { name, email, message } = req.body;

    if (!name || !email || !message) {
        return res.status(400).json({ error: 'Name, email, and message are required.' });
    }

    try {
        await db.query(
            'INSERT INTO dbo.contact_messages (name, email, message, status, created_at) VALUES (?, ?, ?, ?, GETDATE())',
            [name, email, message, 'Pending']
        );
        res.status(201).json({ message: 'Message submitted successfully.' });
    } catch (err) {
        console.error('[contact-messages] SQL Server error inserting message:', err);
        res.status(500).json({ error: 'Database error submitting contact message.' });
    }
});

app.put('/api/contact-messages/:id/responded', async (req, res) => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
        return res.status(400).json({ error: 'Invalid message ID.' });
    }

    try {
        const result = await db.query('UPDATE dbo.contact_messages SET status = ? WHERE id = ?', ['Responded', id]);
        if (!(result.rowsAffected && result.rowsAffected[0] > 0)) {
            return res.status(404).json({ error: 'Message not found.' });
        }
        res.json({ message: 'Message marked as responded.' });
    } catch (err) {
        console.error('[contact-messages] SQL Server error updating message:', err);
        res.status(500).json({ error: 'Database error updating contact message.' });
    }
});

app.get('/api/weekly-menu', async (req, res) => {
    try {
        if (!await tableExists('weekly_menus')) {
            return res.json([]);
        }
        const result = await db.query('SELECT * FROM dbo.weekly_menus ORDER BY week_start_date DESC, id DESC');
        res.json(result.recordset);
    } catch (err) {
        console.error('[weekly-menu] SQL Server error fetching weekly menu:', err);
        res.status(500).json({ error: 'Database error fetching weekly menu.' });
    }
});

app.post('/api/weekly-menu', async (req, res) => {
    const schedule = req.body && req.body.schedule;
    if (!Array.isArray(schedule)) {
        return res.status(400).json({ error: 'Schedule array is required.' });
    }

    const now = new Date();
    const mondayDate = new Date(now);
    mondayDate.setDate(mondayDate.getDate() - ((mondayDate.getDay() + 6) % 7));

    if (!await tableExists('weekly_menus')) {
        return res.status(500).json({ error: 'weekly_menus table is not configured.' });
    }

    try {
        for (const item of schedule) {
            await db.query(
                'INSERT INTO dbo.weekly_menus (week_start_date, day_of_week, meal_id, is_approved, restaurant_name, meal_type) VALUES (?, ?, ?, ?, ?, ?)',
                [mondayDate, item.day_of_week || null, item.meal_id || null, 1, item.restaurant_name || null, item.meal_type || null]
            );
        }
        res.status(201).json({ message: 'Weekly menu saved successfully.' });
    } catch (err) {
        console.error('[weekly-menu] SQL Server error saving weekly menu:', err);
        res.status(500).json({ error: 'Database error saving weekly menu.' });
    }
});

app.get('/api/restaurants', async (req, res) => {
    const activeOnly = req.query.active === 'true';

    const query = activeOnly
        ? 'SELECT * FROM dbo.restaurants WHERE is_active = 1'
        : 'SELECT * FROM dbo.restaurants';

    console.log('[restaurants] executing query:', query);

    try {
        const result = await db.query(query);
        console.log(`[restaurants] query completed, rows=${result.recordset.length}`);
        res.json(result.recordset);
    } catch (err) {
        console.error('[restaurants] SQL Server error fetching restaurants:', err);
        if (err.code) {
            console.error('[restaurants] SQL Server error code:', err.code);
        }
        if (err.originalError) {
            console.error('[restaurants] SQL Server original error:', err.originalError);
        }

        res.status(500).json({
            error: 'Database error fetching restaurants.'
        });
    } finally {
        // connection pool is managed in db.js
    }
});



// ==========================================
// START SERVER
// ==========================================
app.get('/route-check', (req, res) => {
    res.json({
        sqlTestExists: true
    });
});

console.log('ABOUT TO REGISTER SQL TEST ROUTE');
console.log('SQL TEST ROUTE REGISTERED');
app.get('/api/sql-test', async (req, res) => {
    try {
        const queryText = `SELECT @@SERVERNAME AS ServerName, DB_NAME() AS DatabaseName`;
        const result = await db.query(queryText);
        res.json({ server: 'configured', data: result.recordset });
    } catch (err) {
        console.error('[sql-test] error:', err);
        res.status(500).json({ error: err.message || 'SQL test failed' });
    }
});
console.log('SQL TEST ROUTE REGISTRATION COMPLETE');

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "home.html"));
});

console.log("TEST ROUTE LOADED");

function logRegisteredRoutes() {
    if (!app._router || !app._router.stack) {
        console.log('No Express router stack detected.');
        return;
    }

    console.log('Registered Express routes:');
    app._router.stack
        .filter((layer) => layer.route)
        .forEach((layer) => {
            const methods = Object.keys(layer.route.methods).map((m) => m.toUpperCase()).join(', ');
            console.log(`REGISTERED ROUTE: ${methods} ${layer.route.path}`);
        });
}

logRegisteredRoutes();

console.log("BOTTOM OF FILE REACHED");



app.listen(PORT, '0.0.0.0', () => {
    console.log(`Commvault Lunch Portal server running on port ${PORT}`);
});

process.on('exit', (code) => {
    console.log('NODE EXITED WITH CODE:', code);
});

process.on('uncaughtException', (err) => {
    console.error('UNCAUGHT EXCEPTION:', err);
});

process.on('unhandledRejection', (err) => {
    console.error('UNHANDLED REJECTION:', err);
});

// Quick test endpoint to return top 5 restaurants
app.get('/test-sql', async (req, res) => {
    try {
        const result = await db.query('SELECT TOP 5 * FROM restaurants');
        res.json(result.recordset);
    } catch (err) {
        console.error('test-sql error:', err);
        res.status(500).json({ error: err.message || 'SQL test error' });
    }
});
setInterval(() => {
    console.log('Server heartbeat...');
}, 30000);