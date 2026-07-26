import {
  firstNumber,
  number,
  objectOrEmpty,
  optionalNumber,
  paginateRecords,
  sanitize,
  stringOrNull,
} from "../util.js";
import { ClientError, json } from "../http.js";
import {
  cleanSelector,
  GENERIC_UUID_PATTERN,
  normalizeUuid,
  readDetailParameter,
  readIntegerParameter,
  readOptionalBooleanParameter,
  readTextParameter,
  requireEnumParameter,
  requireUuid,
} from "../params.js";
import {
  fetchCollectionResource,
  fetchHypixelJson,
  fetchProfiles,
  fetchSkillResource,
  fetchSkyBlockItemCatalogMap,
  fetchSkyBlockItemNameMap,
} from "../hypixel.js";
import {
  cleanItemName,
  compactAccessories,
  findSacksCounts,
  formatItemId,
} from "../items.js";
import { computeMagicalPower } from "../accessories.js";
import {
  buildOverview,
  buildSection,
  compactGarden,
  compactMuseum,
  compactPlayerCollections,
  PROFILE_SECTIONS,
} from "../sections.js";
import { computeBestiary } from "../bestiary.js";
import {
  compactProfile,
  getMember,
  loadSelectedMember,
  selectProfile,
} from "../profiles.js";

const EXTRA_KINDS = new Set(["museum", "garden", "bingo"]);

export async function handleProfiles(url, env) {
  const uuid = requireUuid(url);
  const profiles = await fetchProfiles(uuid, env);

  return json({
    success: true,
    uuid,
    profiles: profiles.map((profile) => compactProfile(profile, uuid)),
  });
}

export async function handleSummary(url, env) {
  const uuid = requireUuid(url);
  const selector = cleanSelector(url.searchParams.get("profile"));
  const [profiles, skillResource] = await Promise.all([
    fetchProfiles(uuid, env),
    fetchSkillResource(env),
  ]);
  const profile = selectProfile(profiles, uuid, selector);
  const member = getMember(profile, uuid);

  if (!member) {
    return json({ success: false, error: "The player is not a member of that profile." }, 404);
  }

  return json({
    success: true,
    uuid,
    profile: compactProfile(profile, uuid),
    data: buildOverview(profile, member, skillResource),
  });
}

export async function handleSection(url, env) {
  const uuid = requireUuid(url);
  const selector = cleanSelector(url.searchParams.get("profile"));
  const section = (url.searchParams.get("section") || "").toLowerCase();

  if (!PROFILE_SECTIONS.has(section)) {
    return json({
      success: false,
      error: `Unsupported section. Use one of: ${[...PROFILE_SECTIONS].join(", ")}.`,
    }, 400);
  }

  const [profiles, skillResource] = await Promise.all([
    fetchProfiles(uuid, env),
    // overview embeds compactSkills, so it needs the resource just like the
    // summary route; without it every overview skill level reads null.
    ["skills", "stats", "overview"].includes(section) ? fetchSkillResource(env) : Promise.resolve(null),
  ]);
  const profile = selectProfile(profiles, uuid, selector);
  const member = getMember(profile, uuid);

  if (!member) {
    return json({ success: false, error: "The player is not a member of that profile." }, 404);
  }

  const data = await buildSection(section, profile, member, skillResource);

  return json({
    success: true,
    uuid,
    profile: compactProfile(profile, uuid),
    section,
    payload_kind: `profile_section_${section}`,
    payload_version: "1",
    // Sections that declare their own availability (data.data_present) drive
    // the envelope flag; older sections without it keep the historical true.
    data_present: typeof data?.data_present === "boolean" ? data.data_present : true,
    data,
  });
}

export async function handlePlayerCollections(url, env) {
  const query = readTextParameter(url, "query", 100, "").toLowerCase();
  const page = readIntegerParameter(url, "page", 0, 0, 10_000);
  const limit = readIntegerParameter(url, "limit", 50, 1, 100);
  const includeUnlocks = readOptionalBooleanParameter(url, "include_unlocks") === true;
  const [{ uuid, profile, member }, collectionResource] = await Promise.all([
    loadSelectedMember(url, env),
    fetchCollectionResource(env),
  ]);
  // The whole profile flows in, not just the member: co-op collection
  // progress is shared, so tier truth needs every member's amounts plus the
  // queried member's unlocked_coll_tiers.
  const data = compactPlayerCollections(profile, member, collectionResource, query, page, limit, includeUnlocks);

  return json({
    success: true,
    uuid,
    profile: compactProfile(profile, uuid),
    payload_kind: "player_collections",
    payload_version: "1",
    data_present: data.data_present,
    data,
  });
}

