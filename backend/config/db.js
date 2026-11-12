
require("dotenv").config();

const sql = require("mssql/msnodesqlv8");

const config = {
  server: process.env.DB_SERVER,
  database: process.env.DB_NAME,

  driver: "msnodesqlv8",

  options: {
    trustedConnection: true,
    trustServerCertificate: true,
    encrypt: false
  },

  connectionString:
    "Driver={ODBC Driver 18 for SQL Server};" +
    `Server=${process.env.DB_SERVER};` +
    `Database=${process.env.DB_NAME};` +
    "Trusted_Connection=Yes;" +
    "Encrypt=Optional;" +
    "TrustServerCertificate=Yes;"
};

async function connectDB() {
  try {
    const pool = await sql.connect(config);

    console.log("Ket noi SQL Server thanh cong!");

    return pool;
  } catch (error) {
    console.error("Loi ket noi:", error.message);
    throw error;
  }
}

module.exports = { sql, connectDB };
