// Copies the menu from your local Supabase to the online (hosted) project:
// stores, categories, menu items, options, catering packages, deals,
// challenges -- and every photo in storage, with the photo links pointed at
// the online project. Test accounts and test orders stay behind.
//
// Before running: run `migration up` locally and `db push` online so both
// databases have the same updates.
//
// Run from the repo root:
//   node scripts/copy-to-hosted.cjs
// It asks for the URLs and secret keys (nothing is saved). You can also set
// LOCAL_SUPABASE_URL, LOCAL_SUPABASE_SERVICE_ROLE_KEY, HOSTED_SUPABASE_URL
// and HOSTED_SUPABASE_SERVICE_ROLE_KEY instead of typing them.
//
// What's already in the online project's menu is replaced (it only holds
// the starter rows `db push` created). It refuses to run if the online
// project already has orders, so it can never wipe real ones.

const { ask, explainError, makeClient, trimSlash, rewriteStorageUrl, fetchAll, looksLocal } = require('./lib/script-helpers.cjs');

// Parents before children, so every link points at a row that's already there.
const TABLES = ['locations', 'menu_categories', 'menu_items', 'modifier_groups', 'modifier_options', 'promotions', 'challenges'];

const withHostedPhotos = (rows, hostedUrl) =>
  rows.map((row) => ('image_url' in row ? { ...row, image_url: rewriteStorageUrl(row.image_url, hostedUrl) } : row));

async function insertAll(client, table, rows, { upsert = false } = {}) {
  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500);
    const { error } = upsert
      ? await client.from(table).upsert(batch, { onConflict: 'id' })
      : await client.from(table).insert(batch);
    if (error) {
      throw new Error(
        `Writing ${table}: ${error.message}\n` +
          '  If it mentions a missing column, the two databases have different updates --\n' +
          '  run `pnpm dlx supabase migration up` (local) and `pnpm dlx supabase db push` (online), then try again.'
      );
    }
  }
}

async function countRows(client, table) {
  const { count, error } = await client.from(table).select('id', { count: 'exact', head: true });
  if (error) throw new Error(explainError(error, `Checking ${table} online`, client.__url));
  return count ?? 0;
}

// Reads everything to copy from the local database.
async function readLocal(local) {
  const data = {};
  for (const table of TABLES) {
    data[table] = await fetchAll(local, table, {
      // Personal prizes (wheel / points rewards) belong to test accounts.
      filter: table === 'promotions' ? (q) => q.is('user_id', null) : undefined,
    });
  }
  return data;
}

// Empties the online project's menu tables. Deleting the stores takes their
// categories, items and options with them.
async function clearHosted(hosted) {
  for (const table of ['promotions', 'challenges', 'locations']) {
    const { error } = await hosted.from(table).delete().not('id', 'is', null);
    if (error) throw new Error(`Clearing ${table} online: ${error.message}`);
  }
}

async function writeHosted(hosted, data, hostedUrl, log) {
  await insertAll(hosted, 'locations', withHostedPhotos(data.locations, hostedUrl));
  await insertAll(hosted, 'menu_categories', withHostedPhotos(data.menu_categories, hostedUrl));
  await insertAll(hosted, 'menu_items', withHostedPhotos(data.menu_items, hostedUrl));
  // Groups and options point at each other (an option can open a sub-group),
  // so groups go in without that link first and get it back after.
  await insertAll(hosted, 'modifier_groups', data.modifier_groups.map((g) => ({ ...g, parent_option_id: null })));
  await insertAll(hosted, 'modifier_options', data.modifier_options);
  const nested = data.modifier_groups.filter((g) => g.parent_option_id);
  if (nested.length) await insertAll(hosted, 'modifier_groups', nested, { upsert: true });
  await insertAll(hosted, 'promotions', data.promotions);
  await insertAll(hosted, 'challenges', data.challenges);
  for (const table of TABLES) log(`  ${table}: ${data[table].length}`);
}

// Every file in a bucket, including ones in folders.
async function listFiles(client, bucket, prefix = '') {
  const files = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await client.storage.from(bucket).list(prefix, { limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } });
    if (error) throw new Error(`Listing ${bucket}/${prefix}: ${error.message}`);
    for (const entry of data) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.id === null) files.push(...(await listFiles(client, bucket, path)));
      else if (entry.name !== '.emptyFolderPlaceholder') files.push({ path, contentType: entry.metadata?.mimetype });
    }
    if (data.length < 1000) return files;
  }
}

