<!-- srcbook:{"language":"javascript"} -->

# Shamir Secret Sharing

###### package.json

```json
{
  "type": "module",
  "dependencies": {
    "shamir-secret-sharing": "^0.0.3"
  }
}
```

## Introduction to Shamir Secret Sharing

Shamir's Secret Sharing is a cryptographic algorithm created by Adi Shamir. It is used to divide a secret into multiple parts, called shares, in such a way that a subset of those shares can be used to reconstruct the original secret. This is particularly useful for securely distributing sensitive information.

### Why Use Shamir Secret Sharing?

- **Security**: The secret is not stored in a single location, reducing the risk of it being compromised.
- **Redundancy**: Multiple shares can be distributed to ensure that the secret can still be reconstructed even if some shares are lost.
- **Access Control**: Only a predefined number of shares are required to reconstruct the secret, allowing for flexible access control.

## How Shamir Secret Sharing Works

The algorithm works by creating a polynomial of degree `k-1` (where `k` is the minimum number of shares needed to reconstruct the secret) with the secret as the constant term. Each share is a point on this polynomial. To reconstruct the secret, you need at least `k` points to solve the polynomial.

## Example: Using the `shamir-secret-sharing` Library

Let's demonstrate how to use the `shamir-secret-sharing` npm package to split and reconstruct a secret.

###### split-secret.js

```javascript
import { split } from 'shamir-secret-sharing';

// The secret we want to share
const secret = new TextEncoder().encode('my super secret');

// Split the secret into 5 shares, with a threshold of 3
export const shares = await split(secret, 5, 3);
```

In this example, we split the secret into 5 shares, and any 3 of these shares can be used to reconstruct the secret.

###### reconstruct-secret.js

```javascript
import { combine } from 'shamir-secret-sharing';
import { shares } from './split-secret.js';

// Combine the shares to reconstruct the secret
const reconstructedSecret = await combine(shares);

console.log('Reconstructed Secret:', new TextDecoder().decode(reconstructedSecret));
```

## Use cases

Shamir Secret Sharing is not something that is deployed in many environments. It is used in environments where you want to ensure multiple parties cooperate before some action is taken place. For example, Cryptocurrency wallets like [Privy's embedded wallet](https://www.privy.io/features/wallets) leverage Shamire Secret Sharing to ensure the wallet private key is never stored in its entirety, but rather shards of it are distributed and also required to reconstruct the key.