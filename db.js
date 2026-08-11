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

console.log('LOADED DB CONFIG:');
console.log({
    server: config.server,
    port: config.port,
    database: config.database,
    user: config.user
});

async function query(text, params = []) {
    console.log('DB QUERY:', text);

    let idx = 0;

    const transformed = text.replace(/\?/g, () => `@p${++idx}`);

    const pool = await sql.connect(config);

    const request = pool.request();

    params.forEach((p, i) => {
        request.input(`p${i + 1}`, p);
    });

    return await request.query(transformed);
}

module.exports = { query };