
Import in Srcbook
npx srcbook@latest import generating-random-ids

generating-random-ids.src.md
Raw
<!-- srcbook:{"language":"typescript","tsconfig.json":{"compilerOptions":{"module":"nodenext","moduleResolution":"nodenext","target":"es2022","resolveJsonModule":true,"noEmit":true,"allowImportingTsExtensions":true},"include":["src/**/*"],"exclude":["node_modules"]}} -->

# Generating random IDs

###### package.json

```json
{
  "type": "module",
  "dependencies": {
    "crypto": "^1.0.1",
    "@scure/base": "^1.0.0"
  },
  "devDependencies": {
    "tsx": "latest",
    "typescript": "latest",
    "@types/node": "latest"
  }
}
```

Often I need to generate random ids. Sometimes, these are low stakes (client-side only ids). Other times, they might be used as an external identifier of a record in the database.

While there are libraries, database extensions, and many opinions on the matter, sometimes all that's needed are some random bytes encoded in whatever format you prefer. For example, we could use UUIDs but those are an eye sore in URLs.

This Srcbook will demonstrate a few ideas in this space.

## Random bytes

The first thing we need for random unique ids is a source of randomness. We will get that from a [CSPRNG](https://en.wikipedia.org/wiki/Cryptographically_secure_pseudorandom_number_generator). We have two main options for this in Node:

1. Node's [`randomBytes`](https://nodejs.org/api/crypto.html#cryptorandombytessize-callback)
2. Web Crypto's [`getRandomValues`](https://developer.mozilla.org/en-US/docs/Web/API/Crypto/getRandomValues), which is available in Node and the browser

###### node-random-bytes.ts

```typescript
import { randomBytes } from 'crypto';

export function getRandomBytes(length: number): Uint8Array {
  const buffer = randomBytes(length);
  return new Uint8Array(buffer.buffer);
}
```

###### web-crypto.ts

```typescript
export function getRandomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}
```

We'll use `getRandomValues` from Web Crypto as it's part of a Web standard and is available in Node and browsers.

###### untitled.ts

```typescript
import {getRandomBytes} from './web-crypto.ts';

console.log(getRandomBytes(16));
```

We now have our random bytes, but they are not encoded into a string form. Let's do that now.

## Encoding with @scure/base

The `@scure/base` library provides various encoding schemes. We'll use it to encode our random values. We can encode in different bases. Common ones are 16, 32, 64, and sometimes 58 (e.g., Bitcoin and other Cryptocurrencies).

Note that we use the nopad and url variants below because we want these ids to be easier on the eyes in URLs.

###### encode.ts

```typescript
import { base64urlnopad, base58, base32nopad } from '@scure/base';

export function encodeBase64(data: Uint8Array): string {
  return base64urlnopad.encode(data);
}

export function encodeBase58(data: Uint8Array): string {
  return base58.encode(data);
}

export function encodeBase32(data: Uint8Array): string {
  return base32nopad.encode(data);
}

```

Below is the same value encoded in a few different bases.

###### encoding-check.ts

```typescript
import {getRandomBytes} from './web-crypto.ts';
import {encodeBase32, encodeBase58, encodeBase64} from './encode.ts';

const randomData = getRandomBytes(16);
console.log("Base64:", encodeBase64(randomData));
console.log("Base58:", encodeBase58(randomData));
console.log("Base32:", encodeBase32(randomData));
```

## Generating unique ids

In most environments, generating ids from 16 cryptographically-secure random bytes is plenty to ensure unique ids. UUIDv4 uses 16 bytes, for example.

Below is a function to create a random id using the base32 encoding.

###### generate-and-encode.ts

```typescript
import { getRandomBytes } from './web-crypto.ts';
import { encodeBase32 } from './encode.ts';

function randomId() {
  return encodeBase32(getRandomBytes(16)).toLowerCase();
}

for (const _i of [1,2,3,4,5]) {
  console.log('Random id:', randomId());
}
```