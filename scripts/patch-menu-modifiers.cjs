const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const { createClient } = require('@supabase/supabase-js');
const { insertGroup } = require('./modifier-tree.cjs');

// import-menu.cjs skips any item that already exists for a location, so
// re-running it after adding modifiers to menu.csv for an item that was
// already imported (with blank modifiers, back when it was first added)
// does nothing -- the item is "existing" and gets silently skipped, and
// its modifiers stay blank in the live database forever.
//
// This script is the fix for exactly that: for every CSV row that has
// modifiers, find the matching already-imported menu_items row and, only if
// it doesn't already have modifier_groups (so this is safe to re-run),
// insert them. It never inserts or touches the item itself.
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://<YOUR-PROJECT-REF>.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '<YOUR-SERVICE-ROLE-KEY>';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function runPatch() {
  const csvPath = path.resolve(__dirname, '../menu.csv');
  if (!fs.existsSync(csvPath)) {
    console.error(`Error: File not found at ${csvPath}`);
    process.exit(1);
  }

  const { data: locations, error: locError } = await supabase.from('locations').select('id, name');
  if (locError || !locations.length) {
    console.error('Failed to retrieve locations:', locError?.message || 'No locations found');
    process.exit(1);
  }

  const { data: existingItems, error: itemsError } = await supabase
    .from('menu_items')
    .select('id, location_id, name');
  if (itemsError) {
    console.error('Failed to retrieve existing menu items:', itemsError.message);
    process.exit(1);
  }
  const itemIdByKey = new Map(
    existingItems.map((item) => [`${item.location_id}:${item.name.trim().toLowerCase()}`, item.id])
  );

  const { data: existingGroups, error: groupsError } = await supabase
    .from('modifier_groups')
    .select('menu_item_id');
  if (groupsError) {
    console.error('Failed to retrieve existing modifier groups:', groupsError.message);
    process.exit(1);
  }
  const itemIdsWithModifiers = new Set(existingGroups.map((g) => g.menu_item_id));

  const rows = [];
  await new Promise((resolve, reject) => {
    fs.createReadStream(csvPath)
      .pipe(csv())
      .on('data', (data) => rows.push(data))
      .on('end', resolve)
      .on('error', reject);
  });

  let patched = 0;
  let skippedAlreadyHasModifiers = 0;
  let skippedNoMatch = 0;

  for (const row of rows) {
    const itemName = row.name?.trim();
    if (!row.modifiers) continue;

    let modifiers;
    try {
      modifiers = JSON.parse(row.modifiers);
    } catch (e) {
      console.warn(`Failed to parse modifiers JSON for "${itemName}". Skipping.`);
      continue;
    }
    if (!Array.isArray(modifiers) || modifiers.length === 0) continue;

    for (const location of locations) {
      const key = `${location.id}:${itemName.toLowerCase()}`;
      const itemId = itemIdByKey.get(key);
      if (!itemId) {
        skippedNoMatch++;
        continue;
      }
      if (itemIdsWithModifiers.has(itemId)) {
        skippedAlreadyHasModifiers++;
        continue;
      }

      for (let i = 0; i < modifiers.length; i++) {
        await insertGroup(supabase, itemId, itemName, modifiers[i], null, i);
      }
      console.log(`Patched modifiers for "${itemName}" at "${location.name}".`);
      patched++;
    }
  }

  console.log(`\nDone. Patched: ${patched}, already had modifiers: ${skippedAlreadyHasModifiers}, no matching item: ${skippedNoMatch}.`);
}

runPatch().catch((err) => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
