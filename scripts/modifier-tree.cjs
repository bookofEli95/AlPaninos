// Recursively inserts a modifier group (and its options), following an
// option's own "modifiers" array to nest a child group under it via
// parent_option_id. groupIndex/option array position becomes sort_order,
// since display order is otherwise just whatever order Postgres happens to
// return rows in -- real, queryable data instead of an implicit side effect
// of row storage (see the modifier_sort_order migration).
async function insertGroup(supabase, itemId, itemName, group, parentOptionId, groupIndex = 0) {
  const { data: groupData, error: groupError } = await supabase
    .from('modifier_groups')
    .insert({
      menu_item_id: itemId,
      parent_option_id: parentOptionId ?? null,
      name: group.name,
      is_required: Boolean(group.is_required),
      min_selections: parseInt(group.min_selections, 10) || 0,
      max_selections: parseInt(group.max_selections, 10) || 1,
      sort_order: groupIndex,
    })
    .select('id')
    .single();

  if (groupError) {
    console.error(`Failed to insert group "${group.name}" for item "${itemName}":`, groupError.message);
    return;
  }

  if (!Array.isArray(group.options) || group.options.length === 0) return;

  for (let i = 0; i < group.options.length; i++) {
    const opt = group.options[i];
    const { data: optionData, error: optError } = await supabase
      .from('modifier_options')
      .insert({
        group_id: groupData.id,
        name: opt.name,
        price_adjustment: parseFloat(opt.price_adjustment) || 0,
        is_default: Boolean(opt.is_default),
        sort_order: i,
      })
      .select('id')
      .single();

    if (optError) {
      console.error(`Failed to insert option "${opt.name}" for group "${group.name}":`, optError.message);
      continue;
    }

    if (Array.isArray(opt.modifiers)) {
      for (let j = 0; j < opt.modifiers.length; j++) {
        await insertGroup(supabase, itemId, itemName, opt.modifiers[j], optionData.id, j);
      }
    }
  }
}

module.exports = { insertGroup };
