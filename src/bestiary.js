// ---------------------------------------------------------------------------
// Bestiary constants and tier math. Hypixel exposes only raw per-mob kill
// counters (member.bestiary.kills); the family groupings, kill-tier brackets,
// and caps below are game constants transcribed from the SkyCrypt source --
// never invented from memory. Tier math mirrors SkyCrypt's
// src/stats/bestiary.js formatBestiaryMobs exactly, and the Bestiary level is
// milestone / 10 (SkyCrypt displays milestone/10 out of maxMilestone/10).
// A kill key Hypixel returns that no family below claims is reported raw
// with tier: null -- the bracket is unknown, so the tier is never guessed.
// ---------------------------------------------------------------------------

import { optionalNumber } from "./util.js";

// Source: SkyCrypt v1 src/constants/bestiary.js BESTIARY_BRACKETS
// (bracket number -> cumulative kill thresholds for tiers 1..25).
export const BESTIARY_BRACKETS = {
  1: [
    20, 40, 60, 100, 200, 400, 800, 1400, 2000, 3000, 6000, 12000, 20000, 30000, 40000, 50000, 60000, 72000, 86000,
    100000, 200000, 400000, 600000, 800000, 1000000,
  ],
  2: [
    5, 10, 15, 25, 50, 100, 200, 350, 500, 750, 1500, 3000, 5000, 7500, 10000, 12500, 15000, 18000, 21500, 25000, 50000,
    100000, 150000, 200000, 250000,
  ],
  3: [
    4, 8, 12, 16, 20, 40, 80, 140, 200, 300, 600, 1200, 2000, 3000, 4000, 5000, 6000, 7200, 8600, 10000, 20000, 40000,
    60000, 80000, 100000,
  ],
  4: [
    2, 4, 6, 10, 15, 20, 25, 35, 50, 75, 150, 300, 500, 750, 1000, 1350, 1650, 2000, 2500, 3000, 5000, 10000, 15000,
    20000, 25000,
  ],
  5: [
    1, 2, 3, 5, 7, 10, 15, 20, 25, 30, 60, 120, 200, 300, 400, 500, 600, 720, 860, 1000, 2000, 4000, 6000, 8000, 10000,
  ],
  6: [1, 2, 3, 5, 7, 9, 14, 17, 21, 25, 50, 80, 125, 175, 250, 325, 425, 525, 625, 750, 1500, 3000, 4500, 6000, 7500],
  7: [1, 2, 3, 5, 7, 9, 11, 14, 17, 20, 30, 40, 55, 75, 100, 150, 200, 275, 375, 500, 1000, 1500, 2000, 2500, 3000],
};

