
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { connectDB } = require("./config/db");

const productRoutes = require("./routes/productRoutes");
const tableRoutes = require("./routes/tableRoutes");
const authRoutes = require("./routes/authRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const app = express();


app.use(cors());
app.use(express.json());
app.use("/api/auth", authRoutes);
app.use("/api/payments", paymentRoutes);

app.get("/", (req, res) => {
    res.json({
        message: "MOC Coffee Backend dang hoat dong"
    });
});

app.use("/api/products", productRoutes);
app.use("/api/tables", tableRoutes);

const PORT = process.env.PORT || 3000;

connectDB()
    .then(() => {
        app.listen(PORT, () => {
            console.log(
                `Backend dang chay: http://localhost:${PORT}`
            );
        });
    })
    .catch((error) => {
        console.error("Khong the khoi dong backend:", error.message);
        process.exit(1);
    });
