// ============================================================
// db.js — SQL Server connection pool
// Reads credentials from config.ini
// ============================================================


const fs  = require("fs");
const ini = require("ini");
const sql = require("mssql");


// 1. READ config.ini
const configFile = ini.parse(fs.readFileSync("./config.ini", "utf-8"));


const config = {
  server:   configFile.server,
  port:     parseInt(configFile.port, 10),
  database: configFile.database,
  user:     configFile.user,
  password: configFile.password,
  options: {
    trustServerCertificate: true
  }
};


console.log("Loaded DB config:", {
  server:   config.server,
  port:     config.port,
  database: config.database,
  user:     config.user
});


let pool        = null;
let poolConnect = null;


// 2. CREATE connection pool
function createPool() {
  pool = new sql.ConnectionPool(config);


  pool.on("error", (err) => {
    console.error("SQL POOL ERROR:", err);
  });


  poolConnect = pool.connect()
    .then(() => {
      console.log("SQL SERVER CONNECTED");
      return pool;
    })
    .catch((err) => {
      console.error("DB pool connection failed:", err);
      pool        = null;
      poolConnect = null;
      throw err;
    });


  return poolConnect;
}


// 3. GET or re-initialize pool
async function getPool() {
  if (pool && pool.connected) return pool;
  if (poolConnect) {
    await poolConnect;
    if (pool && pool.connected) return pool;
  }
  return createPool();
}


// Helper function to infer mssql parameter type
function getSqlType(param) {
  if (param === null || param === undefined) return sql.NVarChar;
  if (param instanceof Date) return sql.DateTime;
  if (typeof param === "boolean") return sql.Bit;
  if (typeof param === "number") {
    return Number.isInteger(param) ? sql.Int : sql.Decimal(18, 2);
  }
  return sql.NVarChar;
}


// 4. QUERY helper — accepts SQLite-style ? placeholders
//    and converts them to SQL Server @p1, @p2, ... style with explicit types
async function query(text, params = []) {
  const activePool = await getPool();


  let idx = 0;
  const transformedText = text.replace(/\?/g, () => `@p${++idx}`);


  console.log("DB QUERY:", {
    database:   config.database,
    queryText:  transformedText,
    paramCount: params.length
  });


  const request = activePool.request();


  params.forEach((param, index) => {
    const paramName = `p${index + 1}`;
    const sqlType = getSqlType(param);
    const paramValue = (param === undefined) ? null : param;


    request.input(paramName, sqlType, paramValue);
  });


  return await request.query(transformedText);
}


module.exports = { query, getPool, config };



