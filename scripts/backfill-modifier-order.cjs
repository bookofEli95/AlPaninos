const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const { createClient } = require('@supabase/supabase-js');

// menu.csv's modifier lists were reordered into a deliberate order (and a
// couple of names re-cased) after many of these items were already
// imported live. import-menu.cjs skips items that already exist, and
// patch-menu-modifiers.cjs (deliberately) only touches items with NO
// modifier_groups yet -- neither one will push a reorder/rename onto rows
// that already exist. This script is the one that does: for every already-
// imported item, match its live modifier_groups/modifier_options against
// menu.csv by name (case-insensitively, since a couple of names only
// changed by case) and update sort_order (and name, if the casing changed)
// in place. It never inserts or deletes a row, so option ids referenced by
// past orders (order_item_modifiers) are untouched.
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://<YOUR-PROJECT-REF>.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '<YOUR-SERVICE-ROLE-KEY>';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function norm(name) {
  return (name || '').trim().toLowerCase();
}

// Matches a CSV modifier tree against the live rows for one item and
// collects the {table, id, patch} updates needed, without applying them --
// keeps this function testable/dry-run-able independent of the network.
function planUpdates(csvGroups, dbGroups, dbOptionsByGroupId, parentOptionId, updates) {
  const pool = dbGroups.filter((g) => (g.parent_option_id ?? null) === (parentOptionId ?? null));
  const usedGroupIds = new Set();

  csvGroups.forEach((csvGroup, groupIndex) => {
    const dbGroup = pool.find((g) => !usedGroupIds.has(g.id) && norm(g.name) === norm(csvGroup.name));
    if (!dbGroup) {
      console.warn(`  no matching group for "${csvGroup.name}" (parent option ${parentOptionId ?? 'top-level'})`);
      return;
    }
    usedGroupIds.add(dbGroup.id);
    if (dbGroup.sort_order !== groupIndex || dbGroup.name !== csvGroup.name) {
      updates.push({ table: 'modifier_groups', id: dbGroup.id, patch: { sort_order: groupIndex, name: csvGroup.name } });
    }

    const dbOptions = dbOptionsByGroupId.get(dbGroup.id) || [];
    const usedOptionIds = new Set();
    const csvOptions = csvGroup.options || [];
    csvOptions.forEach((csvOpt, optIndex) => {
      const dbOpt = dbOptions.find((o) => !usedOptionIds.has(o.id) && norm(o.name) === norm(csvOpt.name));
      if (!dbOpt) {
        console.warn(`  no matching option for "${csvOpt.name}" in group "${csvGroup.name}"`);
        return;
      }
      usedOptionIds.add(dbOpt.id);
      if (dbOpt.sort_order !== optIndex || dbOpt.name !== csvOpt.name) {
        updates.push({ table: 'modifier_options', id: dbOpt.id, patch: { sort_order: optIndex, name: csvOpt.name } });
      }
      if (Array.isArray(csvOpt.modifiers) && csvOpt.modifiers.length > 0) {
        planUpdates(csvOpt.modifiers, dbGroups, dbOptionsByGroupId, dbOpt.id, updates);
      }
    });
  });
}

async function runBackfill() {
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

  const { data: allItems, error: itemsError } = await supabase.from('menu_items').select('id, location_id, name');
  if (itemsError) {
    console.error('Failed to retrieve menu items:', itemsError.message);
    process.exit(1);
  }
  const itemIdByKey = new Map(allItems.map((it) => [`${it.location_id}:${norm(it.name)}`, it.id]));

  const rows = [];
  await new Promise((resolve, reject) => {
    fs.createReadStream(csvPath)
      .pipe(csv())
      .on('data', (data) => rows.push(data))
      .on('end', resolve)
      .on('error', reject);
  });

  let itemsProcessed = 0;
  let totalUpdates = 0;

  for (const row of rows) {
    const itemName = row.name?.trim();
    if (!row.modifiers?.trim()) continue;

    let csvGroups;
    try {
      csvGroups = JSON.parse(row.modifiers);
    } catch (e) {
      console.warn(`Failed to parse modifiers JSON for "${itemName}". Skipping.`);
      continue;
    }
    if (!Array.isArray(csvGroups) || csvGroups.length === 0) continue;

    for (const location of locations) {
      const itemId = itemIdByKey.get(`${location.id}:${norm(itemName)}`);
      if (!itemId) continue;

      const { data: dbGroups, error: groupsErr } = await supabase
        .from('modifier_groups')
        .select('id, name, parent_option_id, sort_order')
        .eq('menu_item_id', itemId);
      if (groupsErr) {
        console.error(`Failed to fetch groups for "${itemName}" at "${location.name}":`, groupsErr.message);
        continue;
      }
      if (!dbGroups.length) continue; // nothing live to reorder yet -- patch-menu-modifiers.cjs's job

      const groupIds = dbGroups.map((g) => g.id);
      const { data: dbOptions, error: optsErr } = await supabase
        .from('modifier_options')
        .select('id, name, group_id, sort_order')
        .in('group_id', groupIds);
      if (optsErr) {
        console.error(`Failed to fetch options for "${itemName}" at "${location.name}":`, optsErr.message);
        continue;
      }
      const dbOptionsByGroupId = new Map();
      for (const opt of dbOptions) {
        if (!dbOptionsByGroupId.has(opt.group_id)) dbOptionsByGroupId.set(opt.group_id, []);
        dbOptionsByGroupId.get(opt.group_id).push(opt);
      }

      console.log(`Matching "${itemName}" at "${location.name}"...`);
      const updates = [];
      planUpdates(csvGroups, dbGroups, dbOptionsByGroupId, null, updates);

      for (const u of updates) {
        const { error: updateErr } = await supabase.from(u.table).update(u.patch).eq('id', u.id);
        if (updateErr) {
          console.error(`  Failed to update ${u.table} ${u.id}:`, updateErr.message);
        }
      }
      totalUpdates += updates.length;
      itemsProcessed++;
    }
  }

  console.log(`\nDone. Items processed: ${itemsProcessed}, rows updated: ${totalUpdates}.`);
}

runBackfill().catch((err) => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
