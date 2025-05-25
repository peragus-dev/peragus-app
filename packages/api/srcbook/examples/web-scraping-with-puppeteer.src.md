<!-- srcbook:{"language":"typescript","tsconfig.json":{"compilerOptions":{"module":"nodenext","moduleResolution":"nodenext","target":"es2022","resolveJsonModule":true,"noEmit":true,"allowImportingTsExtensions":true},"include":["src/**/*"],"exclude":["node_modules"]}} -->

# Web Scraping with Puppeteer

###### package.json

```json
{
  "type": "module",
  "dependencies": {
    "puppeteer": "^21.3.8"
  },
  "devDependencies": {
    "tsx": "latest",
    "typescript": "latest",
    "@types/node": "latest"
  }
}
```

## Introduction to Puppeteer

[Puppeteer](https://pptr.dev/) is a Node.js library that provides a high-level API to control Chrome or Chromium over the DevTools Protocol. It can be used for various tasks, including web scraping, automated testing, and generating screenshots or PDFs of web pages.

In this srcbook, we'll demonstrate how to use Puppeteer to scrape the contents of a web page.

## Basic Setup

First, let's set up a basic Puppeteer script that launches a browser, navigates to a web page, and extracts some content.

###### scrape.ts

```typescript
import puppeteer from 'puppeteer';

async function scrape() {
  // Launch a new browser instance
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  // Navigate to the desired web page
  await page.goto('https://srcbook.com');

  // Extract the content of the <h1> element
  const content = await page.$eval('h2', (element) => element.textContent);

  console.log('Scraped content:\n', content);

  // Close the browser
  await browser.close();
}

scrape();
```

## Scraping Multiple Elements

Let's extend our script to scrape multiple elements from the page, such as all the paragraph texts.

###### scrape-multiple.ts

```typescript
import puppeteer from 'puppeteer';

async function scrapeMultiple() {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  await page.goto('https://example.com');

  // Extract the content of all <p> elements
  const paragraphs = await page.$$eval('p', (elements) =>
    elements.map((element) => element.textContent)
  );

  console.log('Scraped paragraphs:', paragraphs);

  await browser.close();
}

scrapeMultiple();
```

## Explanation

In this example:

- **Scraping Multiple Elements**: We use `page.$$eval()` to select all `<p>` elements and map over them to extract their text content.

## Taking Screenshots

Puppeteer can also be used to take screenshots of web pages. Let's see how.

###### screenshot.ts

```typescript
import puppeteer from 'puppeteer';
import { join } from 'path';

async function takeScreenshot() {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  await page.goto('https://example.com');

  // Take a screenshot of the page
  const screenshotPath = join(process.env.HOME || '', 'example.png');
  await page.screenshot({ path: screenshotPath });

  console.log(`Screenshot saved as ${screenshotPath}`);

  await browser.close();
}

takeScreenshot();
```

## Explanation

- **Taking a Screenshot**: We use `page.screenshot()` to capture a screenshot of the page and save it as `example.png`.

## Conclusion

Puppeteer is a powerful tool for web scraping and browser automation. In this srcbook, we covered the basics of launching a browser, navigating to a page, scraping content, and taking screenshots. This should give you a solid foundation to start building more complex scraping scripts.