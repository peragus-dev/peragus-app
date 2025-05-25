<!-- srcbook:{"language":"typescript","tsconfig.json":{"compilerOptions":{"module":"nodenext","moduleResolution":"nodenext","target":"es2022","resolveJsonModule":true,"noEmit":true,"allowImportingTsExtensions":true},"include":["src/**/*"],"exclude":["node_modules"]}} -->

# Pinata SDK

###### package.json

```json
{
  "type": "module",
  "dependencies": {
    "@types/node": "latest",
    "pinata": "^0.2.0",
    "tsx": "latest",
    "typescript": "latest"
  }
}

```

Welcome to the Pinata SDK Srcbook! Here you can interact with live code using your own Pinata credentials. To get started just follow the steps below! 

### 📦 Setup

First [make a free Pinata Account](https://app.pinata.cloud/register) and setup your Pinata JWT and Gateway URL
- [Pinata API Key JWT](https://docs.pinata.cloud/account-management/api-keys)
- [Pinata Dedicated Gateway Domain](https://docs.pinata.cloud/gateways/dedicated-ipfs-gateways)

Once you have those variables navigate to the **Secrets** tab above

![secrets tab](https://dweb.mypinata.cloud/ipfs/QmWiEZYQM4EkRFzzzpJ5CgiGCsE598GCvi3iCSDsAo3Q5M)

Then paste in your `PINATA_JWT` and `GATEWAY_URL` as env variables 

![secrets page](https://dweb.mypinata.cloud/ipfs/QmZieCaGcckzMTVf8PhXJCnXVp7zJvoN3aLVeCfSWjBF3i)

Now run the code snippet below to make sure everything is working!

###### testAuthentication.ts

```typescript
import { PinataSDK } from "pinata";

const pinata = new PinataSDK({
  pinataJwt: process.env.PINATA_JWT!,
  pinataGateway: process.env.GATEWAY_URL,
});

const auth = await pinata.testAuthentication()
console.log(auth)

```

If you got this message:
```typescript
{
  message: 'Congratulations! You are communicating with the Pinata API!'
}
```
Then you're all set to go! Check out some of the things you can do with the SDK throughout this book, and feel free to [contact us](mailto:team@pinata.cloud) if you have any questions and be sure to check out the [full documentation](https://docs.pinata.cloud/sdk)!

### ⬆️ Upload Files

At the core of the Pinata SDK is uploading files. There are many ways you can upload content, so let's start with a basic File.

###### upload.ts

```typescript
import { PinataSDK } from "pinata";

const pinata = new PinataSDK({
  pinataJwt: process.env.PINATA_JWT!,
  pinataGateway: process.env.GATEWAY_URL,
});

const file = new File(["hello world!"], "hello.txt", { type: "text/plain" })
const upload = await pinata.upload.file(file)
console.log(upload)

```

That upload should return an `IpfsHash` which we can use to generate a link to share or access that file.

###### link.ts

```typescript
import { PinataSDK } from "pinata";

const pinata = new PinataSDK({
  pinataJwt: process.env.PINATA_JWT!,
  pinataGateway: process.env.GATEWAY_URL,
});

const file = new File(["hello world!"], "hello.txt", { type: "text/plain" })
const upload = await pinata.upload.file(file)
console.log("File hash: ", upload.IpfsHash)

const link = await pinata.gateways.convert(upload.IpfsHash)
console.log("Link: ", link)
```

Along with your uploads you can also chain on extra helpful commands

```typescript chain.ts
import { PinataSDK } from "pinata";

const pinata = new PinataSDK({
  pinataJwt: process.env.PINATA_JWT!,
  pinataGateway: process.env.GATEWAY_URL,
});

const file = new File(["hello world!"], "hello.txt", { type: "text/plain" })
const upload = await pinata.upload
  .file(file)
  .addMetadata({
    name: "Hello from the SDK" // Give the file a custom name
  })
  .group("e18adba4-e894-40ee-bfb7-d74f7ffd594c") // Add the file to an existing group
  .key("GENERATE_KEY") // Use server side generated keys
  .cidVersion(0) // Use V0 hash instead
```

The SDK provides multiple upload methods that you can try out below!

###### json.ts

```typescript
import { PinataSDK } from "pinata";

const pinata = new PinataSDK({
  pinataJwt: process.env.PINATA_JWT!,
  pinataGateway: process.env.GATEWAY_URL,
});

const upload = await pinata.upload.json({
  content: "console.log(\"hello world!\")",
  name: "hello.ts",
  lang: "typescript"
})
console.log(upload)

```

###### base64.ts

```typescript
import { PinataSDK } from "pinata";

const pinata = new PinataSDK({
  pinataJwt: process.env.PINATA_JWT!,
  pinataGateway: process.env.GATEWAY_URL,
});

const upload = await pinata.upload.base64("SGVsbG8gV29ybGQh")
console.log(upload)

```

###### url.ts

```typescript
import { PinataSDK } from "pinata";

const pinata = new PinataSDK({
  pinataJwt: process.env.PINATA_JWT!,
  pinataGateway: process.env.GATEWAY_URL,
});

const upload = await pinata.upload.url("https://i.imgur.com/u4mGk5b.gif")
console.log(upload)

```

### 🌐 Fetch Files
As we covered earlier, files can be accessed through your `GATEWAY_URL` by appending `/ipfs/{CID}`, however you can also use the SDK to fetch the data as well! The `get` method will use the Gateway in your config to fetch the file `data` as well as the `contentType`

###### get.ts

```typescript
import { PinataSDK } from "pinata";

const pinata = new PinataSDK({
  pinataJwt: process.env.PINATA_JWT!,
  pinataGateway: process.env.GATEWAY_URL,
});

const data = await pinata.gateways.get("bafkreidvbhs33ighmljlvr7zbv2ywwzcmp5adtf4kqvlly67cy56bdtmve")
console.log(data)
```

### 📋 List Files

You can also list files that are pinned to your account and filter through a variety of properties!

###### listFiles.ts

```typescript
import { PinataSDK } from "pinata";

const pinata = new PinataSDK({
  pinataJwt: process.env.PINATA_JWT!,
  pinataGateway: process.env.GATEWAY_URL,
});

const files = await pinata.listFiles()
  .name("hello.txt")
  .cid("bafkreidvbhs33ighmljlvr7zbv2ywwzcmp5adtf4kqvlly67cy56bdtmve")
  .pinStart('2024-07-16T11:41:19Z')
console.log(files)

```

### 👪 Groups
The SDK allows you to create Groups which can be used to help organize your files. With a few links of code you can create a group, upload a file to it, and list files by Group!

###### groups.ts

```typescript
import { PinataSDK } from "pinata";

const pinata = new PinataSDK({
  pinataJwt: process.env.PINATA_JWT!,
  pinataGateway: process.env.GATEWAY_URL,
});

// Create the Group
const group = await pinata.groups.create({
  name: "Group 1"
})
console.log(group)

// Upload a file to the group
const upload = await pinata.upload.json({
  content: "Here's some JSON we'll put into a group; nice!"
})
.group(group.id)
console.log(upload)

// List all files part of that group
const files = await pinata.listFiles().group(group.id)
console.log(files)
```

### 📊 Analytics
If you're on the [Picnic Plan](https://app.pinata.cloud/billing) then you can access Analytics for how your files are being viewed! Not only can you view through the [App](https://app.pinata.cloud/analytics) but you can also access the analytics through the SDK

###### analytics.ts

```typescript
// This code will only work if you're on a paid plan!!

import { PinataSDK } from "pinata";

const pinata = new PinataSDK({
  pinataJwt: process.env.PINATA_JWT!,
  pinataGateway: process.env.GATEWAY_URL,
});

const analytics = await pinata.gateways.topUsageAnalytics({
  domain: process.env.GATEWAY_URL,
  start: "2024-08-01",
  end: "2024-08-16",
  sortBy: "requests",
  attribute: "referer"
})
console.log(analytics)

```