require("dotenv").config();

const sql = require("mssql/msnodesqlv8");

const config = {
    connectionString:
        "Driver={ODBC Driver 17 for SQL Server};" +
        `Server=${process.env.DB_SERVER};` +
        `Database=${process.env.DB_NAME};` +
        "Trusted_Connection=Yes;" +
        "Encrypt=Yes;" +
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