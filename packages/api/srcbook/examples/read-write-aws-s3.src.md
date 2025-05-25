<!-- srcbook:{"language":"typescript","tsconfig.json":{"compilerOptions":{"module":"nodenext","moduleResolution":"nodenext","target":"es2022","resolveJsonModule":true,"noEmit":true,"allowImportingTsExtensions":true},"include":["src/**/*"],"exclude":["node_modules"]}} -->

# Read and write to AWS S3

###### package.json

```json
{
  "type": "module",
  "dependencies": {
    "@aws-sdk/client-s3": "^3.0.0"
  },
  "devDependencies": {
    "tsx": "latest",
    "typescript": "latest",
    "@types/node": "latest"
  }
}
```

Recently I needed to store some assets in an S3 bucket for an application I was building. The application needs to read and write from the bucket. Here is a demonstration of doing so using the [AWS SDK for JavaScript](https://www.npmjs.com/package/aws-sdk).

Given that permissions are needed for working with S3, the following environment variables are required for the code in this Srcbook to work.

###### env-check.ts

```typescript
import assert from 'node:assert';

assert.ok(process.env.AWS_ACCESS_KEY, 'You need to set AWS_ACCESS_KEY');
assert.ok(process.env.AWS_SECRET_ACCESS_KEY, 'You need to set AWS_SECRET_ACCESS_KEY');
assert.ok(process.env.AWS_REGION, 'You need to set AWS_REGION');

console.log("Environment configured correctly.")
```

## S3 wrapper module

Let's create a module that wraps the operations we care about, i.e., `getObject` and `putObject`.

###### s3-client.ts

```typescript
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { S3Client } from '@aws-sdk/client-s3';

// Create the client.
const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

// Wrapper for https://docs.aws.amazon.com/AmazonS3/latest/API/API_GetObject.html
export async function getObject(bucketName: string, key: string) {
  const command = new GetObjectCommand({
    Bucket: bucketName,
    Key: key,
  });

  const response = await s3Client.send(command);
  return response.Body;
}

// Wrapper for https://docs.aws.amazon.com/AmazonS3/latest/API/API_PutObject.html
export async function putObject(bucketName: string, key: string, body: string | ReadableStream) {
  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    Body: body,
  });

  return s3Client.send(command);
}

```

## Example usage

Edit the code below to configure your bucket name, the `key` (unique name of the file), and the file contents and then run the code. If all is configured correctly, the code below should upload a file to S3 and subsequently download it.

###### example-usage.ts

```typescript
import { getObject, putObject } from './s3-client.js';

// Edit the values below with your own.
example({
  bucket: 'your-bucket',
  key: 'example.txt',
  content: 'Hello from example.txt',
});

async function example({bucket, key, content}: {bucket: string, key: string, content: string}) {
  console.log(`Uploading ${key} to ${bucket}...`);
  await putObject(bucket, key, content);
  console.log(`Upload successful! Now downloading ${key} from ${bucket}...`);
  const data = await getObject(bucket, key);
  console.log(`Downloaded complete. Contents:`);
  console.log(await data?.transformToString());
}

```