export async function handlePlayerBestiary(url, env) {
  const query = readTextParameter(url, "query", 100, "").toLowerCase();
  const page = readIntegerParameter(url, "page", 0, 0, 10_000);
  const limit = readIntegerParameter(url, "limit", 50, 1, 100);
  const { uuid, profile, member } = await loadSelectedMember(url, env);
  const computed = computeBestiary(member);
  const matchingFamilies = computed.families.filter((family) => !query ||
    `${family.family_id} ${family.name} ${family.category_name || ""}`.toLowerCase().includes(query));
  const pagination = paginateRecords(matchingFamilies, page, limit);

  return json({
    success: true,
    uuid,
    profile: compactProfile(profile, uuid),
    payload_kind: "player_bestiary",
    payload_version: "1",
    data_present: computed.data_present,
    data: {
      payload_kind: "player_bestiary",
      payload_version: "1",
      data_present: computed.data_present,
      available: computed.data_present,
      bestiary_api_present: computed.data_present,
      milestone: computed.milestone,
      max_milestone: computed.max_milestone,
      bestiary_level: computed.bestiary_level,
      max_bestiary_level: computed.max_bestiary_level,
      families_total: computed.families_total,
      families_unlocked: computed.families_unlocked,
      families_maxed: computed.families_maxed,
      untracked_kill_keys: computed.untracked_kill_keys,
      last_claimed_milestone: computed.last_claimed_milestone,
      query: query || null,
      page: pagination.page,
      limit: pagination.limit,
      total_items: pagination.total_items,
      total_pages: pagination.total_pages,
      has_more: pagination.has_more,
      families: pagination.items,
      reason: computed.data_present
        ? null
        : "Hypixel did not expose bestiary kill data (member.bestiary.kills) for this player on this profile.",
    },
  });
}

export async function handlePlayerAccessories(url, env) {
  const query = readTextParameter(url, "query", 100, "").toLowerCase();
  const page = readIntegerParameter(url, "page", 0, 0, 10_000);
  const limit = readIntegerParameter(url, "limit", 50, 1, 100);
  const [{ uuid, profile, member }, itemCatalog] = await Promise.all([
    loadSelectedMember(url, env),
    // Base accessory tiers for computed MP; null keeps the MP unavailable.
    fetchSkyBlockItemCatalogMap(env),
  ]);
  const compact = await compactAccessories(member);
  const allAccessories = Array.isArray(compact.accessories) ? compact.accessories : [];
  const bagSettings = objectOrEmpty(compact.bag_settings);
  const matchingAccessories = allAccessories.filter((item) =>
    !query || `${item.skyblock_id || ""} ${item.name || ""}`.toLowerCase().includes(query)
  );
  const counts = new Map();
  for (const item of allAccessories) {
    const id = item.skyblock_id || item.name || "UNKNOWN";
    counts.set(id, (counts.get(id) || 0) + 1);
  }
  const duplicateItems = [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([itemId, count]) => ({ item_id: itemId, count }))
    .sort((left, right) => right.count - left.count || left.item_id.localeCompare(right.item_id));
  const pagination = paginateRecords(matchingAccessories, page, limit);

  return json({
    success: true,
    uuid,
    profile: compactProfile(profile, uuid),
    payload_kind: "player_accessories",
    payload_version: "1",
    data_present: compact.accessory_bag_api_present === true,
    data: {
      payload_kind: "player_accessories",
      payload_version: "1",
      data_present: compact.accessory_bag_api_present === true,
      available: compact.available === true,
      accessory_bag_api_present: compact.accessory_bag_api_present === true,
      container: compact.container || null,
      highest_magical_power: firstNumber(
        bagSettings.highest_magical_power,
        bagSettings.highestMagicalPower
      ),
      reported_magical_power: firstNumber(
        bagSettings.magical_power,
        bagSettings.current_magical_power,
        bagSettings.magicalPower
      ),
      // Proxy-computed MP (SkyCrypt rules); null when the bag or the items
      // catalog is unavailable - never a guessed zero.
      computed_magical_power: compact.available === true
        ? computeMagicalPower(allAccessories, member, itemCatalog)
        : null,
      selected_power: stringOrNull(
        bagSettings.selected_power ?? bagSettings.selectedPower
      ),
      tuning: sanitize(bagSettings.tuning || {}, 5, 200),
      bag_settings: bagSettings,
      total_accessories: allAccessories.length,
      unique_item_ids: counts.size,
      duplicate_items: duplicateItems,
      query: query || null,
      page: pagination.page,
      limit: pagination.limit,
      total_items: pagination.total_items,
      total_pages: pagination.total_pages,
      has_more: pagination.has_more,
      accessories: pagination.items,
      reason: compact.reason || null,
      decode_error: compact.decode_error || null,
    },
  });
}

