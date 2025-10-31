const express = require('express');
const cors = require('cors');
const db = require('./db');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');

const app = express();
const port = 8040;

app.use(express.json());

// CORS configuration
app.use(cors({
    origin: "http://localhost:3000",
    credentials: true
}));

app.use(cookieParser());

// Configuration
const JWT_SECRET = process.env.JWT_SECRET || 'my_super_secret_key_12345';
const COOKIE_NAME = 'auth_token';

const COOKIE_OPTIONS = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    path: '/',
};

// Auth middleware
function authMiddleware(req, res, next) {
    try {
        const token = req.cookies[COOKIE_NAME];
        if (!token) {
            return res.status(401).json({ message: 'Not authenticated' });
        }

        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ message: 'Invalid or expired token' });
    }
}

// Check auth endpoint
app.get('/api/check-auth', (req, res) => {
    try {
        const token = req.cookies[COOKIE_NAME];
        if (!token) {
            return res.json({ authenticated: false });
        }

        const decoded = jwt.verify(token, JWT_SECRET);
        return res.json({
            authenticated: true,
            user: decoded
        });
    } catch (err) {
        return res.json({ authenticated: false });
    }
});

// Database health check
app.get('/ping', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT 1 AS ok');
        res.json({ ok: rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Login endpoint
app.post('/api/login', async (req, res) => {
    const { user_name, password } = req.body;

    if (!user_name || !password) {
        return res.status(400).json({ message: 'All fields are required!' });
    }

    try {
        const [rows] = await db.query(
            'SELECT user_id, user_name, password, role FROM user_table WHERE user_name = ? AND password = ? LIMIT 1',
            [user_name, password]
        );

        if (!rows || rows.length === 0) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        const user = rows[0];
        const token = jwt.sign(
            {
                user_id: user.user_id,
                user_name: user.user_name,
                role: user.role,
            },
            JWT_SECRET,
            { expiresIn: '1h' }
        );

        res.cookie(COOKIE_NAME, token, {
            ...COOKIE_OPTIONS,
            maxAge: 60 * 60 * 1000,
        });

        return res.json({
            success: true,
            message: 'Login successful',
            user: {
                user_id: user.user_id,
                user_name: user.user_name,
                role: user.role,
            },
        });
    } catch (error) {
        console.error('Login error:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
});

// Protected EMS data endpoint
app.get('/api/ems-dashboard/data', authMiddleware, async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM energy_reports ORDER BY reading_date ASC');
        res.json({
            success: true,
            count: rows.length,
            data: rows,
        });
    } catch (error) {
        console.error('Database query failed:', error.message);
        res.status(500).json({
            success: false,
            message: 'Database query error',
            error: error.message,
        });
    }
});
//get data meter wise
app.get("/api/get-data-meter-wise", async (req, res) => {
    try {
        const { meter_no, machine_name } = req.query;

        const [rows] = await db.query(`SELECT * FROM energy_reports ORDER BY reading_date DESC`);

        // If meter_no or machine_name provided, filter directly
        if (meter_no || machine_name) {
            const filtered = [];

            for (const row of rows) {
                if (
                    (meter_no && Number(row.meter_no) === Number(meter_no)) ||
                    (machine_name &&
                        row.machine_name &&
                        row.machine_name.toLowerCase().includes(machine_name.toLowerCase()))
                ) {
                    filtered.push(row);
                }
            }

            return res.status(200).json({
                Success: true,
                meter_no: meter_no ? Number(meter_no) : filtered[0]?.meter_no || null,
                machineName: filtered[0]?.machine_name || machine_name || null,
                length: filtered.length,
                data: filtered,
            });
        }

        // If no meter or machine name is provided, return grouped data (same as /get-data-all-machines)
        const machinesMap = {};

        for (const row of rows) {
            const key = row.meter_no || row.machine_name || "Unknown";
            if (!machinesMap[key]) {
                machinesMap[key] = {
                    meter_no: row.meter_no || null,
                    machineName: row.machine_name || "Unknown",
                    data: [],
                };
            }
            machinesMap[key].data.push(row);
        }

        const machines = [];
        for (const key in machinesMap) {
            machines.push({
                Success: true,
                meter_no: machinesMap[key].meter_no,
                machineName: machinesMap[key].machineName,
                length: machinesMap[key].data.length,
                data: machinesMap[key].data,
            });
        }

        return res.status(200).json({ Success: true, machines });
    } catch (error) {
        console.error("Database query failed:", error.message);
        res.status(500).json({
            Success: false,
            message: "Database query error",
            error: error.message,
        });
    }
});


// Logout endpoint
app.post('/api/logout', (req, res) => {
    res.clearCookie(COOKIE_NAME, COOKIE_OPTIONS);
    return res.json({ success: true, message: 'Logged out successfully' });
});

// Start server
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});