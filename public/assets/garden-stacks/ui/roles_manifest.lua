-- Role examples for Garden Stacks 4.1 UI polish.
--
-- This manifest is deliberately small. It proves that the documentation's
-- asset roles have a runtime-readable contract without turning the UI Lab into
-- another broad asset catalog.

return {
    {
        key = "garden_stacks_lab_chrome",
        role = "code_chrome",
        module_path = "tools.garden_stacks_ui_lab",
        source_path = "prototype/emoji_garden/tools/garden_stacks_ui_lab.lua",
        usage = "Buttons, panels, cards, meters, chips, hover/pressed states",
    },
    {
        key = "garden_stacks_card_object_art",
        role = "object_bitmap",
        manifest_path = "assets.ui.pile_motifs.manifest",
        source_path = "prototype/emoji_garden/scripts/build_garden_stacks_ui_polish_assets.py",
        usage = "Card center object art and pile seed motif art only; never baked text or whole UI",
    },
    {
        key = "garden_stacks_effect_sprites",
        role = "effect_sprite",
        manifest_path = "assets.ui.effects.manifest",
        source_path = "prototype/emoji_garden/scripts/build_garden_stacks_ui_polish_assets.py",
        usage = "Short trails, puffs, bursts, stamps, halos",
    },
    {
        key = "garden_stacks_fixed_glyphs",
        role = "fixed_ui_glyph",
        manifest_path = "assets.ui.stamps.manifest",
        source_path = "prototype/emoji_garden/scripts/build_garden_stacks_ui_polish_assets.py",
        scale_policy = "fixed_integer",
        usage = "Small icon-button glyphs and status marks",
    },
    {
        key = "garden_stacks_reference_components",
        role = "reference_only",
        source_path = "prototype/emoji_garden/tools/ui_reference/garden_components",
        runtime_default = false,
        usage = "Production comparison and slicing reference only",
    },
}
