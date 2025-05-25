<!-- srcbook:{"language":"typescript","tsconfig.json":{"compilerOptions":{"module":"nodenext","moduleResolution":"nodenext","target":"es2022","resolveJsonModule":true,"noEmit":true,"allowImportingTsExtensions":true},"include":["src/**/*"],"exclude":["node_modules"]}} -->

# Fetching Public Contributions from GitHub API

###### package.json

```json
{
  "type": "module",
  "dependencies": {
    "axios": "^1.4.0"
  },
  "devDependencies": {
    "tsx": "latest",
    "typescript": "latest",
    "@types/node": "latest"
  }
}
```

## Introduction

In this srcbook, we'll explore how to fetch the public contributions of a GitHub user using GitHub's public API. We'll use the `axios` library to make HTTP requests and retrieve the necessary data.

## GitHub API Overview

GitHub provides a REST API that allows you to interact with its platform programmatically. To fetch a user's public contributions, we can use the `/users/{username}/events/public` endpoint, which returns a list of public events performed by the user.

## Fetching Public Contributions

Let's create a function that fetches the public contributions of a given GitHub username.

###### fetch-contributions.ts

```typescript
import axios from 'axios';

/**
 * Fetches the public contributions (events) of a given GitHub user.
 * 
 * @param username - The GitHub username whose public contributions are to be fetched.
 * @returns A promise that resolves to an array of public events, or null if an error occurs.
 */
export async function fetchPublicContributions(username: string) {
  try {
    // Make a GET request to the GitHub API to fetch the user's public events
    const response = await axios.get(`https://api.github.com/users/${username}/events/public`);
    
    // Return the data (array of events) from the response
    return response.data;
  } catch (error) {
    // Log the error to the console and return null in case of failure
    console.error(`Error fetching contributions for ${username}:`, error);
    return null;
  }
}
```

This function makes a GET request to the GitHub API and returns the list of public events for the specified user. If an error occurs, it logs the error and returns `null`.

## Displaying Contributions

Now, let's create a function to display the contributions in a readable format.

###### display-contributions.ts

```typescript
import { fetchPublicContributions } from './fetch-contributions.ts';

export async function displayContributions(username: string) {
  const contributions = await fetchPublicContributions(username);

  if (!contributions) {
    console.log(`No contributions found for ${username}.`);
    return;
  }

  contributions.forEach((event: any, index: number) => {
    console.log(`${index + 1}. ${event.type} at ${event.repo.name}`);
  });
}
```

This function fetches the contributions using the `fetchPublicContributions` function and then iterates over the events, displaying the type of event and the repository it was performed on.

## Running the Example

Finally, let's run the example by fetching and displaying the contributions of a specific GitHub user.

###### run-example.ts

```typescript
import { displayContributions } from './display-contributions.ts';

const username = 'nichochar'; // Replace with any GitHub username

await displayContributions(username);
```