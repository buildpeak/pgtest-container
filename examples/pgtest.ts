import { Pool } from 'pg';

import { PostgresContainer } from '../src/postgres-container';

async function main() {
  const container = await PostgresContainer.start('15', { sslmode: 'disable' });

  console.log(container);

  const pool = new Pool({ connectionString: container.connectionUri });

  const r = await pool.query('SELECT NOW()');

  console.log(r.rows);

  await pool.end();

  await container.shutdown();
}

main();
