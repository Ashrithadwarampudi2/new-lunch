// ============================================================
// server.js — Commvault Lunch Portal
// Database: SQL Server (via ./db.js + config.ini)
// Auth:      Session-based (bcrypt) — SSO-ready stubs included
// ============================================================

const express   = require("express");
const path      = require("path");
const bcrypt    = require("bcrypt");
const session   = require("express-session");
const webpush   = require("web-push");
const db        = require("./db");           // SQL Server pool (mssql)

const app  = express();
const PORT = process.env.PORT || 4000;

// ============================================================
// VAPID / WEB-PUSH  (move keys to .env in production!)
// ============================================================
const PUBLIC_VAPID_KEY  = process.env.PUBLIC_VAPID_KEY  || "BLwCm04sZAn5P9Swr-9UBzTujwH8GBL-kLFD6nJNnzNqx1P4nMkA2UQ5ldl09XSUhXrHx021KMFjV0knlJwcdiM";
const PRIVATE_VAPID_KEY = process.env.PRIVATE_VAPID_KEY || "jX8L-ysZCffyZ8ajIMUO1HzPZo3Vb7N4u6TLfm533aY";
webpush.setVapidDetails("mailto:admin@commvault.com", PUBLIC_VAPID_KEY, PRIVATE_VAPID_KEY);

// ============================================================
// MIDDLEWARE
// ============================================================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname, { index: false }));

app.use(session({
  name:             "lunch.sid",
  secret:           process.env.SESSION_SECRET || "lunch-secret-key-change-in-prod",
  resave:           false,
  saveUninitialized: false,
  cookie: {
    secure:   false,   // set true when behind HTTPS in production
    httpOnly: true,
    sameSite: "lax",
    path:     "/",
    maxAge:   24 * 60 * 60 * 1000
  }
}));

// ============================================================
// AUTH HELPERS
// ============================================================

/** Require any logged-in user. */
function requireAuth(req, res, next) {
  if (!req.session?.user) {
    return res.status(401).json({ error: "Please log in first." });
  }
  next();
}

/** Require admin role. */
function requireAdmin(req, res, next) {
  if (!req.session?.user) {
    return res.status(401).json({ error: "Please log in first." });
  }
  if (req.session.user.role !== "admin") {
    return res.status(403).json({ error: "Admin access required." });
  }
  next();
}

// ============================================================
// TABLE EXISTENCE CHECK HELPER  (SQL Server flavour)
// ============================================================
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
// ENSURE DEFAULT ADMIN ACCOUNT EXISTS IN dbo.users
// ============================================================
const DEFAULT_ADMIN_USERNAME = process.env.DEFAULT_ADMIN_USERNAME || "admin";
const DEFAULT_ADMIN_PASSWORD = process.env.DEFAULT_ADMIN_PASSWORD || "Admin123!";

async function ensureDefaultAdminAccount() {
  try {
    if (!await tableExists("users")) {
      console.warn("[startup] users table not found — skipping default admin creation.");
      return;
    }
    const existing = await db.query(
      "SELECT id FROM dbo.users WHERE LOWER(username) = LOWER(?)",
      [DEFAULT_ADMIN_USERNAME]
    );
    if (existing.recordset && existing.recordset.length > 0) return;

    const hash = await bcrypt.hash(DEFAULT_ADMIN_PASSWORD, 12);
    await db.query(
      "INSERT INTO dbo.users (username, password, role) VALUES (?, ?, ?)",
      [DEFAULT_ADMIN_USERNAME, hash, "admin"]
    );
    console.log(`[startup] Created default admin: ${DEFAULT_ADMIN_USERNAME}`);
  } catch (err) {
    console.error("[startup] Could not ensure default admin:", err.message);
  }
}
ensureDefaultAdminAccount();

// ============================================================
// ROOT ROUTE
// ============================================================
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "login.html"));
});

// ============================================================
// 1. AUTH ENDPOINTS
// ============================================================

/**
 * GET /api/auth/me
 * Returns the currently logged-in user, or 401.
 * SSO NOTE: Replace session check here with your SSO token validation.
 */
app.get("/api/auth/me", (req, res) => {
  if (!req.session?.user) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  res.json({ username: req.session.user.username, role: req.session.user.role });
});

/**
 * POST /register
 * Creates a new user account.
 * SECURITY FIX: Role is always forced to "user" — only an existing admin
 * can promote accounts via /api/admin/users/:id/promote.
 */