// Source: SkyCrypt v1 src/constants/bestiary.js BESTIARY (family list per
// island/category: display name, kill cap, bracket, and the raw
// member.bestiary.kills keys that count toward the family).
export const BESTIARY_FAMILIES = [
  { category: "dynamic", category_name: "Private Island", name: "Creeper", cap: 200, bracket: 1, mobs: ["creeper_1"] },
  { category: "dynamic", category_name: "Private Island", name: "Enderman", cap: 200, bracket: 1, mobs: ["enderman_1","enderman_2","enderman_3","enderman_4","enderman_5","enderman_6","enderman_7","enderman_8","enderman_9","enderman_10","enderman_11","enderman_12","enderman_13","enderman_14","enderman_15"] },
  { category: "dynamic", category_name: "Private Island", name: "Skeleton", cap: 200, bracket: 1, mobs: ["skeleton_1","skeleton_2","skeleton_3","skeleton_4","skeleton_5","skeleton_6","skeleton_7","skeleton_8","skeleton_9","skeleton_10","skeleton_11","skeleton_12","skeleton_13","skeleton_14","skeleton_15"] },
  { category: "dynamic", category_name: "Private Island", name: "Slime", cap: 200, bracket: 1, mobs: ["slime_1","slime_2","slime_3","slime_4","slime_5","slime_6","slime_7","slime_8","slime_9","slime_10","slime_11","slime_12","slime_13","slime_14","slime_15"] },
  { category: "dynamic", category_name: "Private Island", name: "Spider", cap: 200, bracket: 1, mobs: ["spider_1","spider_2","spider_3","spider_4","spider_5","spider_6","spider_7","spider_8","spider_9","spider_10","spider_11","spider_12","spider_13","spider_14","spider_15"] },
  { category: "dynamic", category_name: "Private Island", name: "Witch", cap: 200, bracket: 1, mobs: ["witch_1","witch_2","witch_3","witch_4","witch_5","witch_6","witch_7","witch_8","witch_9","witch_10","witch_11","witch_12","witch_13","witch_14","witch_15"] },
  { category: "dynamic", category_name: "Private Island", name: "Zombie", cap: 200, bracket: 1, mobs: ["zombie_1","zombie_2","zombie_3","zombie_4","zombie_5","zombie_6","zombie_7","zombie_8","zombie_9","zombie_10","zombie_11","zombie_12","zombie_13","zombie_14","zombie_15"] },
  { category: "hub", category_name: "Hub", name: "Crypt Ghoul", cap: 40000, bracket: 1, mobs: ["unburried_zombie_30"] },
  { category: "hub", category_name: "Hub", name: "Golden Ghoul", cap: 4000, bracket: 3, mobs: ["unburried_zombie_60"] },
  { category: "hub", category_name: "Hub", name: "Graveyard Zombie", cap: 200, bracket: 1, mobs: ["graveyard_zombie_1"] },
  { category: "hub", category_name: "Hub", name: "Old Wolf", cap: 4000, bracket: 3, mobs: ["old_wolf_50"] },
  { category: "hub", category_name: "Hub", name: "Wolf", cap: 40000, bracket: 1, mobs: ["ruin_wolf_15"] },
  { category: "hub", category_name: "Hub", name: "Zombie Villager", cap: 1000, bracket: 4, mobs: ["zombie_villager_1"] },
  { category: "farming_1", category_name: "The Farming Islands", name: "Chicken", cap: 200, bracket: 1, mobs: ["farming_chicken_1"] },
  { category: "farming_1", category_name: "The Farming Islands", name: "Cow", cap: 200, bracket: 1, mobs: ["farming_cow_1"] },
  { category: "farming_1", category_name: "The Farming Islands", name: "Mushroom Cow", cap: 200, bracket: 1, mobs: ["mushroom_cow_1"] },
  { category: "farming_1", category_name: "The Farming Islands", name: "Pig", cap: 200, bracket: 1, mobs: ["farming_pig_1"] },
  { category: "farming_1", category_name: "The Farming Islands", name: "Rabbit", cap: 200, bracket: 1, mobs: ["farming_rabbit_1"] },
  { category: "farming_1", category_name: "The Farming Islands", name: "Sheep", cap: 200, bracket: 1, mobs: ["farming_sheep_1"] },
  { category: "combat_1", category_name: "Spiders Den", name: "Arachne", cap: 500, bracket: 7, mobs: ["arachne_500","arachne_300"] },
  { category: "combat_1", category_name: "Spiders Den", name: "Arachne's Brood", cap: 1000, bracket: 4, mobs: ["arachne_brood_200","arachne_brood_100"] },
  { category: "combat_1", category_name: "Spiders Den", name: "Arachne's Keeper", cap: 400, bracket: 5, mobs: ["arachne_keeper_100"] },
  { category: "combat_1", category_name: "Spiders Den", name: "Broodmother", cap: 400, bracket: 5, mobs: ["brood_mother_spider_12"] },
  { category: "combat_1", category_name: "Spiders Den", name: "Dasher Spider", cap: 10000, bracket: 2, mobs: ["dasher_spider_50","dasher_spider_45","dasher_spider_42","dasher_spider_4","dasher_spider_6"] },
  { category: "combat_1", category_name: "Spiders Den", name: "Gravel Skeleton", cap: 4000, bracket: 3, mobs: ["respawning_skeleton_2"] },
  { category: "combat_1", category_name: "Spiders Den", name: "Rain Slime", cap: 1000, bracket: 4, mobs: ["random_slime_8","random_slime_20"] },
  { category: "combat_1", category_name: "Spiders Den", name: "Silverfish", cap: 10000, bracket: 2, mobs: ["jockey_shot_silverfish_3","splitter_spider_silverfish_2","splitter_spider_silverfish_45","splitter_spider_silverfish_42","splitter_spider_silverfish_50","jockey_shot_silverfish_42"] },
  { category: "combat_1", category_name: "Spiders Den", name: "Spider Jockey", cap: 4000, bracket: 3, mobs: ["spider_jockey_3","spider_jockey_42","spider_jockey_5"] },
  { category: "combat_1", category_name: "Spiders Den", name: "Splitter Spider", cap: 10000, bracket: 2, mobs: ["splitter_spider_2","splitter_spider_45","splitter_spider_42","splitter_spider_50","splitter_spider_4","splitter_spider_6"] },
  { category: "combat_1", category_name: "Spiders Den", name: "Voracious Spider", cap: 10000, bracket: 2, mobs: ["voracious_spider_50","voracious_spider_42","voracious_spider_45","voracious_spider_10"] },
  { category: "combat_1", category_name: "Spiders Den", name: "Weaver Spider", cap: 10000, bracket: 2, mobs: ["weaver_spider_3","weaver_spider_4","weaver_spider_5","weaver_spider_6","weaver_spider_42","weaver_spider_45","weaver_spider_50"] },
  { category: "combat_3", category_name: "The End", name: "Dragon", cap: 1000, bracket: 5, mobs: ["protector_dragon_100","old_dragon_100","young_dragon_100","wise_dragon_100","superior_dragon_100","strong_dragon_100","unstable_dragon_100"] },
  { category: "combat_3", category_name: "The End", name: "Enderman", cap: 25000, bracket: 4, mobs: ["enderman_50","enderman_45","enderman_42"] },
  { category: "combat_3", category_name: "The End", name: "Endermite", cap: 10000, bracket: 5, mobs: ["nest_endermite_50","endermite_37","endermite_40"] },
  { category: "combat_3", category_name: "The End", name: "Endstone Protector", cap: 500, bracket: 7, mobs: ["corrupted_protector_100"] },
  { category: "combat_3", category_name: "The End", name: "Obsidian Defender", cap: 10000, bracket: 5, mobs: ["obsidian_wither_55"] },
  { category: "combat_3", category_name: "The End", name: "Voidling Extremist", cap: 4000, bracket: 3, mobs: ["voidling_extremist_100"] },
  { category: "combat_3", category_name: "The End", name: "Voidling Fanatic", cap: 25000, bracket: 4, mobs: ["voidling_fanatic_85"] },
  { category: "combat_3", category_name: "The End", name: "Watcher", cap: 10000, bracket: 5, mobs: ["watcher_55"] },
  { category: "combat_3", category_name: "The End", name: "Zealot", cap: 25000, bracket: 4, mobs: ["zealot_bruiser_100","zealot_enderman_55","island_zealot_enderman_15"] },
  { category: "crimson_isle", category_name: "Crimson Isle", name: "Ashfang", cap: 1000, bracket: 5, mobs: ["ashfang_200"] },
  { category: "crimson_isle", category_name: "Crimson Isle", name: "Barbarian Duke X", cap: 1000, bracket: 5, mobs: ["barbarian_duke_x_200"] },
  { category: "crimson_isle", category_name: "Crimson Isle", name: "Bladesoul", cap: 1000, bracket: 5, mobs: ["bladesoul_200"] },
  { category: "crimson_isle", category_name: "Crimson Isle", name: "Blaze", cap: 3000, bracket: 4, mobs: ["blaze_25","blaze_70","bezal_80","mutated_blaze_70"] },
  { category: "crimson_isle", category_name: "Crimson Isle", name: "Smoldering Blaze", cap: 25000, bracket: 2, mobs: ["smoldering_blaze_95"] },
  { category: "crimson_isle", category_name: "Crimson Isle", name: "Millenia-Aged Blaze", cap: 4000, bracket: 3, mobs: ["old_blaze_110"] },
  { category: "crimson_isle", category_name: "Crimson Isle", name: "Flaming Spider", cap: 10000, bracket: 3, mobs: ["flaming_spider_80"] },
  { category: "crimson_isle", category_name: "Crimson Isle", name: "Flare", cap: 100000, bracket: 1, mobs: ["flare_90"] },
  { category: "crimson_isle", category_name: "Crimson Isle", name: "Ghast", cap: 3000, bracket: 4, mobs: ["ghast_85","dive_ghast_90"] },
  { category: "crimson_isle", category_name: "Crimson Isle", name: "Mage Outlaw", cap: 1000, bracket: 5, mobs: ["mage_outlaw_200"] },
  { category: "crimson_isle", category_name: "Crimson Isle", name: "Magma Cube", cap: 10000, bracket: 3, mobs: ["pack_magma_cube_90","magma_cube_75","fireball_magma_cube_75"] },
  { category: "crimson_isle", category_name: "Crimson Isle", name: "Magma Boss", cap: 1000, bracket: 5, mobs: ["magma_boss_500"] },
  { category: "crimson_isle", category_name: "Crimson Isle", name: "Matcho", cap: 400, bracket: 5, mobs: ["matcho_100"] },
  { category: "crimson_isle", category_name: "Crimson Isle", name: "Mushroom Bull", cap: 10000, bracket: 3, mobs: ["charging_mushroom_cow_80"] },
  { category: "crimson_isle", category_name: "Crimson Isle", name: "Pigman", cap: 10000, bracket: 3, mobs: ["pigman_12"] },
  { category: "crimson_isle", category_name: "Crimson Isle", name: "Wither Skeleton", cap: 3000, bracket: 4, mobs: ["wither_skeleton_70"] },
  { category: "crimson_isle", category_name: "Crimson Isle", name: "Wither Spectre", cap: 10000, bracket: 3, mobs: ["wither_spectre_70"] },
  { category: "crimson_isle", category_name: "Crimson Isle", name: "Tentacle", cap: 1000, bracket: 5, mobs: ["hellwisp_100"] },
  { category: "crimson_isle", category_name: "Crimson Isle", name: "Vanquisher", cap: 1000, bracket: 5, mobs: ["vanquisher_100"] },
  { category: "crimson_isle", category_name: "Crimson Isle", name: "Kada Knight", cap: 3000, bracket: 4, mobs: ["kada_knight_90"] },
  { category: "crimson_isle", category_name: "Crimson Isle", name: "Magma Cube Rider", cap: 3000, bracket: 4, mobs: ["magma_cube_rider_90"] },
  { category: "mining_2", category_name: "Deep Caverns", name: "Emerald Slime", cap: 3000, bracket: 1, mobs: ["emerald_slime_5","emerald_slime_10","emerald_slime_15"] },
  { category: "mining_2", category_name: "Deep Caverns", name: "Miner Skeleton", cap: 3000, bracket: 1, mobs: ["diamond_skeleton_15","diamond_skeleton_20"] },
  { category: "mining_2", category_name: "Deep Caverns", name: "Miner Zombie", cap: 3000, bracket: 1, mobs: ["diamond_zombie_15","diamond_zombie_20"] },
  { category: "mining_2", category_name: "Deep Caverns", name: "Redstone Pigman", cap: 3000, bracket: 1, mobs: ["redstone_pigman_10"] },
  { category: "mining_2", category_name: "Deep Caverns", name: "Sneaky Creeper", cap: 300, bracket: 3, mobs: ["invisible_creeper_3"] },
  { category: "mining_2", category_name: "Deep Caverns", name: "Lapis Zombie", cap: 3000, bracket: 1, mobs: ["lapis_zombie_7"] },
  { category: "mining_3", category_name: "Dwarven Mines", name: "Diamond Goblin", cap: 100, bracket: 7, mobs: ["goblin_500"] },
  { category: "mining_3", category_name: "Dwarven Mines", name: "Ghost", cap: 250000, bracket: 2, mobs: ["caverns_ghost_250"] },
  { category: "mining_3", category_name: "Dwarven Mines", name: "Goblin", cap: 25000, bracket: 2, mobs: ["goblin_weakling_melee_25","goblin_weakling_melee_40","goblin_weakling_bow_25","goblin_weakling_bow_40","goblin_creepertamer_100","goblin_pitfighter_70","goblin_knife_thrower_25","goblin_knife_thrower_40","goblin_flamethrower_100","goblin_murderlover_200"] },
  { category: "mining_3", category_name: "Dwarven Mines", name: "Goblin Raiders", cap: 1000, bracket: 4, mobs: ["goblin_weakling_melee_5","goblin_weakling_bow_5","goblin_creepertamer_90","goblin_creeper_20","goblin_battler_60","goblin_murderlover_150","goblin_golem_150"] },
  { category: "mining_3", category_name: "Dwarven Mines", name: "Golden Goblin", cap: 400, bracket: 5, mobs: ["goblin_50"] },
  { category: "mining_3", category_name: "Dwarven Mines", name: "Ice Walker", cap: 10000, bracket: 2, mobs: ["ice_walker_45"] },
  { category: "mining_3", category_name: "Dwarven Mines", name: "Powder Ghast", cap: 200, bracket: 1, mobs: ["powder_ghast_1"] },
  { category: "mining_3", category_name: "Dwarven Mines", name: "Star Sentry", cap: 1000, bracket: 4, mobs: ["crystal_sentry_50"] },
  { category: "mining_3", category_name: "Dwarven Mines", name: "Treasure Hoarder", cap: 4000, bracket: 3, mobs: ["treasure_hoarder_70"] },
  { category: "mining_3", category_name: "Dwarven Mines", name: "Glacite Bowman", cap: 1000, bracket: 4, mobs: ["glacite_bowman_165"] },
  { category: "mining_3", category_name: "Dwarven Mines", name: "Glacite Caver", cap: 1000, bracket: 4, mobs: ["glacite_caver_200"] },
  { category: "mining_3", category_name: "Dwarven Mines", name: "Glacite Mage", cap: 1000, bracket: 4, mobs: ["glacite_mage_155"] },
  { category: "mining_3", category_name: "Dwarven Mines", name: "Glacite Mutt", cap: 1000, bracket: 4, mobs: ["glacite_mutt_180"] },
  { category: "crystal_hollows", category_name: "Crystal Hollows", name: "Thyst", cap: 4000, bracket: 3, mobs: ["thyst_20"] },
  { category: "crystal_hollows", category_name: "Crystal Hollows", name: "Worm", cap: 400, bracket: 5, mobs: ["worm_5","scatha_10"] },
  { category: "crystal_hollows", category_name: "Crystal Hollows", name: "Yog", cap: 4000, bracket: 3, mobs: ["yog_100"] },
  { category: "crystal_hollows", category_name: "Crystal Hollows", name: "Sludge", cap: 10000, bracket: 2, mobs: ["sludge_5","sludge_10","sludge_100"] },
  { category: "crystal_hollows", category_name: "Crystal Hollows", name: "Automaton", cap: 10000, bracket: 2, mobs: ["automaton_100","automaton_150"] },
  { category: "crystal_hollows", category_name: "Crystal Hollows", name: "Butterfly", cap: 1000, bracket: 4, mobs: ["butterfly_100"] },
  { category: "crystal_hollows", category_name: "Crystal Hollows", name: "Grunt", cap: 4000, bracket: 3, mobs: ["team_treasurite_grunt_50","team_treasurite_viper_100","team_treasurite_wendy_100","team_treasurite_sebastian_100","team_treasurite_corleone_200"] },
  { category: "crystal_hollows", category_name: "Crystal Hollows", name: "§öBal", cap: 250, bracket: 6, mobs: ["bal_boss_100"] },
  { category: "crystal_hollows", category_name: "Crystal Hollows", name: "Key Guardian", cap: 250, bracket: 6, mobs: ["key_guardian_100"] },
  { category: "foraging_1", category_name: "The Park", name: "Howling Spirit", cap: 10000, bracket: 2, mobs: ["howling_spirit_35"] },
  { category: "foraging_1", category_name: "The Park", name: "Pack Spirit", cap: 10000, bracket: 2, mobs: ["pack_spirit_30"] },
  { category: "foraging_1", category_name: "The Park", name: "Soul of the Alpha", cap: 1000, bracket: 4, mobs: ["soul_of_the_alpha_55"] },
  { category: "spooky_festival", category_name: "Spooky Festival", name: "Grim Reaper", cap: 100, bracket: 7, mobs: ["grim_reaper_190"] },
  { category: "spooky_festival", category_name: "Spooky Festival", name: "Nightmare", cap: 1000, bracket: 4, mobs: ["nightmare_24"] },
  { category: "spooky_festival", category_name: "Spooky Festival", name: "Phantom Fisher", cap: 250, bracket: 6, mobs: ["phantom_fisherman_160"] },
  { category: "spooky_festival", category_name: "Spooky Festival", name: "Scarecrow", cap: 4000, bracket: 3, mobs: ["scarecrow_9"] },
  { category: "spooky_festival", category_name: "Spooky Festival", name: "Werewolf", cap: 1000, bracket: 4, mobs: ["werewolf_50"] },
  { category: "mythological_creatures", category_name: "Mythological Creatures", name: "Gaia Construct", cap: 3000, bracket: 4, mobs: ["gaia_construct_140","gaia_construct_260"] },
  { category: "mythological_creatures", category_name: "Mythological Creatures", name: "Minos Champion", cap: 1000, bracket: 5, mobs: ["minos_champion_175","minos_champion_310"] },
  { category: "mythological_creatures", category_name: "Mythological Creatures", name: "Minos Hunter", cap: 1000, bracket: 5, mobs: ["minos_hunter_125","minos_hunter_15","minos_hunter_60"] },
  { category: "mythological_creatures", category_name: "Mythological Creatures", name: "Minos Inquisitor", cap: 500, bracket: 7, mobs: ["minos_inquisitor_750"] },
  { category: "mythological_creatures", category_name: "Mythological Creatures", name: "Minotaur", cap: 3000, bracket: 4, mobs: ["minotaur_45","minotaur_120","minotaur_210"] },
  { category: "mythological_creatures", category_name: "Mythological Creatures", name: "Siamese Lynx", cap: 3000, bracket: 4, mobs: ["siamese_lynx_25","siamese_lynx_85","siamese_lynx_155"] },
  { category: "jerry", category_name: "Jerry", name: "Blue Jerry", cap: 30, bracket: 5, mobs: ["mayor_jerry_blue_2"] },
  { category: "jerry", category_name: "Jerry", name: "Golden Jerry", cap: 20, bracket: 7, mobs: ["mayor_jerry_golden_5"] },
  { category: "jerry", category_name: "Jerry", name: "Green Jerry", cap: 75, bracket: 4, mobs: ["mayor_jerry_green_1"] },
  { category: "jerry", category_name: "Jerry", name: "Purple Jerry", cap: 25, bracket: 6, mobs: ["mayor_jerry_purple_3"] },
  { category: "kuudra", category_name: "Kuudra", name: "Blazing Golem", cap: 300, bracket: 3, mobs: ["blazing_golem_100","blazing_golem_200","blazing_golem_300","blazing_golem_400","blazing_golem_500"] },
  { category: "kuudra", category_name: "Kuudra", name: "Blight", cap: 10000, bracket: 3, mobs: ["blight_100","blight_200","blight_300","blight_400","blight_500"] },
  { category: "kuudra", category_name: "Kuudra", name: "Dropship", cap: 300, bracket: 3, mobs: ["dropship_100","dropship_200","dropship_300","dropship_400","dropship_500"] },
  { category: "kuudra", category_name: "Kuudra", name: "Explosive Imp", cap: 3000, bracket: 4, mobs: ["explosive_imp_100","explosive_imp_200","explosive_imp_300","explosive_imp_400","explosive_imp_500"] },
  { category: "kuudra", category_name: "Kuudra", name: "Inferno Magma Cube", cap: 10000, bracket: 3, mobs: ["inferno_magma_cube_100","inferno_magma_cube_200","inferno_magma_cube_300","inferno_magma_cube_400","inferno_magma_cube_500"] },
  { category: "kuudra", category_name: "Kuudra", name: "Kuudra Berserker", cap: 10000, bracket: 3, mobs: ["kuudra_berserker_100","kuudra_berserker_200","kuudra_berserker_300","kuudra_berserker_400","kuudra_berserker_500"] },
  { category: "kuudra", category_name: "Kuudra", name: "Kuudra Follower", cap: 25000, bracket: 2, mobs: ["kuudra_follower_100","kuudra_follower_200","kuudra_follower_300","kuudra_follower_400","kuudra_follower_500"] },
  { category: "kuudra", category_name: "Kuudra", name: "Kuudra Knocker", cap: 10000, bracket: 3, mobs: ["kuudra_knocker_100","kuudra_knocker_200","kuudra_knocker_300","kuudra_knocker_400","kuudra_knocker_500"] },
  { category: "kuudra", category_name: "Kuudra", name: "Kuudra Landmine", cap: 10000, bracket: 3, mobs: ["kuudra_landmine_100","kuudra_landmine_200","kuudra_landmine_300","kuudra_landmine_400","kuudra_landmine_500"] },
  { category: "kuudra", category_name: "Kuudra", name: "Kuudra Slasher", cap: 30, bracket: 5, mobs: ["kuudra_slasher_100","kuudra_slasher_200","kuudra_slasher_300","kuudra_slasher_400","kuudra_slasher_500"] },
  { category: "kuudra", category_name: "Kuudra", name: "Magma Follower", cap: 30, bracket: 5, mobs: ["magma_follower_100","magma_follower_200","magma_follower_300","magma_follower_400","magma_follower_500"] },
  { category: "kuudra", category_name: "Kuudra", name: "Wandering Blaze", cap: 3000, bracket: 4, mobs: ["wandering_blaze_100","wandering_blaze_200","wandering_blaze_300","wandering_blaze_400","wandering_blaze_500"] },
  { category: "kuudra", category_name: "Kuudra", name: "Wither Sentry", cap: 75, bracket: 4, mobs: ["wither_sentry_100","wither_sentry_200","wither_sentry_300","wither_sentry_400","wither_sentry_500"] },
  { category: "fishing", category_name: "Fishing", name: "Agarimoo", cap: 4000, bracket: 3, mobs: ["agarimoo_35"] },
  { category: "fishing", category_name: "Fishing", name: "Carrot King", cap: 400, bracket: 5, mobs: ["carrot_king_25"] },
  { category: "fishing", category_name: "Fishing", name: "Catfish", cap: 1000, bracket: 4, mobs: ["catfish_23"] },
  { category: "fishing", category_name: "Fishing", name: "Deep Sea Protector", cap: 1000, bracket: 4, mobs: ["deep_sea_protector_60"] },
  { category: "fishing", category_name: "Fishing", name: "Guardian Defender", cap: 1000, bracket: 4, mobs: ["guardian_defender_45"] },
  { category: "fishing", category_name: "Fishing", name: "Night Squid", cap: 1000, bracket: 4, mobs: ["night_squid_6"] },
  { category: "fishing", category_name: "Fishing", name: "Oasis Rabbit", cap: 300, bracket: 3, mobs: ["oasis_rabbit_10"] },
  { category: "fishing", category_name: "Fishing", name: "Oasis Sheep", cap: 300, bracket: 3, mobs: ["oasis_sheep_10"] },
  { category: "fishing", category_name: "Fishing", name: "Poisoned Water Worm", cap: 1000, bracket: 4, mobs: ["poisoned_water_worm_25"] },
  { category: "fishing", category_name: "Fishing", name: "Rider of the Deep", cap: 4000, bracket: 3, mobs: ["zombie_deep_20","chicken_deep_20"] },
  { category: "fishing", category_name: "Fishing", name: "Sea Archer", cap: 4000, bracket: 3, mobs: ["sea_archer_15"] },
  { category: "fishing", category_name: "Fishing", name: "Sea Guardian", cap: 4000, bracket: 3, mobs: ["sea_guardian_10"] },
  { category: "fishing", category_name: "Fishing", name: "Sea Leech", cap: 1000, bracket: 4, mobs: ["sea_leech_30"] },
  { category: "fishing", category_name: "Fishing", name: "Sea Walker", cap: 4000, bracket: 3, mobs: ["sea_walker_4"] },
  { category: "fishing", category_name: "Fishing", name: "Sea Witch", cap: 4000, bracket: 3, mobs: ["sea_witch_15"] },
  { category: "fishing", category_name: "Fishing", name: "Squid", cap: 10000, bracket: 2, mobs: ["pond_squid_1"] },
  { category: "fishing", category_name: "Fishing", name: "The Sea Emperor", cap: 100, bracket: 7, mobs: ["skeleton_emperor_150","guardian_emperor_150"] },
  { category: "fishing", category_name: "Fishing", name: "Water Hydra", cap: 400, bracket: 5, mobs: ["water_hydra_100"] },
  { category: "fishing", category_name: "Fishing", name: "Water Worm", cap: 1000, bracket: 4, mobs: ["water_worm_20"] },
  { category: "fishing", category_name: "Fishing", name: "Abyssal Miner", cap: 250, bracket: 6, mobs: ["zombie_miner_150"] },
  { category: "lava", category_name: "Lava", name: "Fire Eel", cap: 1000, bracket: 4, mobs: ["fire_eel_240"] },
  { category: "lava", category_name: "Lava", name: "Flaming Worm", cap: 4000, bracket: 3, mobs: ["flaming_worm_50"] },
  { category: "lava", category_name: "Lava", name: "Lava Blaze", cap: 1000, bracket: 4, mobs: ["lava_blaze_100"] },
  { category: "lava", category_name: "Lava", name: "Lava Flame", cap: 1000, bracket: 4, mobs: ["lava_flame_230"] },
  { category: "lava", category_name: "Lava", name: "Lava Leech", cap: 4000, bracket: 3, mobs: ["lava_leech_220"] },
  { category: "lava", category_name: "Lava", name: "Lava Pigman", cap: 1000, bracket: 4, mobs: ["lava_pigman_100"] },
  { category: "lava", category_name: "Lava", name: "Lord Jawbus", cap: 250, bracket: 6, mobs: ["lord_jawbus_600"] },
  { category: "lava", category_name: "Lava", name: "Magma Slug", cap: 10000, bracket: 2, mobs: ["magma_slug_200"] },
  { category: "lava", category_name: "Lava", name: "Moogma", cap: 4000, bracket: 3, mobs: ["moogma_210"] },
  { category: "lava", category_name: "Lava", name: "Plhlegblast", cap: 7, bracket: 7, mobs: ["pond_squid_300"] },
  { category: "lava", category_name: "Lava", name: "Pyroclastic Worm", cap: 4000, bracket: 3, mobs: ["pyroclastic_worm_240"] },
  { category: "lava", category_name: "Lava", name: "Taurus", cap: 1000, bracket: 4, mobs: ["pig_rider_250"] },
  { category: "lava", category_name: "Lava", name: "Thunder", cap: 400, bracket: 5, mobs: ["thunder_400"] },
  { category: "fishing_festival", category_name: "Fishing Festival", name: "Blue Shark", cap: 1000, bracket: 4, mobs: ["blue_shark_20"] },
  { category: "fishing_festival", category_name: "Fishing Festival", name: "Great White Shark", cap: 400, bracket: 5, mobs: ["great_white_shark_180"] },
  { category: "fishing_festival", category_name: "Fishing Festival", name: "Nurse Shark", cap: 4000, bracket: 3, mobs: ["nurse_shark_6"] },
  { category: "fishing_festival", category_name: "Fishing Festival", name: "Tiger Shark", cap: 1000, bracket: 4, mobs: ["tiger_shark_50"] },
  { category: "winter", category_name: "Winter", name: "Frosty", cap: 4000, bracket: 3, mobs: ["frosty_the_snowman_13"] },
  { category: "winter", category_name: "Winter", name: "Frozen Steve", cap: 4000, bracket: 3, mobs: ["frozen_steve_7"] },
  { category: "winter", category_name: "Winter", name: "Grinch", cap: 250, bracket: 6, mobs: ["grinch_21"] },
  { category: "winter", category_name: "Winter", name: "Nutcracker", cap: 400, bracket: 5, mobs: ["nutcracker_50"] },
  { category: "winter", category_name: "Winter", name: "Reindrake", cap: 100, bracket: 7, mobs: ["reindrake_100"] },
  { category: "winter", category_name: "Winter", name: "Yeti", cap: 250, bracket: 6, mobs: ["yeti_175"] },
  { category: "catacombs", category_name: "Catacombs", name: "Angry Archeologist", cap: 3000, bracket: 7, mobs: ["diamond_guy_80","diamond_guy_90","diamond_guy_100","diamond_guy_110","diamond_guy_120","diamond_guy_130","diamond_guy_140","diamond_guy_150","diamond_guy_160","diamond_guy_170","master_diamond_guy_80","master_diamond_guy_90","master_diamond_guy_100","master_diamond_guy_110","master_diamond_guy_120","master_diamond_guy_130","master_diamond_guy_140","master_diamond_guy_150","master_diamond_guy_160","master_diamond_guy_170"] },
  { category: "catacombs", category_name: "Catacombs", name: "Bat", cap: 1000, bracket: 4, mobs: ["dungeon_secret_bat_1"] },
  { category: "catacombs", category_name: "Catacombs", name: "Cellar Spider", cap: 1000, bracket: 4, mobs: ["cellar_spider_45","cellar_spider_65","cellar_spider_75","cellar_spider_85","cellar_spider_95","cellar_spider_105","cellar_spider_115","cellar_spider_125","master_cellar_spider_45","master_cellar_spider_65","master_cellar_spider_75","master_cellar_spider_85","master_cellar_spider_95","master_cellar_spider_105","master_cellar_spider_115","master_cellar_spider_125"] },
  { category: "catacombs", category_name: "Catacombs", name: "Lonely Spider", cap: 25000, bracket: 4, mobs: ["lonely_spider_35","lonely_spider_55","lonely_spider_65","lonely_spider_75","lonely_spider_85","lonely_spider_95","lonely_spider_105","lonely_spider_115","master_lonely_spider_35","master_lonely_spider_55","master_lonely_spider_65","master_lonely_spider_75","master_lonely_spider_85","master_lonely_spider_95","master_lonely_spider_105","master_lonely_spider_115"] },
  { category: "catacombs", category_name: "Catacombs", name: "Crypt Dreadlord", cap: 25000, bracket: 4, mobs: ["crypt_dreadlord_47","crypt_dreadlord_67","crypt_dreadlord_77","crypt_dreadlord_87","crypt_dreadlord_97","crypt_dreadlord_107","crypt_dreadlord_117","crypt_dreadlord_127","master_crypt_dreadlord_47","master_crypt_dreadlord_67","master_crypt_dreadlord_77","master_crypt_dreadlord_87","master_crypt_dreadlord_97","master_crypt_dreadlord_107","master_crypt_dreadlord_117","master_crypt_dreadlord_127"] },
  { category: "catacombs", category_name: "Catacombs", name: "Crypt Lurker", cap: 25000, bracket: 4, mobs: ["crypt_lurker_41","crypt_lurker_61","crypt_lurker_71","crypt_lurker_81","crypt_lurker_91","crypt_lurker_101","crypt_lurker_111","crypt_lurker_121","master_crypt_lurker_41","master_crypt_lurker_61","master_crypt_lurker_71","master_crypt_lurker_81","master_crypt_lurker_91","master_crypt_lurker_101","master_crypt_lurker_111","master_crypt_lurker_121"] },
  { category: "catacombs", category_name: "Catacombs", name: "Crypt Souleater", cap: 25000, bracket: 4, mobs: ["crypt_souleater_45","crypt_souleater_65","crypt_souleater_75","crypt_souleater_85","crypt_souleater_95","crypt_souleater_105","crypt_souleater_115","crypt_souleater_125","master_crypt_souleater_45","master_crypt_souleater_65","master_crypt_souleater_75","master_crypt_souleater_85","master_crypt_souleater_95","master_crypt_souleater_105","master_crypt_souleater_115","master_crypt_souleater_125"] },
  { category: "catacombs", category_name: "Catacombs", name: "Fels", cap: 10000, bracket: 5, mobs: ["tentaclees_90","tentaclees_100","tentaclees_110","master_tentaclees_90","master_tentaclees_100","master_tentaclees_110"] },
  { category: "catacombs", category_name: "Catacombs", name: "Golem", cap: 1000, bracket: 4, mobs: ["sadan_golem_1","master_sadan_golem_1"] },
  { category: "catacombs", category_name: "Catacombs", name: "King Midas", cap: 750, bracket: 6, mobs: ["king_midas_130","king_midas_140","king_midas_150","king_midas_160","king_midas_170","master_king_midas_130","master_king_midas_140","master_king_midas_150","master_king_midas_160","master_king_midas_170"] },
  { category: "catacombs", category_name: "Catacombs", name: "Lost Adventurer", cap: 3000, bracket: 7, mobs: ["lost_adventurer_80","lost_adventurer_81","lost_adventurer_82","lost_adventurer_83","lost_adventurer_85","lost_adventurer_86","lost_adventurer_87","lost_adventurer_88","lost_adventurer_90","lost_adventurer_91","lost_adventurer_92","lost_adventurer_93","lost_adventurer_100","lost_adventurer_101","lost_adventurer_102","lost_adventurer_103","lost_adventurer_110","lost_adventurer_111","lost_adventurer_112","lost_adventurer_113","lost_adventurer_120","lost_adventurer_121","lost_adventurer_122","lost_adventurer_123","lost_adventurer_130","lost_adventurer_131","lost_adventurer_132","lost_adventurer_133","lost_adventurer_134","lost_adventurer_135","lost_adventurer_140","lost_adventurer_141","lost_adventurer_142","lost_adventurer_143","lost_adventurer_144","lost_adventurer_150","lost_adventurer_151","lost_adventurer_152","lost_adventurer_153","lost_adventurer_154","lost_adventurer_160","lost_adventurer_161","lost_adventurer_162","lost_adventurer_163","lost_adventurer_164","master_lost_adventurer_80","master_lost_adventurer_81","master_lost_adventurer_82","master_lost_adventurer_83","master_lost_adventurer_85","master_lost_adventurer_86","master_lost_adventurer_87","master_lost_adventurer_88","master_lost_adventurer_90","master_lost_adventurer_91","master_lost_adventurer_92","master_lost_adventurer_93","master_lost_adventurer_100","master_lost_adventurer_101","master_lost_adventurer_102","master_lost_adventurer_103","master_lost_adventurer_110","master_lost_adventurer_111","master_lost_adventurer_112","master_lost_adventurer_113","master_lost_adventurer_120","master_lost_adventurer_121","master_lost_adventurer_122","master_lost_adventurer_123","master_lost_adventurer_130","master_lost_adventurer_131","master_lost_adventurer_132","master_lost_adventurer_133","master_lost_adventurer_134","master_lost_adventurer_135","master_lost_adventurer_140","master_lost_adventurer_141","master_lost_adventurer_142","master_lost_adventurer_143","master_lost_adventurer_144","master_lost_adventurer_150","master_lost_adventurer_151","master_lost_adventurer_152","master_lost_adventurer_153","master_lost_adventurer_154","master_lost_adventurer_160","master_lost_adventurer_161","master_lost_adventurer_162","master_lost_adventurer_163","master_lost_adventurer_164"] },
  { category: "catacombs", category_name: "Catacombs", name: "Mimic", cap: 1000, bracket: 4, mobs: ["mimic_115","mimic_125","master_mimic_115","master_mimic_125"] },
  { category: "catacombs", category_name: "Catacombs", name: "Scared Skeleton", cap: 4000, bracket: 3, mobs: ["scared_skeleton_42","scared_skeleton_62","scared_skeleton_72","master_scared_skeleton_42","master_scared_skeleton_62","master_scared_skeleton_72"] },
  { category: "catacombs", category_name: "Catacombs", name: "Shadow Assassin", cap: 3000, bracket: 7, mobs: ["shadow_assassin_120","shadow_assassin_130","shadow_assassin_140","shadow_assassin_150","shadow_assassin_160","shadow_assassin_170","shadow_assassin_171","master_shadow_assassin_120","master_shadow_assassin_130","master_shadow_assassin_140","master_shadow_assassin_150","master_shadow_assassin_160","master_shadow_assassin_170","master_shadow_assassin_171"] },
  { category: "catacombs", category_name: "Catacombs", name: "Skeleton Grunt", cap: 4000, bracket: 3, mobs: ["skeleton_grunt_40","skeleton_grunt_60","skeleton_grunt_70","skeleton_grunt_80","master_skeleton_grunt_40","master_skeleton_grunt_60","master_skeleton_grunt_70","master_skeleton_grunt_80"] },
  { category: "catacombs", category_name: "Catacombs", name: "Skeleton Lord", cap: 1000, bracket: 5, mobs: ["skeleton_lord_150","master_skeleton_lord_150"] },
  { category: "catacombs", category_name: "Catacombs", name: "Skeleton Master", cap: 25000, bracket: 4, mobs: ["skeleton_master_48","skeleton_master_68","skeleton_master_78","skeleton_master_88","skeleton_master_98","skeleton_master_108","skeleton_master_118","skeleton_master_128","master_skeleton_master_48","master_skeleton_master_68","master_skeleton_master_78","master_skeleton_master_88","master_skeleton_master_98","master_skeleton_master_108","master_skeleton_master_118","master_skeleton_master_128"] },
  { category: "catacombs", category_name: "Catacombs", name: "Skeleton Soldier", cap: 40000, bracket: 1, mobs: ["skeleton_soldier_46","skeleton_soldier_66","skeleton_soldier_76","skeleton_soldier_86","skeleton_soldier_96","skeleton_soldier_106","skeleton_soldier_116","skeleton_soldier_126","master_skeleton_soldier_46","master_skeleton_soldier_66","master_skeleton_soldier_76","master_skeleton_soldier_86","master_skeleton_soldier_96","master_skeleton_soldier_106","master_skeleton_soldier_116","master_skeleton_soldier_126"] },
  { category: "catacombs", category_name: "Catacombs", name: "Skeletor", cap: 10000, bracket: 5, mobs: ["skeletor_80","skeletor_90","skeletor_100","skeletor_101","skeletor_110","skeletor_120","skeletor_prime_100","skeletor_prime_110","skeletor_prime_120","master_skeletor_80","master_skeletor_90","master_skeletor_100","master_skeletor_101","master_skeletor_110","master_skeletor_120","master_skeletor_prime_100","master_skeletor_prime_110","master_skeletor_prime_120"] },
  { category: "catacombs", category_name: "Catacombs", name: "Sniper", cap: 4000, bracket: 3, mobs: ["sniper_skeleton_43","sniper_skeleton_63","sniper_skeleton_73","sniper_skeleton_83","sniper_skeleton_93","sniper_skeleton_103","sniper_skeleton_113","sniper_skeleton_123","master_sniper_skeleton_43","master_sniper_skeleton_63","master_sniper_skeleton_73","master_sniper_skeleton_83","master_sniper_skeleton_93","master_sniper_skeleton_103","master_sniper_skeleton_113","master_sniper_skeleton_123"] },
  { category: "catacombs", category_name: "Catacombs", name: "Super Archer", cap: 10000, bracket: 5, mobs: ["super_archer_90","super_archer_100","super_archer_110","super_archer_120","master_super_archer_90","master_super_archer_100","master_super_archer_110","master_super_archer_120"] },
  { category: "catacombs", category_name: "Catacombs", name: "Super Tank Zombie", cap: 25000, bracket: 4, mobs: ["super_tank_zombie_90","super_tank_zombie_100","super_tank_zombie_110","super_tank_zombie_120","master_super_tank_zombie_90","master_super_tank_zombie_100","master_super_tank_zombie_110","master_super_tank_zombie_120"] },
  { category: "catacombs", category_name: "Catacombs", name: "Tank Zombie", cap: 4000, bracket: 3, mobs: ["crypt_tank_zombie_40","crypt_tank_zombie_60","crypt_tank_zombie_70","crypt_tank_zombie_80","crypt_tank_zombie_90","master_crypt_tank_zombie_40","master_crypt_tank_zombie_60","master_crypt_tank_zombie_70","master_crypt_tank_zombie_80","master_crypt_tank_zombie_90"] },
  { category: "catacombs", category_name: "Catacombs", name: "Terracotta", cap: 40000, bracket: 1, mobs: ["sadan_statue_1","master_sadan_statue_1"] },
  { category: "catacombs", category_name: "Catacombs", name: "Undead", cap: 10000, bracket: 2, mobs: ["watcher_summon_undead_1","watcher_summon_undead_2","watcher_summon_undead_3","watcher_summon_undead_4","watcher_summon_undead_5","watcher_summon_undead_6","watcher_summon_undead_7","watcher_summon_undead_8","master_watcher_summon_undead_1","master_watcher_summon_undead_2","master_watcher_summon_undead_3","master_watcher_summon_undead_4","master_watcher_summon_undead_5","master_watcher_summon_undead_6","master_watcher_summon_undead_7","master_watcher_summon_undead_8"] },
  { category: "catacombs", category_name: "Catacombs", name: "Undead Skeleton", cap: 25000, bracket: 4, mobs: ["dungeon_respawning_skeleton_40","dungeon_respawning_skeleton_skull_40","dungeon_respawning_skeleton_60","dungeon_respawning_skeleton_70","dungeon_respawning_skeleton_80","dungeon_respawning_skeleton_90","dungeon_respawning_skeleton_100","dungeon_respawning_skeleton_110","dungeon_respawning_skeleton_120","master_dungeon_respawning_skeleton_40","master_dungeon_respawning_skeleton_60","master_dungeon_respawning_skeleton_70","master_dungeon_respawning_skeleton_80","master_dungeon_respawning_skeleton_90","master_dungeon_respawning_skeleton_100","master_dungeon_respawning_skeleton_110","master_dungeon_respawning_skeleton_120"] },
  { category: "catacombs", category_name: "Catacombs", name: "Wither Guard", cap: 10000, bracket: 5, mobs: ["wither_guard_100","master_wither_guard_100"] },
  { category: "catacombs", category_name: "Catacombs", name: "Wither Husk", cap: 10000, bracket: 5, mobs: ["master_wither_husk_100"] },
  { category: "catacombs", category_name: "Catacombs", name: "Wither Miner", cap: 25000, bracket: 4, mobs: ["wither_miner_100","master_wither_miner_100"] },
  { category: "catacombs", category_name: "Catacombs", name: "Withermancer", cap: 25000, bracket: 4, mobs: ["crypt_witherskeleton_90","crypt_witherskeleton_100","crypt_witherskeleton_110","crypt_witherskeleton_120","master_crypt_witherskeleton_90","master_crypt_witherskeleton_100","master_crypt_witherskeleton_110","master_crypt_witherskeleton_120"] },
  { category: "catacombs", category_name: "Catacombs", name: "Zombie Commander", cap: 3000, bracket: 4, mobs: ["zombie_commander_110","zombie_commander_120","master_zombie_commander_110","master_zombie_commander_120"] },
  { category: "catacombs", category_name: "Catacombs", name: "Zombie Grunt", cap: 4000, bracket: 3, mobs: ["zombie_grunt_40","zombie_grunt_60","zombie_grunt_70","zombie_grunt_80","master_zombie_grunt_40","master_zombie_grunt_60","master_zombie_grunt_70","master_zombie_grunt_80"] },
  { category: "catacombs", category_name: "Catacombs", name: "Zombie Knight", cap: 10000, bracket: 5, mobs: ["zombie_knight_86","zombie_knight_96","zombie_knight_106","zombie_knight_116","zombie_knight_126","master_zombie_knight_86","master_zombie_knight_96","master_zombie_knight_106","master_zombie_knight_116","master_zombie_knight_126"] },
  { category: "catacombs", category_name: "Catacombs", name: "Zombie Lord", cap: 1000, bracket: 5, mobs: ["zombie_lord_150","master_zombie_lord_150"] },
  { category: "catacombs", category_name: "Catacombs", name: "Zombie Soldier", cap: 40000, bracket: 1, mobs: ["zombie_soldier_83","zombie_soldier_93","zombie_soldier_103","zombie_soldier_113","zombie_soldier_123","master_zombie_soldier_83","master_zombie_soldier_93","master_zombie_soldier_103","master_zombie_soldier_113","master_zombie_soldier_123"] },
  { category: "garden", category_name: "Garden", name: "Beetle", cap: 250, bracket: 6, mobs: ["pest_beetle_1"] },
  { category: "garden", category_name: "Garden", name: "Cricket", cap: 250, bracket: 6, mobs: ["pest_cricket_1"] },
  { category: "garden", category_name: "Garden", name: "Earthworm", cap: 250, bracket: 6, mobs: ["pest_worm_1"] },
  { category: "garden", category_name: "Garden", name: "Fly", cap: 250, bracket: 6, mobs: ["pest_fly_1"] },
  { category: "garden", category_name: "Garden", name: "Locust", cap: 250, bracket: 6, mobs: ["pest_locust_1"] },
  { category: "garden", category_name: "Garden", name: "Mite", cap: 250, bracket: 6, mobs: ["pest_mite_1"] },
  { category: "garden", category_name: "Garden", name: "Mosquito", cap: 250, bracket: 6, mobs: ["pest_mosquito_1"] },
  { category: "garden", category_name: "Garden", name: "Moth", cap: 250, bracket: 6, mobs: ["pest_moth_1"] },
  { category: "garden", category_name: "Garden", name: "Rat", cap: 250, bracket: 6, mobs: ["pest_rat_1"] },
  { category: "garden", category_name: "Garden", name: "Slug", cap: 250, bracket: 6, mobs: ["pest_slug_1"] },];

