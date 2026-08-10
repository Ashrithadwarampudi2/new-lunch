// ==========================================
// RESTAURANTS, MENUS & ORDERS ENDPOINTS
// ==========================================
// ==========================================
// SQL SERVER CONFIGURATION
// ==========================================

const sql = require('mssql');

const sqlConfig = {
    server: 'lunchmenu',
    database: 'LunchPortal',
    options: {
        trustServerCertificate: true
    }
};

// ==========================================
// RESTAURANTS ENDPOINT (SQL SERVER)
// ==========================================

app.get('/api/restaurants', async (req, res) => {

    const activeOnly = req.query.active === 'true';

    const query = activeOnly
        ? 'SELECT * FROM dbo.restaurants WHERE is_active = 1'
        : 'SELECT * FROM dbo.restaurants';

    try {

        await sql.connect(sqlConfig);

        const result = await sql.query(query);

        res.json(result.recordset);

    } catch (err) {

        console.error(
            'SQL Server error fetching restaurants:',
            err
        );

        res.status(500).json({
            error: 'Database error fetching restaurants.'
        });

    } finally {

        try {
            await sql.close();
        } catch (e) {
            // ignore close errors
        }

    }
});

// 2. GET Active Weekly Menu
app.get('/api/weekly-menu', (req, res) => {
    const query = 'SELECT * FROM weekly_menus WHERE is_active = 1';
    db.all(query, [], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: 'Database error fetching weekly menu.' });
        }
        res.json(rows);
    });
});

// 3. POST / Save Published Weekly Menu
app.post('/api/weekly-menu', requireAdmin, (req, res) => {
    const { schedule } = req.body;
    if (!schedule || !Array.isArray(schedule)) {
        return res.status(400).json({ error: 'Invalid schedule format.' });
    }

    // Deactivate previous active menus
    db.run('UPDATE weekly_menus SET is_active = 0', [], (err) => {
        if (err) return res.status(500).json({ error: 'Database update failed.' });

        const stmt = db.prepare(`INSERT INTO weekly_menus (day_of_week, meal_type, restaurant_id, restaurant_name, cuisine, is_active)
                                 VALUES (?, ?, ?, ?, ?, 1)`);
        schedule.forEach(item => {
            stmt.run([item.day_of_week, item.meal_type, item.restaurant_id, item.restaurant_name, item.cuisine]);
        });
        stmt.finalize();

        res.status(201).json({ message: 'Weekly menu published successfully.' });
    });
});

// 4. POST Employee Order
app.post('/api/orders', (req, res) => {
    const { username, monday, tuesday, wednesday, thursday, bagels, friday, icecream } = req.body;

    const sql = `INSERT INTO orders (username, monday, tuesday, wednesday, thursday, bagels, friday, icecream)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
    const params = [username, monday, tuesday, wednesday, thursday, bagels, friday, icecream];

    db.run(sql, params, function (err) {
        if (err) {
            return res.status(500).json({ error: 'Failed to record order.' });
        }
        res.status(201).json({ message: 'Order submitted successfully', id: this.lastID });
    });
});