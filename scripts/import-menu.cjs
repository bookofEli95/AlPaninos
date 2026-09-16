const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const { createClient } = require('@supabase/supabase-js');

// 1. Config: Replace or ensure these environment variables exist
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://<YOUR-PROJECT-REF>.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '<YOUR-SERVICE-ROLE-KEY>';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function runImport() {
  const csvPath = path.resolve(__dirname, '../menu.csv');
  if (!fs.existsSync(csvPath)) {
    console.error(`Error: File not found at ${csvPath}`);
    process.exit(1);
  }

  // 2. Load locations and their categories
  const { data: locations, error: locError } = await supabase.from('locations').select('id, name');
  if (locError || !locations.length) {
    console.error('Failed to retrieve locations:', locError?.message || 'No locations found');
    process.exit(1);
  }

  const { data: categories, error: catError } = await supabase.from('menu_categories').select('id, location_id, name');
  if (catError) {
    console.error('Failed to retrieve categories:', catError.message);
    process.exit(1);
  }

  // Map categories for quick lookup: `${location_id}:${category_name.toLowerCase()}` -> category_id
  const categoryMap = new Map();
  categories.forEach(cat => {
    categoryMap.set(`${cat.location_id}:${cat.name.trim().toLowerCase()}`, cat.id);
  });

  // 3. Read CSV rows
  const rows = [];
  await new Promise((resolve, reject) => {
    fs.createReadStream(csvPath)
      .pipe(csv())
      .on('data', (data) => rows.push(data))
      .on('end', resolve)
      .on('error', reject);
  });

  console.log(`Parsed ${rows.length} rows from CSV. Inserting across ${locations.length} locations...`);

  // 4. Ingest items and relational modifiers
  for (const row of rows) {
    const categoryName = row.category?.trim();
    const itemName = row.name?.trim();
    const description = row.description?.trim() || null;
    const basePrice = parseFloat(row.base_price) || 0;
    const imageFilename = row.image_filename?.trim();
    const imageUrl = imageFilename 
      ? `${SUPABASE_URL}/storage/v1/object/public/menu-images/${imageFilename}` 
      : null;

    let modifiers = [];
    if (row.modifiers) {
      try {
        modifiers = JSON.parse(row.modifiers);
      } catch (e) {
        console.warn(`Failed to parse modifiers JSON for "${itemName}". Skipping modifiers for this row.`);
      }
    }

    for (const location of locations) {
      const categoryId = categoryMap.get(`${location.id}:${categoryName.toLowerCase()}`);
      if (!categoryId) {
        console.warn(`Category "${categoryName}" not found for location "${location.name}" (${location.id}). Skipping item.`);
        continue;
      }

      // Insert menu item
      const { data: itemData, error: itemError } = await supabase
        .from('menu_items')
        .insert({
          location_id: location.id,
          category_id: categoryId,
          name: itemName,
          description: description,
          base_price: basePrice,
          image_url: imageUrl,
          is_available: true,
        })
        .select('id')
        .single();

      if (itemError) {
        console.error(`Failed to insert item "${itemName}" at "${location.name}":`, itemError.message);
        continue;
      }

      // Insert modifier groups & options
      for (const group of modifiers) {
        const { data: groupData, error: groupError } = await supabase
          .from('modifier_groups')
          .insert({
            menu_item_id: itemData.id,
            name: group.name,
            is_required: Boolean(group.is_required),
            min_selections: parseInt(group.min_selections, 10) || 0,
            max_selections: parseInt(group.max_selections, 10) || 1,
          })
          .select('id')
          .single();

        if (groupError) {
          console.error(`Failed to insert group "${group.name}" for item "${itemName}":`, groupError.message);
          continue;
        }

        if (Array.isArray(group.options) && group.options.length > 0) {
          const optionsPayload = group.options.map(opt => ({
            group_id: groupData.id,
            name: opt.name,
            price_adjustment: parseFloat(opt.price_adjustment) || 0,
          }));

          const { error: optError } = await supabase
            .from('modifier_options')
            .insert(optionsPayload);

          if (optError) {
            console.error(`Failed to insert options for group "${group.name}":`, optError.message);
          }
        }
      }
    }
  }

  console.log('Menu import complete.');
}

runImport().catch(err => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});