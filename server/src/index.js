import express from "express";
import cors from "cors";
import { BadRequest } from "./common.js";
import summary from "./routes/summary.js";
import scenario from "./routes/scenario.js";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
app.use("/api", summary);
app.use("/api", scenario);
app.use("/api", (_req, res) => res.status(404).json({ error: "not found" }));

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  if (err instanceof BadRequest) return res.status(400).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: "internal error" });
});

app.listen(PORT, () => console.log(`API listening on :${PORT}`));
