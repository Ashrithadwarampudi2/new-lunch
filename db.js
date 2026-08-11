const sql = require('mssql');

const config = {
    user: 'sa',
    password: 'Commvault!12',
    server: '127.0.0.1',
    port: 1433,
    database: 'LunchPortal',
    options: {
        encrypt: false,
        trustServerCertificate: true
    }
};

const pool = new sql.ConnectionPool(config);
const poolConnect = pool.connect().catch((err) => {
    console.error('DB pool connection failed:', err);
});

console.log('LOADED DB CONFIG:');
console.log({
    server: config.server,
    port: config.port,
    database: config.database,
    user: config.user
});

async function query(text, params = []) {
    await poolConnect;

    let idx = 0;
    const transformed = text.replace(/\?/g, () => `@p${++idx}`);

    console.log('DB QUERY:', {
        server: config.server,
        port: config.port,
        database: config.database,
        query: transformed
    });

    const request = pool.request();
    params.forEach((p, i) => {
        request.input(`p${i + 1}`, p);
    });

    return await request.query(transformed);
}

module.exports = { query, config, pool };