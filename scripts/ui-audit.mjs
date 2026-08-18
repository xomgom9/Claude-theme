import { chromium } from 'playwright-core';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const outputDir = 'tmp/ui-audit';
await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--disable-web-security', '--disable-features=BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessChecks'],
});

const viewports = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'tablet', width: 834, height: 1112 },
  { name: 'mobile', width: 390, height: 844 },
  { name: 'small-mobile', width: 320, height: 700 },
];

const report = {};
for (const viewport of viewports) {
  const page = await browser.newPage({ viewport });
  await page.route('**/assets/**', async (route) => {
    const url = new URL(route.request().url());
    const filename = decodeURIComponent(url.pathname.split('/').pop());
    if (!/\.(png|jpe?g|gif|webp|svg)$/i.test(filename)) {
      await route.continue();
      return;
    }
    try {
      const body = await readFile(`assets/${filename}`);
      const extension = filename.split('.').pop().toLowerCase();
      const contentType = extension === 'png' ? 'image/png' : extension === 'svg' ? 'image/svg+xml' : extension === 'webp' ? 'image/webp' : 'image/jpeg';
      await route.fulfill({ status: 200, contentType, body });
    } catch {
      await route.continue();
    }
  });
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto('http://127.0.0.1:9292', { waitUntil: 'networkidle' });
  const imageSources = await page.$$eval('img', (images) => images.map((image) => image.currentSrc || image.src));
  const localImages = {};
  for (const source of imageSources) {
    const filename = decodeURIComponent(new URL(source).pathname.split('/').pop());
    if (!/\.(png|jpe?g|gif|webp|svg)$/i.test(filename)) continue;
    try {
      const body = await readFile(`assets/${filename}`);
      const extension = filename.split('.').pop().toLowerCase();
      const mime = extension === 'png' ? 'image/png' : extension === 'svg' ? 'image/svg+xml' : extension === 'webp' ? 'image/webp' : 'image/jpeg';
      localImages[source] = `data:${mime};base64,${body.toString('base64')}`;
    } catch {}
  }
  await page.evaluate((replacements) => {
    document.querySelectorAll('img').forEach((image) => {
      const source = image.currentSrc || image.src;
      if (!replacements[source]) return;
      image.removeAttribute('srcset');
      image.src = replacements[source];
    });
  }, localImages);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${outputDir}/${viewport.name}.png`, fullPage: true });
  report[viewport.name] = await page.evaluate(() => {
    const visible = (element) => {
      const style = getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden' && element.getBoundingClientRect().height > 0;
    };
    const sections = [...document.querySelectorAll('.cc-landing section')].filter(visible).map((section) => {
      const rect = section.getBoundingClientRect();
      return {
        id: section.id || section.className,
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        top: Math.round(rect.top + scrollY),
      };
    });
    const brokenImages = [...document.images].filter((image) => !image.complete || image.naturalWidth === 0).map((image) => image.currentSrc || image.src);
    const overflowing = [...document.querySelectorAll('body *')].filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.right > document.documentElement.clientWidth + 1 || rect.left < -1;
    }).slice(0, 30).map((element) => ({ tag: element.tagName, className: String(element.className), rect: element.getBoundingClientRect().toJSON() }));
    const headings = [...document.querySelectorAll('.cc-landing h1, .cc-landing h2, .cc-landing h3')].filter(visible).map((heading) => ({
      text: heading.textContent.trim(),
      lines: Math.round(heading.getBoundingClientRect().height / parseFloat(getComputedStyle(heading).lineHeight)),
      fontSize: getComputedStyle(heading).fontSize,
    }));
    return {
      title: document.title,
      viewportWidth: document.documentElement.clientWidth,
      pageWidth: document.documentElement.scrollWidth,
      pageHeight: document.documentElement.scrollHeight,
      brokenImages,
      overflowing,
      sections,
      headings,
    };
  });
  report[viewport.name].consoleErrors = consoleErrors;
  report[viewport.name].pageErrors = pageErrors;
  await page.close();
}

await browser.close();
await writeFile(`${outputDir}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
