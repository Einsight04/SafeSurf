import fs from "fs";
import dotenv from "dotenv";
import express from "express";
import bodyParser from "body-parser";
import cors from 'cors';
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth"
import ErrnoException = NodeJS.ErrnoException;
import {performance} from 'perf_hooks';
import {fileURLToPath} from "url";
import path from "path";

// file pathing
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// .env setup
dotenv.config({path: path.join(__dirname, "..", ".env")});

// stealth plugin setup
puppeteer.use(StealthPlugin());

// express setup
const app = express()
app.use(cors())

// body parser setup
app.use(bodyParser.urlencoded({ extended: false })) // parse application/x-www-form-urlencoded
app.use(bodyParser.json()) // parse application/json


// create folder if it doesn't exist
const folderPath = path.join(__dirname, "..", "clones");
if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath);
}

// Allocating dictionary to memory
let badWords: string[] = []
fs.readFile('server/dictionary/bad-words', function (err: ErrnoException | null, data: { toString: () => string; }) {
    if (err) throw err;
    badWords = data.toString().replace(/\r\n/g, '\n').split('\n');
});


function profanityReport(wordCount: number, profanityCount: number) {
    console.log(process.env.SEP);
    console.log(`Word Count: ${wordCount}`);
    console.log(`Profanity Count: ${profanityCount}`);
    console.log(`Profanity Makeup: ${Math.round(((profanityCount / wordCount) * 100) * 100) / 100}`);
    console.log(process.env.SEP);
}


async function profanityData(link: string) {
    const browser = await puppeteer.launch({
        headless: false
    })
    const page = await browser.newPage();
    await page.goto(link);

    const startTime = performance.now()


    let newHtml = await page.evaluate(() => document.body.innerHTML)

    for (let badWord of badWords) {
        newHtml = newHtml.replace(new RegExp(`\\b${badWord}\\b`, "gi"), '*'.repeat(badWord.length));
    }

    await page.evaluate((newHtml) => document.body.innerHTML = newHtml, newHtml)

    const cdp = await page.target().createCDPSession();
    let {data} = await cdp.send('Page.captureSnapshot');

    await page.screenshot({path: 'server/clones/screenshot.png', fullPage: true});

    fs.writeFile('server/clones/clone.mhtml', data, "utf-8", function (err: ErrnoException | null) {
        if (err)
            throw err;
    });

    // time
    const endTime = performance.now()

    console.log(`${Math.round(((endTime - startTime) / 1000) * 100) / 100} seconds || ${endTime - startTime} milliseconds`)

    await browser.close();

    /* Profanity Information */
    const textContent: string = data.trim().replace(/[\s]+/g, " ")

    let profanityCount: number = 0;
    let wordCount:number = textContent.split(" ").length;

    for (let badWord of badWords) {
        let re = new RegExp(badWord, "gi");

        profanityCount += (textContent.match(re)?.length) ?? 0
    }

    profanityReport(wordCount, profanityCount)
}


app.post('/api/website-link', async function (req, res) {
    console.log(`Link: ${await req.body.link}`)

    const { link } = req.body
    await profanityData(link)

    res.send({
        status: 'success'
    })

    console.log('Profanity processing completed')
})


app.post('/api/profanity-download', async function (req, res) {
    let fileName: string

    if (req.body.html){
        fileName = 'clone.mhtml'
    } else if (req.body.img) {
        fileName = 'screenshot.png'
    }

    res.download(path.join(__dirname, '..', `/clones/${fileName!}`), 'clone.mhtml');
})


app.listen(process.env.PORT || 3000,
    () => console.log(`Listening on port ${process.env.PORT || 3000}`))