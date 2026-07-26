import {
  createTruncationReport,
  firstNumber,
  isoFromUnixMs,
  normalizeUnixMilliseconds,
  objectOrEmpty,
  optionalNumber,
  paginateRecords,
  pick,
  round,
  sanitize,
  stringOrNull,
} from "./util.js";
import { normalizeUuid } from "./params.js";
import {
  cleanItemName,
  compactAccessories,
  compactGear,
  decodeInventoryBlob,
  expandNbtItem,
  formatItemId,
} from "./items.js";
import { LADDER_SOURCES, TABLE_VERSION, cosmeticOverflow, levelFromLadder } from "./levels.js";
import { computeBestiary } from "./bestiary.js";

export const PROFILE_SECTIONS = new Set([
  "overview",
  "skills",
  "slayers",
  "dungeons",
  "collections",
  "mining",
  "forge",
  "foraging",
  "stats",
  "gear",
  "pets",
  "accessories",
  "bestiary",
  "rift",
  "crimson_isle",
  "farming",
  "minions",
  "trophy_fish",
  "chocolate_factory",
  "hunting",
  "effects",
]);

export function compactGarden(garden) {
  const value = objectOrEmpty(garden);
  const report = createTruncationReport();
  const sanitized = sanitize({
    uuid: value.uuid || null,
    garden_experience: value.garden_experience,
    commission_data: value.commission_data,
    composter_data: value.composter_data,
    active_commissions: value.active_commissions,
    resources_collected: value.resources_collected,
    crop_upgrade_levels: value.crop_upgrade_levels,
    unlocked_plots_ids: value.unlocked_plots_ids,
    unlocked_barn_skins: value.unlocked_barn_skins,
    selected_barn_skin: value.selected_barn_skin,
    additional_fields: Object.fromEntries(Object.entries(value).filter(([key]) => !new Set([
      "uuid", "garden_experience", "commission_data", "composter_data", "active_commissions", "resources_collected",
      "crop_upgrade_levels", "unlocked_plots_ids", "unlocked_barn_skins", "selected_barn_skin",
    ]).has(key))),
  }, 10, 2_000, report);
  // The flag is attached after sanitize runs so it is not itself subject to
  // the depth/entry limits it describes.
  return { ...sanitized, garden_truncated: report.truncated };
}

const MUSEUM_ITEMS_PER_ENTRY = 8;
// Full detail expands every decoded item (lore, ExtraAttributes, NBT), so the
// per-entry cap drops alongside the route's 5-entries-per-page cap.
const MUSEUM_FULL_ITEMS_PER_ENTRY = 4;

export async function compactMuseum(profileData, query, page, limit, detail = "summary") {
  const members = [];
  const entries = [];
  for (const [memberUuid, rawMuseum] of Object.entries(objectOrEmpty(profileData))) {
    const museum = objectOrEmpty(rawMuseum);
    const memberEntries = [];
    for (const [itemId, itemData] of Object.entries(objectOrEmpty(museum.items))) {
      memberEntries.push({
        member_uuid: normalizeUuid(memberUuid),
        source: "items",
        item_id: itemId,
        donated_time: optionalNumber(itemData?.donated_time),
        // Hypixel only sets borrowing on loaned donations; absence means owned.
        borrowing: itemData?.borrowing === true,
        featured_slot: stringOrNull(itemData?.featured_slot),
        blob: itemData?.items ?? null,
      });
    }
    for (const [index, special] of (Array.isArray(museum.special) ? museum.special : []).entries()) {
      memberEntries.push({
        member_uuid: normalizeUuid(memberUuid),
        source: "special",
        special_index: index,
        item_id: null,
        donated_time: optionalNumber(special?.donated_time),
        borrowing: special?.borrowing === true,
        featured_slot: stringOrNull(special?.featured_slot),
        blob: special?.items ?? null,
      });
    }
    members.push({
      member_uuid: normalizeUuid(memberUuid),
      value: optionalNumber(museum.value),
      appraisal: museum.appraisal ?? null,
      total_entries: memberEntries.length,
    });
    entries.push(...memberEntries);
  }

  // Query matches identifiers only. It previously ran over JSON.stringify of the
  // entry, which meant it searched truncated base64 — never a useful match.
  const filtered = entries.filter((entry) => !query ||
    `${entry.item_id || ""} ${entry.source} ${entry.member_uuid}`.toLowerCase().includes(query));
  const pagination = paginateRecords(filtered, page, limit);

  // Decode only this page. Museums hold hundreds of items; decoding all of them
  // would be base64 + gzip + a full NBT walk each. A single entry can hold more
  // than one item — a donated armor set carries every piece in one blob — so
  // report the whole list rather than just the first. Cap and flag per entry,
  // mirroring compactNbtItem's attributes/enchantments caps in items.js, so a
  // uniform page of multi-piece sets can't push a response over the size cap.
  const perEntryCap = detail === "full" ? MUSEUM_FULL_ITEMS_PER_ENTRY : MUSEUM_ITEMS_PER_ENTRY;
  const items = await Promise.all(pagination.items.map(async ({ blob, ...entry }) => {
    if (!blob) {
      return { ...entry, blob_present: false, decoded_items: [], decoded_items_truncated: false, decode_error: null };
    }
    const decoded = await decodeInventoryBlob(blob);
    const pageRecords = decoded.records.slice(0, perEntryCap);
    const decodedItems = detail === "full"
      ? await Promise.all(pageRecords.map((record) => expandNbtItem(record)))
      : pageRecords.map((record) => record.summary);
    return {
      ...entry,
      blob_present: decoded.present,
      decoded_items: decodedItems,
      decoded_items_truncated: decoded.records.length > perEntryCap,
      decode_error: decoded.error,
    };
  }));

  return {
    members,
    detail,
    query: query || null,
    ...pagination,
    items,
  };
}

export function flattenCollections(collections) {
  const output = [];
  for (const [categoryId, categoryValue] of Object.entries(objectOrEmpty(collections))) {
    const category = objectOrEmpty(categoryValue);
    const items = objectOrEmpty(category.items);
    if (!Object.keys(items).length) {
      output.push({ category_id: categoryId, id: categoryId, ...category });
      continue;
    }
    for (const [itemId, itemValue] of Object.entries(items)) {
      output.push({
        category_id: categoryId,
        category_name: category.name || null,
        id: itemId,
        ...objectOrEmpty(itemValue),
      });
    }
  }
  return output;
}

export function compactCollectionItem(item) {
  return sanitize(pick(item, [
    "category_id", "category_name", "id", "name", "maxTiers", "tiers", "bossCollection", "mobs",
  ]), 7, 300);
}

function memberCollectionMap(member) {
  const candidate = member?.collection ?? member?.player_data?.collection;
  return candidate && typeof candidate === "object" && !Array.isArray(candidate) ? candidate : null;
}

// Collection progress is shared across a co-op: the game unlocks tiers from
// the profile-wide total, while each member's collection map only records
// their own contribution. Per-member amounts therefore understate progress,
// and the actual unlocked tiers live in member.player_data.unlocked_coll_tiers
// (strings like "LOG:4"; a collection id may itself contain a colon, e.g.
// "INK_SACK:3:4", so the tier is the segment after the LAST colon).
function parseUnlockedCollectionTiers(member) {
  const raw = member?.player_data?.unlocked_coll_tiers;
  const present = Array.isArray(raw);
  const tiers = new Map();
  if (present) {
    for (const entry of raw) {
      if (typeof entry !== "string") continue;
      const splitAt = entry.lastIndexOf(":");
      if (splitAt <= 0) continue;
      const collectionId = entry.slice(0, splitAt).toUpperCase();
      const tier = optionalNumber(entry.slice(splitAt + 1));
      if (tier === null) continue;
      if (!tiers.has(collectionId) || tier > tiers.get(collectionId)) tiers.set(collectionId, tier);
    }
  }
  return { present, tiers };
}

