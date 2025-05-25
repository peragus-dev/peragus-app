<!-- srcbook:{"language":"javascript"} -->

# CRON Screenshot of HN

###### package.json

```json
{
  "type": "module",
  "dependencies": {
    "puppeteer": "^21.3.8",
    "node-cron": "^3.0.2"
  }
}
```

## Introduction

In this srcbook, we'll create a simple Node.js script that uses Puppeteer to take a screenshot of the Hacker News homepage (`https://news.ycombinator.com`) every 10 minutes. The screenshot will be saved to a directory named `hn` in your home directory, with the filename being the current timestamp.

We'll use the `node-cron` library to schedule the task to run at regular intervals.

## Setting up Puppeteer

First, let's set up Puppeteer to take a screenshot of the Hacker News homepage.

###### screenshot.js

```javascript
import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Function to take a screenshot
export async function takeScreenshot() {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.goto('https://news.ycombinator.com');

  // Create the directory if it doesn't exist
  const dir = path.join(os.homedir(), 'hn');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir);
  }

  // Generate a timestamp for the filename
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filePath = path.join(dir, `${timestamp}.png`);

  // Take the screenshot and save it
  await page.screenshot({ path: filePath });
  console.log(`Screenshot saved to ${filePath}`);

  await browser.close();
}
```

## Scheduling the Task

Now that we have the screenshot function, let's schedule it to run every 10 minutes using `node-cron`.

###### I.js

```javascript
import cron from 'node-cron';
import { takeScreenshot } from './screenshot.js';

// Schedule the task to run every 10 minutes
cron.schedule('*/15 * * * *', () => {
  console.log('Taking screenshot...');
  takeScreenshot();
});

console.log('Scheduler started. Taking screenshots every 15 minutes.');
```

## Running the Scheduler

Finally, let's create an entry point to run the scheduler.

###### index.js

```javascript
import './scheduler.js';
```

## Conclusion

This srcbook demonstrates how to automate the process of taking screenshots of a webpage at regular intervals using Puppeteer and `node-cron`. The screenshots are saved in the `hn` directory in your home folder with a timestamped filename. 

To run this, simply execute the `index.js` file, and the scheduler will start taking screenshots every 10 minutes.