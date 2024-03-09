# pgtest-container

This is a small repo just to create PostgreSQL container for unittest or integration test for nodejs projects.

## Installation

```
npm install pgtest-container
```

## Usage

```typescript
import { Pool } from 'pg';

import { startPostgresContainer } from '../src/postgres-container';

async function main() {
  const container = await startPostgresContainer('15', { sslmode: 'disable' });

  console.log(container);

  const pool = new Pool({ connectionString: container.connectionUri });

  const r = await pool.query('SELECT NOW()');

  console.log(r.rows);

  await pool.end();

  await container.shutdown();
}

main();
```
