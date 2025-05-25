<!-- srcbook:{"language":"typescript","tsconfig.json":{"compilerOptions":{"module":"nodenext","moduleResolution":"nodenext","target":"es2022","resolveJsonModule":true,"noEmit":true,"allowImportingTsExtensions":true},"include":["src/**/*"],"exclude":["node_modules"]}} -->

# Trace your AI app with TraceLoop

###### package.json

```json
{
  "type": "module",
  "dependencies": {
    "@traceloop/node-server-sdk": "^0.10.0",
    "@types/node": "latest",
    "openai": "^4.56.0",
    "tsx": "latest",
    "typescript": "latest"
  }
}

```

## Traceloop

_Monitor, debug and test the quality of your LLM outputs with [traceloop](https://www.traceloop.com/docs/introduction)._

Traceloop automatically monitors the quality of your LLM outputs. It helps you to debug and test changes to your models and prompts.

- Get real-time alerts about your model’s quality
- Execution tracing for every request
- Gradually rollout changes to models and prompts
- Debug and re-run issues from production in your IDE

![sample traceloop trace](https://mintlify.s3-us-west-1.amazonaws.com/enrolla/img/workflow.png)

## Getting started
Let's create and log some traces uses the TypeScript SDK. For this, you'll need a traceloop API key. You can get one and get started for free at https://traceloop.com. Once you have it, add it as `TRACELOOP_API_KEY` to Srcbook secrets, that you can access from the header.

Once you're ready, test your setup by running the cell below. You should see:
```
Traceloop exporting traces to https://api.traceloop.com
```

###### env-check.ts

```typescript
import * as traceloop from "@traceloop/node-server-sdk";

if (!process.env.TRACELOOP_API_KEY) {
  throw new Error("Missing required environment variable: TRACELOOP_API_KEY");
}

traceloop.initialize({ 
  disableBatch: true, 
  apiKey: process.env.TRACELOOP_API_KEY 
});
```

Now let's get openAI to write a joke for us. We'll create a workflow with 3 tasks:
 1. First the AI will write a joke
 2. Then, we'll translate the joke to pirate language
 3. Finally, we'll generate a signature for the joke

###### joke-workflow.ts

```typescript
import * as traceloop from "@traceloop/node-server-sdk";
import OpenAI from 'openai';

const client = new OpenAI();

traceloop.initialize({ 
  disableBatch: true, 
  apiKey: process.env.TRACELOOP_API_KEY 
});

async function call_openai(prompt: string) {
  const completion = await client.chat.completions.create({
    model: "gpt-3.5-turbo",
    messages: [{ role: "user", content: prompt }],
    stream: false,
  });

  return completion.choices[0].message?.content;
}

async function create_joke() {
  return await traceloop.withTask(
    { name: "joke_creation" },
    () => call_openai("Tell me a joke about opentelemetry")
  );
}

async function generate_signature(joke: string) {
  return await traceloop.withTask(
    { name: "signature_generation" },
    () => call_openai("Add a signature to the joke:\n\n" + joke)
  );
}

async function translate_joke_to_pirate(joke: string) {
  return await traceloop.withTask(
    { name: "pirate_translation" },
    () => call_openai("Translate the following joke to pirate language:\n\n" + joke)
  );
}

async function joke_workflow() {
  return await traceloop.withWorkflow(
    { name: "pirate_joke_generator" },
    async () => {
      const eng_joke = await create_joke();
      const pirate_joke = await translate_joke_to_pirate(eng_joke);
      const signature = await generate_signature(pirate_joke);
      console.log(pirate_joke + "\n\n" + signature);
    }
  );
}

joke_workflow();
```

Now, if you navigate to your traceloop dashboard, you should see the trace under the `joke_creation` task:

![screenshot of traceloop trace](https://i.imgur.com/IZOJF02.png)