// Recursively inserts a modifier group (and its options), following an
// option's own "modifiers" array to nest a child group under it via
// parent_option_id.
async function insertGroup(supabase, itemId, itemName, group, parentOptionId) {
  const { data: groupData, error: groupError } = await supabase
    .from('modifier_groups')
    .insert({
      menu_item_id: itemId,
      parent_option_id: parentOptionId ?? null,
      name: group.name,
      is_required: Boolean(group.is_required),
      min_selections: parseInt(group.min_selections, 10) || 0,
      max_selections: parseInt(group.max_selections, 10) || 1,
    })
    .select('id')
    .single();

  if (groupError) {
    console.error(`Failed to insert group "${group.name}" for item "${itemName}":`, groupError.message);
    return;
  }

  if (!Array.isArray(group.options) || group.options.length === 0) return;

  for (const opt of group.options) {
    const { data: optionData, error: optError } = await supabase
      .from('modifier_options')
      .insert({
        group_id: groupData.id,
        name: opt.name,
        price_adjustment: parseFloat(opt.price_adjustment) || 0,
        is_default: Boolean(opt.is_default),
      })
      .select('id')
      .single();

    if (optError) {
      console.error(`Failed to insert option "${opt.name}" for group "${group.name}":`, optError.message);
      continue;
    }

    if (Array.isArray(opt.modifiers)) {
      for (const childGroup of opt.modifiers) {
        await insertGroup(supabase, itemId, itemName, childGroup, optionData.id);
      }
    }
  }
}

module.exports = { insertGroup };
