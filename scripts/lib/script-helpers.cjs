// Shared by copy-to-hosted.cjs and fix-image-urls.cjs.
const readline = require('readline');
const { createClient } = require('@supabase/supabase-js');

// Asks a question in the terminal. `hidden` shows * instead of what's typed
// or pasted (for secret keys).
function ask(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
    if (hidden) {
      rl._writeToOutput = (text) => {
        rl.output.write(/[\r\n]/.test(text) ? '\n' : '*'.repeat(text.length));
      };
    }
  });
}

function makeClient(url, key) {
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

const trimSlash = (url) => url.replace(/\/+$/, '');

const STORAGE_PATH = '/storage/v1/object/public/';
const IMAGE_FILE = /\.(jpe?g|png|webp|gif|heic|avif)$/i;
const DEFAULT_BUCKET = 'menu-images';

// Points a photo link at `targetUrl`'s storage, keeping the bucket and file:
//   http://192.168.0.113:54321/storage/v1/object/public/menu-images/a.jpg
//     -> https://xyz.supabase.co/storage/v1/object/public/menu-images/a.jpg
// A bare file name ("a.jpg") is taken to be in menu-images. Anything else
// (a photo hosted on some other website, empty values) is left alone.
function rewriteStorageUrl(value, targetUrl) {
  if (typeof value !== 'string' || !value.trim()) return value;
  const target = trimSlash(targetUrl);
  const v = value.trim();
  if (/^https?:\/\//i.test(v)) {
    const at = v.indexOf(STORAGE_PATH);
    if (at < 0) return value;
    return `${target}${STORAGE_PATH}${v.slice(at + STORAGE_PATH.length)}`;
  }
  if (IMAGE_FILE.test(v)) {
    const path = v.replace(/^\/+/, '');
    return `${target}${STORAGE_PATH}${path.includes('/') ? path : `${DEFAULT_BUCKET}/${path}`}`;
  }
  return value;
}

// Every row of a table, 1000 at a time (the API's page size).
async function fetchAll(client, table, { filter } = {}) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    let query = client.from(table).select('*').order('id').range(from, from + 999);
    if (filter) query = filter(query);
    const { data, error } = await query;
    if (error) throw new Error(`Reading ${table}: ${error.message}`);
    rows.push(...data);
    if (data.length < 1000) return rows;
  }
}

function looksLocal(url) {
  return /:54321\b|127\.0\.0\.1|localhost|192\.168\.|10\.\d+\.\d+\.\d+/.test(url);
}

module.exports = { ask, makeClient, trimSlash, rewriteStorageUrl, fetchAll, looksLocal, STORAGE_PATH };