export async function handleSacks(url, env) {
  const { uuid, profile, member } = await loadSelectedMember(url, env);
  const query = readTextParameter(url, "query", 100, "").toLowerCase();
  const page = readIntegerParameter(url, "page", 0, 0, 10_000);
  const limit = readIntegerParameter(url, "limit", 50, 1, 100);
  const sort = requireEnumParameter(url, "sort", new Set(["quantity", "item_id", "name"]), "quantity");
  const order = requireEnumParameter(url, "order", new Set(["asc", "desc"]), "desc");
  const sacksCounts = findSacksCounts(member);

  if (!sacksCounts) {
    return json({
      success: true,
      uuid,
      profile: compactProfile(profile, uuid),
      payload_kind: "player_sacks",
      payload_version: "1",
      data_present: false,
      data: {
        payload_kind: "player_sacks",
        payload_version: "1",
        data_present: false,
        available: false,
        sacks_api_present: false,
        query: query || null,
        sort,
        order,
        total_distinct_items: 0,
        total_item_quantity: 0,
        page,
        limit,
        total_items: 0,
        total_pages: 0,
        has_more: false,
        items: [],
        reason: "Hypixel did not include sacks_counts. The player's Inventory API setting may be disabled.",
      },
    });
  }

  const itemNames = await fetchSkyBlockItemNameMap(env);
  const allItems = Object.entries(sacksCounts)
    .map(([itemId, rawQuantity]) => ({
      item_id: itemId,
      name: cleanItemName(itemNames.get(itemId)) || formatItemId(itemId),
      quantity: optionalNumber(rawQuantity),
    }))
    .filter((item) => item.quantity !== null && item.quantity > 0);
  const totalItemQuantity = allItems.reduce((sum, item) => sum + item.quantity, 0);
  const items = allItems.filter((item) => !query || `${item.item_id} ${item.name || ""}`.toLowerCase().includes(query));
  items.sort((left, right) => compareSackItems(left, right, sort, order));

  return json({
    success: true,
    uuid,
    profile: compactProfile(profile, uuid),
    payload_kind: "player_sacks",
    payload_version: "1",
    data_present: true,
    data: {
      payload_kind: "player_sacks",
      payload_version: "1",
      data_present: true,
      available: true,
      sacks_api_present: true,
      query: query || null,
      sort,
      order,
      total_distinct_items: allItems.length,
      total_item_quantity: totalItemQuantity,
      ...paginateRecords(items, page, limit),
      reason: null,
    },
  });
}

export async function handlePlayerExtra(url, env) {
  const uuid = requireUuid(url);
  const kind = requireEnumParameter(url, "kind", EXTRA_KINDS);

  if (kind === "bingo") {
    const payload = await fetchHypixelJson("/v2/skyblock/bingo", env, { uuid }, {
      authenticated: true,
    });
    return json({
      success: true,
      uuid,
      kind,
      data: {
        total_events: Array.isArray(payload.events) ? payload.events.length : 0,
        events: sanitize(payload.events || [], 7, 500),
      },
    });
  }

  const selector = cleanSelector(url.searchParams.get("profile"));
  const profiles = await fetchProfiles(uuid, env);
  const selectedProfile = selectProfile(profiles, uuid, selector);
  const profileId = normalizeUuid(selectedProfile.profile_id || "");
  if (!GENERIC_UUID_PATTERN.test(profileId)) {
    throw new ClientError("The selected SkyBlock profile did not contain a valid profile ID.", 502);
  }

  if (kind === "garden") {
    const payload = await fetchHypixelJson("/v2/skyblock/garden", env, { profile: profileId }, {
      authenticated: true,
    });
    return json({
      success: true,
      uuid,
      profile: compactProfile(selectedProfile, uuid),
      kind,
      data: compactGarden(payload.garden || {}),
    });
  }

  const payload = await fetchHypixelJson("/v2/skyblock/museum", env, { profile: profileId }, {
    authenticated: true,
  });
  const query = readTextParameter(url, "query", 100, "").toLowerCase();
  const page = readIntegerParameter(url, "page", 0, 0, 10_000);
  const requestedLimit = readIntegerParameter(url, "limit", 20, 1, 40);
  const detail = readDetailParameter(url);
  // Full detail is bounded like the inventory container route: few entries
  // per page, and compactMuseum caps expanded items per entry.
  const limit = detail === "full" ? Math.min(requestedLimit, 5) : requestedLimit;
  const museum = await compactMuseum(payload.profile || {}, query, page, limit, detail);

  return json({
    success: true,
    uuid,
    profile: compactProfile(selectedProfile, uuid),
    kind,
    data: { ...museum, requested_limit: requestedLimit },
  });
}

function compareSackItems(left, right, sort, order) {
  let comparison;
  if (sort === "item_id") {
    comparison = String(left.item_id || "").localeCompare(String(right.item_id || ""));
  } else if (sort === "name") {
    comparison = String(left.name || "").localeCompare(String(right.name || ""));
  } else {
    comparison = number(left.quantity) - number(right.quantity);
  }
  return order === "desc" ? -comparison : comparison;
}