export function compactPlayerCollections(profile, member, resource, query, page, limit, includeUnlocks = false) {
  const memberCollections = memberCollectionMap(member);
  const collectionApiPresent = memberCollections !== null;
  const rawCollections = memberCollections || {};
  const resourceRecords = resource ? flattenCollections(resource.collections || {}) : [];
  const resourceById = new Map(resourceRecords.map((record) => [String(record.id || "").toUpperCase(), record]));

  const claimed = parseUnlockedCollectionTiers(member);

  const membersMap = objectOrEmpty(profile?.members);
  const totalMembers = Object.keys(membersMap).length;
  const coopAmounts = new Map();
  let membersWithCollectionData = 0;
  for (const coopMember of Object.values(membersMap)) {
    const coopCollections = memberCollectionMap(coopMember);
    if (!coopCollections) continue;
    membersWithCollectionData += 1;
    for (const [collectionId, rawAmount] of Object.entries(coopCollections)) {
      const amount = optionalNumber(rawAmount);
      if (amount === null) continue;
      const key = collectionId.toUpperCase();
      coopAmounts.set(key, (coopAmounts.get(key) || 0) + amount);
    }
  }

  const dataPresent = collectionApiPresent || claimed.present || membersWithCollectionData > 0;

  // Records come from the union of the queried member's own amounts, the
  // co-op-summed amounts, and the claimed tiers -- a collection another
  // member ground out alone must still appear for this profile.
  const idsByUpper = new Map();
  for (const collectionId of Object.keys(rawCollections)) idsByUpper.set(collectionId.toUpperCase(), collectionId);
  for (const collectionId of coopAmounts.keys()) {
    if (!idsByUpper.has(collectionId)) idsByUpper.set(collectionId, collectionId);
  }
  for (const collectionId of claimed.tiers.keys()) {
    if (!idsByUpper.has(collectionId)) idsByUpper.set(collectionId, collectionId);
  }

  const allCollections = [...idsByUpper.entries()]
    .map(([upperId, collectionId]) => {
      const memberAmount = Object.hasOwn(rawCollections, collectionId)
        ? optionalNumber(rawCollections[collectionId])
        : null;
      if (memberAmount === null && !coopAmounts.has(upperId) && !claimed.tiers.has(upperId)) return null;
      const coopTotalAmount = coopAmounts.has(upperId) ? coopAmounts.get(upperId) : null;
      const claimedTier = claimed.present ? claimed.tiers.get(upperId) ?? 0 : null;
      const metadata = resourceById.get(upperId) || null;
      const tiers = Array.isArray(metadata?.tiers)
        ? metadata.tiers
            .map((tier, index) => compactCollectionTier(tier, index))
            .filter(Boolean)
            .sort((left, right) => left.tier - right.tier)
        : [];
      const tierFor = (amount) => {
        if (amount === null || !tiers.length) return null;
        return tiers.filter((tier) => tier.amount_required !== null && amount >= tier.amount_required).at(-1)?.tier ?? 0;
      };
      const achieved = memberAmount === null
        ? null
        : tiers.filter((tier) => tier.amount_required !== null && memberAmount >= tier.amount_required).at(-1) || null;
      const next = memberAmount === null
        ? null
        : tiers.find((tier) => tier.amount_required !== null && memberAmount < tier.amount_required) || null;
      const unlockedRewards = includeUnlocks && memberAmount !== null
        ? [...new Set(tiers
            .filter((tier) => tier.amount_required !== null && memberAmount >= tier.amount_required)
            .flatMap((tier) => tier.unlocks)
          )].slice(0, 200)
        : [];

      return {
        collection_id: collectionId,
        name: cleanItemName(metadata?.name) || formatItemId(collectionId),
        category_id: metadata?.category_id || null,
        category_name: cleanItemName(metadata?.category_name) || null,
        // amount keeps its original semantic: the queried member's own
        // contribution (null when only co-op partners or claimed tiers know
        // this collection). member_amount is its explicit alias.
        amount: memberAmount,
        member_amount: memberAmount,
        coop_total_amount: coopTotalAmount,
        // Tier truth from unlocked_coll_tiers; null when Hypixel exposed no
        // claimed-tier list at all.
        claimed_tier: claimedTier,
        // Tier the profile-wide (co-op summed) amount reaches on the resource
        // ladder. On co-op profiles this -- not the member-amount-inferred
        // achieved_tier -- matches what the game shows.
        coop_achieved_tier: tierFor(coopTotalAmount),
        achieved_tier: memberAmount === null ? null : achieved?.tier ?? (tiers.length ? 0 : null),
        max_tier: optionalNumber(metadata?.maxTiers) ?? (tiers.length ? tiers.at(-1).tier : null),
        next_tier: next?.tier ?? null,
        next_tier_requirement: next?.amount_required ?? null,
        amount_to_next_tier: next?.amount_required === null || next?.amount_required === undefined
          ? null
          : Math.max(0, next.amount_required - memberAmount),
        unlocked_rewards: unlockedRewards,
        next_tier_unlocks: includeUnlocks && next ? next.unlocks : [],
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.collection_id.localeCompare(right.collection_id));
  const matchingCollections = allCollections.filter((entry) =>
    !query || `${entry.collection_id} ${entry.name || ""} ${entry.category_name || ""}`.toLowerCase().includes(query)
  );
  const pagination = paginateRecords(matchingCollections, page, limit);

  return {
    payload_kind: "player_collections",
    payload_version: "1",
    data_present: dataPresent,
    available: dataPresent,
    collection_api_present: collectionApiPresent,
    claimed_tiers_present: claimed.present,
    members_with_collection_data: membersWithCollectionData,
    total_members: totalMembers,
    coop_totals_complete: totalMembers > 0 && membersWithCollectionData === totalMembers,
    resource_metadata_available: resourceRecords.length > 0,
    source_last_updated: optionalNumber(resource?.lastUpdated),
    source_version: stringOrNull(resource?.version),
    unlocks_included: includeUnlocks,
    query: query || null,
    total_distinct_collections: allCollections.length,
    total_collected: allCollections.reduce((sum, entry) => sum + (entry.member_amount ?? 0), 0),
    coop_total_collected: membersWithCollectionData > 0
      ? allCollections.reduce((sum, entry) => sum + (entry.coop_total_amount ?? 0), 0)
      : null,
    page: pagination.page,
    limit: pagination.limit,
    total_items: pagination.total_items,
    total_pages: pagination.total_pages,
    has_more: pagination.has_more,
    collections: pagination.items,
    reason: dataPresent
      ? null
      : "Hypixel did not expose player collection amounts, co-op collection amounts, or unlocked collection tiers for this profile. The Collection API setting may be disabled.",
  };
}

function compactCollectionTier(tier, index) {
  if (!tier || typeof tier !== "object") return null;
  const tierNumber = optionalNumber(tier.tier ?? tier.level) ?? index + 1;
  const amountRequired = optionalNumber(
    tier.amountRequired ?? tier.amount_required ?? tier.requiredAmount ?? tier.required_amount
  );
  const rawUnlocks = Array.isArray(tier.unlocks) ? tier.unlocks : [];
  const unlocks = rawUnlocks
    .map((unlock) => collectionUnlockText(unlock))
    .filter(Boolean)
    .slice(0, 100);
  return { tier: tierNumber, amount_required: amountRequired, unlocks };
}

function collectionUnlockText(unlock) {
  if (typeof unlock === "string") return cleanItemName(unlock);
  if (unlock === null || unlock === undefined) return null;
  try {
    return JSON.stringify(sanitize(unlock, 4, 50)).slice(0, 500);
  } catch {
    return String(unlock).slice(0, 500);
  }
}

export function buildOverview(profile, member, skillResource = null) {
  const experience = optionalNumber(member?.leveling?.experience);
  const currencies = member?.currencies || {};
  const purse = optionalNumber(currencies.coin_purse ?? member?.coin_purse);
  const profileBank = optionalNumber(profile?.banking?.balance);
  const personalBank = optionalNumber(
    member?.profile?.bank_account ??
    member?.profile?.personal_bank ??
    member?.bank_account
  );
  const availableBankParts = [profileBank, personalBank].filter((value) => value !== null);
  const availableBankBalance = availableBankParts.length
    ? availableBankParts.reduce((total, value) => total + value, 0)
    : null;
  const combinedBankBalance = profileBank !== null && personalBank !== null
    ? profileBank + personalBank
    : null;
  const bankBalanceScope = combinedBankBalance !== null
    ? "combined"
    : personalBank !== null
      ? "personal_only"
      : profileBank !== null
        ? "profile_only"
        : "unavailable";

  return {
    first_join: optionalNumber(member?.first_join),
    last_save: optionalNumber(member?.last_save),
    skyblock_experience: experience,
    skyblock_level_exact: experience === null ? null : experience / 100,
    skyblock_level_whole: experience === null ? null : Math.floor(experience / 100),
    skyblock_xp_into_current_level: experience === null ? null : experience % 100,
    currencies: sanitize({
      ...currencies,
      coin_purse: purse,
      bank_balance: availableBankBalance,
      bank_balance_scope: bankBalanceScope,
      personal_bank_balance: personalBank,
      profile_bank_balance: profileBank,
      combined_bank_balance: combinedBankBalance,
      bank_data_complete: combinedBankBalance !== null,
    }, 4),
    fairy_souls: sanitize(member?.fairy_soul || {
      total_collected: member?.fairy_souls_collected,
      unspent_souls: member?.fairy_souls,
    }, 3),
    skills: compactSkills(member, skillResource),
    slayers: compactSlayers(member),
    dungeons: compactDungeons(member),
    // Counts-only potion/buff summary; full capped lists live in
    // section=effects.
    effects: compactEffectsSummary(member),
  };
}

export async function buildSection(section, profile, member, skillResource = null) {
  switch (section) {
    case "overview":
      // The skill resource must flow through here exactly as it does on the
      // summary route; dropping it made section=overview report every skill
      // level as null even though the XP was present.
      return buildOverview(profile, member, skillResource);
    case "skills":
      return compactSkills(member, skillResource);
    case "slayers":
      return compactSlayers(member);
    case "dungeons":
      // The dedicated section carries per-floor detail (best runs, class
      // damage records); the overview embed of compactDungeons stays lean.
      return compactDungeons(member, { includeFloorDetail: true });
    case "collections":
      return sanitize(member.collection || member.player_data?.collection || {}, 4, 500);
    case "mining":
      return compactMining(member);
    case "forge":
      return compactForge(member);
    case "foraging":
      return compactForaging(member);
    case "stats":
      return compactStats(member, skillResource);
    case "gear":
      return await compactGear(member);
    case "pets":
      return compactPets(member);
    case "accessories":
      return await compactAccessories(member);
    case "bestiary":
      return compactBestiarySection(member);
    case "effects":
      return compactEffects(member);
    case "rift": {
      const report = createTruncationReport();
      return { ...sanitize(member.rift || {}, 6, 500, report), payload_truncated: report.truncated };
    }
    case "crimson_isle":
      return compactCrimsonIsle(member);
    case "farming":
      return compactFarming(member);
    case "minions":
      return compactMinions(profile);
    case "trophy_fish":
      return compactTrophyFish(member);
    case "chocolate_factory":
      return compactChocolateFactory(member);
    case "hunting":
      return compactHunting(member);
    default:
      return {};
  }
}

// ---------------------------------------------------------------------------
// Per-player skill caps. The Hypixel skills resource tabulates the absolute
// ladder maximum (Farming 60, Taming 60), but the cap an individual player can
// actually level to depends on member data:
// - Farming: 50 + member.jacobs_contest.perks.farming_level_cap (0-10).
//   Source: SkyCrypt v1 src/stats/skills.js getSkills
//   (DEFAULT_SKILL_CAPS.farming + jacobs_contest.perks.farming_level_cap).
// - Taming: 50 + unique member.pets_data.pet_care.pet_types_sacrificed (max
//   +10, so 60). Source: hypixel-api-reborn SkyBlockMember.ts (tamingCap:
//   petCare.petsSacrificed.length) with the cap applied as 50 + tamingCap in
//   SkyBlockMemberPlayerDataSkills.ts. SkyCrypt v1 reads the equivalent
//   skyblock_domesticator achievement instead, which lives on the /v2/player
//   endpoint this Worker does not call.
// Hypixel writes both source fields on first purchase/sacrifice, so with
// member data present an absent field is a real zero bonus (cap 50) --
// matching how SkyCrypt reads the same payload, not a zero substituted for
// missing data.
// ---------------------------------------------------------------------------
const SKILL_CAP_BASE = 50;
const SKILL_CAP_MAX_BONUS = 10;

function playerSkillCaps(member) {
  const farmingBonusRaw = optionalNumber(member?.jacobs_contest?.perks?.farming_level_cap) ?? 0;
  const farmingBonus = Math.max(0, Math.min(SKILL_CAP_MAX_BONUS, farmingBonusRaw));
  const sacrificedRaw = member?.pets_data?.pet_care?.pet_types_sacrificed;
  const sacrificedCount = Array.isArray(sacrificedRaw)
    ? new Set(sacrificedRaw.map((entry) => String(entry))).size
    : 0;
  const tamingBonus = Math.max(0, Math.min(SKILL_CAP_MAX_BONUS, sacrificedCount));

  return {
    farming: {
      effective: SKILL_CAP_BASE + farmingBonus,
      base: SKILL_CAP_BASE,
      bonus: farmingBonus,
      source: "member.jacobs_contest.perks.farming_level_cap",
    },
    taming: {
      effective: SKILL_CAP_BASE + tamingBonus,
      base: SKILL_CAP_BASE,
      bonus: tamingBonus,
      source: "member.pets_data.pet_care.pet_types_sacrificed",
      pet_types_sacrificed_count: sacrificedCount,
    },
  };
}

function compactSkills(member, skillResource = null) {
  const experience = collectSkillExperience(member);
  const caps = playerSkillCaps(member);
  const skills = {};

  for (const [name, xp] of Object.entries(experience).sort(([left], [right]) => left.localeCompare(right))) {
    const cap = caps[name] || null;
    skills[name] = {
      experience: xp,
      ...calculateSkillProgress(name, xp, skillResource, cap ? cap.effective : null),
      ...(cap ? { level_cap: cap } : {}),
    };
  }

  const averageNames = [
    "farming",
    "mining",
    "combat",
    "foraging",
    "fishing",
    "enchanting",
    "alchemy",
    "taming",
  ];
  const calculated = averageNames
    .map((name) => skills[name])
    .filter((entry) => entry && entry.level !== null && entry.level !== undefined);
  const skillAverage = calculated.length
    ? calculated.reduce((sum, entry) => sum + entry.level, 0) / calculated.length
    : null;
  const trueSkillAverage = calculated.length
    ? calculated.reduce((sum, entry) => sum + (entry.level_with_progress ?? entry.level), 0) / calculated.length
    : null;

  return {
    available: Object.keys(skills).length > 0,
    levels_calculated: Object.values(skills).some((entry) => entry.level !== null),
    threshold_source: skillResource ? "Hypixel skills resource" : null,
    skill_average: skillAverage === null ? null : round(skillAverage, 2),
    true_skill_average: trueSkillAverage === null ? null : round(trueSkillAverage, 2),
    counted_skills: calculated.length,
    skills,
    reason: Object.keys(skills).length
      ? skillResource
        ? null
        : "Skill XP was exposed, but the live Hypixel skill thresholds could not be loaded, so levels were not guessed."
      : "Hypixel did not expose skill experience for this player on this profile.",
  };
}

function collectSkillExperience(member) {
  const result = {};
  const modern = member?.player_data?.experience;

  if (modern && typeof modern === "object" && !Array.isArray(modern)) {
    for (const [key, value] of Object.entries(modern)) {
      const name = normalizeSkillName(key);
      const xp = optionalNumber(value && typeof value === "object" ? value.experience ?? value.xp : value);
      if (name && xp !== null) result[name] = xp;
    }
  }

  for (const [key, value] of Object.entries(member || {})) {
    if (!key.startsWith("experience_skill_")) continue;
    const name = normalizeSkillName(key.replace("experience_skill_", ""));
    const xp = optionalNumber(value);
    if (name && xp !== null && result[name] === undefined) result[name] = xp;
  }

  return result;
}

function normalizeSkillName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/^skill_/, "")
    .replace(/[^a-z0-9_]/g, "");
}

function calculateSkillProgress(skillName, experience, skillResource, playerCap = null) {
  const definitions = skillResource?.skills;
  if (!definitions || typeof definitions !== "object") {
    return emptySkillProgress();
  }

  const definitionEntry = Object.entries(definitions).find(([key, value]) =>
    normalizeSkillName(key) === skillName || normalizeSkillName(value?.name) === skillName
  );
  const definition = definitionEntry?.[1];
  const levels = Array.isArray(definition?.levels) ? [...definition.levels] : [];
  if (!levels.length) return emptySkillProgress();

  let cumulative = 0;
  const thresholds = levels
    .map((entry, index) => {
      const level = optionalNumber(entry?.level) ?? index + 1;
      const explicitTotal = optionalNumber(
        entry?.totalExpRequired ?? entry?.total_exp_required ?? entry?.totalExperienceRequired
      );
      const required = optionalNumber(
        entry?.requiredExp ?? entry?.required_exp ?? entry?.experienceRequired ?? entry?.experience
      );
      if (explicitTotal !== null) cumulative = explicitTotal;
      else if (required !== null) cumulative += required;
      else return null;
      return { level, total: cumulative };
    })
    .filter(Boolean)
    .sort((left, right) => left.level - right.level);
  if (!thresholds.length) return emptySkillProgress();

  const resourceMaxLevel = optionalNumber(definition.maxLevel ?? definition.max_level) ?? thresholds.at(-1).level;
  // A per-player cap (Farming/Taming, see playerSkillCaps) lowers the
  // resource maximum; it never raises it past what the ladder tabulates.
  const maxLevel = playerCap === null ? resourceMaxLevel : Math.max(0, Math.min(resourceMaxLevel, playerCap));

  let level = 0;
  let currentThreshold = 0;
  let nextThreshold = null;
  for (const threshold of thresholds) {
    // Stop at the effective cap, mirroring levelFromLadder: walking past it
    // would detach xp_into_level/progress from the level being reported.
    if (threshold.level > maxLevel) break;
    if (experience < threshold.total) {
      nextThreshold = threshold.total;
      break;
    }
    level = threshold.level;
    currentThreshold = threshold.total;
  }

  const cappedLevel = Math.min(level, maxLevel);
  const xpIntoLevel = nextThreshold === null ? Math.max(0, experience - currentThreshold) : experience - currentThreshold;
  const xpForNextLevel = nextThreshold === null ? null : nextThreshold - currentThreshold;
  const progress = xpForNextLevel && xpForNextLevel > 0
    ? Math.max(0, Math.min(1, xpIntoLevel / xpForNextLevel))
    : 0;

  return {
    level: cappedLevel,
    level_with_progress: round(cappedLevel + (cappedLevel < maxLevel ? progress : 0), 4),
    max_level: maxLevel,
    xp_into_level: xpIntoLevel,
    xp_for_next_level: xpForNextLevel,
    progress_to_next_level: cappedLevel >= maxLevel ? 1 : round(progress, 6),
  };
}

