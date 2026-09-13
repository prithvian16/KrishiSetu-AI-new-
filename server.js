const express = require("express");
const mongoose = require("mongoose");
const path = require("path");

const farmerRoutes = require("./routes/farmerRoutes");
const procurementRoutes = require("./routes/procurementRoutes");
const adminRoutes = require("./routes/adminRoutes");

const app = express();
const PORT = Number(process.env.PORT || 8080);
const MONGO_URL = process.env.MONGO_URL || "mongodb://127.0.0.1:27017/krishi_setu_ai";

app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true, limit: "5mb" }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.use("/api/farmers", farmerRoutes);
app.use("/api/procurement", procurementRoutes);
app.use("/api/admin", adminRoutes);
app.get("/api/health", (req, res) => res.json({ ok: true, app: "KrishiSetuAI", problemStatement: "26032" }));

mongoose.connect(MONGO_URL)
  .then(() => {
    console.log("MongoDB connected");
    app.listen(PORT, () => console.log(`KrishiSetuAI running at http://localhost:${PORT}`));
  })
  .catch(err => {
    console.error("MongoDB connection failed:", err.message);
    process.exit(1);
  });
