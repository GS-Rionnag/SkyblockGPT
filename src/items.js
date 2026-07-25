import { decodeBase64, decompressGzip, NbtReader } from "./nbt.js";
import { number, optionalNumber, sanitize, stringOrNull } from "./util.js";

export async function compactAccessories(member) {
  const containers = findNbtContainers(member);
  const container = containers.find((entry) => entry.kind === "accessory_bag");
  const bagSettings = sanitize(member.accessory_bag_storage || {}, 6, 400);

  if (!container) {
    return {
      available: false,
      accessory_bag_api_present: false,
      total_accessories: 0,
      accessories: [],
      bag_settings: bagSettings,
      reason: "Hypixel did not include the talisman bag inventory. The player's Inventory API setting may be disabled.",
    };
  }

  const decoded = await decodeInventoryBlob(container.blob);
  if (decoded.error) {
    return {
      available: false,
      accessory_bag_api_present: true,
      total_accessories: 0,
      accessories: [],
      bag_settings: bagSettings,
      reason: "Hypixel returned the talisman bag, but the proxy could not decode it.",
      decode_error: decoded.error,
    };
  }

  const accessories = decoded.items.sort((left, right) => number(left.slot) - number(right.slot));
  return {
    available: true,
    accessory_bag_api_present: true,
    container: containerMetadata(container),
    total_accessories: accessories.length,
    accessories,
    bag_settings: bagSettings,
    reason: null,
  };
}

// Hypixel moved the armor Wardrobe and the Equipment Wardrobe out of
// `inventory.wardrobe_contents` and into `member.loadout`, where every piece is
// its own tiny NBT blob keyed by set number and slot name.
const ARMOR_LOADOUT_PIECES = ["HELMET", "CHESTPLATE", "LEGGINGS", "BOOTS"];
const EQUIPMENT_LOADOUT_PIECES = ["EQUIPMENT_SLOT_1", "EQUIPMENT_SLOT_2", "EQUIPMENT_SLOT_3", "EQUIPMENT_SLOT_4"];

function loadoutWardrobeParts(sets, pieceKeys) {
  if (!sets || typeof sets !== "object") return [];
  const parts = [];
  for (const [key, set] of Object.entries(sets)) {
    // Numeric keys are wardrobe sets; `equipped_set` and friends are metadata.
    if (!/^\d+$/.test(key) || !set || typeof set !== "object") continue;
    for (const [offset, piece] of pieceKeys.entries()) {
      if (isNbtBlob(set[piece])) parts.push({ slot: Number(key) * 4 + offset, blob: set[piece] });
    }
  }
  return parts.sort((left, right) => left.slot - right.slot);
}

function loadoutWardrobeContainers(member, existing) {
  const loadout = member?.loadout;
  if (!loadout || typeof loadout !== "object") return [];

  const hasLegacyWardrobe = existing.some((entry) => entry.kind === "wardrobe");
  const wardrobes = [
    // Skip the loadout armor wardrobe when a legacy wardrobe_contents blob
    // already covers the same pieces, so the index lists each wardrobe once.
    { id: "loadout.armor", kind: "wardrobe", sets: loadout.armor, pieces: ARMOR_LOADOUT_PIECES, skip: hasLegacyWardrobe },
    { id: "loadout.equipment", kind: "equipment_wardrobe", sets: loadout.equipment, pieces: EQUIPMENT_LOADOUT_PIECES, skip: false },
  ];

  return wardrobes
    .filter((wardrobe) => !wardrobe.skip)
    .map((wardrobe) => ({
      id: wardrobe.id,
      label: CONTAINER_LABELS[wardrobe.kind],
      kind: wardrobe.kind,
      // Slot = set * 4 + piece offset, so one paged container covers every set.
      parts: loadoutWardrobeParts(wardrobe.sets, wardrobe.pieces),
    }))
    .filter((entry) => entry.parts.length > 0);
}