function emptySkillProgress() {
  return {
    level: null,
    level_with_progress: null,
    max_level: null,
    xp_into_level: null,
    xp_for_next_level: null,
    progress_to_next_level: null,
  };
}

function compactMining(member) {
  const core = objectOrEmpty(member?.mining_core || member?.mining);
  const skillTree = objectOrEmpty(member?.skill_tree);
  const nodeGroups = objectOrEmpty(skillTree.nodes);
  const nodes = objectOrEmpty(nodeGroups.mining || core.nodes);
  const selectedAbilities = objectOrEmpty(skillTree.selected_ability);
  const perks = compactTreePerks(nodes, "mining", ["core_of_the_mountain"]);
  const hotmLevel = optionalNumber(
    nodes.core_of_the_mountain ?? core.core_of_the_mountain ?? core.level ?? core.tier
  );
  const hasTreeData = Object.keys(nodes).length > 0;
  const hasCoreProgress = Object.keys(core).some((key) => key !== "received_free_tier");
  const forge = compactForge(member);

  return {
    available: hasTreeData || hasCoreProgress || forge.forge_api_present,
    hotm_available: hasTreeData || hasCoreProgress,
    hotm: {
      level: hotmLevel,
      experience: firstNumber(
        readTreeScopedValue(skillTree, "experience", "mining"),
        core.experience,
        core.hotm_experience
      ),
      selected_ability: stringOrNull(
        selectedAbilities.mining ?? core.selected_ability ?? core.selected_pickaxe_ability
      ),
      tokens_available: firstNumber(
        readTreeScopedValue(skillTree, "tokens", "mining"),
        core.tokens
      ),
      tokens_spent: firstNumber(
        readTreeScopedValue(skillTree, "tokens_spent", "mining"),
        core.tokens_spent
      ),
      unlocked_perks: perks.length,
      perks,
      nodes: sanitize(nodes, 4, 400),
    },
    powder: {
      mithril: compactPowder(core, "mithril"),
      gemstone: compactPowder(core, "gemstone"),
      glacite: compactPowder(core, "glacite"),
    },
    crystals: sanitize(core.crystals || {}, 5, 100),
    biomes: sanitize(core.biomes || {}, 5, 100),
    glacite: sanitize(member?.glacite_player_data || {}, 6, 500),
    forge,
    mining_core: sanitize(core, 7, 700),
    reason: hasTreeData || hasCoreProgress
      ? null
      : core.received_free_tier === true
        ? "Hypixel returned only the free-tier flag. The profile's Skills API setting may not be exposing progression data."
        : "Hypixel did not expose Heart of the Mountain progression for this player on this profile.",
  };
}

function compactForge(member) {
  const candidates = [
    ["forge.forge_processes", member?.forge?.forge_processes],
    ["forge", member?.forge],
    ["forge_processes", member?.forge_processes],
    ["player_data.forge.forge_processes", member?.player_data?.forge?.forge_processes],
    ["mining_core.forge_processes", member?.mining_core?.forge_processes],
    ["mining.forge_processes", member?.mining?.forge_processes],
  ];
  const source = candidates.find(([, value]) => value && typeof value === "object" && !Array.isArray(value));
  const checkedAt = Date.now();

  if (!source) {
    return {
      available: false,
      forge_api_present: false,
      source_path: null,
      checked_at: checkedAt,
      checked_at_iso: isoFromUnixMs(checkedAt),
      active_processes: 0,
      slots_used: 0,
      processes: [],
      reason: "Hypixel did not expose Forge process data for this player on this profile.",
    };
  }

  const [sourcePath, root] = source;
  const processes = [];
  const visited = new WeakSet();
  const scan = (value, path, depth) => {
    if (!value || typeof value !== "object" || Array.isArray(value) || depth > 6) return;
    if (visited.has(value)) return;
    visited.add(value);

    if (isForgeProcess(value)) {
      processes.push(compactForgeProcess(value, path, checkedAt));
      return;
    }
    for (const [key, child] of Object.entries(value).slice(0, 500)) {
      if (child && typeof child === "object" && !Array.isArray(child)) {
        scan(child, [...path, key], depth + 1);
      }
    }
  };
  scan(root, [], 0);
  processes.sort((left, right) =>
    String(left.forge_id || "").localeCompare(String(right.forge_id || ""), undefined, { numeric: true }) ||
    String(left.slot || "").localeCompare(String(right.slot || ""), undefined, { numeric: true })
  );

  return {
    available: true,
    forge_api_present: true,
    source_path: sourcePath,
    checked_at: checkedAt,
    checked_at_iso: isoFromUnixMs(checkedAt),
    active_processes: processes.length,
    slots_used: processes.length,
    processes,
    reason: processes.length
      ? null
      : "The Forge API section was present, but it contained no active or unclaimed processes.",
  };
}

function isForgeProcess(value) {
  const start = firstNumber(value.startTime, value.start_time, value.startedAt, value.started_at);
  const itemId = stringOrNull(value.id ?? value.item_id ?? value.itemId);
  const type = stringOrNull(value.type ?? value.process_type ?? value.processType);
  return start !== null && Boolean(itemId || type);
}

function compactForgeProcess(process, path, checkedAt) {
  const itemId = stringOrNull(process.id ?? process.item_id ?? process.itemId);
  const processType = stringOrNull(process.type ?? process.process_type ?? process.processType);
  const startTime = normalizeUnixMilliseconds(
    firstNumber(process.startTime, process.start_time, process.startedAt, process.started_at)
  );
  const upstreamEndTime = normalizeUnixMilliseconds(
    firstNumber(process.endTime, process.end_time, process.finishTime, process.finish_time, process.endsAt, process.ends_at)
  );
  const explicitDurationMs = firstNumber(
    process.duration_ms,
    process.durationMs,
    process.duration_milliseconds,
    process.durationMilliseconds
  );
  const explicitDurationSeconds = firstNumber(process.duration_seconds, process.durationSeconds);
  const durationMs = explicitDurationMs !== null
    ? Math.max(0, explicitDurationMs)
    : explicitDurationSeconds !== null
      ? Math.max(0, explicitDurationSeconds * 1_000)
      : null;
  const endTime = upstreamEndTime ?? (
    startTime !== null && durationMs !== null ? startTime + durationMs : null
  );
  const elapsedMs = startTime === null ? null : Math.max(0, checkedAt - startTime);
  const remainingMs = endTime === null ? null : Math.max(0, endTime - checkedAt);
  const complete = endTime === null ? null : checkedAt >= endTime;
  const progress = durationMs && elapsedMs !== null
    ? round(Math.max(0, Math.min(1, elapsedMs / durationMs)), 6)
    : null;

  return {
    path: path.join("."),
    forge_id: path.length > 1 ? path[0] : null,
    slot: path.length ? path.at(-1) : null,
    item_id: itemId,
    process_type: processType,
    start_time: startTime,
    start_time_iso: isoFromUnixMs(startTime),
    elapsed_ms: elapsedMs,
    duration_ms: durationMs,
    duration_raw: optionalNumber(process.duration),
    end_time: endTime,
    end_time_iso: isoFromUnixMs(endTime),
    end_time_calculated: upstreamEndTime === null && endTime !== null,
    remaining_ms: remainingMs,
    progress,
    complete,
    status: endTime === null ? "duration_required" : complete ? "finished_unclaimed" : "running",
    needs_wiki_duration: endTime === null,
    raw_process: sanitize(process, 4, 120),
  };
}

function compactForaging(member) {
  const core = objectOrEmpty(member?.foraging_core || member?.foraging);
  // Since the 2025 Hunting update, member.foraging is a quest/progression
  // object (fish_family, hina, tree_gifts, songs), while HotF progression
  // lives in member.foraging_core. member.foraging is still accepted as the
  // core fallback above for old payloads, but for every current player (who
  // has foraging_core) it must also be emitted in its own right or the quest
  // data is silently dropped. When foraging_core is absent, the same object
  // may appear both as core and here; that duplication is preferred over
  // hiding either reading of it.
  const questSource = member?.foraging;
  const questsPresent = Boolean(
    questSource && typeof questSource === "object" && !Array.isArray(questSource)
  );
  const quests = objectOrEmpty(questSource);
  const skillTree = objectOrEmpty(member?.skill_tree);
  const nodeGroups = objectOrEmpty(skillTree.nodes);
  const nodes = objectOrEmpty(nodeGroups.foraging || core.nodes);
  const selectedAbilities = objectOrEmpty(skillTree.selected_ability);
  const perks = compactTreePerks(nodes, "foraging", [
    "core_of_the_forest",
    "heart_of_the_forest",
  ]);
  const hotfLevel = firstNumber(
    nodes.core_of_the_forest,
    nodes.heart_of_the_forest,
    core.level,
    core.tier
  );
  const whispersCurrent = firstNumber(core.forests_whispers, core.forest_whispers, core.whispers);
  const whispersSpent = firstNumber(
    core.forests_whispers_spent,
    core.forest_whispers_spent,
    core.whispers_spent
  );
  const whispersTotal = firstNumber(
    core.forests_whispers_total,
    core.forest_whispers_total,
    whispersCurrent !== null && whispersSpent !== null ? whispersCurrent + whispersSpent : null
  );
  const available = Object.keys(nodes).length > 0 || Object.keys(core).length > 0;

  return {
    available,
    hotf: {
      level: hotfLevel,
      experience: firstNumber(
        readTreeScopedValue(skillTree, "experience", "foraging"),
        core.experience,
        core.hotf_experience
      ),
      selected_ability: stringOrNull(selectedAbilities.foraging ?? core.selected_ability),
      tokens_available: firstNumber(
        readTreeScopedValue(skillTree, "tokens", "foraging"),
        core.tokens
      ),
      tokens_spent: firstNumber(
        readTreeScopedValue(skillTree, "tokens_spent", "foraging"),
        core.tokens_spent
      ),
      unlocked_perks: perks.length,
      perks,
      nodes: sanitize(nodes, 4, 400),
    },
    forest_whispers: {
      current: whispersCurrent,
      spent: whispersSpent,
      total_earned: whispersTotal,
    },
    daily_trees_cut: optionalNumber(core.daily_trees_cut),
    daily_log_cut: sanitize(core.daily_log_cut || [], 4, 100),
    foraging_core: sanitize(core, 7, 700),
    quests: {
      available: questsPresent,
      fish_family: sanitize(quests.fish_family ?? null, 4, 60),
      hina: sanitize(quests.hina ?? null, 5, 100),
      tree_gifts: sanitize(quests.tree_gifts ?? null, 5, 100),
      songs: sanitize(quests.songs ?? null, 5, 100),
      additional_fields: sanitize(Object.fromEntries(Object.entries(quests).filter(
        ([key]) => !["fish_family", "hina", "tree_gifts", "songs"].includes(key)
      )), 4, 100),
    },
    reason: available
      ? null
      : "Hypixel did not expose Heart of the Forest progression for this player on this profile.",
  };
}

function compactTreePerks(nodes, tree, excludedIds = []) {
  const excluded = new Set(excludedIds);
  const perks = [];

  for (const [id, value] of Object.entries(nodes)) {
    if (id.startsWith("toggle_") || excluded.has(id)) continue;
    const level = optionalNumber(value);
    if (level === null || level <= 0) continue;
    const toggle = nodes[`toggle_${id}`];
    perks.push({
      id,
      name: formatTreePerkName(id, tree),
      level,
      enabled: typeof toggle === "boolean" ? toggle : null,
    });
  }

  return perks.sort((left, right) => right.level - left.level || left.name.localeCompare(right.name));
}

function formatTreePerkName(id, tree) {
  const known = {
    core_of_the_mountain: "Core of the Mountain",
    mining_speed: "Mining Speed",
    mining_fortune: "Mining Fortune",
    efficient_miner: "Efficient Miner",
    great_explorer: "Great Explorer",
    daily_powder: "Daily Powder",
    professional: "Professional",
    mole: "Mole",
    powder_buff: "Powder Buff",
    pickobulus: "Pickobulus",
    maniac_miner: "Maniac Miner",
    sweep: "Sweep",
    foraging_fortune: "Foraging Fortune",
    daily_wishes: "Daily Wishes",
    axe_toss: "Axe Toss",
    speed_boost: "Speed Boost",
    center_of_the_forest: "Center of the Forest",
    galateas_might: "Galatea's Might",
  };
  if (known[id]) return known[id];
  return id
    .replace(/^toggle_/, "")
    .split("_")
    .map((part) => part ? `${part[0].toUpperCase()}${part.slice(1)}` : "")
    .join(" ");
}

