// Een nagebootste D1-database voor de tests, op de SQLite die in Node zit. Zo draait de echte code van de Worker,
// met dezelfde SQL, zonder Cloudflare. Alleen wat de Worker gebruikt: prepare, bind, all en batch.
import { DatabaseSync } from 'node:sqlite';

export function nepD1() {
  const db = new DatabaseSync(':memory:');
  const opdracht = (sql, waarden = []) => ({
    bind: (...w) => opdracht(sql, w),
    voer: () => (/^\s*select/i.test(sql) ? { results: db.prepare(sql).all(...waarden) } : (db.prepare(sql).run(...waarden), { results: [] })),
    all: async () => ({ results: db.prepare(sql).all(...waarden) }),
    run: async () => { db.prepare(sql).run(...waarden); return { success: true }; },
  });
  return {
    prepare: (sql) => opdracht(sql),
    // Zoals in D1: alles in één transactie
    batch: async (lijst) => {
      db.exec('BEGIN');
      try { const uit = lijst.map((o) => o.voer()); db.exec('COMMIT'); return uit; } catch (e) { db.exec('ROLLBACK'); throw e; }
    },
    sql: db, // voor controles in de tests
  };
}