app.post("/register", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password || username.trim().length < 3 || password.length < 6) {
      return res.status(400).json({ error: "Username must be at least 3 characters and password at least 6." });
    }

    if (!await tableExists("users")) {
      return res.status(500).json({ error: "User table not configured." });
    }

    // Check for duplicate
    const existing = await db.query(
      "SELECT id FROM dbo.users WHERE LOWER(username) = LOWER(?)",
      [username.trim()]
    );
    if (existing.recordset && existing.recordset.length > 0) {
      return res.status(400).json({ error: "Username already exists!" });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    // SECURITY: role is always 'user' regardless of what client sends
    await db.query(
      "INSERT INTO dbo.users (username, password, role) VALUES (?, ?, ?)",
      [username.trim(), hashedPassword, "user"]
    );

    res.json({ message: "Registration successful!", role: "user" });
  } catch (err) {
    console.error("[register] Error:", err);
    res.status(500).json({ error: "Something went wrong on the server." });
  }
});

/**
 * POST /login
 * Validates credentials and creates a session.
 */
app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required." });
  }

  try {
    if (!await tableExists("users")) {
      return res.status(500).json({ error: "User table not configured." });
    }

    const result = await db.query(
      "SELECT * FROM dbo.users WHERE LOWER(username) = LOWER(?)",
      [username.trim()]
    );
    const user = result.recordset && result.recordset[0];

    if (!user) {
      return res.status(400).json({ error: "User not found!" });
    }

    const storedPassword = user.password || "";
    let passwordsMatch = false;

    if (storedPassword.startsWith("$2a$") || storedPassword.startsWith("$2b$")) {
      passwordsMatch = await bcrypt.compare(password, storedPassword).catch(() => false);
    } else {
      // Plaintext fallback (legacy accounts) — consider migrating these
      passwordsMatch = (storedPassword === password);
    }

    if (!passwordsMatch) {
      return res.status(400).json({ error: "Incorrect password!" });
    }

    req.session.user = { username: user.username, role: user.role };
    req.session.save((saveErr) => {
      if (saveErr) {
        console.error("[login] Session save error:", saveErr);
        return res.status(500).json({ error: "Could not create your session." });
      }
      res.json({ message: "Login successful!", username: user.username, role: user.role });
    });
  } catch (err) {
    console.error("[login] Error:", err);
    res.status(500).json({ error: "Database error during login." });
  }
});

/**
 * POST /logout
 */
app.post("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error("[logout] Error:", err);
      return res.status(500).json({ error: "Could not log out." });
    }
    res.clearCookie("lunch.sid");
    res.json({ message: "Logged out successfully." });
  });
});

// ============================================================
// 2. LUNCH ORDERS ENDPOINTS
// ============================================================

/**
 * GET /api/orders/:username
 * Fetch a single user's existing order (for auto-fill on the order page).
 * Users can only see their own order; admins can see any.
 *
 * NOTE: Company DB uses column names:
 *   monday, tuesday, wednesday, thursday, bagels, Friday (bubbakoos), icecream, submitted_at
 * We alias these back to the original frontend field names for compatibility.
 */
app.get("/api/orders/:username", requireAuth, async (req, res) => {
  const username = req.params.username;

  if (req.session.user.role !== "admin" && req.session.user.username !== username) {
    return res.status(403).json({ error: "Access denied." });
  }

  try {
    if (!await tableExists("lunch_orders")) {
      return res.json(null);
    }

    const result = await db.query(
      `SELECT
         username,
         monday,
         tuesday      AS tuesdayChoice,
         wednesday    AS wednesdayChoice,
         thursday,
         bagels,
         Friday       AS bubbakoos,
         icecream,
         submitted_at AS submittedAt
       FROM dbo.lunch_orders
       WHERE username = ?`,
      [username]
    );

    const row = result.recordset && result.recordset[0];
    res.json(row || null);
  } catch (err) {
    console.error("[orders GET] Error:", err);
    res.status(500).json({ error: "Database error fetching order." });
  }
});

/**
 * GET /api/orders
 * Public or auth-gated read of all orders — used by the menu ticker, etc.
 */
