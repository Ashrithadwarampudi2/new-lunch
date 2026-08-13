const sql = require('mssql');

const config = {
    user: 'sa',
    password: 'Commvault!12',
    server: 'localhost',
    port: 1433,
    database: 'LunchPortal',
    options: {
        encrypt: false,
        trustServerCertificate: true
    }
};

let pool = null;
let poolConnect = null;

function createPool() {
    pool = new sql.ConnectionPool(config);

    pool.on('error', err => {
        console.error(' SQL POOL ERROR:', err);
    });

    poolConnect = pool.connect()
        .then(() => {
            console.log(' SQL SERVER CONNECTED');
            return pool;
        })
        .catch(err => {
            console.error(' DB pool connection failed:', err);
            pool = null;
            poolConnect = null;
            throw err;
        });

    return poolConnect;
}

async function getPool() {
    if (pool && pool.connected) {
        return pool;
    }

    if (poolConnect) {
        await poolConnect;
        if (pool && pool.connected) {
            return pool;
        }
    }

    return createPool();
}

async function query(text, params = []) {
    const activePool = await getPool();

    let idx = 0;
    const transformed = text.replace(/\?/g, () => `@p${++idx}`);

    console.log('DB QUERY:', {
        server: config.server,
        port: config.port,
        database: config.database,
        query: transformed,
        params
    });

    const request = activePool.request();
    params.forEach((p, i) => {
        request.input(`p${i + 1}`, p);
    });

    return request.query(transformed);
}

module.exports = { query, config, getPool, pool };