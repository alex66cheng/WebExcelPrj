// Generates the Syncfusion UI locale files used by src/i18n/syncfusion.ts:
//   src/i18n/syncfusion/ja.json     ← @syncfusion/ej2-locale ja.json
//   src/i18n/syncfusion/zh-TW.json  ← @syncfusion/ej2-locale zh.json (Simplified),
//                                      converted to Taiwan Traditional with OpenCC (s2twp)
// Only the sections the Spreadsheet (ribbon, menus, dialogs, filter, pickers) uses
// are kept, so the chunk each language downloads stays small. The package's
// translations are machine-made; the most visible terms are corrected at runtime
// by the override tables in src/i18n/syncfusion.ts rather than here.
//
// Run from my-app-pt1/ (opencc-js is only needed for this one-off step):
//   npm install --no-save opencc-js && node scripts/gen-syncfusion-locales.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const OpenCC = require('opencc-js');

const SECTIONS = [
  'spreadsheet', 'grid', 'pager', 'dialog', 'colorpicker', 'dropdowns', 'drop-down-list',
  'drop-down-base', 'numerictextbox', 'datepicker', 'calendar', 'uploader', 'tab',
];

const localeDir = path.join(path.dirname(require.resolve('@syncfusion/ej2-locale/package.json')), 'src');
const outDir = path.join(import.meta.dirname, '..', 'src', 'i18n', 'syncfusion');
fs.mkdirSync(outDir, { recursive: true });

function pick(source) {
  return Object.fromEntries(SECTIONS.filter((s) => source[s]).map((s) => [s, source[s]]));
}

function mapStrings(value, fn) {
  if (typeof value === 'string') return fn(value);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, mapStrings(v, fn)]));
  }
  return value;
}

const ja = pick(JSON.parse(fs.readFileSync(path.join(localeDir, 'ja.json'), 'utf8')).ja);
fs.writeFileSync(path.join(outDir, 'ja.json'), JSON.stringify(ja, null, 1) + '\n');

const toTaiwan = OpenCC.Converter({ from: 'cn', to: 'twp' });
// OpenCC's phrase table still says 單元格 for "cell"; Taiwanese Excel uses 儲存格.
const zhTW = mapStrings(
  pick(JSON.parse(fs.readFileSync(path.join(localeDir, 'zh.json'), 'utf8')).zh),
  (s) => toTaiwan(s).replace(/單元格/g, '儲存格')
);
fs.writeFileSync(path.join(outDir, 'zh-TW.json'), JSON.stringify(zhTW, null, 1) + '\n');

console.log(`Wrote ${SECTIONS.length} sections to ${outDir}`);
