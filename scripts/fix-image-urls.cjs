// Fixes every menu and category photo link so it points at the database
// you run it against, then checks that each photo actually loads.
//
// Photo links store the full address of the storage they live in, e.g.
//   http://192.168.0.113:54321/storage/v1/object/public/menu-images/a.jpg
// which breaks once the menu is somewhere else (the online project, or your
// PC's IP address changing). This rewrites them to
//   <that database's URL>/storage/v1/object/public/menu-images/a.jpg
// and turns a bare file name ("a.jpg") into a menu-images link too.
//
// Run from the repo root:
//   node scripts/fix-image-urls.cjs
// It asks for the database URL and its secret key, shows what it would
// change, and only writes after you type yes. Photos hosted on some other
// website are left alone. You can also set SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY instead of typing them.

const { ask, makeClient, trimSlash, rewriteStorageUrl, fetchAll } = require('./lib/script-helpers.cjs');

const TABLES = ['menu_items', 'menu_categories'];

function planFixes(rowsByTable, targetUrl) {
  const fixes = [];
  for (const [table, rows] of Object.entries(rowsByTable)) {
    for (const row of rows) {
      if (!row.image_url) continue;
      const fixed = rewriteStorageUrl(row.image_url, targetUrl);
      if (fixed !== row.image_url) fixes.push({ table, id: row.id, name: row.name, from: row.image_url, to: fixed });
    }
  }
  return fixes;
}

async function applyFixes(client, fixes) {
  for (const fix of fixes) {
    const { error } = await client.from(fix.table).update({ image_url: fix.to }).eq('id', fix.id);
    if (error) throw new Error(`Updating ${fix.table} "${fix.name}": ${error.message}`);
  }
}

// Photo links that don't load (file missing from storage, bucket not
// public...), a few at a time.
async function findBrokenPhotos(rowsByTable, fixes) {
  const fixedById = new Map(fixes.map((f) => [f.id, f.to]));
  const checks = [];
  for (const [table, rows] of Object.entries(rowsByTable)) {
    for (const row of rows) {
      const url = fixedById.get(row.id) ?? row.image_url;
      if (url) checks.push({ table, name: row.name, url });
    }
  }

  const statusByUrl = new Map();
  const unique = Array.from(new Set(checks.map((c) => c.url)));
  for (let i = 0; i < unique.length; i += 8) {
    await Promise.all(
      unique.slice(i, i + 8).map(async (url) => {
        try {
          const res = await fetch(url, { method: 'HEAD' });
          statusByUrl.set(url, res.ok ? null : `HTTP ${res.status}`);
        } catch (e) {
          statusByUrl.set(url, e.message);
        }
      })
    );
  }
  return checks.filter((c) => statusByUrl.get(c.url)).map((c) => ({ ...c, problem: statusByUrl.get(c.url) }));
}

async function main() {
  console.log('Fix menu photo links.\n');
  const url = trimSlash(
    process.env.SUPABASE_URL ||
      (await ask('Database URL to fix (e.g. https://xxxx.supabase.co, or http://192.168.0.113:54321 for local): '))
  );
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || (await ask('Its secret key: ', { hidden: true }));
  if (!url || !key) throw new Error('The URL or key was left empty.');
  const client = makeClient(url, key);

  const rowsByTable = {};
  for (const table of TABLES) rowsByTable[table] = await fetchAll(client, table);
  const withPhoto = Object.values(rowsByTable).flat().filter((r) => r.image_url).length;
  console.log(`\nFound ${withPhoto} photo link(s).`);

  const fixes = planFixes(rowsByTable, url);
  if (fixes.length === 0) {
    console.log('All photo links already point at this database.');
  } else {
    console.log(`${fixes.length} need fixing, for example:`);
    for (const fix of fixes.slice(0, 5)) console.log(`  ${fix.name}\n    ${fix.from}\n -> ${fix.to}`);
    if (fixes.length > 5) console.log(`  ...and ${fixes.length - 5} more`);

    const answer = await ask(`\nFix these ${fixes.length} link(s)? Type yes to continue: `);
    if (answer.toLowerCase() !== 'yes') {
      console.log('Cancelled -- nothing was changed.');
      return;
    }
    await applyFixes(client, fixes);
    console.log(`Fixed ${fixes.length} link(s).`);
  }

  console.log('\nChecking every photo loads...');
  const broken = await findBrokenPhotos(rowsByTable, fixes);
  if (broken.length === 0) {
    console.log('All photos load.');
  } else {
    console.log(`${broken.length} photo(s) don't load -- the file is probably missing from storage:`);
    for (const b of broken) console.log(`  ${b.name} (${b.table}): ${b.problem}\n    ${b.url}`);
    console.log('\nUpload those files in Studio (Storage > menu-images) with exactly these names, or re-run copy-to-hosted.cjs.');
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error(`\nStopped: ${e.message}`);
    // Not process.exit(): exiting while the prompt is still closing
    // crashes Node on Windows ("Assertion failed ... async.c").
    process.exitCode = 1;
  });
}

module.exports = { planFixes, findBrokenPhotos };
