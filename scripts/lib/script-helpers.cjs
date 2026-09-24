// Shared by copy-to-hosted.cjs and fix-image-urls.cjs.
const readline = require('readline');
const { createClient } = require('@supabase/supabase-js');

// Asks a question in the terminal. `hidden` shows * instead of what's typed
// or pasted (for secret keys); `preview: false` then only reports the
// length (for passwords, where even a few characters shouldn't show).
function ask(question, { hidden = false, preview = true } = {}) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl.question(question, (answer) => {
      rl.close();
      // Pasted keys sometimes come with quotes or "KEY=" in front.
      const value = answer.trim().replace(/^[A-Z_]+=/, '').replace(/^["']|["']$/g, '').trim();
      if (hidden && value) {
        // Shown so a cut-off or wrong paste is easy to spot.
        console.log(
          preview
            ? `  (got ${value.length} characters: ${value.slice(0, 11)}...${value.slice(-4)})`
            : `  (got ${value.length} characters)`
        );
      }
      resolve(value);
    });
    if (hidden) {
      rl._writeToOutput = (text) => {
        rl.output.write(/[\r\n]/.test(text) ? '\n' : '*'.repeat(text.length));
      };
    }
  });
}

// A clearer message for the most common mistake: a key that doesn't belong
// to that URL (local vs online, or the publishable key instead of the
// secret one).
function explainError(error, what, url) {
  const message = error?.message || String(error);
  if (/invalid api key|jwt|unauthorized|401/i.test(message)) {
    return (
      `${what}: ${message}\n` +
      `  The key doesn't match ${url}. Check that you pasted that project's SECRET key\n` +
      '  (starts with sb_secret_ or is the long "service_role" key), not the publishable/anon key,\n' +
      "  and not the other database's key. Local: `pnpm dlx supabase status`. Online: Project Settings > API Keys."
    );
  }
  return `${what}: ${message}`;
}

function makeClient(url, key) {
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  client.__url = url;
  return client;
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
    if (error) throw new Error(explainError(error, `Reading ${table}`, client.__url));
    rows.push(...data);
    if (data.length < 1000) return rows;
  }
}

function looksLocal(url) {
  return /:54321\b|127\.0\.0\.1|localhost|192\.168\.|10\.\d+\.\d+\.\d+/.test(url);
}

module.exports = { ask, explainError, makeClient, trimSlash, rewriteStorageUrl, fetchAll, looksLocal, STORAGE_PATH };
