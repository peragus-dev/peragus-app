<!-- srcbook:{"language":"javascript"} -->

# Checking if a service is running on a local port in Node.js

###### package.json

```json
{
  "type": "module",
  "dependencies": {
    "net": "latest"
  }
}
```

## Introduction

In this srcbook, we'll explore how to check if a service is running on a specific local port (e.g., `localhost:2150`) using Node.js. This can be useful for various scenarios, such as ensuring that a required service is up before starting another process.

## Checking Port Availability

We'll use the `net` module, which is a built-in module in Node.js, to create a simple TCP client that attempts to connect to the specified port. If the connection is successful, it means the port is in use; otherwise, it is free.

###### check-port.js

```javascript
import net from 'net';

/**
 * Function to check if a port is in use
 * @param {string} host - The hostname to check (e.g., 'localhost')
 * @param {number} port - The port number to check (e.g., 2150)
 * @returns {Promise<boolean>} - Resolves to true if the port is in use, false otherwise
 */
export function isPortInUse(host, port) {
  return new Promise((resolve, reject) => {
    const client = new net.Socket();

    client.once('error', (err) => {
      if (err.code === 'ECONNREFUSED') {
        resolve(false); // Port is not in use
      } else {
        reject(err); // Some other error occurred
      }
    });

    client.once('connect', () => {
      client.end();
      resolve(true); // Port is in use
    });

    client.connect(port, host);
  });
}

// Example usage
const host = 'localhost';
const port = 2150;

isPortInUse(host, port)
  .then((inUse) => {
    if (inUse) {
      console.log(`Port ${port} on ${host} is in use.`);
    } else {
      console.log(`Port ${port} on ${host} is free.`);
    }
  })
  .catch((err) => {
    console.error(`Error checking port ${port} on ${host}:`, err);
  });
```

## Explanation

In the code above, we define a function `isPortInUse` that takes a hostname and a port number as arguments. It returns a promise that resolves to `true` if the port is in use and `false` otherwise.

- We create a new TCP client using `net.Socket()`.
- We attach an `error` event listener to handle connection errors. If the error code is `ECONNREFUSED`, it means the port is not in use.
- We attach a `connect` event listener to handle successful connections, indicating that the port is in use.
- We attempt to connect to the specified port on the given host using `client.connect(port, host)`.

## Running the Example

To run the example, ensure you have Node.js installed. Save the code in a file named `check-port.js` and execute it using the following command:

```bash
node check-port.js
```

You should see output indicating whether the specified port is in use or free.