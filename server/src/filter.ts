import {Stats} from "fs";
import fs from "fs/promises";
import fetch, {ResponseInit} from "node-fetch";
import puppeteer from "puppeteer-extra";
import {fileURLToPath} from "url";
import path from "path";

// file pathing
const __filename: string = fileURLToPath(import.meta.url);
const __dirname: string = path.dirname(__filename);

// create folder if it doesn't exist
await fs.mkdir(path.join(__dirname, '..', 'storage/clones'), {recursive: true});

// Allocating dictionary to memory
const badWords: string[] = (await fs.readFile(path.join(__dirname, '..', 'storage/dictionary/bad-words'), 'utf-8'))
    .replace(/\r\n/g, '\n')
    .split('\n');

// open puppeteer browser to be used later
const browser = await puppeteer.launch({
    headless: true
});


export async function websiteValidity(link: string): Promise<number | undefined> {
    try {
        // HEAD request to check website validity
        const response: ResponseInit = await fetch(link, {
            method: 'HEAD',
        });

        return response.status;
    } catch {
        return 404;
    }
}

export async function profanityData(link: string, fileName: string) {
    const page = await browser.newPage();
    await page.goto(link);

    const profanityData = await page.evaluate((badWords) => {
        const content: string[] = document.body.innerText.replace(/[^\w\s]/gi, '').split(/\s+|\n+/);

        const wordCount: number = content.length;
        const profanityCount: number = content.filter(word => badWords.includes(word.toLowerCase())).length;
        const profanityMakeup: number = Math.round((profanityCount / wordCount) * 100 * 100) / 100;

        return {
            wordCount,
            profanityCount,
            profanityMakeup
        }
    }, badWords);

    let newHtml: string = await page.evaluate((badWords) => {
        let html: string = document.body.innerHTML;

        for (let badWord of badWords) {
            html = html.replace(new RegExp(`\\b${badWord}\\b`, "gi"), '*'.repeat(badWord.length));
        }

        return html;
    }, badWords);

    await page.evaluate((newHtml) => document.body.innerHTML = newHtml, newHtml)

    const cdp = await page.target().createCDPSession();
    let {data} = await cdp.send('Page.captureSnapshot');

    await page.screenshot({path: `server/storage/clones/${fileName}.png`, fullPage: true});

    await fs.writeFile(path.join(__dirname, '..', 'storage/clones', fileName + '.mhtml'), data, "utf-8");

    await page.close();

    return profanityData;
}

export async function fileCleanup(): Promise<void> {
    const files: string[] = await fs.readdir(path.join(__dirname, '..', 'storage/clones'));

    for (let file of files) {
        const stats: Stats = await fs.stat(path.join(__dirname, '..', 'storage/clones', file));

        if (stats.isFile() && (Date.now() - stats.mtimeMs) > 10000) {
            await fs.unlink(path.join(__dirname, '..', 'storage/clones', file));
        }
    }
}