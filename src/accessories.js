// Magical Power computation for the decoded Accessory Bag.
//
// Hypixel never exposes a Magical Power number or per-item rarity in the
// profile API, so MP is computed here the way SkyCrypt does it: base tier from
// the official items catalog, a Recombobulator bumps the tier one step, only
// the single best accessory per upgrade family counts, and Hegemony/Abicase/
// consumed Rift Prism apply their special rules. Every table below is
// transcribed from the SkyCrypt source, never invented from memory.

import { optionalNumber } from "./util.js";

// Source: SkyCrypt common/constants/items.js RARITIES (tier order used to bump one step on recombobulation).
export const RARITY_ORDER = [
  "common",
  "uncommon",
  "rare",
  "epic",
  "legendary",
  "mythic",
  "divine",
  "supreme",
  "special",
  "very_special",
  "admin",
];

// Source: SkyCrypt src/constants/accessories.js MAGICAL_POWER (MP granted per accessory rarity).
export const MAGICAL_POWER_BY_RARITY = {
  common: 3,
  uncommon: 5,
  rare: 8,
  epic: 12,
  legendary: 16,
  mythic: 22,
  special: 3,
  very_special: 5,
};

// Source: SkyCrypt src/constants/accessories.js accessoryUpgrades (each list is one upgrade family, lowest tier first; only the highest owned entry counts).
const ACCESSORY_UPGRADE_FAMILIES = [
  ["WOLF_TALISMAN", "WOLF_RING"],
  ["POTION_AFFINITY_TALISMAN", "RING_POTION_AFFINITY", "ARTIFACT_POTION_AFFINITY"],
  ["FEATHER_TALISMAN", "FEATHER_RING", "FEATHER_ARTIFACT"],
  ["SEA_CREATURE_TALISMAN", "SEA_CREATURE_RING", "SEA_CREATURE_ARTIFACT"],
  ["HEALING_TALISMAN", "HEALING_RING"],
  ["CANDY_TALISMAN", "CANDY_RING", "CANDY_ARTIFACT", "CANDY_RELIC"],
  ["INTIMIDATION_TALISMAN", "INTIMIDATION_RING", "INTIMIDATION_ARTIFACT", "INTIMIDATION_RELIC"],
  ["SPIDER_TALISMAN", "SPIDER_RING", "SPIDER_ARTIFACT"],
  ["RED_CLAW_TALISMAN", "RED_CLAW_RING", "RED_CLAW_ARTIFACT"],
  ["HUNTER_TALISMAN", "HUNTER_RING"],
  ["ZOMBIE_TALISMAN", "ZOMBIE_RING", "ZOMBIE_ARTIFACT"],
  ["BAT_TALISMAN", "BAT_RING", "BAT_ARTIFACT"],
  ["SPEED_TALISMAN", "SPEED_RING", "SPEED_ARTIFACT"],
  ["PERSONAL_COMPACTOR_4000", "PERSONAL_COMPACTOR_5000", "PERSONAL_COMPACTOR_6000", "PERSONAL_COMPACTOR_7000"],
  ["PERSONAL_DELETOR_4000", "PERSONAL_DELETOR_5000", "PERSONAL_DELETOR_6000", "PERSONAL_DELETOR_7000"],
  ["SCARF_STUDIES", "SCARF_THESIS", "SCARF_GRIMOIRE"],
  ["CAT_TALISMAN", "LYNX_TALISMAN", "CHEETAH_TALISMAN"],
  ["SHADY_RING", "CROOKED_ARTIFACT", "SEAL_OF_THE_FAMILY"],
  ["TREASURE_TALISMAN", "TREASURE_RING", "TREASURE_ARTIFACT"],
  [
    "BEASTMASTER_CREST_COMMON",
    "BEASTMASTER_CREST_UNCOMMON",
    "BEASTMASTER_CREST_RARE",
    "BEASTMASTER_CREST_EPIC",
    "BEASTMASTER_CREST_LEGENDARY",
  ],
  [
    "RAGGEDY_SHARK_TOOTH_NECKLACE",
    "DULL_SHARK_TOOTH_NECKLACE",
    "HONED_SHARK_TOOTH_NECKLACE",
    "SHARP_SHARK_TOOTH_NECKLACE",
    "RAZOR_SHARP_SHARK_TOOTH_NECKLACE",
  ],
  ["BAT_PERSON_TALISMAN", "BAT_PERSON_RING", "BAT_PERSON_ARTIFACT"],
  ["LUCKY_HOOF", "ETERNAL_HOOF"],
  ["WITHER_ARTIFACT", "WITHER_RELIC"],
  ["WEDDING_RING_0", "WEDDING_RING_2", "WEDDING_RING_4", "WEDDING_RING_7", "WEDDING_RING_9"],
  ["CAMPFIRE_TALISMAN_1", "CAMPFIRE_TALISMAN_4", "CAMPFIRE_TALISMAN_8", "CAMPFIRE_TALISMAN_13", "CAMPFIRE_TALISMAN_21"],
  ["JERRY_TALISMAN_GREEN", "JERRY_TALISMAN_BLUE", "JERRY_TALISMAN_PURPLE", "JERRY_TALISMAN_GOLDEN"],
  ["TITANIUM_TALISMAN", "TITANIUM_RING", "TITANIUM_ARTIFACT", "TITANIUM_RELIC"],
  ["BAIT_RING", "SPIKED_ATROCITY"],
  [
    "MASTER_SKULL_TIER_1",
    "MASTER_SKULL_TIER_2",
    "MASTER_SKULL_TIER_3",
    "MASTER_SKULL_TIER_4",
    "MASTER_SKULL_TIER_5",
    "MASTER_SKULL_TIER_6",
    "MASTER_SKULL_TIER_7",
  ],
  ["SOULFLOW_PILE", "SOULFLOW_BATTERY", "SOULFLOW_SUPERCELL"],
  ["ENDER_ARTIFACT", "ENDER_RELIC"],
  ["POWER_TALISMAN", "POWER_RING", "POWER_ARTIFACT", "POWER_RELIC"],
  ["BINGO_TALISMAN", "BINGO_RING", "BINGO_ARTIFACT", "BINGO_RELIC"],
  ["BURSTSTOPPER_TALISMAN", "BURSTSTOPPER_ARTIFACT"],
  ["ODGERS_BRONZE_TOOTH", "ODGERS_SILVER_TOOTH", "ODGERS_GOLD_TOOTH", "ODGERS_DIAMOND_TOOTH"],
  ["GREAT_SPOOK_TALISMAN", "GREAT_SPOOK_RING", "GREAT_SPOOK_ARTIFACT"],
  ["DRACONIC_TALISMAN", "DRACONIC_RING", "DRACONIC_ARTIFACT"],
  ["BURNING_KUUDRA_CORE", "FIERY_KUUDRA_CORE", "INFERNAL_KUUDRA_CORE"],
  ["VACCINE_TALISMAN", "VACCINE_RING", "VACCINE_ARTIFACT"],
  ["WHITE_GIFT_TALISMAN", "GREEN_GIFT_TALISMAN", "BLUE_GIFT_TALISMAN", "PURPLE_GIFT_TALISMAN", "GOLD_GIFT_TALISMAN"],
  ["GLACIAL_TALISMAN", "GLACIAL_RING", "GLACIAL_ARTIFACT"],
  ["CROPIE_TALISMAN", "SQUASH_RING", "FERMENTO_ARTIFACT"],
  ["KUUDRA_FOLLOWER_ARTIFACT", "KUUDRA_FOLLOWER_RELIC"],
  ["AGARIMOO_TALISMAN", "AGARIMOO_RING", "AGARIMOO_ARTIFACT"],
  ["BLOOD_DONOR_TALISMAN", "BLOOD_DONOR_RING", "BLOOD_DONOR_ARTIFACT"],
  ["LUSH_TALISMAN", "LUSH_RING", "LUSH_ARTIFACT"],
  ["ANITA_TALISMAN", "ANITA_RING", "ANITA_ARTIFACT"],
  ["PESTHUNTER_BADGE", "PESTHUNTER_RING", "PESTHUNTER_ARTIFACT"],
  [
    "NIBBLE_CHOCOLATE_STICK",
    "SMOOTH_CHOCOLATE_BAR",
    "RICH_CHOCOLATE_CHUNK",
    "GANACHE_CHOCOLATE_SLAB",
    "PRESTIGE_CHOCOLATE_REALM",
  ],
  ["COIN_TALISMAN", "RING_OF_COINS", "ARTIFACT_OF_COINS", "RELIC_OF_COINS"],
  ["SCAVENGER_TALISMAN", "SCAVENGER_RING", "SCAVENGER_ARTIFACT"],
  ["EMERALD_RING", "EMERALD_ARTIFACT"],
  ["MINERAL_TALISMAN", "GLOSSY_MINERAL_TALISMAN"],
  ["HASTE_RING", "HASTE_ARTIFACT"],
];