function compactPowder(core, type) {
  const current = firstNumber(core[`powder_${type}`], core[`${type}_powder`]);
  const spent = firstNumber(core[`powder_spent_${type}`], core[`${type}_powder_spent`]);
  const total = firstNumber(
    core[`powder_${type}_total`],
    core[`total_powder_${type}`],
    current !== null && spent !== null ? current + spent : null
  );
  return { current, spent, total_earned: total };
}

// ---------------------------------------------------------------------------
// Dedicated player_stats buckets. The regex-filtered category counters and
// the catch-all lifetime_counters blob can silently truncate, so the stat
// groups players actually ask about (dragons, Mythological Ritual, races,
// auction house totals, gifts, Winter event, candy, pet milestones) are
// always emitted as bounded named picks with their own availability flag.
// Field names mirror the upstream player_stats keys. An absent sub-object is
// unavailable (available: false, null values) -- never zero.
// ---------------------------------------------------------------------------

function statObject(value, depth, maxEntries) {
  return presentObject(value) ? sanitize(value, depth, maxEntries) : null;
}

// member.player_stats.end_island.dragon_fight: each key below is a map of
// dragon type (young/wise/superior/...) -> value, plus a "best" rollup.
const DRAGON_FIGHT_MAPS = [
  "most_damage",
  "fastest_kill",
  "highest_rank",
  "amount_summoned",
  "summoning_eyes_contributed",
];

function compactDragonStats(lifetime) {
  const fight = objectOrEmpty(lifetime.end_island).dragon_fight;
  if (!presentObject(fight)) {
    return {
      available: false,
      ender_crystals_destroyed: null,
      ...Object.fromEntries(DRAGON_FIGHT_MAPS.map((key) => [key, null])),
    };
  }
  return {
    available: true,
    ender_crystals_destroyed: optionalNumber(fight.ender_crystals_destroyed),
    ...Object.fromEntries(DRAGON_FIGHT_MAPS.map((key) => [key, statObject(fight[key], 2, 20)])),
  };
}

function compactMythosStats(lifetime) {
  const mythos = lifetime.mythos;
  const burrowKeys = [
    "burrows_dug_next",
    "burrows_dug_combat",
    "burrows_dug_treasure",
    "burrows_chains_complete",
  ];
  if (!presentObject(mythos)) {
    return { available: false, kills: null, ...Object.fromEntries(burrowKeys.map((key) => [key, null])) };
  }
  return {
    available: true,
    kills: optionalNumber(mythos.kills),
    // Each burrow map is keyed by burrow rarity (COMMON..LEGENDARY, none)
    // plus a total.
    ...Object.fromEntries(burrowKeys.map((key) => [key, statObject(mythos[key], 2, 12)])),
  };
}

function compactRaceStats(lifetime) {
  const races = lifetime.races;
  if (!presentObject(races)) {
    return { available: false, best_times: null, races_truncated: false };
  }
  // Race keys are open-ended (foraging_race_best_time, end_race_best_time,
  // crystal_core variants, plus the nested dungeon_hub map of per-setting
  // variants), so this keeps the map bounded instead of hand-picking and
  // dropping newly added races. Times are in milliseconds.
  const report = createTruncationReport();
  return {
    available: true,
    best_times: sanitize(races, 3, 80, report),
    races_truncated: report.truncated,
  };
}

const AUCTION_STAT_NUMBERS = [
  "created",
  "completed",
  "won",
  "no_bids",
  "bids",
  "highest_bid",
  "gold_spent",
  "gold_earned",
  "fees",
];

function compactAuctionStats(lifetime) {
  const auctions = lifetime.auctions;
  if (!presentObject(auctions)) {
    return {
      available: false,
      ...Object.fromEntries(AUCTION_STAT_NUMBERS.map((key) => [key, null])),
      total_bought: null,
      total_sold: null,
    };
  }
  return {
    available: true,
    ...Object.fromEntries(AUCTION_STAT_NUMBERS.map((key) => [key, optionalNumber(auctions[key])])),
    // Maps keyed by item rarity (COMMON..MYTHIC, SPECIAL) plus a total.
    total_bought: statObject(auctions.total_bought, 2, 12),
    total_sold: statObject(auctions.total_sold, 2, 12),
  };
}

function compactGiftStats(lifetime) {
  const gifts = lifetime.gifts;
  if (!presentObject(gifts)) {
    return { available: false, total_given: null, total_received: null };
  }
  return {
    available: true,
    total_given: optionalNumber(gifts.total_given),
    total_received: optionalNumber(gifts.total_received),
  };
}

function compactWinterStats(lifetime) {
  const winter = lifetime.winter;
  const keys = [
    "most_snowballs_hit",
    "most_damage_dealt",
    "most_magma_damage_dealt",
    "most_cannonballs_hit",
  ];
  if (!presentObject(winter)) {
    return { available: false, ...Object.fromEntries(keys.map((key) => [key, null])) };
  }
  return {
    available: true,
    ...Object.fromEntries(keys.map((key) => [key, optionalNumber(winter[key])])),
  };
}

const CANDY_FESTIVALS_RETURNED = 10;

function compactCandyStats(lifetime) {
  const candy = lifetime.candy_collected;
  if (!presentObject(candy)) {
    return {
      available: false,
      total: null,
      green_candy: null,
      purple_candy: null,
      total_festivals_recorded: null,
      recent_festivals: null,
      festivals_truncated: false,
    };
  }
  // Per-festival keys (spooky_festival_<n>) accumulate forever, so only the
  // most recent CANDY_FESTIVALS_RETURNED ship; lifetime totals are above.
  const festivals = Object.entries(candy)
    .filter(([, value]) => presentObject(value))
    .sort(([left], [right]) => {
      const leftNumber = optionalNumber(left.match(/(\d+)$/)?.[1]) ?? -1;
      const rightNumber = optionalNumber(right.match(/(\d+)$/)?.[1]) ?? -1;
      return rightNumber - leftNumber || left.localeCompare(right);
    });
  return {
    available: true,
    total: optionalNumber(candy.total),
    green_candy: optionalNumber(candy.green_candy),
    purple_candy: optionalNumber(candy.purple_candy),
    total_festivals_recorded: festivals.length,
    // Depth 3: map -> per-festival object -> scalar counters. Depth 2 would
    // land the counters on sanitize's depth-0 "[omitted]" floor.
    recent_festivals: sanitize(Object.fromEntries(festivals.slice(0, CANDY_FESTIVALS_RETURNED)), 3, 40),
    festivals_truncated: festivals.length > CANDY_FESTIVALS_RETURNED,
  };
}

function compactPetMilestoneStats(lifetime) {
  const milestone = objectOrEmpty(lifetime.pets).milestone;
  if (!presentObject(milestone)) {
    return { available: false, sea_creatures_killed: null, ores_mined: null };
  }
  return {
    available: true,
    sea_creatures_killed: optionalNumber(milestone.sea_creatures_killed),
    ores_mined: optionalNumber(milestone.ores_mined),
  };
}

function compactStats(member, skillResource = null) {
  const lifetime = objectOrEmpty(member?.player_stats);
  const skills = compactSkills(member, skillResource);
  const lifetimeCountersReport = createTruncationReport();

  return {
    skills,
    combat: {
      skill: skills.skills.combat || null,
      lifetime_counters: filterNumericStats(lifetime, /kill|death|damage|critical|slayer|dragon|dungeon|kuudra/i),
    },
    mining: {
      skill: skills.skills.mining || null,
      lifetime_counters: filterNumericStats(lifetime, /min(e|ed|ing)|ore|gemstone|mithril|titanium|glacite|nucleus|crystal|powder|commission/i),
    },
    foraging: {
      skill: skills.skills.foraging || null,
      lifetime_counters: filterNumericStats(lifetime, /forag|forest|tree|log|galatea/i),
    },
    farming: {
      skill: skills.skills.farming || null,
      lifetime_counters: filterNumericStats(lifetime, /farm|crop|garden|contest/i),
    },
    fishing: {
      skill: skills.skills.fishing || null,
      lifetime_counters: filterNumericStats(lifetime, /fish|sea_creature|trophy/i),
    },
    dragons: compactDragonStats(lifetime),
    mythos: compactMythosStats(lifetime),
    races: compactRaceStats(lifetime),
    auctions: compactAuctionStats(lifetime),
    gifts: compactGiftStats(lifetime),
    winter: compactWinterStats(lifetime),
    candy_collected: compactCandyStats(lifetime),
    pets_milestones: compactPetMilestoneStats(lifetime),
    player_misc: compactPlayerMisc(member),
    highest_critical_damage: optionalNumber(lifetime.highest_critical_damage),
    lifetime_counters: sanitize(lifetime, 6, 900, lifetimeCountersReport),
    lifetime_counters_truncated: lifetimeCountersReport.truncated,
    current_effective_stats: {
      available: false,
      reason: "Hypixel does not return one authoritative snapshot of current Health, Strength, Defense, Mining Speed, Mining Fortune, and similar gear/buff totals. Those must be derived from exposed gear, pets, perks, accessories, skills, and location-specific effects.",
    },
    reason: Object.keys(lifetime).length || skills.available
      ? null
      : "Hypixel did not expose skill experience or lifetime player-stat counters for this profile.",
  };
}

function filterNumericStats(stats, pattern, limit = 160) {
  const result = {};
  const walk = (value, prefix, depth) => {
    if (depth > 4) return;
    for (const [key, item] of Object.entries(value)) {
      if (Object.keys(result).length >= limit) return;
      const path = prefix ? `${prefix}.${key}` : key;
      if (item && typeof item === "object" && !Array.isArray(item)) {
        walk(item, path, depth + 1);
      } else if (["number", "boolean", "string"].includes(typeof item) && pattern.test(path)) {
        result[path] = item;
      }
    }
  };
  walk(objectOrEmpty(stats), "", 0);
  return result;
}

function readTreeScopedValue(skillTree, key, scope) {
  const value = skillTree?.[key];
  if (value && typeof value === "object" && !Array.isArray(value)) return value[scope];
  return value;
}

// Hypixel's slayer_bosses keys are already the lowercase boss names used as
// the LADDER_SOURCES suffix (zombie, spider, wolf, enderman, blaze, vampire).
// A direct `slayer_${name}` lookup means an unrecognized boss key naturally
// falls through to "no source" -- never a fallback to another boss's ladder.
// Returns the LADDER_SOURCES *key*, not the entry itself: callers need the
// key both to resolve the ladder (deriveLevel) and to point back to it from
// level_provenance.ladders (pointerLevel), so the key is the one shared
// currency between the two.
function slayerLadderKey(bossName) {
  const key = `slayer_${String(bossName || "").toLowerCase()}`;
  return LADDER_SOURCES[key] ? key : null;
}

// levelFromLadder itself reports `available: false` with `source_authority:
// null` when handed a missing/invalid ladder, so routing the "no source"
// case through it (rather than hand-building an unavailable object) keeps
// exactly one place that defines what "level unavailable" looks like.
function deriveLevel(experience, ladderKey) {
  const source = ladderKey ? LADDER_SOURCES[ladderKey] : null;
  return source
    ? levelFromLadder(experience, source.ladder, { ...source, tableVersion: TABLE_VERSION })
    : levelFromLadder(experience, null, { tableVersion: TABLE_VERSION });
}

// Provenance (level_source, table_version, source_authority, source_url,
// verify_on_wiki) is identical for every item sharing a ladder, so it is
// hoisted out of the per-item level object and emitted once per section,
// keyed by ladder. Each item instead carries a `ladder` pointer into
// level_provenance.ladders. Strips `experience` too: every caller here
// already keeps the item's original XP field, so restating it inside
// `level` would just be a second duplicate.
//
// `usedLadders` is populated as a side effect (only for ladders that
// actually produced an available level) so buildLevelProvenance can emit
// exactly the ladders referenced -- no dangling pointers, no unused entries.
// `options.cosmeticOverflow` (Catacombs and dungeon classes only) additionally
// reports the sourced flat post-cap continuation -- see cosmeticOverflow in
// levels.js. The existing level fields keep their capped semantics.
function pointerLevel(experience, ladderKey, usedLadders, options = {}) {
  const result = deriveLevel(experience, ladderKey);
  const overflowFields = options.cosmeticOverflow ? cosmeticOverflow(result) : null;
  if (!result.available) {
    return {
      available: false,
      level: null,
      level_with_progress: null,
      max_level: null,
      xp_into_level: null,
      xp_for_next_level: null,
      progress_to_next_level: null,
      ...(overflowFields ?? {}),
    };
  }
  usedLadders.add(ladderKey);
  return {
    available: true,
    level: result.level,
    level_with_progress: result.level_with_progress,
    max_level: result.max_level,
    xp_into_level: result.xp_into_level,
    xp_for_next_level: result.xp_for_next_level,
    progress_to_next_level: result.progress_to_next_level,
    ...(overflowFields ?? {}),
    ladder: ladderKey,
  };
}

// level_source, table_version and verify_on_wiki are identical across every
// current ladder, so they sit at the top level. source_authority is now also
// identical for every ladder ("wiki": both hypixelskyblock.minecraft.wiki and
// wiki.hypixel.net are acceptable sources for ladder data), but source_url
// still varies per ladder -- it is the only place the which-wiki fact lives
// -- so both stay inside ladders[key] rather than being split across two
// levels.
function buildLevelProvenance(usedLadders) {
  const ladders = {};
  for (const key of usedLadders) {
    const source = LADDER_SOURCES[key];
    if (!source) continue;
    ladders[key] = { source_authority: source.authority, source_url: source.sourceUrl };
  }
  return {
    level_source: "static_table",
    table_version: TABLE_VERSION,
    verify_on_wiki: true,
    ladders,
  };
}