app.get("/api/orders", requireAuth, async (req, res) => {
  try {
    if (!await tableExists("lunch_orders")) {
      return res.json([]);
    }
    const result = await db.query(
      `SELECT
         username,
         monday,
         tuesday      AS tuesdayChoice,
         wednesday    AS wednesdayChoice,
         thursday,
         bagels,
         Friday       AS bubbakoos,
         icecream,
         submitted_at AS submittedAt
       FROM dbo.lunch_orders
       ORDER BY submitted_at DESC`
    );
    res.json(result.recordset || []);
  } catch (err) {
    console.error("[orders GET all] Error:", err);
    res.status(500).json({ error: "Database error fetching orders." });
  }
});

/**
 * POST /api/orders
 * Save or update an employee's weekly lunch order (upsert).
 * Accepts the original frontend field names and maps to company DB columns.
 */
app.post("/api/orders", requireAuth, async (req, res) => {
  const {
    username,
    monday,
    tuesdayChoice,
    wednesdayChoice,
    thursday,
    bagels,
    bubbakoos,
    icecream
  } = req.body;

  const requestUsername = (username || req.session.user.username).trim();

  if (req.session.user.role !== "admin" && req.session.user.username !== requestUsername) {
    return res.status(403).json({ error: "Access denied." });
  }

  try {
    if (!await tableExists("lunch_orders")) {
      return res.status(500).json({ error: "Orders table not configured." });
    }

    // Check if this user already has an order this week
    const existing = await db.query(
      "SELECT id FROM dbo.lunch_orders WHERE username = ?",
      [requestUsername]
    );

    if (existing.recordset && existing.recordset.length > 0) {
      // UPDATE existing order
      await db.query(
        `UPDATE dbo.lunch_orders
         SET monday = ?, tuesday = ?, wednesday = ?, thursday = ?,
             bagels = ?, Friday = ?, icecream = ?, submitted_at = GETDATE()
         WHERE username = ?`,
        [
          monday       || null,
          tuesdayChoice  || null,
          wednesdayChoice || null,
          thursday     || null,
          bagels       || null,
          bubbakoos    || null,
          icecream     || null,
          requestUsername
        ]
      );
      return res.status(200).json({ message: "Order updated successfully!" });
    } else {
      // INSERT new order
      await db.query(
        `INSERT INTO dbo.lunch_orders
           (username, monday, tuesday, wednesday, thursday, bagels, Friday, icecream, submitted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, GETDATE())`,
        [
          requestUsername,
          monday       || null,
          tuesdayChoice  || null,
          wednesdayChoice || null,
          thursday     || null,
          bagels       || null,
          bubbakoos    || null,
          icecream     || null
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
// 3. ADMIN — ORDERS
// ============================================================

/**
 * GET /api/admin/orders
 * All orders, admin only.
 */
app.get("/api/admin/orders", requireAdmin, async (req, res) => {
  try {
    if (!await tableExists("lunch_orders")) {
      return res.json([]);
    }
    const result = await db.query(
      `SELECT
         username,
         monday,
         tuesday      AS tuesdayChoice,
         wednesday    AS wednesdayChoice,
         thursday,
         bagels,
         Friday       AS bubbakoos,
         icecream,
         submitted_at AS submittedAt
       FROM dbo.lunch_orders
       ORDER BY submitted_at DESC`
    );
    res.json(result.recordset || []);
  } catch (err) {
    console.error("[admin/orders] Error:", err);
    res.status(500).json({ error: "Failed to fetch orders." });
  }
});

// ============================================================
// 4. ADMIN — USER MANAGEMENT
// ============================================================

/**
 * GET /api/admin/users
 * List all users (admin only).
 */
app.get("/api/admin/users", requireAdmin, async (req, res) => {
  try {
    if (!await tableExists("users")) {
      return res.status(404).json({ error: "users table not found." });
    }
    const result = await db.query(
      "SELECT id, username, role, createdAt FROM dbo.users ORDER BY username ASC"
    );
    res.json(result.recordset || []);
  } catch (err) {
    console.error("[admin/users] Error:", err);
    res.status(500).json({ error: "Could not fetch users list." });
  }
});

/**
 * POST /api/admin/users/:id/promote
 * Promote a user to admin role.
 */
app.post("/api/admin/users/:id/promote", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    return res.status(400).json({ error: "Invalid user ID." });
  }
  try {
    const result = await db.query(
      "UPDATE dbo.users SET role = ? WHERE id = ?",
      ["admin", id]
    );
    const rows = result.rowsAffected && result.rowsAffected[0];
    if (!rows) return res.status(404).json({ error: "User not found." });
    res.json({ message: "User promoted to admin." });
  } catch (err) {
    console.error("[admin/promote] Error:", err);
    res.status(500).json({ error: "Could not promote user." });
  }
});

/**
 * DELETE /api/admin/users/:id
 * Remove a user and their orders.
 */
app.delete("/api/admin/users/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    return res.status(400).json({ error: "Invalid user ID." });
  }
  try {
    // Fetch username so we can also clean up their orders
    const userResult = await db.query(
      "SELECT username FROM dbo.users WHERE id = ?", [id]
    );
    const user = userResult.recordset && userResult.recordset[0];
    if (!user) return res.status(404).json({ error: "User not found." });

    await db.query("DELETE FROM dbo.lunch_orders WHERE username = ?", [user.username]);
    await db.query("DELETE FROM dbo.users WHERE id = ?", [id]);

    res.json({ message: `User "${user.username}" removed.` });
  } catch (err) {
    console.error("[admin/delete user] Error:", err);
    res.status(500).json({ error: "Could not delete user." });
  }
});

// ============================================================
// 5. WEEKLY MENU ENDPOINTS
// ============================================================

/**
 * GET /api/weekly-menu
 * Fetch the current weekly menu (public — for menu.html display).
 */
app.get("/api/weekly-menu", async (req, res) => {
  try {
    if (!await tableExists("weekly_menus")) {
      return res.json([]);
    }
    const result = await db.query(
      "SELECT * FROM dbo.weekly_menus ORDER BY week_start_date DESC, id DESC"
    );
    res.json(result.recordset || []);
  } catch (err) {
    console.error("[weekly-menu GET] Error:", err);
    res.status(500).json({ error: "Database error fetching weekly menu." });
  }
});

/**
 * POST /api/admin/menu
 * Save or update the weekly menu (admin only).
 * Accepts the admin dashboard's menu editor payload.
 */
app.post("/api/admin/menu", requireAdmin, async (req, res) => {
  const {
    weekStart,
    monday, mondayNotes,
    tuesday, tuesdayNotes,
    wednesday, wednesdayNotes,
    thursday, thursdayNotes,
    fridayBagels, fridayLunch, fridayTreat
  } = req.body;

  if (!weekStart) {
    return res.status(400).json({ error: "weekStart date is required." });
  }

  // Build a schedule array (one item per day) matching the weekly_menus table
  const schedule = [
    { day_of_week: "Monday",    description: monday,       notes: mondayNotes    },
    { day_of_week: "Tuesday",   description: tuesday,      notes: tuesdayNotes   },
    { day_of_week: "Wednesday", description: wednesday,    notes: wednesdayNotes },
    { day_of_week: "Thursday",  description: thursday,     notes: thursdayNotes  },
    { day_of_week: "Friday",    description: fridayLunch,  notes: `Bagels: ${fridayBagels || "–"} | Treat: ${fridayTreat || "–"}` }
  ];

  try {
    if (!await tableExists("weekly_menus")) {
      return res.status(500).json({ error: "weekly_menus table is not configured." });
    }

    for (const item of schedule) {
      // Upsert: update if row exists for this week+day, else insert
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

// ============================================================
// 6. SUBSCRIBERS (Phone text alerts)
// ============================================================

/**
 * GET /api/admin/subscribers
 * List all phone subscribers (admin only).
 */
app.get("/api/admin/subscribers", requireAdmin, async (req, res) => {
  try {
    if (!await tableExists("subscribers")) {
      return res.json([]);
    }
    const result = await db.query(
      "SELECT * FROM dbo.subscribers ORDER BY subscribedAt DESC"
    );
    res.json(result.recordset || []);
  } catch (err) {
    console.error("[admin/subscribers] Error:", err);
    res.status(500).json({ error: "Could not fetch subscribers." });
  }
});

/**
 * POST /api/subscribe
 * Sign up for phone text alerts.
 */
app.post("/api/subscribe", requireAuth, async (req, res) => {
  const { phone } = req.body;
  const username   = req.session.user.username;

  if (!phone || phone.trim().length < 10) {
    return res.status(400).json({ error: "Please enter a valid phone number." });
  }

  try {
    // Check for duplicate phone
    const existing = await db.query(
      "SELECT id FROM dbo.subscribers WHERE phone = ?",
      [phone.trim()]
    );
    if (existing.recordset && existing.recordset.length > 0) {
      return res.status(400).json({ error: "Phone number is already subscribed." });
    }

    await db.query(
      "INSERT INTO dbo.subscribers (username, phone, subscribedAt) VALUES (?, ?, GETDATE())",
      [username, phone.trim()]
    );
    res.status(201).json({ message: "Successfully signed up for text alerts!" });
  } catch (err) {
    console.error("[subscribe] Error:", err);
    res.status(500).json({ error: "Failed to enroll subscription." });
  }
});

/**
 * GET /api/subscribers
 * Public read of subscriber count (no PII — used for admin UI badge).
 */
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
// 7. PUSH NOTIFICATIONS (Browser Web Push)
// ============================================================

/**
 * POST /api/save-subscription
 * Save or update a browser push subscription.
 */
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

/**
 * POST /api/send-notification
 * Dispatch a push notification to all browser subscribers (admin only).
 */
app.post("/api/send-notification", requireAdmin, async (req, res) => {
  const { message } = req.body;
  if (!message?.trim()) {
    return res.status(400).json({ error: "Notification message is required." });
  }
  if (!await tableExists("push_subscriptions")) {
    return res.status(500).json({ error: "Push notification storage is not configured." });
  }

  const payload = JSON.stringify({ title: "Commvault Lunch Update", message: message.trim() });

  try {
    const result        = await db.query("SELECT * FROM dbo.push_subscriptions");
    const subscriptions = result.recordset || [];

    if (!subscriptions.length) {
      return res.json({ success: true, message: "No active push subscribers to notify." });
    }

    await Promise.all(subscriptions.map(async (subRow) => {
      const pushSub = { endpoint: subRow.endpoint, keys: { p256dh: subRow.p256dh, auth: subRow.auth } };
      try {
        await webpush.sendNotification(pushSub, payload);
      } catch (pushErr) {
        // Remove expired/invalid subscriptions automatically
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
// 8. CONTACT MESSAGES
// ============================================================

/**
 * POST /api/contact-messages
 * Save a contact form submission.
 */
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

/**
 * GET /api/admin/messages
 * Fetch all contact messages (admin only).
 */
app.get("/api/admin/messages", requireAdmin, async (req, res) => {
  try {
    if (!await tableExists("contact_messages")) return res.json([]);
    const result = await db.query(
      "SELECT * FROM dbo.contact_messages ORDER BY created_at DESC"
    );
    res.json(result.recordset || []);
  } catch (err) {
    console.error("[admin/messages GET] Error:", err);
    res.status(500).json({ error: "Could not fetch messages." });
  }
});

/**
 * PUT /api/contact-messages/:id/responded
 * Mark a contact message as responded.
 */
app.put("/api/contact-messages/:id/responded", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ error: "Invalid message ID." });
  try {
    const result = await db.query(
      "UPDATE dbo.contact_messages SET status = ? WHERE id = ?",
      ["Responded", id]
    );
    if (!result.rowsAffected?.[0]) return res.status(404).json({ error: "Message not found." });
    res.json({ message: "Message marked as responded." });
  } catch (err) {
    console.error("[contact-messages PUT] Error:", err);
    res.status(500).json({ error: "Database error updating contact message." });
  }
});

// ============================================================
// 9. DEV/DEBUG ROUTES  (disable in production!)
// ============================================================
app.get("/test", (req, res) => res.send("Server is running."));

app.get("/api/sql-test", async (req, res) => {
  try {
    const result = await db.query("SELECT @@SERVERNAME AS ServerName, DB_NAME() AS DatabaseName");
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ message: err.message, code: err.code });
  }
});
// ============================================================
// 10. RESTAURANTS
// ============================================================

/**
 * GET /api/restaurants
 * Fetch all active restaurants for the menu planner.
 */
app.get("/api/restaurants", requireAdmin, async (req, res) => {
  try {
    if (!await tableExists("restaurants")) {
      return res.status(404).json({ error: "restaurants table not found." });
    }
    const result = await db.query(
      "SELECT * FROM dbo.restaurants ORDER BY name ASC"
    );
    res.json(result.recordset || []);
  } catch (err) {
    console.error("[restaurants] Error:", err);
    res.status(500).json({ error: "Failed to load restaurants" });
  }
});

// ============================================================
// START SERVER
// ============================================================
app.listen(PORT, () => {
  console.log(`Commvault Lunch Portal running on http://localhost:${PORT}`);
});