function familySlug(family) {
  return `${family.category}:${family.name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;
}

function formatKillKey(key) {
  return key
    .split("_")
    .map((part) => (part ? `${part[0].toUpperCase()}${part.slice(1)}` : ""))
    .join(" ");
}

// SkyCrypt's formatBestiaryMobs tier walk, verbatim: the next tier is the
// first bracket threshold the kill count has not reached (never past the
// cap); the current tier is that threshold's index, or one past the cap's
// index when the family is maxed.
function familyTier(kills, bracket, cap) {
  const nextTierKills = bracket.find((tier) => kills < tier && tier <= cap);
  const tier = nextTierKills !== undefined ? bracket.indexOf(nextTierKills) : bracket.indexOf(cap) + 1;
  const maxTier = bracket.indexOf(cap) + 1;
  return { tier, max_tier: maxTier, next_tier_kills: nextTierKills ?? null };
}

// Computes every family record plus the overall milestone rollup from
// member.bestiary.kills. Returns data_present: false when Hypixel exposed no
// kills object at all; with the object present, an absent per-mob key is a
// real zero, matching SkyCrypt's `kills[key] ?? 0` read of the same payload.
export function computeBestiary(member) {
  const bestiaryRaw = member?.bestiary;
  const killsRaw = bestiaryRaw?.kills;
  const killsPresent = Boolean(killsRaw && typeof killsRaw === "object" && !Array.isArray(killsRaw));

  if (!killsPresent) {
    return {
      data_present: false,
      families: [],
      families_total: BESTIARY_FAMILIES.length,
      families_unlocked: null,
      families_maxed: null,
      milestone: null,
      max_milestone: null,
      bestiary_level: null,
      max_bestiary_level: null,
      untracked_kill_keys: null,
      last_claimed_milestone: optionalNumber(bestiaryRaw?.milestone?.last_claimed_milestone),
    };
  }

  const claimedKeys = new Set();
  const families = [];
  let milestone = 0;
  let maxMilestone = 0;
  let familiesUnlocked = 0;
  let familiesMaxed = 0;

  for (const family of BESTIARY_FAMILIES) {
    const bracket = BESTIARY_BRACKETS[family.bracket];
    let kills = 0;
    for (const key of family.mobs) {
      claimedKeys.add(key);
      kills += optionalNumber(killsRaw[key]) ?? 0;
    }
    const { tier, max_tier, next_tier_kills } = familyTier(kills, bracket, family.cap);
    milestone += tier;
    maxMilestone += max_tier;
    if (kills > 0) familiesUnlocked += 1;
    if (tier === max_tier) familiesMaxed += 1;
    families.push({
      family_id: familySlug(family),
      name: family.name,
      category_id: family.category,
      category_name: family.category_name,
      kills,
      tier,
      max_tier,
      maxed: tier === max_tier,
      next_tier_kills,
      kills_to_next_tier: next_tier_kills === null ? null : Math.max(0, next_tier_kills - kills),
      max_kills: family.cap,
      bracket: family.bracket,
      in_bracket_table: true,
    });
  }

  // Kill keys Hypixel returned that no transcribed family claims (a mob added
  // after the table was transcribed). Kills ship complete and raw; the tier
  // stays null because the bracket is unknown -- never guessed. These do not
  // count toward the milestone, matching SkyCrypt, which also only sums
  // families it knows.
  let untracked = 0;
  for (const [key, value] of Object.entries(killsRaw)) {
    if (claimedKeys.has(key)) continue;
    const kills = optionalNumber(value);
    if (kills === null) continue;
    untracked += 1;
    families.push({
      family_id: `untracked:${key}`,
      name: formatKillKey(key),
      category_id: null,
      category_name: null,
      kills,
      tier: null,
      max_tier: null,
      maxed: null,
      next_tier_kills: null,
      kills_to_next_tier: null,
      max_kills: null,
      bracket: null,
      in_bracket_table: false,
    });
  }

  return {
    data_present: true,
    families,
    families_total: BESTIARY_FAMILIES.length,
    families_unlocked: familiesUnlocked,
    families_maxed: familiesMaxed,
    milestone,
    max_milestone: maxMilestone,
    // Source: SkyCrypt v1 views/sections/stats/bestiary.ejs displays the
    // Bestiary milestone as milestone / 10 out of maxMilestone / 10.
    bestiary_level: milestone / 10,
    max_bestiary_level: maxMilestone / 10,
    untracked_kill_keys: untracked,
    last_claimed_milestone: optionalNumber(bestiaryRaw?.milestone?.last_claimed_milestone),
  };
}