// member.slayer.slayer_quest is the active (or most recently started) slayer
// quest. An absent object means Hypixel exposed no quest data -- unavailable,
// not "no quest ever started". recent_mob_kills is Hypixel's own rolling
// window of the latest qualifying kills; only the newest few ship.
const SLAYER_RECENT_MOB_KILLS_CAP = 10;

function compactSlayerQuest(member) {
  const quest = member?.slayer?.slayer_quest;
  if (!presentObject(quest)) {
    return {
      available: false,
      type: null,
      tier: null,
      start_timestamp: null,
      start_timestamp_iso: null,
      completion_state: null,
      combat_xp: null,
      recent_mob_kills: [],
      recent_mob_kills_truncated: false,
    };
  }
  const recentKills = Array.isArray(quest.recent_mob_kills) ? quest.recent_mob_kills : [];
  const startTimestamp = normalizeUnixMilliseconds(quest.start_timestamp);
  return {
    available: true,
    type: stringOrNull(quest.type),
    tier: optionalNumber(quest.tier),
    start_timestamp: startTimestamp,
    start_timestamp_iso: isoFromUnixMs(startTimestamp),
    completion_state: optionalNumber(quest.completion_state),
    combat_xp: optionalNumber(quest.combat_xp),
    recent_mob_kills: sanitize(recentKills.slice(0, SLAYER_RECENT_MOB_KILLS_CAP), 3, 30),
    recent_mob_kills_truncated: recentKills.length > SLAYER_RECENT_MOB_KILLS_CAP,
  };
}

function compactSlayers(member) {
  const bosses = member?.slayer?.slayer_bosses || member?.slayer_bosses || {};
  const result = {};
  const usedLadders = new Set();

  for (const [name, data] of Object.entries(bosses).slice(0, 30)) {
    const sanitized = objectOrEmpty(sanitize(data, 4, 100));
    result[name] = { ...sanitized, level: pointerLevel(data?.xp, slayerLadderKey(name), usedLadders) };
  }
  return {
    ...result,
    active_quest: compactSlayerQuest(member),
    level_provenance: buildLevelProvenance(usedLadders),
  };
}

// ---------------------------------------------------------------------------
// Dungeons per-floor detail. Hypixel keys every per-floor stat by floor
// number ("0" = entrance), and best_runs holds an ARRAY of past notable runs
// per floor. Only the single best run per floor ships -- picked by total
// score (exploration + speed + skill + bonus, the game's own score formula)
// -- never the full arrays, which would blow the response budget.
// `timestamp` is Unix milliseconds; `elapsed_time` is milliseconds.
// ---------------------------------------------------------------------------

// Per-floor stat maps copied per dungeon type when floor detail is requested
// (section=dungeons only -- the overview/summary embed stays lean).
const DUNGEON_FLOOR_STAT_MAPS = [
  "most_damage_healer",
  "most_damage_mage",
  "most_damage_berserk",
  "most_damage_archer",
  "most_damage_tank",
  "most_healing",
  "mobs_killed",
  "most_mobs_killed",
  "watcher_kills",
];

const DUNGEON_FLOORS_CAP = 20;
const DUNGEON_BEST_RUNS_SCANNED = 60;

const BEST_RUN_SCORE_FIELDS = ["score_exploration", "score_speed", "score_skill", "score_bonus"];

// null when the run carries no score fields at all: an unscored record is
// unknown, never treated as a zero-score run.
function bestRunTotalScore(run) {
  const parts = BEST_RUN_SCORE_FIELDS.map((field) => optionalNumber(run?.[field]));
  if (parts.every((part) => part === null)) return null;
  return parts.reduce((sum, part) => sum + (part ?? 0), 0);
}

function compactBestRun(run) {
  const timestamp = normalizeUnixMilliseconds(run.timestamp);
  return {
    timestamp,
    timestamp_iso: isoFromUnixMs(timestamp),
    score_exploration: optionalNumber(run.score_exploration),
    score_speed: optionalNumber(run.score_speed),
    score_skill: optionalNumber(run.score_skill),
    score_bonus: optionalNumber(run.score_bonus),
    total_score: bestRunTotalScore(run),
    dungeon_class: stringOrNull(run.dungeon_class),
    elapsed_time: optionalNumber(run.elapsed_time),
    damage_dealt: optionalNumber(run.damage_dealt),
    deaths: optionalNumber(run.deaths),
    mobs_killed: optionalNumber(run.mobs_killed),
    secrets_found: optionalNumber(run.secrets_found),
  };
}

// null when Hypixel exposed no best_runs object at all (unavailable); an
// empty result with the object present means it genuinely recorded no runs.
// runs_recorded preserves how many entries Hypixel kept for the floor so
// "best of N" stays honest even though only the top-1 ships.
function bestRunPerFloor(bestRuns) {
  if (!presentObject(bestRuns)) return null;
  const floors = {};
  for (const [floor, runs] of Object.entries(bestRuns).slice(0, DUNGEON_FLOORS_CAP)) {
    if (!Array.isArray(runs)) continue;
    let best = null;
    for (const run of runs.slice(0, DUNGEON_BEST_RUNS_SCANNED)) {
      if (!presentObject(run)) continue;
      if (!best || (bestRunTotalScore(run) ?? -1) > (bestRunTotalScore(best) ?? -1)) best = run;
    }
    if (best) floors[floor] = { ...compactBestRun(best), runs_recorded: runs.length };
  }
  return floors;
}

function compactDungeons(member, options = {}) {
  // Floor detail (best runs, per-class damage records, watcher kills) ships
  // only for section=dungeons; buildOverview's embed stays lean so the
  // summary route keeps its compact size.
  const includeFloorDetail = options.includeFloorDetail === true;
  const raw = member?.dungeons || {};
  const dungeonTypes = {};
  const classes = {};
  const usedLadders = new Set();

  for (const [name, data] of Object.entries(raw.dungeon_types || {}).slice(0, 20)) {
    const picked = pick(data, [
      "experience",
      "highest_tier_completed",
      "times_played",
      "tier_completions",
      "milestone_completions",
      "fastest_time",
      "fastest_time_s",
      "fastest_time_s_plus",
      "best_score",
      ...(includeFloorDetail ? DUNGEON_FLOOR_STAT_MAPS : []),
    ]);
    // Only Catacombs has a sourced ladder; other dungeon types (if Hypixel
    // ever adds one) report level unavailable rather than reusing this one.
    // Master Catacombs shares regular Catacombs XP and carries no experience
    // of its own, so its level is unavailable by design.
    const ladderKey = name === "catacombs" ? "catacombs" : null;
    // cosmeticOverflow adds level_with_overflow/overflow_xp for the flat
    // post-50 continuation; the capped level fields keep their semantics.
    const entry = {
      ...picked,
      level: pointerLevel(data?.experience, ladderKey, usedLadders, { cosmeticOverflow: true }),
    };
    if (includeFloorDetail) {
      const bestRun = bestRunPerFloor(data?.best_runs);
      entry.best_run_per_floor = bestRun;
      entry.best_runs_available = bestRun !== null;
    }
    dungeonTypes[name] = entry;
  }

  for (const [name, data] of Object.entries(raw.player_classes || {}).slice(0, 20)) {
    const picked = pick(data, ["experience"]);
    // All dungeon classes share one XP curve (LADDER_SOURCES.dungeon_class),
    // and the flat post-50 cosmetic continuation applies to classes too.
    classes[name] = {
      ...picked,
      level: pointerLevel(data?.experience, "dungeon_class", usedLadders, { cosmeticOverflow: true }),
    };
  }

  const lastDungeonRun = normalizeUnixMilliseconds(raw.last_dungeon_run);

  return {
    selected_dungeon_class: raw.selected_dungeon_class || null,
    // Lifetime member.dungeons scalars. Absent upstream = null (unavailable),
    // never zero.
    secrets: optionalNumber(raw.secrets),
    daily_runs: presentObject(raw.daily_runs) ? sanitize(raw.daily_runs, 3, 20) : null,
    last_dungeon_run: lastDungeonRun,
    last_dungeon_run_iso: isoFromUnixMs(lastDungeonRun),
    dungeon_types: sanitize(dungeonTypes, 5, 300),
    player_classes: sanitize(classes, 4, 100),
    level_provenance: buildLevelProvenance(usedLadders),
  };
}

const PET_FIELDS = [
  "uuid",
  "type",
  "exp",
  "active",
  "tier",
  "heldItem",
  "held_item",
  "candyUsed",
  "candy_used",
  "skin",
];

// Belt-and-braces hard ceiling on pet *count*, kept alongside the byte
// budget below rather than removed: it bounds how much sorting/serializing
// work one response can demand even in a pathological case where every pet
// is tiny enough that the byte budget would never bind. In practice the
// byte budget (PETS_ARRAY_BYTE_BUDGET) binds first for any realistic pet --
// see the measured sizes in scripts/tests/sections.test.mjs -- because a
// fixed count cannot bound bytes: response size depends on what each pet
// carries (heldItem, skin, candyUsed), not how many pets there are. A 250
// count cap alone let a lean fixture pass at 79,149 chars while a realistic
// fixture (heldItem+skin+candyUsed) hit 101,899 -- a 502 in production.
const PET_PAGE_CAP = 250;

// Budget for the *serialized pets array only* (not the whole section
// response). The rest of the response -- envelope
// (success/uuid/profile/section/payload_kind/payload_version/data_present)
// plus data's non-pets fields (available/total_pets/returned/truncated/
// truncation_reason/level_provenance/reason) -- was measured directly
// through the real worker response pipeline (src/http.js's own 80,000-char
// enforcement), not estimated: ~736 chars with one pet ladder referenced,
// rising to ~1,441 chars in the worst realistic case where a single
// player's pets reference all seven pet ladders (common through mythic
// plus golden_dragon) at once. 73,000 + that worst-case 1,441 leaves the
// whole response at roughly 74,400 chars -- about 5,600 chars (7%) under
// the 80,000 cap, not a budget that only just fits a measured case.
const PETS_ARRAY_BYTE_BUDGET = 73_000;

const PET_RARITY_ORDER = ["COMMON", "UNCOMMON", "RARE", "EPIC", "LEGENDARY", "MYTHIC"];
const PET_RARITY_LADDER_KEYS = {
  COMMON: "pet_common",
  UNCOMMON: "pet_uncommon",
  RARE: "pet_rare",
  EPIC: "pet_epic",
  LEGENDARY: "pet_legendary",
  MYTHIC: "pet_mythic",
};

// PET_ITEM_TIER_BOOST raises a pet's effective rarity by one step for
// leveling purposes. A boosted Mythic pet has no rarity above it to boost
// into, so this returns null and the caller reports the level unavailable
// instead of guessing.
function boostedPetRarity(tier) {
  const index = PET_RARITY_ORDER.indexOf(tier);
  if (index === -1 || index === PET_RARITY_ORDER.length - 1) return null;
  return PET_RARITY_ORDER[index + 1];
}

// Golden Dragon has its own ladder (levels 1-200) rather than the shared
// Legendary curve, so its type is checked before falling back to tier.
// Returns the LADDER_SOURCES key (not the entry) -- see slayerLadderKey for
// why: the key is what both deriveLevel and the level_provenance pointer need.
function resolvePetLadderKey(pet) {
  const type = typeof pet?.type === "string" ? pet.type.toUpperCase() : null;
  if (type === "GOLDEN_DRAGON") return "golden_dragon";

  const tier = typeof pet?.tier === "string" ? pet.tier.toUpperCase() : null;
  if (!tier) return null;

  const heldItem = pet?.heldItem ?? pet?.held_item ?? null;
  const effectiveTier = heldItem === "PET_ITEM_TIER_BOOST" ? boostedPetRarity(tier) : tier;
  if (!effectiveTier) return null;

  return PET_RARITY_LADDER_KEYS[effectiveTier] || null;
}

// Sort key for surviving truncation: active pets first (a player cares most
// about the pet they're actually using), then by derived level -- using the
// fractional level_with_progress so two pets on the same whole level still
// order by how close they are to the next one -- descending, falling back
// to raw exp when a level could not be derived (unknown rarity) so those
// pets still sort sensibly among themselves rather than colliding at one
// value.
function petSortRank(entry) {
  const active = entry.active === true ? 1 : 0;
  const level = entry.level?.available
    ? (entry.level.level_with_progress ?? entry.level.level ?? 0)
    : -1;
  const exp = optionalNumber(entry.exp) ?? -1;
  return [active, level, exp];
}

function comparePetsForTruncation(left, right) {
  const [leftActive, leftLevel, leftExp] = petSortRank(left);
  const [rightActive, rightLevel, rightExp] = petSortRank(right);
  if (leftActive !== rightActive) return rightActive - leftActive;
  if (leftLevel !== rightLevel) return rightLevel - leftLevel;
  return rightExp - leftExp;
}

