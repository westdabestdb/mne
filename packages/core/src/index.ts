// @mnemia/core — capture, recall, hygiene over one Postgres.
// Surface grows as features migrate in; today it's just the DB layer.
export { getPool, closePool, withTx } from "./db.js";