export function findNbtContainers(member) {
  const found = new Map();
  const visited = new WeakSet();

  const scan = (value, path, depth) => {
    if (!value || typeof value !== "object" || depth > 8) return;
    if (visited.has(value)) return;
    visited.add(value);

    if (isNbtBlob(value)) {
      if (!found.has(path)) {
        found.set(path, {
          id: path,
          label: inventoryContainerLabel(path),
          kind: inventoryContainerKind(path),
          blob: value,
        });
      }
      return;
    }

    for (const [key, child] of Object.entries(value).slice(0, 2_000)) {
      if (child && typeof child === "object") scan(child, `${path}.${key}`, depth + 1);
    }
  };

  if (member?.inventory && typeof member.inventory === "object") {
    scan(member.inventory, "inventory", 0);
  }

  for (const [key, value] of Object.entries(member || {})) {
    if (key === "inventory" || !/(?:contents|inventory|armor|equipment|wardrobe|backpack|bag|quiver|vault)/i.test(key)) {
      continue;
    }
    if (value && typeof value === "object") scan(value, key, 0);
  }

  const containers = [...found.values()].filter((entry) => entry.kind !== "backpack_icon");
  containers.push(...loadoutWardrobeContainers(member, containers));

  return containers.sort((left, right) => left.id.localeCompare(right.id));
}

export function findSacksCounts(member) {
  const candidates = [
    member?.inventory?.sacks_counts,
    member?.sacks_counts,
    member?.inventory?.bag_contents?.sacks_counts,
    member?.bag_contents?.sacks_counts,
  ];
  for (const candidate of candidates) {
    if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) return candidate;
  }
  return null;
}

function isNbtBlob(value) {
  if (!value || typeof value !== "object" || typeof value.data !== "string") return false;
  const data = value.data.replace(/\s+/g, "");
  if (data.length < 8) return false;
  return value.type !== undefined || /^[A-Za-z0-9+/_-]+={0,2}$/.test(data);
}

export function containerMetadata(container) {
  const blobs = Array.isArray(container.parts) ? container.parts.map((part) => part.blob) : [container.blob];
  const encodedLength = blobs.reduce((sum, blob) => {
    const encoded = typeof blob === "string" ? blob : blob?.data || "";
    return sum + encoded.replace(/\s+/g, "").length;
  }, 0);
  return {
    id: container.id,
    label: container.label,
    kind: container.kind,
    encoded_bytes_estimate: Math.floor(encodedLength * 0.75),
  };
}

function inventoryContainerKind(path) {
  const value = path.toLowerCase();
  if (/talisman|accessor/.test(value)) return "accessory_bag";
  if (/inv_armor|\.armor/.test(value)) return "armor";
  if (/equipment/.test(value)) return "equipment";
  if (/wardrobe/.test(value)) return "wardrobe";
  if (/ender_chest/.test(value)) return "ender_chest";
  if (/backpack_icons?/.test(value)) return "backpack_icon";
  if (/backpack/.test(value)) return "backpack";
  if (/personal_vault|vault/.test(value)) return "personal_vault";
  if (/fishing_bag/.test(value)) return "fishing_bag";
  if (/potion_bag/.test(value)) return "potion_bag";
  if (/quiver/.test(value)) return "quiver";
  if (/candy/.test(value)) return "candy_bag";
  if (/sacks?_bag/.test(value)) return "sacks_bag";
  if (/inv_contents/.test(value)) return "inventory";
  if (/bag/.test(value)) return "bag";
  return "other";
}

const CONTAINER_LABELS = {
  accessory_bag: "Accessory Bag",
  armor: "Worn Armor",
  equipment: "Equipment",
  wardrobe: "Wardrobe",
  equipment_wardrobe: "Equipment Wardrobe",
  ender_chest: "Ender Chest",
  backpack_icon: "Backpack Icon",
  backpack: "Backpack",
  personal_vault: "Personal Vault",
  fishing_bag: "Fishing Bag",
  potion_bag: "Potion Bag",
  quiver: "Quiver",
  candy_bag: "Candy Bag",
  sacks_bag: "Sacks Bag",
  inventory: "Main Inventory",
  bag: "Bag",
  other: "Item Container",
};

function inventoryContainerLabel(path) {
  const kind = inventoryContainerKind(path);
  const suffix = kind === "backpack" ? ` (${path.split(".").at(-1)})` : "";
  return `${CONTAINER_LABELS[kind]}${suffix}`;
}