// member.pets_data.pet_care: coins spent on pet care plus the pet types
// sacrificed to George. The unique sacrificed list is exactly what raises the
// Taming level cap (see playerSkillCaps), so it ships here for verification.
// Bounded: the worst realistic case (~60 type ids) adds ~1.5k chars to the
// pets envelope, well inside the margin left by PETS_ARRAY_BYTE_BUDGET.
const PET_TYPES_SACRIFICED_CAP = 60;

function compactPetCare(member) {
  const care = member?.pets_data?.pet_care;
  if (!presentObject(care)) {
    return {
      available: false,
      coins_spent: null,
      pet_types_sacrificed: [],
      pet_types_sacrificed_count: null,
      pet_types_sacrificed_truncated: false,
    };
  }
  const sacrificedRaw = Array.isArray(care.pet_types_sacrificed) ? care.pet_types_sacrificed : [];
  const unique = [...new Set(sacrificedRaw.map((entry) => String(entry)))];
  return {
    available: true,
    coins_spent: optionalNumber(care.coins_spent),
    pet_types_sacrificed: unique.slice(0, PET_TYPES_SACRIFICED_CAP),
    pet_types_sacrificed_count: unique.length,
    pet_types_sacrificed_truncated: unique.length > PET_TYPES_SACRIFICED_CAP,
  };
}

function compactPets(member) {
  const rawPets = member?.pets_data?.pets ?? member?.pets;

  // Distinguish "Hypixel exposed no pet data" (missing/non-array field) from
  // "Hypixel exposed pet data and the player genuinely has zero pets" (an
  // actual empty array). Only the former is unavailable.
  if (!Array.isArray(rawPets)) {
    return {
      available: false,
      total_pets: null,
      returned: 0,
      truncated: false,
      truncation_reason: null,
      pets: [],
      pet_care: compactPetCare(member),
      level_provenance: buildLevelProvenance(new Set()),
      reason: "Hypixel did not expose pet data for this player on this profile.",
    };
  }

  const totalPets = rawPets.length;

  // Levels are derived once up front (into a scratch ladder set) purely to
  // sort by them. Only ladders actually used by pets that survive
  // truncation get folded into the real `usedLadders` below -- otherwise a
  // dropped pet's ladder would leak into level_provenance.ladders as a
  // dangling, unreferenced entry.
  const scratchLadders = new Set();
  const scored = rawPets.map((pet) => ({
    ...pick(pet, PET_FIELDS),
    level: pointerLevel(pet?.exp, resolvePetLadderKey(pet), scratchLadders),
  }));
  scored.sort(comparePetsForTruncation);

  const usedLadders = new Set();
  const pets = [];
  let arrayBytesUsed = 2; // "[" + "]"
  let sizeCapped = false;
  let countCapped = false;

  for (const entry of scored) {
    if (pets.length >= PET_PAGE_CAP) {
      countCapped = true;
      break;
    }
    const entryLength = JSON.stringify(entry).length + (pets.length > 0 ? 1 : 0); // +1 for the joining comma
    if (arrayBytesUsed + entryLength > PETS_ARRAY_BYTE_BUDGET) {
      sizeCapped = true;
      break;
    }
    arrayBytesUsed += entryLength;
    pets.push(entry);
    if (entry.level.available) usedLadders.add(entry.level.ladder);
  }

  const truncated = pets.length < totalPets;

  return {
    available: true,
    total_pets: totalPets,
    returned: pets.length,
    truncated,
    truncation_reason: !truncated
      ? null
      : sizeCapped
        ? "response_size_budget"
        : countCapped
          ? "pet_count_cap"
          : null,
    pets,
    pet_care: compactPetCare(member),
    level_provenance: buildLevelProvenance(usedLadders),
    reason: null,
  };
}


// ---------------------------------------------------------------------------
// Crimson Isle (section=crimson_isle), from member.nether_island_player_data.
// Availability rule: when Hypixel omits the whole object the section is
// unavailable (data_present: false). When a sub-object IS present, keys
// Hypixel only writes on first completion (Kuudra tiers, trophy tiers) are
// genuinely zero, matching how SkyCrypt reads the same payload -- that is
// real data, not a zero substituted for missing data.
// ---------------------------------------------------------------------------

function presentObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

// Source: SkyCrypt v1 src/constants/misc.js KUUDRA_TIERS (tier keys and display names).
const KUUDRA_TIERS = {
  none: "Basic",
  hot: "Hot",
  burning: "Burning",
  fiery: "Fiery",
  infernal: "Infernal",
};

// Source: SkyCrypt v1 src/constants/misc.js DOJO (test keys and display names).
const DOJO_TESTS = {
  sword_swap: "Discipline",
  fireball: "Tenacity",
  archer: "Mastery",
  lock_head: "Control",
  snake: "Swiftness",
  wall_jump: "Stamina",
  mob_kb: "Force",
};

// Source: hypixel-api-reborn src/Structures/SkyBlock/Member/CrimsonIsle/
// SkyBlockMemberCrimsonIsleDojoMinigame.ts getScore (points -> rank brackets).
// SkyCrypt does not compute Dojo ranks, so this bracket table is transcribed
// from that library instead; verify on the wiki when the rank is load-bearing.
const DOJO_RANK_BRACKETS = [
  [1000, "S"],
  [800, "A"],
  [600, "B"],
  [400, "C"],
  [200, "D"],
];

function dojoRankFromPoints(points) {
  if (points === null) return null;
  for (const [threshold, rank] of DOJO_RANK_BRACKETS) {
    if (points >= threshold) return rank;
  }
  return "F";
}

const ABIPHONE_CONTACT_CAP = 60;

function compactCrimsonIsle(member) {
  const data = member?.nether_island_player_data;
  if (!presentObject(data)) {
    return {
      available: false,
      data_present: false,
      crimson_isle_api_present: false,
      kuudra: { available: false },
      dojo: { available: false },
      factions: { available: false },
      abiphone: { available: false },
      matriarch: { available: false },
      kuudra_party_finder: { available: false },
      quests: { available: false },
      last_minibosses_killed: [],
      reason: "Hypixel did not expose Crimson Isle data (nether_island_player_data) for this player on this profile.",
    };
  }

  const kuudraRaw = data.kuudra_completed_tiers;
  let kuudra = { available: false };
  if (presentObject(kuudraRaw)) {
    const tiers = {};
    let total = 0;
    for (const [tier, name] of Object.entries(KUUDRA_TIERS)) {
      // Hypixel writes a tier key on first completion, so with the parent
      // object present an absent key is a real zero. highest_wave_* is only
      // written once a wave is reached, so it stays null when absent.
      const completions = optionalNumber(kuudraRaw[tier]) ?? 0;
      tiers[tier] = {
        name,
        completions,
        highest_wave: optionalNumber(kuudraRaw[`highest_wave_${tier}`]),
      };
      total += completions;
    }
    kuudra = { available: true, total_completions: total, tiers };
  }

  const dojoRaw = data.dojo;
  let dojo = { available: false };
  if (presentObject(dojoRaw)) {
    const tests = {};
    let totalPoints = 0;
    for (const [id, name] of Object.entries(DOJO_TESTS)) {
      const points = optionalNumber(dojoRaw[`dojo_points_${id}`]);
      tests[id] = {
        name,
        points,
        time: optionalNumber(dojoRaw[`dojo_time_${id}`]),
        rank: dojoRankFromPoints(points),
      };
      totalPoints += points ?? 0;
    }
    dojo = { available: true, total_points: totalPoints, tests };
  }

  const abiphoneRaw = data.abiphone;
  let abiphone = { available: false };
  if (presentObject(abiphoneRaw)) {
    const contactIds = Object.keys(objectOrEmpty(abiphoneRaw.contact_data)).sort();
    abiphone = {
      available: true,
      active_contact_count: Array.isArray(abiphoneRaw.active_contacts)
        ? abiphoneRaw.active_contacts.length
        : null,
      contact_count: contactIds.length,
      contacts: contactIds.slice(0, ABIPHONE_CONTACT_CAP),
      contacts_truncated: contactIds.length > ABIPHONE_CONTACT_CAP,
      operator_chip: sanitize(abiphoneRaw.operator_chip ?? null, 3, 30),
      selected_ringtone: stringOrNull(abiphoneRaw.selected_ringtone),
      trio_contact_addons: optionalNumber(abiphoneRaw.trio_contact_addons),
    };
  }

  const matriarchRaw = data.matriarch;
  let matriarch = { available: false };
  if (presentObject(matriarchRaw)) {
    const lastAttempt = normalizeUnixMilliseconds(matriarchRaw.last_attempt);
    matriarch = {
      available: true,
      pearls_collected: optionalNumber(matriarchRaw.pearls_collected),
      last_attempt: lastAttempt,
      last_attempt_iso: isoFromUnixMs(lastAttempt),
    };
  }

  const questsRaw = data.quests;
  let quests = { available: false };
  if (presentObject(questsRaw)) {
    quests = {
      available: true,
      miniboss_data: sanitize(questsRaw.miniboss_data ?? null, 3, 60),
      miniboss_daily: sanitize(questsRaw.miniboss_daily ?? null, 3, 60),
      chicken_quest: sanitize(questsRaw.chicken_quest ?? null, 3, 60),
      pablo_quest: sanitize(questsRaw.pablo_quest ?? null, 3, 60),
      other_quest_keys: Object.keys(questsRaw)
        .filter((key) => !["miniboss_data", "miniboss_daily", "chicken_quest", "pablo_quest"].includes(key))
        .sort()
        .slice(0, 40),
    };
  }

  return {
    available: true,
    data_present: true,
    crimson_isle_api_present: true,
    kuudra,
    dojo,
    factions: {
      available: true,
      selected_faction: stringOrNull(data.selected_faction),
      mages_reputation: optionalNumber(data.mages_reputation),
      barbarians_reputation: optionalNumber(data.barbarians_reputation),
    },
    abiphone,
    matriarch,
    kuudra_party_finder: presentObject(data.kuudra_party_finder)
      ? { available: true, ...objectOrEmpty(sanitize(data.kuudra_party_finder, 4, 60)) }
      : { available: false },
    quests,
    last_minibosses_killed: sanitize(
      Array.isArray(data.last_minibosses_killed) ? data.last_minibosses_killed : [],
      2,
      30
    ),
    reason: null,
  };
}

// ---------------------------------------------------------------------------
// Farming / Jacob's contests (section=farming), from member.jacobs_contest
// plus the Trapper pelt counter and member.garden_player_data. The contests
// map is unbounded (one key per contest ever entered), so only the most
// recent FARMING_CONTESTS_RETURNED are returned, alongside totals and
// claimed-medal counts computed over the full set. Medal counts use only the
// claimed_medal field Hypixel reports -- placement percentages are never
// used to guess an unclaimed medal.
// ---------------------------------------------------------------------------

const FARMING_CONTESTS_RETURNED = 25;
const FARMING_MEDALS = ["bronze", "silver", "gold", "platinum", "diamond"];

// Contest keys look like "285:2_11:CACTUS" (SkyBlock year 285, month 2, day
// 11). The numeric composite orders contests chronologically.
function parseContestKey(contestId) {
  const parts = String(contestId).split(":");
  if (parts.length < 3) return { crop: null, sort_key: -1 };
  const year = optionalNumber(parts[0]) ?? 0;
  const [monthRaw, dayRaw] = parts[1].split("_");
  const month = optionalNumber(monthRaw) ?? 0;
  const day = optionalNumber(dayRaw) ?? 0;
  return {
    crop: parts.slice(2).join(":") || null,
    sort_key: year * 100_000 + month * 1_000 + day,
  };
}

