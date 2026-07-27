// ==========================================
// DEPENDENCIES & INITIALIZATION
// ==========================================
const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const cookieParser = require("cookie-parser");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { createClient } = require("@supabase/supabase-js");

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "commvault-portal-secret-key-2026";

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
// 3. SUBSCRIBER ENDPOINT (TEXT ALERTS)
// ==========================================
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
app.listen(PORT, () => {
    console.log(`Commvault Lunch Portal server running on port ${PORT}`);
});