// Source: SkyCrypt src/constants/accessories.js ACCESSORY_ALIASES (alternate item IDs of the same accessory).
const ACCESSORY_ALIASES = {
  WEDDING_RING_0: ["WEDDING_RING_1"],
  WEDDING_RING_2: ["WEDDING_RING_3"],
  WEDDING_RING_4: ["WEDDING_RING_5", "WEDDING_RING_6"],
  WEDDING_RING_7: ["WEDDING_RING_8"],
  CAMPFIRE_TALISMAN_1: ["CAMPFIRE_TALISMAN_2", "CAMPFIRE_TALISMAN_3"],
  CAMPFIRE_TALISMAN_4: ["CAMPFIRE_TALISMAN_5", "CAMPFIRE_TALISMAN_6", "CAMPFIRE_TALISMAN_7"],
  CAMPFIRE_TALISMAN_8: ["CAMPFIRE_TALISMAN_9", "CAMPFIRE_TALISMAN_10", "CAMPFIRE_TALISMAN_11", "CAMPFIRE_TALISMAN_12"],
  CAMPFIRE_TALISMAN_13: [
    "CAMPFIRE_TALISMAN_14",
    "CAMPFIRE_TALISMAN_15",
    "CAMPFIRE_TALISMAN_16",
    "CAMPFIRE_TALISMAN_17",
    "CAMPFIRE_TALISMAN_18",
    "CAMPFIRE_TALISMAN_19",
    "CAMPFIRE_TALISMAN_20",
  ],
  CAMPFIRE_TALISMAN_21: [
    "CAMPFIRE_TALISMAN_22",
    "CAMPFIRE_TALISMAN_23",
    "CAMPFIRE_TALISMAN_24",
    "CAMPFIRE_TALISMAN_25",
    "CAMPFIRE_TALISMAN_26",
    "CAMPFIRE_TALISMAN_27",
    "CAMPFIRE_TALISMAN_28",
    "CAMPFIRE_TALISMAN_29",
  ],
  PARTY_HAT_CRAB: ["PARTY_HAT_CRAB_ANIMATED", "PARTY_HAT_SLOTH", "BALLOON_HAT_2024"],
  PIGGY_BANK: ["BROKEN_PIGGY_BANK", "CRACKED_PIGGY_BANK"],
  DANTE_TALISMAN: ["DANTE_RING"],
};

