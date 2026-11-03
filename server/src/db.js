import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite"; // built in (Node 22.13+), no native build

const here = path.dirname(fileURLToPath(import.meta.url));
export const DB_PATH = process.env.DB_PATH || path.resolve(here, "../../data/payments.db");

export const db = new DatabaseSync(DB_PATH, { readOnly: true });

const hasView = db
  .prepare("SELECT 1 FROM sqlite_master WHERE type = 'view' AND name = 'v_transaction_fees'")
  .get();
if (!hasView) {
  throw new Error(`v_transaction_fees not found in ${DB_PATH}; run data/run_fee_model.py first`);
}
