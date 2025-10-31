const mysql = require('mysql2/promise');

const db = mysql.createPool({
    host: '172.16.83.137',
    user: 'root',
    password: '',
    database: 'meter_database',
    connectionLimit: 10,
});

module.exports = db;