function compactFarming(member) {
  const jacobsRaw = member?.jacobs_contest;
  const jacobsPresent = presentObject(jacobsRaw);
  const peltCount = optionalNumber(
    member?.quests?.trapper_quest?.pelt_count ?? member?.trapper_quest?.pelt_count
  );
  const gardenRaw = member?.garden_player_data;
  const gardenPresent = presentObject(gardenRaw);
  const present = jacobsPresent || peltCount !== null || gardenPresent;

  let jacobs = { available: false };
  if (jacobsPresent) {
    const medalsInv = objectOrEmpty(jacobsRaw.medals_inv);
    const perks = objectOrEmpty(jacobsRaw.perks);
    const contestsRaw = objectOrEmpty(jacobsRaw.contests);
    const entries = Object.entries(contestsRaw).map(([contestId, value]) => {
      const contest = objectOrEmpty(value);
      const parsed = parseContestKey(contestId);
      return {
        contest_id: contestId,
        crop: parsed.crop,
        sort_key: parsed.sort_key,
        collected: optionalNumber(contest.collected),
        claimed_rewards: contest.claimed_rewards === true,
        claimed_position: optionalNumber(contest.claimed_position),
        claimed_participants: optionalNumber(contest.claimed_participants),
        claimed_medal: stringOrNull(contest.claimed_medal),
      };
    });
    const claimedMedalCounts = Object.fromEntries(FARMING_MEDALS.map((medal) => [medal, 0]));
    for (const entry of entries) {
      const medal = entry.claimed_medal ? entry.claimed_medal.toLowerCase() : null;
      if (medal && medal in claimedMedalCounts) claimedMedalCounts[medal] += 1;
    }
    entries.sort((left, right) => right.sort_key - left.sort_key ||
      String(left.contest_id).localeCompare(String(right.contest_id)));
    const recent = entries.slice(0, FARMING_CONTESTS_RETURNED)
      .map(({ sort_key, ...entry }) => entry);

    // personal_bests is the modern per-crop map; older payloads only carry
    // per-contest collected amounts, so the maximum per crop backfills it.
    let personalBests = objectOrEmpty(jacobsRaw.personal_bests);
    if (!Object.keys(personalBests).length && entries.length) {
      personalBests = {};
      for (const entry of entries) {
        if (entry.crop === null || entry.collected === null) continue;
        if (!(entry.crop in personalBests) || entry.collected > personalBests[entry.crop]) {
          personalBests[entry.crop] = entry.collected;
        }
      }
    }

    jacobs = {
      available: true,
      talked: jacobsRaw.talked === true,
      medals_inventory: {
        bronze: optionalNumber(medalsInv.bronze),
        silver: optionalNumber(medalsInv.silver),
        gold: optionalNumber(medalsInv.gold),
      },
      perks: {
        double_drops: optionalNumber(perks.double_drops),
        farming_level_cap: optionalNumber(perks.farming_level_cap),
      },
      personal_bests: sanitize(personalBests, 3, 100),
      unique_brackets: sanitize(jacobsRaw.unique_brackets ?? null, 3, 60),
      contests: {
        total_contests: entries.length,
        claimed_medal_counts: claimedMedalCounts,
        returned: recent.length,
        contests_truncated: entries.length > recent.length,
        recent,
      },
    };
  }

  return {
    available: present,
    data_present: present,
    jacobs,
    trapper: {
      available: peltCount !== null,
      pelt_count: peltCount,
    },
    garden_player_data: {
      available: gardenPresent,
      copper: gardenPresent ? optionalNumber(gardenRaw.copper) : null,
      larva_consumed: gardenPresent ? optionalNumber(gardenRaw.larva_consumed) : null,
    },
    reason: present
      ? null
      : "Hypixel did not expose Jacob's contest, Trapper, or garden player data for this player on this profile.",
  };
}

// ---------------------------------------------------------------------------
// Minions (section=minions). crafted_generators is per member and each entry
// is a "<TYPE>_<TIER>" string, so the union across every profile member is
// what the game's Unique Minions counter reflects. Bonus-slot progress comes
// from a static table (below); community-shop extra slots are reported
// separately as their upgrade tier, never folded into a guessed total.
// ---------------------------------------------------------------------------

// Source: SkyCrypt v1 src/constants/minions.js MINION_SLOTS
// (unique crafted minions -> total minion slots, community upgrades excluded).
const MINION_SLOTS_BY_UNIQUE_CRAFTS = {
  0: 5, 5: 6, 15: 7, 30: 8, 50: 9, 75: 10, 100: 11, 125: 12, 150: 13,
  175: 14, 200: 15, 225: 16, 250: 17, 275: 18, 300: 19, 350: 20, 400: 21,
  450: 22, 500: 23, 550: 24, 600: 25, 650: 26, 700: 27,
};

const MINION_TYPES_CAP = 120;

function compactMinions(profile) {
  const members = objectOrEmpty(profile?.members);
  const uniqueCrafts = new Set();
  let membersWithData = 0;
  for (const rawMember of Object.values(members)) {
    const crafted = rawMember?.player_data?.crafted_generators;
    if (!Array.isArray(crafted)) continue;
    membersWithData += 1;
    for (const generator of crafted) {
      if (typeof generator === "string" && generator) uniqueCrafts.add(generator);
    }
  }
  const craftedPresent = membersWithData > 0;

  const byType = new Map();
  for (const generator of uniqueCrafts) {
    const splitAt = generator.lastIndexOf("_");
    const type = splitAt > 0 ? generator.slice(0, splitAt) : generator;
    const tier = splitAt > 0 ? optionalNumber(generator.slice(splitAt + 1)) : null;
    const record = byType.get(type) || { minion_id: type, max_tier_crafted: null, tiers_crafted: 0 };
    record.tiers_crafted += 1;
    if (tier !== null && (record.max_tier_crafted === null || tier > record.max_tier_crafted)) {
      record.max_tier_crafted = tier;
    }
    byType.set(type, record);
  }
  const minionTypes = [...byType.values()]
    .sort((left, right) => left.minion_id.localeCompare(right.minion_id));

  // Bonus-slot progress, mirroring SkyCrypt's getMinionSlots walk of the same
  // table: current slots come from the largest threshold reached; the next
  // row up gives the following slot's requirement.
  let slotsFromUniques = null;
  let nextSlot = null;
  if (craftedPresent) {
    const thresholds = Object.keys(MINION_SLOTS_BY_UNIQUE_CRAFTS)
      .map(Number)
      .sort((left, right) => left - right);
    slotsFromUniques = MINION_SLOTS_BY_UNIQUE_CRAFTS[0];
    for (const threshold of thresholds) {
      if (uniqueCrafts.size >= threshold) {
        slotsFromUniques = MINION_SLOTS_BY_UNIQUE_CRAFTS[threshold];
      } else {
        nextSlot = {
          slots: MINION_SLOTS_BY_UNIQUE_CRAFTS[threshold],
          unique_crafts_required: threshold,
          remaining_crafts: threshold - uniqueCrafts.size,
        };
        break;
      }
    }
  }

  const communityRaw = profile?.community_upgrades;
  let communityUpgrades = { available: false };
  if (presentObject(communityRaw)) {
    const states = Array.isArray(communityRaw.upgrade_states) ? communityRaw.upgrade_states : [];
    const highestTiers = {};
    for (const state of states.slice(0, 300)) {
      const upgrade = stringOrNull(state?.upgrade);
      const tier = optionalNumber(state?.tier);
      if (!upgrade || tier === null) continue;
      if (!(upgrade in highestTiers) || tier > highestTiers[upgrade]) highestTiers[upgrade] = tier;
    }
    communityUpgrades = {
      available: true,
      currently_upgrading: sanitize(communityRaw.currently_upgrading ?? null, 3, 20),
      // Highest purchased tier per community upgrade (minion_slots,
      // island_size, coop_slots, guests_count, coins_allowance). The
      // minion_slots tier is the community-shop bonus on top of
      // slots_from_unique_crafts; the two are reported separately.
      highest_tiers: highestTiers,
      total_upgrade_states: states.length,
    };
  }

  return {
    available: craftedPresent || communityUpgrades.available,
    data_present: craftedPresent,
    crafted_generators_present: craftedPresent,
    members_with_crafted_data: membersWithData,
    total_members: Object.keys(members).length,
    unique_minions_crafted: craftedPresent ? uniqueCrafts.size : null,
    distinct_minion_types: craftedPresent ? minionTypes.length : null,
    slots_from_unique_crafts: slotsFromUniques,
    next_slot: nextSlot,
    minion_types: minionTypes.slice(0, MINION_TYPES_CAP),
    minion_types_truncated: minionTypes.length > MINION_TYPES_CAP,
    community_upgrades: communityUpgrades,
    reason: craftedPresent
      ? null
      : "Hypixel did not expose crafted_generators for any member of this profile, so crafted minions are unavailable.",
  };
}

// ---------------------------------------------------------------------------
// Trophy fish (section=trophy_fish), from member.trophy_fish. Hypixel stores
// a flat map: "<fish>" for the total plus "<fish>_<tier>" per tier, alongside
// total_caught, rewards, and last_caught. With the parent object present, an
// absent fish/tier key is a real zero (Hypixel writes keys on first catch),
// matching how SkyCrypt reads the same payload.
// ---------------------------------------------------------------------------

// Source: SkyCrypt v1 src/constants/trophy-fish.js TROPHY_FISH (the 18 fish ids and display names).
const TROPHY_FISH_NAMES = {
  BLOBFISH: "Blobfish",
  FLYFISH: "Flyfish",
  GOLDEN_FISH: "Golden Fish",
  GUSHER: "Gusher",
  KARATE_FISH: "Karate Fish",
  LAVA_HORSE: "Lavahorse",
  MANA_RAY: "Mana Ray",
  MOLDFIN: "Moldfin",
  OBFUSCATED_FISH_1: "Obfuscated 1",
  OBFUSCATED_FISH_2: "Obfuscated 2",
  OBFUSCATED_FISH_3: "Obfuscated 3",
  SKELETON_FISH: "Skeleton Fish",
  SLUGFISH: "Slugfish",
  SOUL_FISH: "Soul Fish",
  STEAMING_HOT_FLOUNDER: "Steaming-Hot Flounder",
  SULPHUR_SKITTER: "Sulphur Skitter",
  VANILLE: "Vanille",
  VOLCANIC_STONEFISH: "Volcanic Stonefish",
};

// Source: SkyCrypt v1 src/constants/trophy-fish.js TROPHY_FISH_STAGES
// (net reward stages, in claim order).
const TROPHY_FISH_STAGES = ["Bronze Hunter", "Silver Hunter", "Gold Hunter", "Diamond Hunter"];

const TROPHY_FISH_TIERS = ["bronze", "silver", "gold", "diamond"];

function compactTrophyFish(member) {
  const raw = member?.trophy_fish;
  if (!presentObject(raw)) {
    return {
      available: false,
      data_present: false,
      trophy_fish_api_present: false,
      total_caught: null,
      fish: [],
      rewards: { claimed_reward_count: null, claimed_stages: [], current_stage: null },
      last_caught: null,
      reason: "Hypixel did not expose trophy fish data for this player on this profile.",
    };
  }

  // Start from the known 18 fish, then absorb any additional fish ids in the
  // payload so a newly added fish shows up instead of being dropped.
  const fishIds = [...Object.keys(TROPHY_FISH_NAMES)];
  const known = new Set(fishIds.map((id) => id.toLowerCase()));
  const reserved = new Set(["total_caught", "rewards", "last_caught"]);
  const FISH_RECORD_CAP = 40;
  for (const key of Object.keys(raw)) {
    if (fishIds.length >= FISH_RECORD_CAP) break;
    if (reserved.has(key)) continue;
    const tierSuffix = TROPHY_FISH_TIERS.find((tier) => key.endsWith(`_${tier}`));
    const base = tierSuffix ? key.slice(0, -(tierSuffix.length + 1)) : key;
    if (!base || known.has(base)) continue;
    known.add(base);
    fishIds.push(base.toUpperCase());
  }

  const fish = fishIds.map((fishId) => {
    const lower = fishId.toLowerCase();
    const record = {
      fish_id: fishId,
      name: TROPHY_FISH_NAMES[fishId] || formatItemId(fishId),
      total: optionalNumber(raw[lower]) ?? 0,
    };
    for (const tier of TROPHY_FISH_TIERS) {
      record[tier] = optionalNumber(raw[`${lower}_${tier}`]) ?? 0;
    }
    record.highest_tier = [...TROPHY_FISH_TIERS].reverse().find((tier) => record[tier] > 0) || null;
    return record;
  });

  const rewardsRaw = Array.isArray(raw.rewards) ? raw.rewards : [];
  const claimedStages = rewardsRaw
    .map((reward) => TROPHY_FISH_STAGES[Number(reward) - 1] || null);

  return {
    available: true,
    data_present: true,
    trophy_fish_api_present: true,
    total_caught: optionalNumber(raw.total_caught),
    fish,
    rewards: {
      claimed_reward_count: rewardsRaw.length,
      claimed_stages: claimedStages,
      current_stage: rewardsRaw.length ? TROPHY_FISH_STAGES[rewardsRaw.length - 1] || null : null,
    },
    last_caught: stringOrNull(raw.last_caught),
    reason: null,
  };
}

// ---------------------------------------------------------------------------
// Chocolate Factory (section=chocolate_factory), from member.events.easter.
// The rabbits object is huge (hundreds of per-rabbit counters plus
// collected_eggs/collected_locations), so it is summarized: counts, unique
// totals, and only the top CHOCOLATE_TOP_RABBITS duplicates by count, with an
// explicit truncation flag. The raw rabbit blob is never returned.
// ---------------------------------------------------------------------------

const CHOCOLATE_TOP_RABBITS = 30;

function compactChocolateFactory(member) {
  const easter = member?.events?.easter;
  if (!presentObject(easter)) {
    return {
      available: false,
      data_present: false,
      chocolate_factory_api_present: false,
      reason: "Hypixel did not expose Chocolate Factory data (events.easter) for this player on this profile.",
    };
  }

  const rabbitsRaw = objectOrEmpty(easter.rabbits);
  const rabbitEntries = [];
  let collectedEggs = null;
  let collectedLocationCount = null;
  for (const [key, value] of Object.entries(rabbitsRaw)) {
    if (key === "collected_eggs") {
      collectedEggs = sanitize(value, 3, 30);
      continue;
    }
    if (key === "collected_locations") {
      collectedLocationCount = presentObject(value)
        ? Object.values(value).reduce(
            (sum, locations) => sum + (Array.isArray(locations) ? locations.length : 0),
            0
          )
        : null;
      continue;
    }
    const count = optionalNumber(value);
    if (count !== null) rabbitEntries.push({ rabbit: key, count });
  }
  rabbitEntries.sort((left, right) => right.count - left.count ||
    left.rabbit.localeCompare(right.rabbit));
  const uniqueRabbits = rabbitEntries.length;

  return {
    available: true,
    data_present: true,
    chocolate_factory_api_present: true,
    chocolate: optionalNumber(easter.chocolate),
    total_chocolate: optionalNumber(easter.total_chocolate),
    chocolate_since_prestige: optionalNumber(easter.chocolate_since_prestige),
    prestige_level: optionalNumber(easter.chocolate_level),
    rabbit_barn_capacity_level: optionalNumber(easter.rabbit_barn_capacity_level),
    employees: sanitize(easter.employees ?? null, 3, 30),
    time_tower: sanitize(easter.time_tower ?? null, 3, 30),
    shop: sanitize(easter.shop ?? null, 4, 60),
    rabbits: {
      unique_rabbits: uniqueRabbits,
      total_rabbits_found: rabbitEntries.reduce((sum, entry) => sum + entry.count, 0),
      top_rabbits: rabbitEntries.slice(0, CHOCOLATE_TOP_RABBITS),
      top_rabbits_returned: Math.min(uniqueRabbits, CHOCOLATE_TOP_RABBITS),
      rabbits_truncated: uniqueRabbits > CHOCOLATE_TOP_RABBITS,
      collected_eggs: collectedEggs,
      collected_location_count: collectedLocationCount,
    },
    reason: null,
  };
}

