const fs = require('fs');
const ini = require('ini');
const sql = require('mssql');


// 1. READ CONFIG.INI
const configFile = ini.parse(
  fs.readFileSync('./config.ini', 'utf-8')
);


const config = {
  server: configFile.server,
  port: parseInt(configFile.port, 10),
  database: configFile.database,
  user: configFile.user,
  password: configFile.password,
  options: {
    trustServerCertificate: true
  }
};


console.log('Loaded config:', {
  server: config.server,
  port: config.port,
  database: config.database,
  user: config.user,
  options: config.options
});


let pool = null;
let poolConnect = null;


// 2. CREATE CONNECTION POOL
function createPool() {
  pool = new sql.ConnectionPool(config);


  pool.on('error', err => {
    console.error('SQL POOL ERROR:', err);
  });


  poolConnect = pool.connect()
    .then(() => {
      console.log('SQL SERVER CONNECTED');
      return pool;
    })
    .catch(err => {
      console.error('DB pool connection failed:', err);
      pool = null;
      poolConnect = null;
      throw err;
    });


  return poolConnect;
}


// 3. RETRIEVE OR RE-INITIALIZE CONNECTION POOL
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


// 4. QUERY HELPER WITH PARAMETERIZED BINDINGS
async function query(text, params = []) {
  const activePool = await getPool();
  let idx = 0;


  // Replace '?' placeholders with SQL Server parameter format (@p1, @p2, ...)
  const transformedText = text.replace(/\?/g, () => `@p${++idx}`);


  console.log('DB QUERY:', {
    server: config.server,
    port: config.port,
    database: config.database,
    queryText: transformedText,
    paramCount: params.length
  });


  const request = activePool.request();


  // Bind each parameter to its corresponding @p variable name
  params.forEach((param, index) => {
    request.input(`p${index + 1}`, param);
  });


  return await request.query(transformedText);
}


module.exports = {
  query,
  getPool,
  config
};



