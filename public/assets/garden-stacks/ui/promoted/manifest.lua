-- Runtime-safe UI assets promoted from development source sheets.
--
-- Only files under assets/ui/promoted are listed here. Source sheets,
-- Aseprite files, previews, and playground-only data stay outside the runtime
-- asset contract.

local M = {}

M.card_frames = {}

M.garden_components = {}

M.garden_templates = require("assets.ui.promoted.garden_templates_manifest")

M.garden_refined = require("assets.ui.promoted.garden_refined_manifest")

M.pixel_kit = {
    { key = "primary_button", file = "primary_button.png", role = "button.primary", source = "assets/sprites/aseprite-ui/lucky-garden-ui-kit/components/primary_button.aseprite", w = 192, h = 56, slice = { 18, 18, 18, 18 }, safe = { 24, 10, 24, 10 } },
    { key = "secondary_button", file = "secondary_button.png", role = "button.secondary", source = "assets/sprites/aseprite-ui/lucky-garden-ui-kit/components/secondary_button.aseprite", w = 192, h = 56, slice = { 18, 18, 18, 18 }, safe = { 24, 10, 24, 10 } },
    { key = "danger_button", file = "danger_button.png", role = "button.danger", source = "assets/sprites/aseprite-ui/lucky-garden-ui-kit/components/danger_button.aseprite", w = 192, h = 56, slice = { 18, 18, 18, 18 }, safe = { 24, 10, 24, 10 } },
    { key = "resource_button", file = "resource_button.png", role = "button.resource", source = "assets/sprites/aseprite-ui/lucky-garden-ui-kit/components/resource_button.aseprite", w = 192, h = 56, slice = { 18, 18, 18, 18 }, safe = { 24, 10, 24, 10 } },
    { key = "icon_button_square", file = "icon_button_square.png", role = "button.icon", source = "assets/sprites/aseprite-ui/lucky-garden-ui-kit/components/icon_button_square.aseprite", w = 56, h = 56, slice = { 16, 16, 16, 16 }, safe = { 8, 8, 8, 8 } },
    { key = "leafy_panel_9slice", file = "leafy_panel_9slice.png", role = "panel.leafy_9slice", source = "assets/sprites/aseprite-ui/lucky-garden-ui-kit/components/leafy_panel_9slice.aseprite", w = 192, h = 128, slice = { 30, 30, 30, 30 }, safe = { 30, 30, 30, 30 } },
    { key = "modal_panel_9slice", file = "modal_panel_9slice.png", role = "modal.panel_9slice", source = "assets/sprites/aseprite-ui/lucky-garden-ui-kit/components/modal_panel_9slice.aseprite", w = 240, h = 160, slice = { 34, 34, 34, 34 }, safe = { 36, 34, 36, 34 } },
    { key = "parchment_panel_9slice", file = "parchment_panel_9slice.png", role = "panel.parchment_9slice", source = "assets/sprites/aseprite-ui/lucky-garden-ui-kit/components/parchment_panel_9slice.aseprite", w = 192, h = 128, slice = { 28, 28, 28, 28 }, safe = { 30, 28, 30, 28 } },
    { key = "operation_card_frame", file = "operation_card_frame.png", role = "card.operation_frame", source = "assets/sprites/aseprite-ui/lucky-garden-ui-kit/components/operation_card_frame.aseprite", w = 128, h = 180, slice = { 20, 22, 20, 24 }, safe = { 18, 18, 18, 18 } },
    { key = "species_card_frame", file = "species_card_frame.png", role = "card.species_frame", source = "assets/sprites/aseprite-ui/lucky-garden-ui-kit/components/species_card_frame.aseprite", w = 128, h = 180, slice = { 20, 22, 20, 24 }, safe = { 18, 18, 18, 18 } },
    { key = "codex_open_book", file = "codex_open_book.png", role = "codex.book_composable", source = "assets/sprites/aseprite-ui/lucky-garden-ui-kit/components/codex_open_book.aseprite", w = 320, h = 210, safe = { 28, 28, 28, 24 } },
    { key = "tab_leaf_selected", file = "tab_leaf_selected.png", role = "tab.selected", source = "assets/sprites/aseprite-ui/lucky-garden-ui-kit/components/tab_leaf_selected.aseprite", w = 96, h = 48, slice = { 16, 16, 16, 16 }, safe = { 14, 8, 14, 8 } },
    { key = "tab_leaf_idle", file = "tab_leaf_idle.png", role = "tab.idle", source = "assets/sprites/aseprite-ui/lucky-garden-ui-kit/components/tab_leaf_idle.aseprite", w = 96, h = 48, slice = { 16, 16, 16, 16 }, safe = { 14, 8, 14, 8 } },
    { key = "meter_track", file = "meter_track.png", role = "meter.track_9slice", source = "assets/sprites/aseprite-ui/lucky-garden-ui-kit/components/meter_track.aseprite", w = 192, h = 24, slice = { 14, 8, 14, 8 }, safe = { 14, 5, 14, 5 } },
    { key = "meter_fill_green", file = "meter_fill_green.png", role = "meter.fill.green", source = "assets/sprites/aseprite-ui/lucky-garden-ui-kit/components/meter_fill_green.aseprite", w = 192, h = 24, slice = { 14, 8, 14, 8 }, safe = { 14, 5, 14, 5 } },
    { key = "meter_fill_red", file = "meter_fill_red.png", role = "meter.fill.red", source = "assets/sprites/aseprite-ui/lucky-garden-ui-kit/components/meter_fill_red.aseprite", w = 192, h = 24, slice = { 14, 8, 14, 8 }, safe = { 14, 5, 14, 5 } },
    { key = "meter_fill_gold", file = "meter_fill_gold.png", role = "meter.fill.gold", source = "assets/sprites/aseprite-ui/lucky-garden-ui-kit/components/meter_fill_gold.aseprite", w = 192, h = 24, slice = { 14, 8, 14, 8 }, safe = { 14, 5, 14, 5 } },
    { key = "chip_positive", file = "chip_positive.png", role = "chip.positive", source = "assets/sprites/aseprite-ui/lucky-garden-ui-kit/components/chip_positive.aseprite", w = 96, h = 32, slice = { 12, 10, 12, 10 }, safe = { 14, 6, 14, 6 } },
    { key = "chip_warning", file = "chip_warning.png", role = "chip.warning", source = "assets/sprites/aseprite-ui/lucky-garden-ui-kit/components/chip_warning.aseprite", w = 96, h = 32, slice = { 12, 10, 12, 10 }, safe = { 14, 6, 14, 6 } },
    { key = "chip_locked", file = "chip_locked.png", role = "chip.locked", source = "assets/sprites/aseprite-ui/lucky-garden-ui-kit/components/chip_locked.aseprite", w = 96, h = 32, slice = { 12, 10, 12, 10 }, safe = { 14, 6, 14, 6 } },
}