const ALIAS_TO_CANONICAL = new Map();
for (const [canonical, aliases] of Object.entries(ACCESSORY_ALIASES)) {
  for (const alias of aliases) ALIAS_TO_CANONICAL.set(alias, canonical);
}

// id -> { family index, position inside the family } for the dedup pass.
const FAMILY_POSITION = new Map();
for (const [familyIndex, family] of ACCESSORY_UPGRADE_FAMILIES.entries()) {
  for (const [position, id] of family.entries()) {
    FAMILY_POSITION.set(id, { family: familyIndex, position });
  }
}

const UNKNOWN_TIER_ID_CAP = 25;

function rarityRank(tier) {
  if (typeof tier !== "string") return -1;
  return RARITY_ORDER.indexOf(tier);
}

function bumpRarity(tier) {
  const index = RARITY_ORDER.indexOf(tier);
  if (index === -1 || index + 1 >= RARITY_ORDER.length) return tier;
  return RARITY_ORDER[index + 1];
}

// Source: SkyCrypt src/helper.js getMagicalPower (Hegemony Artifact provides double MP).
function magicalPowerFor(tier, id) {
  const base = MAGICAL_POWER_BY_RARITY[tier] ?? 0;
  return id === "HEGEMONY_ARTIFACT" ? 2 * base : base;
}

function isAbicaseId(id) {
  // SkyCrypt matches the exact id ABICASE (the case model lives in
  // ExtraAttributes.model); the prefix match also tolerates model-suffixed ids.
  return id === "ABICASE" || id.startsWith("ABICASE_");
}

/**
 * Computes Magical Power from decoded accessory-bag summaries.
 *
 * @param accessories decoded bag item summaries ({ skyblock_id, recombobulated })
 * @param member the profile member (Abiphone contacts, consumed Rift Prism)
 * @param catalog Map of item id -> catalog record with a `tier` from /v2/resources/skyblock/items
 * @returns computed MP breakdown, or null when the catalog is unavailable
 */
