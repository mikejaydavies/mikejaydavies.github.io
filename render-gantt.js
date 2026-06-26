#!/usr/bin/env node
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const MMD = path.join(ROOT, 'patient-antimicrobial-timeline.mmd');
const SVG = path.join(ROOT, 'patient-antimicrobial-timeline.svg');
const PNG = path.join(ROOT, 'patient-antimicrobial-timeline.png');

const TREATMENT_START = new Date(2026, 4, 13); // 13 May 2026, Day 1
const TODAY = new Date(2026, 5, 26); // 26 Jun 2026, Day 45

const MONTHS = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

function daySinceStart(date) {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.floor((date - TREATMENT_START) / msPerDay) + 1;
}

function parseTickDate(label) {
  const match = label.trim().match(/^(\d{1,2})-([A-Za-z]{3})$/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = MONTHS[match[2]];
  if (month === undefined) return null;
  return new Date(2026, month, day);
}

function addDayLabels(svg) {
  const tickRegex = /<g class="tick"[^>]*transform="translate\(([-\d.]+),0\)"[^>]*>[\s\S]*?<text[^>]*>([^<]+)<\/text>/g;
  let extraHeight = 0;
  let match;

  while ((match = tickRegex.exec(svg)) !== null) {
    const x = match[1];
    const dateLabel = match[2];
    const date = parseTickDate(dateLabel);
    if (!date) continue;

    const dayNum = daySinceStart(date);
    const dayLabel = `<tspan x="${x}" dy="1.35em" fill="#666" font-size="8">Day ${dayNum}</tspan>`;
    const originalTick = match[0];
    const updatedTick = originalTick.replace('</text>', `${dayLabel}</text>`);
    svg = svg.replace(originalTick, updatedTick);
    extraHeight = 18;
  }

  const subtitle = [
    `Treatment started 13 May 2026 (Day 1)`,
    `Today: 26 Jun 2026 (Day ${daySinceStart(TODAY)})`,
  ].join(' · ');

  svg = svg.replace(
    '</style>',
    `#my-svg .subtitleText{fill:#555;font-size:11px;text-anchor:middle;font-family:"trebuchet ms",verdana,arial,sans-serif;}</style>`
  );

  svg = svg.replace(
    /<text x="(\d+)" y="25" class="titleText">([^<]+)<\/text>/,
    `<text x="$1" y="22" class="titleText">$2</text>\n<text x="$1" y="38" class="subtitleText">${subtitle}</text>`
  );

  if (extraHeight > 0) {
    svg = svg.replace(/viewBox="0 0 (\d+) (\d+)"/, (_, w, h) => {
      const newH = Number(h) + extraHeight;
      return `viewBox="0 0 ${w} ${newH}"`;
    });
    svg = svg.replace(/height="(\d+)"/, (_, h) => `height="${Number(h) + extraHeight}"`);
  }

  return svg;
}

async function svgToPng(svg, outputPath) {
  const puppeteer = require('puppeteer');
  const htmlPath = path.join(ROOT, '.gantt-render.html');
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;background:white;">${svg}</body></html>`;
  fs.writeFileSync(htmlPath, html);

  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    const viewBoxMatch = svg.match(/viewBox="0 0 (\d+) (\d+)"/);
    const width = viewBoxMatch ? Number(viewBoxMatch[1]) : 3400;
    const height = viewBoxMatch ? Number(viewBoxMatch[2]) : 1400;
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle0' });
    await page.screenshot({ path: outputPath, fullPage: true, type: 'png' });
  } finally {
    await browser.close();
    fs.unlinkSync(htmlPath);
  }
}

async function main() {
  execSync(`npx mmdc -i "${MMD}" -o "${SVG}" -w 3400 -H 1400 -b white`, {
    cwd: ROOT,
    stdio: 'inherit',
  });

  let svg = fs.readFileSync(SVG, 'utf8');
  svg = addDayLabels(svg);
  fs.writeFileSync(SVG, svg);
  await svgToPng(svg, PNG);
  console.log('Rendered chart with day labels.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
