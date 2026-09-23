const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const { createClient } = require('@supabase/supabase-js');

// Same situation as patch-menu-modifiers.cjs: these items were already
// imported before menu.csv gained an upsell_group column, and
// import-menu.cjs skips any item that already exists -- so re-running it
// does nothing for them. This sets upsell_group directly on the matching
// already-imported rows.
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://<YOUR-PROJECT-REF>.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '<YOUR-SERVICE-ROLE-KEY>';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function runBackfill() {
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

  let updated = 0;
  for (const row of rows) {
    const itemName = row.name?.trim();
    const upsellGroup = row.upsell_group?.trim();
    if (!upsellGroup) continue;

    const { data, error } = await supabase
      .from('menu_items')
      .update({ upsell_group: upsellGroup })
      .ilike('name', itemName)
      .is('upsell_group', null)
      .select('id, location_id');

    if (error) {
      console.error(`Failed to update "${itemName}":`, error.message);
      continue;
    }
    if (data.length > 0) {
      console.log(`Tagged "${itemName}" as "${upsellGroup}" at ${data.length} location(s).`);
      updated += data.length;
    }
  }

  console.log(`\nDone. Rows tagged: ${updated}.`);
}

runBackfill().catch((err) => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
