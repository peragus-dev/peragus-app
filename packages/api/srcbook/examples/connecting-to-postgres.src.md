<!-- srcbook:{"language":"javascript"} -->

# Connecting to Postgres

###### package.json

```json
{
  "type": "module",
  "dependencies": {
    "pg": "^8.7.1"
  }
}
```

This Srcbook is an example of a simple way to connect to a Postgres database in Node using the `pg` library.

It requires a PG_DATABASE_URL environment variable to be set with the database you wish to connect to.

###### connect.js

```javascript
import assert from 'node:assert';
import pg from 'pg';

assert.ok(process.env.PG_DATABASE_URL, 'You need to have a PG_DATABASE_URL set');

export const client = new pg.Client({
  connectionString: process.env.PG_DATABASE_URL,
});
```

## Running a Simple Query

Now that we have established a connection, let's run a simple query.

###### query.js

```javascript
import { client } from './connect.js';

await client.connect();

const result = await client.query('SELECT NOW() AS current_time');
console.log('Result:', result.rows[0].current_time);

await client.end();
```

## Inserting Data

Let's see how to insert data into a table. We'll assume there's a table named `users` with columns `id` and `name`.

###### insert.js

```javascript
import { client } from './connect.js';

await client.connect();

const insertQuery = 'INSERT INTO users (id, name) VALUES ($1, $2) RETURNING *';
const values = [1, 'John Doe'];

const result = await client.query(insertQuery, values)
console.log('Inserted row:', result.rows[0]);

await client.end();
```

## Updating Data

Next, let's update data in the `users` table.

###### update.js

```javascript
import { client } from './connect.js';

await client.connect();

const updateQuery = 'UPDATE users SET name = $1 WHERE id = $2 RETURNING *';
const values = ['Jane Doe', 1];

const result = await client.query(updateQuery, values)
console.log('Updated row:', result.rows[0]);

await client.end();
```

## Deleting Data

Finally, let's delete data from the `users` table.

###### delete.js

```javascript
import { client } from './connect.js';

await client.connect();

const deleteQuery = 'DELETE FROM users WHERE id = $1 RETURNING *';
const values = [1];

const result = await client.query(deleteQuery, values)
console.log('Deleted row:', result.rows[0]);

await client.end();
```

## Conclusion

In this srcbook, we covered the basics of connecting to a PostgreSQL database using a connection string and performing simple CRUD operations. The `pg` library provides a straightforward way to interact with PostgreSQL without the overhead of an ORM.