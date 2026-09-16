// Applies the `modifiers` column from menu.csv to menu_items that already
// exist in the database, without touching anything else (no re-inserting
// items, no duplicating). Safe to re-run: an item that already has at least
// one top-level modifier group is skipped, so this is meant to be used as
// you keep filling in modifiers for more items over time in menu.csv.
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const { createClient } = require('@supabase/supabase-js');
const { insertGroup } = require('./modifier-tree.cjs');

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://<YOUR-PROJECT-REF>.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '<YOUR-SERVICE-ROLE-KEY>';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const csvPath = path.resolve(__dirname, '../menu.csv');
  if (!fs.existsSync(csvPath)) {
    console.error(`Error: File not found at ${csvPath}`);
    process.exit(1);
  }

  const rows = [];
  await new Promise((resolve, reject) => {
    fs.createReadStream(csvPath)
      .pipe(csv())
      .on('data', (data) => rows.push(data))
      .on('end', resolve)
      .on('error', reject);
  });

  const rowsWithModifiers = rows.filter(r => r.modifiers && r.modifiers.trim());
  console.log(`Found ${rowsWithModifiers.length} row(s) in menu.csv with modifiers defined.`);

  for (const row of rowsWithModifiers) {
    const categoryName = row.category?.trim();
    const itemName = row.name?.trim();

    let modifiers;
    try {
      modifiers = JSON.parse(row.modifiers);
    } catch (e) {
      console.warn(`Skipping "${itemName}": modifiers column is not valid JSON.`);
      continue;
    }

    // Match against the item's category too, in case a name is reused across categories
    const { data: items, error: itemsError } = await supabase
      .from('menu_items')
      .select('id, name, menu_categories!inner(name)')
      .eq('name', itemName)
      .eq('menu_categories.name', categoryName);

    if (itemsError) {
      console.error(`Failed to look up "${itemName}":`, itemsError.message);
      continue;
    }
    if (!items || items.length === 0) {
      console.warn(`No existing menu_item found for "${itemName}" in category "${categoryName}". Skipping.`);
      continue;
    }

    for (const item of items) {
      const { data: existingGroups, error: existingError } = await supabase
        .from('modifier_groups')
        .select('id')
        .eq('menu_item_id', item.id)
        .is('parent_option_id', null);

      if (existingError) {
        console.error(`Failed to check existing modifiers for "${itemName}":`, existingError.message);
        continue;
      }
      if (existingGroups && existingGroups.length > 0) {
        console.log(`"${itemName}" already has modifiers -- skipping.`);
        continue;
      }

      console.log(`Applying modifiers to "${itemName}"...`);
      for (const group of modifiers) {
        await insertGroup(supabase, item.id, itemName, group, null);
      }
    }
  }

  console.log('Done.');
}

run().catch(err => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
