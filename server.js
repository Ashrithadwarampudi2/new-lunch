// ==========================================
// DEPENDENCIES & INITIALIZATION
// ==========================================
const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const cookieParser = require("cookie-parser");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const webpush = require("web-push");
const { createClient } = require("@supabase/supabase-js");


const app = express();
const PORT = process.env.PORT || 3000;
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
// SUPABASE CLIENT INITIALIZATION
// ==========================================
const supabaseUrl = 'https://udqraywfsemkulraudbd.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkcXJheXdmc2Vta3VscmF1ZGJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQxMzI2NjEsImV4cCI6MjA5OTcwODY2MX0.2VWPvdoJP-bYalmBa56wqqEWX8jPABNgFokYomQo2Rk';
const supabase = createClient(supabaseUrl, supabaseKey);


// ==========================================
// MIDDLEWARE CONFIGURATION
// ==========================================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(__dirname));


// ==========================================
// DATABASE SETUP (SQLITE)
// ==========================================
const db = new sqlite3.Database("./database.db", (err) => {
    if (err) {
        console.error("Error connecting to SQLite database:", err.message);
    } else {
        console.log("Connected to SQLite database.");
        initializeDatabase();
    }
});


function initializeDatabase() {
    db.serialize(() => {
        // Users Table
        db.run(`
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'user',
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);


        // Subscribers Table (Text Alerts)
        db.run(`
            CREATE TABLE IF NOT EXISTS subscribers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                phone TEXT UNIQUE NOT NULL,
                subscribedAt DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);


        // Push Notifications Table (Browser Push Subscriptions)
        db.run(`
            CREATE TABLE IF NOT EXISTS push_subscriptions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                endpoint TEXT UNIQUE NOT NULL,
                p256dh TEXT NOT NULL,
                auth TEXT NOT NULL,
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);


        // Seed default admin and user if users table is empty
        db.get(`SELECT COUNT(*) AS count FROM users`, [], async (err, row) => {
            if (!err && row.count === 0) {
                const adminPassword = await bcrypt.hash("admin123", 10);
                const userPassword = await bcrypt.hash("user123", 10);


                db.run(`INSERT INTO users (username, password, role) VALUES (?, ?, ?)`, ["admin", adminPassword, "admin"]);
                db.run(`INSERT INTO users (username, password, role) VALUES (?, ?, ?)`, ["employee", userPassword, "user"]);
                console.log("Default accounts initialized: admin / admin123, employee / user123");
            }
        });
    });
}


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
app.post("/api/login", (req, res) => {
    const { username, password } = req.body;


    if (!username || !password) {
        return res.status(400).json({ error: "Username and password are required." });
    }


    db.get(`SELECT * FROM users WHERE username = ?`, [username.trim()], async (err, user) => {
        if (err) return res.status(500).json({ error: "Database authentication error." });
        if (!user) return res.status(401).json({ error: "Invalid username or password." });


        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(401).json({ error: "Invalid username or password." });
        }


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
    });
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


        db.run(
            `INSERT INTO users (username, password, role) VALUES (?, ?, ?)`,
            [username.trim(), hashedPassword, userRole],
            function (err) {
                if (err) {
                    if (err.message.includes("UNIQUE")) {
                        return res.status(400).json({ error: "Username already exists." });
                    }
                    return res.status(500).json({ error: "Failed to create account." });
                }
                res.status(201).json({ message: "Account created successfully!" });
            }
        );
    } catch (err) {
        res.status(500).json({ error: "Server error creating account." });
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
    db.all(`SELECT id, username, role, createdAt FROM users ORDER BY username ASC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: "Could not fetch users list." });
        res.json(rows);
    });
});


// Get subscribers list (Admin only)
app.get("/api/admin/subscribers", requireAdmin, (req, res) => {
    db.all(`SELECT * FROM subscribers ORDER BY subscribedAt DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: "Could not fetch subscribers." });
        res.json(rows);
    });
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


    db.run(`INSERT INTO subscribers (phone) VALUES (?)`, [phone.trim()], function (err) {
        if (err) {
            if (err.message.includes("UNIQUE")) {
                return res.status(400).json({ error: "Phone number is already subscribed." });
            }
            return res.status(500).json({ error: "Failed to enroll subscription." });
        }
        res.status(201).json({ message: "Successfully signed up for text alerts!" });
    });
});


app.get("/api/subscribers", (req, res) => {
    db.all("SELECT * FROM subscribers ORDER BY subscribedAt DESC", [], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(rows);
    });
});


// Browser Web Push Subscription Endpoint (Called by home.html)
app.post("/api/save-subscription", (req, res) => {
    const subscription = req.body;


    if (!subscription || !subscription.endpoint || !subscription.keys) {
        return res.status(400).json({ error: "Invalid subscription payload." });
    }


    const { endpoint, keys } = subscription;


    db.run(
        `INSERT OR REPLACE INTO push_subscriptions (endpoint, p256dh, auth) VALUES (?, ?, ?)`,
        [endpoint, keys.p256dh, keys.auth],
        function (err) {
            if (err) {
                console.error("Error saving push subscription:", err.message);
                return res.status(500).json({ error: "Failed to save push subscription." });
            }
            res.status(201).json({ success: true, message: "Push subscription saved successfully." });
        }
    );
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


    // Retrieve all active browser push subscriptions from SQLite
    db.all(`SELECT * FROM push_subscriptions`, [], async (err, subscriptions) => {
        if (err) {
            console.error("Error fetching push subscriptions:", err.message);
            return res.status(500).json({ error: "Database error fetching subscriptions." });
        }


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


            return webpush.sendNotification(pushSubscription, payload).catch((pushErr) => {
                // If subscription has expired or is invalid (404/410), delete it from SQLite
                if (pushErr.statusCode === 410 || pushErr.statusCode === 404) {
                    db.run(`DELETE FROM push_subscriptions WHERE endpoint = ?`, [subRow.endpoint]);
                } else {
                    console.error("WebPush delivery error:", pushErr);
                }
            });
        });


        await Promise.all(dispatchPromises);
        return res.json({ success: true, message: `Notification sent to ${subscriptions.length} subscriber device(s)!` });
    });
});


// ==========================================
// 4. CONTACT FORM ENDPOINT (SUPABASE INTEGRATION)
// ==========================================
app.post("/api/contact", async (req, res) => {
    const { name, email, message } = req.body;


    if (!name || !email || !message) {
        return res.status(400).json({ error: "All fields are required." });
    }


    if (name.trim().length < 2) {
        return res.status(400).json({ error: "Name must be at least 2 characters." });
    }


    const emailRegex = /^[^^\s@]+@[^^\s@]+\.[^^\s@]+$/;
    if (!emailRegex.test(email)) {
        return res.status(400).json({ error: "Please provide a valid email address." });
    }


    if (message.trim().length < 5) {
        return res.status(400).json({ error: "Message must be at least 5 characters long." });
    }


    try {
        const { data, error } = await supabase
            .from("contact_messages")
            .insert([
                {
                    name: name.trim(),
                    email: email.trim(),
                    message: message.trim(),
                    status: "Pending"
                }
            ]);


        if (error) {
            throw error;
        }


        res.status(201).json({ message: "Contact message received successfully!" });
    } catch (err) {
        console.error("Supabase Contact Insert Error:", err);
        res.status(500).json({ error: "Failed to submit contact form to database." });
    }
});


// ==========================================
// START SERVER
// ==========================================
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "login.html"));
});


app.listen(PORT, '0.0.0.0', () => {
    console.log(`Commvault Lunch Portal server running on port ${PORT}`);
});