// ---------------------------------------------------------------------------
// Hunting (section=hunting), from the 2025 Hunting update objects:
// member.shards (owned attribute shards, active traps, fusions),
// member.attributes.stacks (attribute shard levels), and
// member.temples.unlocked_temples. Each sub-object carries its own
// availability; the section is unavailable only when none of them exist.
// ---------------------------------------------------------------------------

const HUNTING_LIST_CAP = 120;

function cappedList(value, cap, depth = 4) {
  const list = Array.isArray(value) ? value : null;
  return {
    count: list ? list.length : null,
    items: list ? sanitize(list.slice(0, cap), depth, 200) : [],
    truncated: list ? list.length > cap : false,
  };
}

function compactHunting(member) {
  const shardsRaw = member?.shards;
  const attributesRaw = member?.attributes;
  const templesRaw = member?.temples;
  const shardsPresent = presentObject(shardsRaw);
  const stacksPresent = presentObject(attributesRaw) && presentObject(attributesRaw.stacks);
  const templesPresent = presentObject(templesRaw);
  const present = shardsPresent || stacksPresent || templesPresent;

  if (!present) {
    return {
      available: false,
      data_present: false,
      shards: { available: false },
      attribute_stacks: { available: false },
      temples: { available: false },
      reason: "Hypixel did not expose Hunting data (shards, attribute stacks, or temples) for this player on this profile.",
    };
  }

  let shards = { available: false };
  if (shardsPresent) {
    const owned = cappedList(shardsRaw.owned, HUNTING_LIST_CAP);
    const activeTraps = cappedList(shardsRaw?.traps?.active_traps, HUNTING_LIST_CAP);
    const fusedReport = createTruncationReport();
    shards = {
      available: true,
      owned_count: owned.count,
      owned: owned.items,
      owned_truncated: owned.truncated,
      traps: {
        active_trap_count: activeTraps.count,
        active_traps: activeTraps.items,
        active_traps_truncated: activeTraps.truncated,
      },
      fused: sanitize(shardsRaw.fused ?? null, 4, 150, fusedReport),
      fused_truncated: fusedReport.truncated,
    };
  }

  const stacksReport = createTruncationReport();
  const attributeStacks = stacksPresent
    ? {
        available: true,
        stack_count: Object.keys(attributesRaw.stacks).length,
        stacks: sanitize(attributesRaw.stacks, 3, 200, stacksReport),
        stacks_truncated: stacksReport.truncated,
      }
    : { available: false };

  let temples = { available: false };
  if (templesPresent) {
    const unlocked = cappedList(templesRaw.unlocked_temples, HUNTING_LIST_CAP);
    temples = {
      available: true,
      unlocked_temple_count: unlocked.count,
      unlocked_temples: unlocked.items,
      unlocked_temples_truncated: unlocked.truncated,
    };
  }

  return {
    available: true,
    data_present: true,
    shards,
    attribute_stacks: attributeStacks,
    temples,
    reason: null,
  };
}

// ---------------------------------------------------------------------------
// Bestiary (section=bestiary). Raw kills come from member.bestiary.kills;
// family groupings, tier brackets, and the milestone/level math live in
// bestiary.js (transcribed from SkyCrypt, never invented). The section
// returns the overall rollup plus a bounded per-category summary; the full
// per-family list is large (200+ families) and ships pageable + queryable
// from the dedicated /v1/player/bestiary route instead.
// ---------------------------------------------------------------------------

export function compactBestiarySection(member) {
  const computed = computeBestiary(member);
  if (!computed.data_present) {
    return {
      available: false,
      data_present: false,
      bestiary_api_present: false,
      milestone: null,
      max_milestone: null,
      bestiary_level: null,
      max_bestiary_level: null,
      families_total: computed.families_total,
      families_unlocked: null,
      families_maxed: null,
      untracked_kill_keys: null,
      last_claimed_milestone: computed.last_claimed_milestone,
      categories: [],
      reason: "Hypixel did not expose bestiary kill data (member.bestiary.kills) for this player on this profile.",
    };
  }

  const categories = new Map();
  for (const family of computed.families) {
    if (!family.in_bracket_table) continue;
    const record = categories.get(family.category_id) || {
      category_id: family.category_id,
      category_name: family.category_name,
      families: 0,
      families_unlocked: 0,
      families_maxed: 0,
      kills: 0,
      milestone: 0,
      max_milestone: 0,
    };
    record.families += 1;
    if (family.kills > 0) record.families_unlocked += 1;
    if (family.maxed) record.families_maxed += 1;
    record.kills += family.kills;
    record.milestone += family.tier;
    record.max_milestone += family.max_tier;
    categories.set(family.category_id, record);
  }

  return {
    available: true,
    data_present: true,
    bestiary_api_present: true,
    milestone: computed.milestone,
    max_milestone: computed.max_milestone,
    bestiary_level: computed.bestiary_level,
    max_bestiary_level: computed.max_bestiary_level,
    families_total: computed.families_total,
    families_unlocked: computed.families_unlocked,
    families_maxed: computed.families_maxed,
    untracked_kill_keys: computed.untracked_kill_keys,
    last_claimed_milestone: computed.last_claimed_milestone,
    categories: [...categories.values()],
    reason: null,
  };
}

// ---------------------------------------------------------------------------
// Potion effects and active buffs (section=effects), from
// member.player_data.{active_effects, paused_effects, disabled_potion_effects,
// temp_stat_buffs} plus member.profile.cookie_buff_active. Each list carries
// its own availability: an absent array is unavailable (count null), while a
// present empty array is a real "no effects". God Potion presence is derived
// purely from the exposed effect names -- when no effect list is exposed it
// stays null, never guessed.
// ---------------------------------------------------------------------------

const EFFECT_LIST_CAP = 60;
const TEMP_STAT_BUFF_CAP = 40;

const EFFECT_SOURCE_KEYS = [
  "active_effects",
  "paused_effects",
  "disabled_potion_effects",
  "temp_stat_buffs",
];

function godPotionEffectPresent(activeRaw, pausedRaw) {
  if (!Array.isArray(activeRaw) && !Array.isArray(pausedRaw)) return null;
  const names = [
    ...(Array.isArray(activeRaw) ? activeRaw : []),
    ...(Array.isArray(pausedRaw) ? pausedRaw : []),
  ].map((entry) => String(typeof entry === "object" && entry !== null ? entry.effect ?? "" : entry).toLowerCase());
  return names.some((name) => name.includes("god"));
}

// Tri-state Booster Cookie flag from member.profile.cookie_buff_active:
// true/false when Hypixel exposed the member profile object, null when it
// did not (unknown, never assumed inactive).
function boosterCookieActive(member) {
  const profile = member?.profile;
  if (!presentObject(profile)) return null;
  return typeof profile.cookie_buff_active === "boolean" ? profile.cookie_buff_active : null;
}

// Shared by section=effects and the overview summary so the two can never
// disagree about availability.
function collectEffectSources(member) {
  const playerData = objectOrEmpty(member?.player_data);
  const cookie = boosterCookieActive(member);
  const anyListPresent = EFFECT_SOURCE_KEYS.some((key) => Array.isArray(playerData[key]));
  return { playerData, cookie, present: anyListPresent || cookie !== null };
}

export function compactEffects(member) {
  const { playerData, cookie, present } = collectEffectSources(member);

  if (!present) {
    return {
      available: false,
      data_present: false,
      booster_cookie_active: null,
      god_potion_effect_present: null,
      active_effects: { count: null, effects: [], truncated: false },
      paused_effects: { count: null, effects: [], truncated: false },
      disabled_potion_effects: { count: null, effects: [], truncated: false },
      temp_stat_buffs: { count: null, buffs: [], truncated: false },
      reason: "Hypixel did not expose potion effect or buff data for this player on this profile.",
    };
  }

  // Depth 5: list -> effect object -> modifiers array -> modifier object ->
  // scalar key/amp. Anything shallower collapses modifiers to "[omitted]".
  const active = cappedList(playerData.active_effects, EFFECT_LIST_CAP, 5);
  const paused = cappedList(playerData.paused_effects, EFFECT_LIST_CAP, 5);
  const disabled = cappedList(playerData.disabled_potion_effects, EFFECT_LIST_CAP, 2);
  const tempBuffs = cappedList(playerData.temp_stat_buffs, TEMP_STAT_BUFF_CAP, 4);

  return {
    available: true,
    data_present: true,
    booster_cookie_active: cookie,
    god_potion_effect_present: godPotionEffectPresent(playerData.active_effects, playerData.paused_effects),
    active_effects: { count: active.count, effects: active.items, truncated: active.truncated },
    paused_effects: { count: paused.count, effects: paused.items, truncated: paused.truncated },
    disabled_potion_effects: { count: disabled.count, effects: disabled.items, truncated: disabled.truncated },
    temp_stat_buffs: { count: tempBuffs.count, buffs: tempBuffs.items, truncated: tempBuffs.truncated },
    reason: null,
  };
}

// Compact counts-only embed for section=overview; the full capped lists live
// in section=effects.
function compactEffectsSummary(member) {
  const { playerData, cookie, present } = collectEffectSources(member);
  const countOf = (key) => (Array.isArray(playerData[key]) ? playerData[key].length : null);
  return {
    available: present,
    active_effect_count: countOf("active_effects"),
    paused_effect_count: countOf("paused_effects"),
    disabled_effect_count: countOf("disabled_potion_effects"),
    temp_stat_buff_count: countOf("temp_stat_buffs"),
    booster_cookie_active: cookie,
    god_potion_effect_present: present
      ? godPotionEffectPresent(playerData.active_effects, playerData.paused_effects)
      : null,
  };
}

// ---------------------------------------------------------------------------
// Miscellaneous player_data / item_data counters (section=stats bucket).
// Every field is null when Hypixel omits it -- never zero. last_death ships
// raw: modern payloads carry Unix milliseconds, but older ones used a
// different clock, so the ISO form is only derived when the raw value is
// unambiguously Unix milliseconds (>= 10^12).
// ---------------------------------------------------------------------------

const VISITED_ZONES_CAP = 100;
const VISITED_MODES_CAP = 20;
const PLAYER_PERKS_CAP = 60;

function compactPlayerMisc(member) {
  const playerDataRaw = member?.player_data;
  const itemDataRaw = member?.item_data;
  const playerDataPresent = presentObject(playerDataRaw);
  const itemDataPresent = presentObject(itemDataRaw);
  const playerData = objectOrEmpty(playerDataRaw);
  const itemData = objectOrEmpty(itemDataRaw);

  const lastDeath = optionalNumber(playerData.last_death);
  const zones = cappedList(playerData.visited_zones, VISITED_ZONES_CAP, 2);
  const modes = cappedList(playerData.visited_modes, VISITED_MODES_CAP, 2);
  const perksReport = createTruncationReport();

  return {
    available: playerDataPresent || itemDataPresent,
    death_count: optionalNumber(playerData.death_count),
    last_death: lastDeath,
    // Only unambiguous Unix-millisecond values get an ISO form; older
    // payloads used a different clock for last_death and converting those
    // would fabricate a date.
    last_death_iso: lastDeath !== null && lastDeath >= 1_000_000_000_000 ? isoFromUnixMs(lastDeath) : null,
    fishing_treasure_caught: optionalNumber(playerData.fishing_treasure_caught),
    reaper_peppers_eaten: optionalNumber(playerData.reaper_peppers_eaten),
    visited_zones: { count: zones.count, zones: zones.items, truncated: zones.truncated },
    visited_modes: { count: modes.count, modes: modes.items, truncated: modes.truncated },
    // Essence-shop stat perks (flat perk-name -> level map), bounded.
    perks: presentObject(playerData.perks)
      ? sanitize(playerData.perks, 2, PLAYER_PERKS_CAP, perksReport)
      : null,
    perks_truncated: perksReport.truncated,
    item_data: {
      available: itemDataPresent,
      soulflow: optionalNumber(itemData.soulflow),
      favorite_arrow: stringOrNull(itemData.favorite_arrow),
      teleporter_pill_consumed: typeof itemData.teleporter_pill_consumed === "boolean"
        ? itemData.teleporter_pill_consumed
        : null,
    },
  };
}