async function copyStorage(local, hosted, log) {
  const { data: buckets, error } = await local.storage.listBuckets();
  if (error) throw new Error(explainError(error, 'Listing local storage', local.__url));

  for (const bucket of buckets) {
    const { error: createError } = await hosted.storage.createBucket(bucket.id, { public: bucket.public });
    if (createError && !/exist/i.test(createError.message)) {
      throw new Error(`Creating bucket ${bucket.id} online: ${createError.message}`);
    }
    if (createError) await hosted.storage.updateBucket(bucket.id, { public: bucket.public });

    const files = await listFiles(local, bucket.id);
    let copied = 0;
    for (const file of files) {
      const { data: blob, error: downloadError } = await local.storage.from(bucket.id).download(file.path);
      if (downloadError) throw new Error(`Downloading ${bucket.id}/${file.path}: ${downloadError.message}`);
      const body = Buffer.from(await blob.arrayBuffer());
      const { error: uploadError } = await hosted.storage
        .from(bucket.id)
        .upload(file.path, body, { upsert: true, contentType: file.contentType || blob.type || undefined });
      if (uploadError) throw new Error(`Uploading ${bucket.id}/${file.path}: ${uploadError.message}`);
      copied++;
    }
    log(`  ${bucket.id} (${bucket.public ? 'public' : 'private'}): ${copied} files`);
  }
}

async function copyToHosted({ local, hosted, hostedUrl, log = console.log, confirm = async () => true }) {
  const hostedOrders = await countRows(hosted, 'orders');
  if (hostedOrders > 0) {
    throw new Error(
      `The online project already has ${hostedOrders} order(s). Stopping so nothing real is deleted.\n` +
        '  (This script is for the first copy into a new project.)'
    );
  }

  log('\nReading your local menu...');
  const data = await readLocal(local);
  for (const table of TABLES) log(`  ${table}: ${data[table].length}`);
  if (data.locations.length === 0) throw new Error('Your local database has no stores -- is the local Supabase running?');

  if (!(await confirm())) return false;

  log('\nReplacing the online menu...');
  await clearHosted(hosted);
  await writeHosted(hosted, data, hostedUrl, log);

  log('\nCopying photos...');
  await copyStorage(local, hosted, log);
  return true;
}

async function main() {
  console.log('Copy your menu from local Supabase to the online project.\n');
  const localUrl = trimSlash(process.env.LOCAL_SUPABASE_URL || (await ask('Local Supabase URL [http://127.0.0.1:54321]: ')) || 'http://127.0.0.1:54321');
  const localKey =
    process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY ||
    (await ask('Local secret key (from `pnpm dlx supabase status`, "Secret key" or "service_role key"): ', { hidden: true }));
  const hostedUrl = trimSlash(process.env.HOSTED_SUPABASE_URL || (await ask('Online project URL (https://xxxx.supabase.co): ')));
  const hostedKey =
    process.env.HOSTED_SUPABASE_SERVICE_ROLE_KEY ||
    (await ask('Online secret key (Project Settings > API Keys): ', { hidden: true }));

  if (!localKey || !hostedUrl || !hostedKey) throw new Error('A URL or key was left empty.');
  if (!/^https:\/\/.+/.test(hostedUrl) || looksLocal(hostedUrl)) {
    throw new Error(`"${hostedUrl}" doesn't look like an online project URL (https://xxxx.supabase.co).`);
  }
  if (hostedUrl === localUrl) throw new Error('The local and online URLs are the same.');

  const ok = await copyToHosted({
    local: makeClient(localUrl, localKey),
    hosted: makeClient(hostedUrl, hostedKey),
    hostedUrl,
    confirm: async () => {
      const answer = await ask(`\nThis replaces the menu, deals and challenges in ${hostedUrl}.\nType COPY to continue: `);
      if (answer !== 'COPY') console.log('Cancelled -- nothing was changed.');
      return answer === 'COPY';
    },
  });
  if (ok) {
    console.log('\nDone! Next: run `node scripts/fix-image-urls.cjs` against the online project to check every photo loads.');
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

module.exports = { copyToHosted };
