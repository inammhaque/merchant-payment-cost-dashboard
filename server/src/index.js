import express from "express";
import cors from "cors";
import summary from "./routes/summary.js";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
app.use("/api", summary);
app.use("/api", (_req, res) => res.status(404).json({ error: "not found" }));

app.listen(PORT, () => console.log(`API listening on :${PORT}`));