M.icons = {
    { key = "leaf", file = "leaf.png", role = "icon.leaf", source = "assets/sprites/aseprite-ui/lucky-garden-ui-kit/icons/lucky_garden_icons_5x5.aseprite" },
    { key = "coin", file = "coin.png", role = "icon.coin", source = "assets/sprites/aseprite-ui/lucky-garden-ui-kit/icons/lucky_garden_icons_5x5.aseprite" },
    { key = "seed", file = "seed.png", role = "icon.seed", source = "assets/sprites/aseprite-ui/lucky-garden-ui-kit/icons/lucky_garden_icons_5x5.aseprite" },
    { key = "water_drop", file = "water_drop.png", role = "icon.water_drop", source = "assets/sprites/aseprite-ui/lucky-garden-ui-kit/icons/lucky_garden_icons_5x5.aseprite" },
    { key = "sun", file = "sun.png", role = "icon.sun", source = "assets/sprites/aseprite-ui/lucky-garden-ui-kit/icons/lucky_garden_icons_5x5.aseprite" },
    { key = "shield", file = "shield.png", role = "icon.shield", source = "assets/sprites/aseprite-ui/lucky-garden-ui-kit/icons/lucky_garden_icons_5x5.aseprite" },
    { key = "warning", file = "warning.png", role = "icon.warning", source = "assets/sprites/aseprite-ui/lucky-garden-ui-kit/icons/lucky_garden_icons_5x5.aseprite" },
    { key = "lock", file = "lock.png", role = "icon.lock", source = "assets/sprites/aseprite-ui/lucky-garden-ui-kit/icons/lucky_garden_icons_5x5.aseprite" },
    { key = "clean_spark", file = "clean_spark.png", role = "icon.clean_spark", source = "assets/sprites/aseprite-ui/lucky-garden-ui-kit/icons/lucky_garden_icons_5x5.aseprite" },
    { key = "pollution", file = "pollution.png", role = "icon.pollution", source = "assets/sprites/aseprite-ui/lucky-garden-ui-kit/icons/lucky_garden_icons_5x5.aseprite" },
    { key = "gear", file = "gear.png", role = "icon.gear", source = "assets/sprites/aseprite-ui/lucky-garden-ui-kit/icons/lucky_garden_icons_5x5.aseprite" },
    { key = "close_x", file = "close_x.png", role = "icon.close_x", source = "assets/sprites/aseprite-ui/lucky-garden-ui-kit/icons/lucky_garden_icons_5x5.aseprite" },
    { key = "back_arrow", file = "back_arrow.png", role = "icon.back_arrow", source = "assets/sprites/aseprite-ui/lucky-garden-ui-kit/icons/lucky_garden_icons_5x5.aseprite" },
    { key = "reroll", file = "reroll.png", role = "icon.reroll", source = "assets/sprites/aseprite-ui/lucky-garden-ui-kit/icons/lucky_garden_icons_5x5.aseprite" },
    { key = "check", file = "check.png", role = "icon.check", source = "assets/sprites/aseprite-ui/lucky-garden-ui-kit/icons/lucky_garden_icons_5x5.aseprite" },
    { key = "flower", file = "flower.png", role = "icon.flower", source = "assets/sprites/aseprite-ui/lucky-garden-ui-kit/icons/lucky_garden_icons_5x5.aseprite" },
    { key = "tree", file = "tree.png", role = "icon.tree", source = "assets/sprites/aseprite-ui/lucky-garden-ui-kit/icons/lucky_garden_icons_5x5.aseprite" },
    { key = "reeds", file = "reeds.png", role = "icon.reeds", source = "assets/sprites/aseprite-ui/lucky-garden-ui-kit/icons/lucky_garden_icons_5x5.aseprite" },
    { key = "bee", file = "bee.png", role = "icon.bee", source = "assets/sprites/aseprite-ui/lucky-garden-ui-kit/icons/lucky_garden_icons_5x5.aseprite" },
    { key = "bird", file = "bird.png", role = "icon.bird", source = "assets/sprites/aseprite-ui/lucky-garden-ui-kit/icons/lucky_garden_icons_5x5.aseprite" },
    { key = "frog", file = "frog.png", role = "icon.frog", source = "assets/sprites/aseprite-ui/lucky-garden-ui-kit/icons/lucky_garden_icons_5x5.aseprite" },
    { key = "book", file = "book.png", role = "icon.book", source = "assets/sprites/aseprite-ui/lucky-garden-ui-kit/icons/lucky_garden_icons_5x5.aseprite" },
    { key = "calendar", file = "calendar.png", role = "icon.calendar", source = "assets/sprites/aseprite-ui/lucky-garden-ui-kit/icons/lucky_garden_icons_5x5.aseprite" },
    { key = "gate", file = "gate.png", role = "icon.gate", source = "assets/sprites/aseprite-ui/lucky-garden-ui-kit/icons/lucky_garden_icons_5x5.aseprite" },
    { key = "star", file = "star.png", role = "icon.star", source = "assets/sprites/aseprite-ui/lucky-garden-ui-kit/icons/lucky_garden_icons_5x5.aseprite" },
}

for _, item in ipairs(M.pixel_kit) do
    item.path = "assets/ui/promoted/pixel_kit/" .. item.file
end

for _, item in ipairs(M.icons) do
    item.path = "assets/ui/promoted/icons/" .. item.file
end

for _, item in ipairs(M.garden_templates) do
    item.path = "assets/ui/promoted/garden_templates/" .. item.file
end

for _, item in ipairs(M.garden_refined) do
    item.path = "assets/ui/promoted/garden_refined/" .. item.file
end

return M
