require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { connectDB } = require("./config/db");

const productRoutes = require("./routes/productRoutes");
const categoryRoutes = require("./routes/categoryRoutes");
const tableRoutes = require("./routes/tableRoutes");
const authRoutes = require("./routes/authRoutes");
const accountRoutes = require("./routes/accountRoutes");
const authMiddleware = require("./middleware/authMiddleware");

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/accounts", accountRoutes);
app.use("/api/products", authMiddleware, productRoutes);
app.use("/api/categories", authMiddleware, categoryRoutes);
app.use("/api/tables", tableRoutes);

app.get("/", (req, res) => {
    res.json({
        message: "MOC Coffee Backend dang hoat dong"
    });
});

const PORT = process.env.PORT || 3000;

connectDB()
    .then(() => {
        app.listen(PORT, () => {
            console.log(`Backend dang chay: http://localhost:${PORT}`);
        });
    })
    .catch((error) => {
        console.error("Khong the khoi dong backend:", error.message);
        process.exit(1);
    });