export async function compactGear(member) {
  const inventory = member?.inventory || {};
  const armorBlob = inventory.inv_armor ?? member?.inv_armor;
  const equipmentBlob = inventory.equipment_contents ?? member?.equipment_contents;
  const [armorResult, equipmentResult] = await Promise.all([
    decodeInventoryBlob(armorBlob),
    decodeInventoryBlob(equipmentBlob),
  ]);

  const armor = {
    helmet: null,
    chestplate: null,
    leggings: null,
    boots: null,
  };

  for (const [index, item] of armorResult.items.entries()) {
    const armorSlot = inferArmorSlot(item, index);
    if (armorSlot) armor[armorSlot] = item;
  }

  const equipment = equipmentResult.items
    .map((item) => ({ ...item, category: inferEquipmentCategory(item) }))
    .sort((left, right) => number(left.slot) - number(right.slot));

  const anyBlobPresent = armorResult.present || equipmentResult.present;
  const anyDecoded =
    (armorResult.present && !armorResult.error) ||
    (equipmentResult.present && !equipmentResult.error);
  const decodeErrors = {};
  if (armorResult.error) decodeErrors.armor = armorResult.error;
  if (equipmentResult.error) decodeErrors.equipment = equipmentResult.error;

  return {
    available: anyDecoded,
    armor_api_present: armorResult.present,
    equipment_api_present: equipmentResult.present,
    armor,
    equipment,
    reason: !anyBlobPresent
      ? "Hypixel did not include armor or equipment inventory data. The player's Inventory API setting may be disabled."
      : !anyDecoded
        ? "Hypixel returned inventory data, but the proxy could not decode it."
        : null,
    decode_errors: Object.keys(decodeErrors).length ? decodeErrors : null,
  };
}

export async function decodeContainer(container) {
  if (!Array.isArray(container.parts)) return decodeInventoryBlob(container.blob);

  const results = await Promise.all(container.parts.map((part) => decodeInventoryBlob(part.blob)));
  const records = [];
  let firstError = null;

  for (const [index, result] of results.entries()) {
    if (result.error) {
      firstError ??= result.error;
      continue;
    }
    for (const record of result.records) {
      // Each loadout piece decodes as its own single-item container, so the
      // synthetic wardrobe slot replaces the piece-local slot 0.
      records.push({ summary: { ...record.summary, slot: container.parts[index].slot }, raw: record.raw });
    }
  }

  // A wardrobe with one corrupt piece stays readable; fail only when nothing decodes.
  return {
    present: true,
    items: records.map((record) => record.summary),
    records,
    error: records.length ? null : firstError,
  };
}