export function computeMagicalPower(accessories, member, catalog) {
  if (!(catalog instanceof Map) || catalog.size === 0) return null;

  const candidates = [];
  for (const item of Array.isArray(accessories) ? accessories : []) {
    const rawId = typeof item?.skyblock_id === "string" ? item.skyblock_id.trim().toUpperCase() : "";
    if (!rawId) continue;
    const canonicalId = ALIAS_TO_CANONICAL.get(rawId) || rawId;
    const catalogTier = catalog.get(rawId)?.tier ?? catalog.get(canonicalId)?.tier;
    const baseTier = typeof catalogTier === "string" ? catalogTier.toLowerCase() : null;
    const tier = item.recombobulated === true && baseTier ? bumpRarity(baseTier) : baseTier;
    candidates.push({ id: rawId, canonical_id: canonicalId, tier });
  }

  // Pass 1 - exact duplicates (including aliased ids): only the single
  // highest-rarity copy of an accessory can count.
  const byCanonicalId = new Map();
  let duplicatesIgnored = 0;
  for (const candidate of candidates) {
    const existing = byCanonicalId.get(candidate.canonical_id);
    if (!existing) {
      byCanonicalId.set(candidate.canonical_id, candidate);
      continue;
    }
    duplicatesIgnored += 1;
    if (rarityRank(candidate.tier) > rarityRank(existing.tier)) {
      byCanonicalId.set(candidate.canonical_id, candidate);
    }
  }

  // Pass 2 - upgrade families: only the highest family tier counts; owning
  // both WOLF_TALISMAN and WOLF_RING grants MP for the ring alone.
  const counted = [];
  const familyBest = new Map();
  for (const candidate of byCanonicalId.values()) {
    const position = FAMILY_POSITION.get(candidate.canonical_id);
    if (!position) {
      counted.push(candidate);
      continue;
    }
    const best = familyBest.get(position.family);
    if (!best) {
      familyBest.set(position.family, { candidate, position: position.position });
      continue;
    }
    duplicatesIgnored += 1;
    if (position.position > best.position) {
      familyBest.set(position.family, { candidate, position: position.position });
    }
  }
  for (const { candidate } of familyBest.values()) counted.push(candidate);

  const perRarity = {};
  for (const rarity of Object.keys(MAGICAL_POWER_BY_RARITY)) {
    perRarity[rarity] = { count: 0, magical_power: 0 };
  }

  const unknownTierIds = new Set();
  let accessoriesMagicalPower = 0;
  let hegemonyMagicalPower = 0;
  let hasAbicase = false;

  for (const item of counted) {
    if (isAbicaseId(item.canonical_id)) hasAbicase = true;
    if (item.tier === null) {
      unknownTierIds.add(item.id);
      continue;
    }
    const magicalPower = magicalPowerFor(item.tier, item.canonical_id);
    accessoriesMagicalPower += magicalPower;
    if (item.canonical_id === "HEGEMONY_ARTIFACT") hegemonyMagicalPower = magicalPower;
    if (perRarity[item.tier]) {
      perRarity[item.tier].count += 1;
      perRarity[item.tier].magical_power += magicalPower;
    }
  }

  // Source: SkyCrypt src/stats/missing.js magical_power (Abicase adds
  // floor(active Abiphone contacts / 2); a consumed Rift Prism adds 11; the
  // Hegemony double already sits inside the accessory sum).
  const activeContacts = member?.nether_island_player_data?.abiphone?.active_contacts;
  const contactCount = Array.isArray(activeContacts) ? activeContacts.length : optionalNumber(activeContacts);
  const abicaseMagicalPower = hasAbicase && contactCount ? Math.floor(contactCount / 2) : 0;
  const riftPrismMagicalPower = member?.rift?.access?.consumed_prism ? 11 : 0;

  return {
    total: accessoriesMagicalPower + abicaseMagicalPower + riftPrismMagicalPower,
    accessory_magical_power: accessoriesMagicalPower,
    accessories_counted: counted.length,
    duplicates_ignored: duplicatesIgnored,
    per_rarity: perRarity,
    components: {
      // Informational: already included in accessory_magical_power.
      hegemony: hegemonyMagicalPower,
      abicase: abicaseMagicalPower,
      rift_prism: riftPrismMagicalPower,
    },
    unknown_tier_ids: [...unknownTierIds].sort().slice(0, UNKNOWN_TIER_ID_CAP),
    table_source: "SkyCrypt MAGICAL_POWER/accessoryUpgrades/ACCESSORY_ALIASES tables",
  };
}
