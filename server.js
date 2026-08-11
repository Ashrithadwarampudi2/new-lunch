// ==========================================
// DEPENDENCIES & INITIALIZATION
// ==========================================
const express = require("express");
const path = require("path");
const cookieParser = require("cookie-parser");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const webpush = require("web-push");
const db = require('./db');


const app = express();
const PORT = 4000;
const JWT_SECRET = process.env.JWT_SECRET || "commvault-portal-secret-key-2026";

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
app.use(cookieParser());
app.use(express.static(__dirname));



// Database: using SQL Server via ./db.js (no local SQLite initialization)



// ==========================================
// AUTHENTICATION MIDDLEWARE
// ==========================================
function authenticateToken(req, res, next) {
    const token = req.cookies.auth_token;
    if (!token) {
        return res.status(401).json({ error: "Unauthorized access. Please log in." });
    }


    jwt.verify(token, JWT_SECRET, (err, decodedUser) => {
        if (err) {
            return res.status(403).json({ error: "Invalid or expired session token." });
        }
        req.user = decodedUser;
        next();
    });
}


function requireAdmin(req, res, next) {
    authenticateToken(req, res, () => {
        if (req.user && req.user.role === "admin") {
            next();
        } else {
            res.status(403).json({ error: "Forbidden: Admin privileges required." });
        }
    });
}



// ==========================================
// 1. AUTHENTICATION ENDPOINTS
// ==========================================


// Login
app.post("/api/login", async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: "Username and password are required." });
    }

    try {
        const result = await db.query('SELECT * FROM users WHERE username = ?', [username.trim()]);
        const user = result.recordset && result.recordset[0];
        if (!user) return res.status(401).json({ error: "Invalid username or password." });

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) return res.status(401).json({ error: "Invalid username or password." });

        const token = jwt.sign(
            { id: user.id, username: user.username, role: user.role },
            JWT_SECRET,
            { expiresIn: "8h" }
        );

        res.cookie("auth_token", token, {
            httpOnly: true,
            sameSite: "strict",
            maxAge: 8 * 60 * 60 * 1000 // 8 hours
        });

        res.json({ message: "Login successful", username: user.username, role: user.role });
    } catch (err) {
        console.error('[login] SQL Server error fetching user:', err);
        return res.status(500).json({
            error: err.message,
            code: err.code,
            originalError: err.originalError
        });
    }
});


// Check Current User Authentication Status
app.get("/api/auth/me", authenticateToken, (req, res) => {
    res.json({ username: req.user.username, role: req.user.role });
});



// Register New Account Endpoint
app.post("/register", async (req, res) => {
    const { username, password, role } = req.body;


    if (!username || !password) {
        return res.status(400).json({ error: "Username and password are required." });
    }


    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const userRole = role === "admin" ? "admin" : "user"; // Default to standard user

        await db.query(`INSERT INTO users (username, password, role) VALUES (?, ?, ?)`, [username.trim(), hashedPassword, userRole]);
        res.status(201).json({ message: "Account created successfully!" });
    } catch (err) {
        console.error('Error creating account:', err);
        const msg = err && err.message ? err.message : '';
        if (msg.includes('UNIQUE') || msg.includes('duplicate') || msg.includes('Violation')) {
            return res.status(400).json({ error: "Username already exists." });
        }
        res.status(500).json({ error: "Failed to create account." });
    }
});


// Logout Endpoint
app.post("/logout", (req, res) => {
    res.clearCookie("auth_token");
    res.json({ message: "Logged out successfully" });
});



// ==========================================
// 2. ADMIN USER ENDPOINTS
// ==========================================


// Get all registered users (Admin only)
app.get("/api/admin/users", requireAdmin, (req, res) => {
    (async () => {
        try {
            const result = await db.query('SELECT id, username, role, createdAt FROM users ORDER BY username ASC');
            res.json(result.recordset);
        } catch (err) {
            console.error('Could not fetch users list:', err);
            res.status(500).json({ error: "Could not fetch users list." });
        }
    })();
});



// Get subscribers list (Admin only)
app.get("/api/admin/subscribers", requireAdmin, (req, res) => {
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


app.get("/api/subscribers", (req, res) => {
    (async () => {
        try {
            const result = await db.query('SELECT * FROM subscribers ORDER BY subscribedAt DESC');
            res.json(result.recordset);
        } catch (err) {
            console.error('Error fetching subscribers:', err);
            return res.status(500).json({ error: err.message });
        }
    })();
});



// Browser Web Push Subscription Endpoint (Called by home.html)
app.post("/api/save-subscription", (req, res) => {
    const subscription = req.body;


    if (!subscription || !subscription.endpoint || !subscription.keys) {
        return res.status(400).json({ error: "Invalid subscription payload." });
    }


    const { endpoint, keys } = subscription;

    (async () => {
        try {
            // Try update first
            const update = await db.query('UPDATE push_subscriptions SET p256dh = ?, auth = ? WHERE endpoint = ?', [keys.p256dh, keys.auth, endpoint]);
            const rowsAffected = update.rowsAffected && update.rowsAffected[0] ? update.rowsAffected[0] : 0;
            if (rowsAffected === 0) {
                await db.query('INSERT INTO push_subscriptions (endpoint, p256dh, auth) VALUES (?, ?, ?)', [endpoint, keys.p256dh, keys.auth]);
            }
            res.status(201).json({ success: true, message: "Push subscription saved successfully." });
        } catch (err) {
            console.error("Error saving push subscription:", err);
            return res.status(500).json({ error: "Failed to save push subscription." });
        }
    })();
});



// Dispatch Notifications Endpoint (Called by Admin Dashboard)
app.post("/api/send-notification", async (req, res) => {
    const { message } = req.body;


    if (!message || message.trim() === "") {
        return res.status(400).json({ error: "Notification message is required." });
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
    res.sendFile(path.join(__dirname, "login.html"));
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