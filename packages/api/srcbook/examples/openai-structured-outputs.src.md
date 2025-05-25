<!-- srcbook:{"language":"typescript","tsconfig.json":{"compilerOptions":{"module":"nodenext","moduleResolution":"nodenext","target":"es2022","resolveJsonModule":true,"noEmit":true,"allowImportingTsExtensions":true},"include":["src/**/*"],"exclude":["node_modules"]}} -->

# OpenAI structured outputs

###### package.json

```json
{
  "type": "module",
  "dependencies": {
    "@types/node": "latest",
    "openai": "^4.56.0",
    "tsx": "latest",
    "typescript": "latest",
    "zod": "^3.23.8"
  }
}

```

Make sure to add an `OPENAI_API_KEY` in the [secrets](/secrets) tab. Note that openai's code always throws a warning about punycode, you can safely ignore it.

## Structured outputs to create semantic queries

In this code cell, we use OpenAI's API to parse a natural language query into a structured format that can be used to query a database. The query is validated using Zod schemas to ensure that the input adheres to a specific format. The model is prompted to act as a helpful assistant, and it returns the parsed arguments for the query function, which can then be used to retrieve the desired data.

###### orders.ts

```typescript
import OpenAI from 'openai';
import z from 'zod';
import { zodFunction } from 'openai/helpers/zod';

const Table = z.enum(['orders', 'customers', 'products']);
const Column = z.enum([
    'id',
    'status',
    'expected_delivery_date',
    'delivered_at',
    'shipped_at',
    'ordered_at',
    'canceled_at',
]);
const Operator = z.enum(['=', '>', '<', '<=', '>=', '!=']);
const OrderBy = z.enum(['asc', 'desc']);

const DynamicValue = z.object({
    column_name: z.string(),
});

const Condition = z.object({
    column: z.string(),
    operator: Operator,
    value: z.union([z.string(), z.number(), DynamicValue]),
});

const QueryArgs = z.object({
    table_name: Table,
    columns: z.array(Column),
    conditions: z.array(Condition),
    order_by: OrderBy,
});

const client = new OpenAI();

const completion = await client.beta.chat.completions.parse({
    model: 'gpt-4o-2024-08-06',
    messages: [
        { role: 'system', content: 'You are a helpful assistant. The current date is August 6, 2024. You help users query for the data they are looking for by calling the query function.' },
        { role: 'user', content: 'look up all my orders in may of last year that were fulfilled but not delivered on time' }
    ],
    tools: [zodFunction({ name: 'query', parameters: QueryArgs })],
});
console.log(completion.choices[0].message.tool_calls[0].function.parsed_arguments);
```

## Step by step math problem solving

In this code cell, we use OpenAI's API to solve a math problem step-by-step. The response is structured using Zod schemas to ensure that the output adheres to a specific format. The model is prompted as a math tutor, and it returns both the steps taken to solve the problem and the final answer.

###### math.ts

```typescript
import OpenAI from 'openai';
import { zodResponseFormat } from 'openai/helpers/zod';
import { z } from 'zod';

// Change this to the math problem of your choice!
const PROBLEM = "solve 8x + 3 = 21"

const Step = z.object({
    explanation: z.string(),
    output: z.string(),
})

const MathResponse = z.object({
    steps: z.array(Step),
    final_answer: z.string(),
})


const client = new OpenAI();

const completion = await client.beta.chat.completions.parse({
    model: 'gpt-4o-2024-08-06',
    messages: [
        {
            "role": "system",
            "content": "You are a helpful math tutor. Only use the schema for math responses.",
        },
        { "role": "user", "content": PROBLEM },
    ],
    response_format: zodResponseFormat(MathResponse, 'mathResponse'),
});

const message = completion.choices[0]?.message;
if (message?.parsed) {
    console.log(message.parsed.steps);
    console.log(message.parsed.final_answer);
} else {
    console.log(message.refusal);
}
```