export async function decodeInventoryBlob(blob) {
  const encoded = typeof blob === "string" ? blob : blob?.data;
  if (typeof encoded !== "string" || !encoded.trim()) {
    return { present: false, items: [], records: [], error: null };
  }

  try {
    const compressed = decodeBase64(encoded);
    const uncompressed = await decompressGzip(compressed);
    const root = new NbtReader(uncompressed).readRoot();
    const rawItems = Array.isArray(root?.i) ? root.i : [];
    const records = rawItems
      .map((item, index) => {
        const summary = compactNbtItem(item, index);
        return summary ? { summary, raw: item } : null;
      })
      .filter(Boolean);
    return { present: true, items: records.map((record) => record.summary), records, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown NBT decoding error.";
    return { present: true, items: [], records: [], error: message.slice(0, 300) };
  }
}

function compactNbtItem(item, fallbackSlot) {
  if (!item || typeof item !== "object" || !Object.keys(item).length) return null;

  const tag = item.tag && typeof item.tag === "object" ? item.tag : {};
  const extra = tag.ExtraAttributes && typeof tag.ExtraAttributes === "object"
    ? tag.ExtraAttributes
    : item.ExtraAttributes && typeof item.ExtraAttributes === "object"
      ? item.ExtraAttributes
      : {};
  const display = tag.display && typeof tag.display === "object" ? tag.display : {};
  const skyblockId = stringOrNull(extra.id);
  const name = cleanItemName(display.Name || display.name || extra.display_name) || formatItemId(skyblockId);
  const vanillaId = optionalNumber(item.id);
  const rawSlot = optionalNumber(item.Slot);
  const slot = rawSlot !== null && rawSlot >= 0 ? rawSlot : fallbackSlot;

  if (!skyblockId && !name && (!vanillaId || vanillaId === 0)) return null;

  const attributeKeys = extra.attributes && typeof extra.attributes === "object"
    ? Object.keys(extra.attributes)
    : [];
  const enchantmentKeys = extra.enchantments && typeof extra.enchantments === "object"
    ? Object.keys(extra.enchantments)
    : [];

  return {
    slot,
    name: name || "Unknown item",
    skyblock_id: skyblockId,
    count: optionalNumber(item.Count) ?? 1,
    reforge: stringOrNull(extra.modifier),
    stars: optionalNumber(extra.upgrade_level ?? extra.dungeon_item_level),
    recombobulated: number(extra.rarity_upgrades) > 0,
    attributes: attributeKeys.slice(0, 20),
    attributes_truncated: attributeKeys.length > 20,
    enchantments: enchantmentKeys.slice(0, 50),
    enchantments_truncated: enchantmentKeys.length > 50,
  };
}

export function expandNbtItem(record) {
  const item = record.raw || {};
  const tag = item.tag && typeof item.tag === "object" ? item.tag : {};
  const extra = tag.ExtraAttributes && typeof tag.ExtraAttributes === "object"
    ? tag.ExtraAttributes
    : item.ExtraAttributes && typeof item.ExtraAttributes === "object"
      ? item.ExtraAttributes
      : {};
  const display = tag.display && typeof tag.display === "object" ? tag.display : {};
  const lore = Array.isArray(display.Lore)
    ? display.Lore.slice(0, 120).map(cleanItemName).filter(Boolean)
    : [];

  return {
    ...record.summary,
    minecraft_id: optionalNumber(item.id),
    damage: optionalNumber(item.Damage),
    lore,
    extra_attributes: sanitize(extra, 12, 1_500),
    nbt: sanitize(item, 12, 1_500),
  };
}

function inferArmorSlot(item, fallbackSlot) {
  const haystack = `${item.skyblock_id || ""} ${item.name || ""}`.toUpperCase();
  if (/HELMET|FEDORA|CROWN|MASK|GOGGLES/.test(haystack)) return "helmet";
  if (/CHESTPLATE|TUNIC/.test(haystack)) return "chestplate";
  if (/LEGGINGS|PANTS/.test(haystack)) return "leggings";
  if (/BOOTS|SHOES/.test(haystack)) return "boots";

  return ({ 0: "boots", 1: "leggings", 2: "chestplate", 3: "helmet" })[item.slot ?? fallbackSlot] || null;
}

function inferEquipmentCategory(item) {
  const haystack = `${item.skyblock_id || ""} ${item.name || ""}`.toUpperCase();
  if (haystack.includes("NECKLACE")) return "necklace";
  if (haystack.includes("CLOAK")) return "cloak";
  if (haystack.includes("BELT")) return "belt";
  if (haystack.includes("BRACELET")) return "bracelet";
  if (/GLOVE|GAUNTLET/.test(haystack)) return "gloves";
  return null;
}

export function cleanItemName(value) {
  if (value === null || value === undefined) return null;
  let text = String(value);

  if (text.startsWith("{") || text.startsWith("[")) {
    try {
      text = flattenTextComponent(JSON.parse(text));
    } catch {
      // Keep the original string when it is not valid JSON text-component data.
    }
  }

  text = text.replace(/§[0-9A-FK-ORX]/gi, "").trim();
  return text || null;
}

function flattenTextComponent(value) {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(flattenTextComponent).join("");
  if (!value || typeof value !== "object") return "";
  return `${value.text || ""}${Array.isArray(value.extra) ? value.extra.map(flattenTextComponent).join("") : ""}`;
}

export function formatItemId(value) {
  if (!value) return null;
  return String(value)
    .replace(/^STARRED_/, "")
    .split("_")
    .filter(Boolean)
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(" ");
}
