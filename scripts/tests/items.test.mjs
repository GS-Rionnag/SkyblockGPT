import assert from "node:assert/strict";
import { decodeContainer, decodeInventoryBlob, findNbtContainers } from "../../src/items.js";
import {
  call,
  encodeItemsNbt,
  encodeItemsNbtBytes,
  installMockFetch,
  itemNbt,
  member,
  nbtItem,
  playerUuid,
  profileId,
} from "./_fixtures.mjs";

export async function run() {
  // A factory, not a shared object: findNbtContainers guards recursion with a
  // `visited` WeakSet keyed by identity, so reusing one blob reference across
  // containers would make it skip all but the first. Real payloads come from
  // JSON.parse, which yields a distinct object per container.
  const blob = () => ({ type: 0, data: itemNbt });
  const containers = findNbtContainers({
    inventory: {
      inv_contents: blob(),
      backpack_contents: { 0: blob() },
      backpack_icons: { 0: blob() },
    },
  });
  const ids = containers.map((entry) => entry.id);

  assert.ok(ids.includes("inventory.inv_contents"), "main inventory must be indexed");
  assert.ok(ids.includes("inventory.backpack_contents.0"), "real backpacks must be indexed");
  assert.ok(
    !ids.some((id) => id.includes("backpack_icons")),
    "backpack_icons are display icons, not containers",
  );
  assert.equal(
    containers.filter((entry) => entry.kind === "backpack").length,
    1,
    "only the real backpack counts",
  );

  await runLoadoutWardrobes(blob);
  await runInventoryRoutes(blob);
  await runRiftAndSharedContainers(blob);
  await runSummaryLevelMaps();
  await runNestedBackpackDecode();
  await runLoadoutMetadata(blob);
}

async function runRiftAndSharedContainers(blob) {
  // member.rift.inventory never matched the old key scan, so rift gear was
  // only visible as truncated base64 inside the rift section.
  const containers = findNbtContainers({
    inventory: { inv_contents: blob() },
    rift: {
      inventory: {
        inv_contents: blob(),
        inv_armor: blob(),
        equipment_contents: blob(),
        ender_chest_contents: blob(),
      },
    },
    shared_inventory: { carnival_mask_inventory_contents: blob() },
  });
  const byId = Object.fromEntries(containers.map((entry) => [entry.id, entry]));

  assert.equal(byId.rift_inv_contents?.kind, "rift_inventory");
  assert.equal(byId.rift_inv_armor?.kind, "rift_armor");
  assert.equal(byId.rift_equipment_contents?.kind, "rift_equipment");
  assert.equal(byId.rift_ender_chest_contents?.kind, "rift_ender_chest");
  assert.equal(byId.rift_inv_contents?.label, "Rift Main Inventory");
  assert.equal(byId["shared_inventory.carnival_mask_inventory_contents"]?.kind, "carnival_masks");

  // An unknown member key no longer leaks into the index: the allowlist
  // replaced the substring regex that would have matched it.
  const unrelated = findNbtContainers({
    inventory: { inv_contents: blob() },
    weird_future_inventory_thing: { some_contents: blob() },
  });
  assert.ok(
    !unrelated.some((entry) => entry.id.startsWith("weird_future_inventory_thing")),
    "non-allowlisted member roots must not be indexed",
  );

  // Route level: a rift container decodes through the normal container flow.
  installMockFetch({
    "/v2/skyblock/profiles": () => Response.json({
      success: true,
      profiles: [{
        profile_id: profileId,
        cute_name: "Mango",
        selected: true,
        members: {
          [playerUuid]: { ...member(), rift: { inventory: { inv_contents: blob() } } },
        },
      }],
    }),
  });
  const response = await call(`/v1/player/inventory?uuid=${playerUuid}&container=rift_inv_contents`);
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  assert.equal(body.data.container.kind, "rift_inventory");
  assert.equal(body.data.items[0].name, "Azure Bluet");
}

async function runSummaryLevelMaps() {
  // Summary items keep the contractual key arrays and add parallel
  // {name: level} maps so callers don't need full detail for levels.
  const decoded = await decodeInventoryBlob({
    type: 0,
    data: encodeItemsNbt([
      nbtItem("ASPECT_OF_THE_END", {
        enchantments: { sharpness: 5, growth: 2 },
        attributes: { mending: 3 },
      }),
    ]),
  });
  assert.equal(decoded.error, null);
  const [summary] = decoded.items;
  assert.deepEqual(summary.enchantments, ["sharpness", "growth"], "key arrays keep their contractual shape");
  assert.deepEqual(summary.enchantment_levels, { sharpness: 5, growth: 2 });
  assert.deepEqual(summary.attributes, ["mending"]);
  assert.deepEqual(summary.attribute_levels, { mending: 3 });
  assert.equal(summary.enchantments_truncated, false);
}

async function runNestedBackpackDecode() {
  // ExtraAttributes *_backpack_data byte arrays hold gzipped NBT of the bag's
  // contents; full detail decodes them instead of dumping truncated numbers.
  const childBytes = encodeItemsNbtBytes([
    nbtItem("ENCHANTED_TITANIUM", {}, { name: "Enchanted Titanium" }),
    nbtItem("BOOSTER_COOKIE", {}, { name: "Booster Cookie" }),
  ]);
  const inventoryBlob = {
    type: 0,
    data: encodeItemsNbt([
      nbtItem("SMALL_BACKPACK", { small_backpack_data: { __bytes: childBytes } }, { name: "Small Backpack" }),
    ]),
  };
  installMockFetch({
    "/v2/skyblock/profiles": () => Response.json({
      success: true,
      profiles: [{
        profile_id: profileId,
        cute_name: "Mango",
        selected: true,
        members: { [playerUuid]: { ...member(), inventory: { inv_contents: inventoryBlob } } },
      }],
    }),
  });

  const itemResponse = await call(`/v1/player/item?uuid=${playerUuid}&container=inventory.inv_contents&slot=0`);
  const itemBody = await itemResponse.json();
  assert.equal(itemResponse.status, 200, JSON.stringify(itemBody));
  const fullItem = itemBody.data.item;
  assert.equal(fullItem.contained_items.length, 1);
  assert.equal(fullItem.contained_items[0].source_key, "small_backpack_data");
  assert.equal(fullItem.contained_items[0].total_items, 2);
  assert.equal(fullItem.contained_items[0].items_truncated, false);
  assert.equal(fullItem.contained_items[0].decode_error, null);
  assert.deepEqual(
    fullItem.contained_items[0].items.map((child) => child.skyblock_id),
    ["ENCHANTED_TITANIUM", "BOOSTER_COOKIE"],
  );
  assert.equal(
    fullItem.extra_attributes.small_backpack_data,
    "[decoded in contained_items]",
    "the raw byte dump must be replaced everywhere it appeared",
  );
  assert.equal(fullItem.nbt.tag.ExtraAttributes.small_backpack_data, "[decoded in contained_items]");
  assert.equal(fullItem.contained_bags_truncated, false);

  // Summary listings stay untouched: no nested decode, no byte dump.
  const summaryResponse = await call(`/v1/player/inventory?uuid=${playerUuid}&container=inventory.inv_contents`);
  const summaryBody = await summaryResponse.json();
  assert.equal(summaryResponse.status, 200, JSON.stringify(summaryBody));
  assert.equal(summaryBody.data.items[0].contained_items, undefined);
  assert.equal(summaryBody.data.items[0].extra_attributes, undefined);
}

async function runLoadoutMetadata(blob) {
  // Equipped-set numbers and saved loadout configs ride along with the index.
  installMockFetch({
    "/v2/skyblock/profiles": () => Response.json({
      success: true,
      profiles: [{
        profile_id: profileId,
        cute_name: "Mango",
        selected: true,
        members: {
          [playerUuid]: {
            ...member(),
            inventory: { ...member().inventory, wardrobe_equipped_slot: 2 },
            loadout: {
              armor: { equipped_set: 1, 0: { id: 1, HELMET: blob() } },
              equipment: { equipped_set: 0, 0: { id: 1, EQUIPMENT_SLOT_1: blob() } },
              loadouts: {
                1: { id: 2, name: "§9Farming", armor_set_id: 3, power_stone: "SCORCHED", tuning_points_slot: 2 },
                0: { id: 1, name: "Mining", armor_set_id: 1, pet: "abc-123" },
              },
            },
          },
        },
      }],
    }),
  });

  const response = await call(`/v1/player/inventories?uuid=${playerUuid}`);
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  const loadout = body.data.loadout;
  assert.equal(loadout.wardrobe_equipped_slot, 2);
  assert.equal(loadout.armor_equipped_set, 1);
  assert.equal(loadout.equipment_equipped_set, 0);
  assert.deepEqual(loadout.loadouts.map((entry) => entry.index), [0, 1], "saved loadouts sort by index");
  assert.equal(loadout.loadouts[0].name, "Mining");
  assert.equal(loadout.loadouts[0].pet, "abc-123");
  assert.equal(loadout.loadouts[0].power_stone, null, "absent loadout fields are null, not fabricated");
  assert.equal(loadout.loadouts[1].name, "Farming", "color codes are stripped from loadout names");
  assert.equal(loadout.loadouts[1].armor_set_id, 3);
  assert.equal(loadout.loadouts[1].power_stone, "SCORCHED");
  assert.equal(loadout.loadouts[1].tuning_points_slot, 2);

  // No loadout data and no legacy pointer: metadata is unavailable, not {}.
  installMockFetch();
  const bareResponse = await call(`/v1/player/inventories?uuid=${playerUuid}`);
  const bareBody = await bareResponse.json();
  assert.equal(bareResponse.status, 200, JSON.stringify(bareBody));
  assert.equal(bareBody.data.loadout, null);
}

async function runLoadoutWardrobes(blob) {
  // Hypixel's loadout update stores each wardrobe piece as its own NBT blob
  // under member.loadout instead of one inventory.wardrobe_contents blob.
  const loadout = {
    armor: {
      equipped_set: 1,
      0: { id: 1, HELMET: blob(), CHESTPLATE: blob() },
      1: { id: 2, BOOTS: blob() },
    },
    equipment: {
      equipped_set: 0,
      0: { id: 1, EQUIPMENT_SLOT_1: blob(), EQUIPMENT_SLOT_3: blob() },
    },
    loadouts: { 0: { id: 1, name: "Mining", armor_set_id: 1 } },
  };

  const containers = findNbtContainers({ inventory: { inv_contents: blob() }, loadout });
  const wardrobe = containers.find((entry) => entry.id === "loadout.armor");
  const equipmentWardrobe = containers.find((entry) => entry.id === "loadout.equipment");

  assert.ok(wardrobe, "loadout armor sets must appear as a wardrobe container");
  assert.equal(wardrobe.kind, "wardrobe");
  assert.equal(wardrobe.label, "Wardrobe");
  assert.deepEqual(wardrobe.parts.map((part) => part.slot), [0, 1, 7], "slot = set * 4 + piece offset");

  assert.ok(equipmentWardrobe, "loadout equipment sets must appear as an equipment wardrobe container");
  assert.equal(equipmentWardrobe.kind, "equipment_wardrobe");
  assert.equal(equipmentWardrobe.label, "Equipment Wardrobe");
  assert.deepEqual(equipmentWardrobe.parts.map((part) => part.slot), [0, 2]);

  assert.ok(
    !containers.some((entry) => entry.id.startsWith("loadout.loadouts")),
    "saved loadout configs hold no items and must not be indexed",
  );

  const decoded = await decodeContainer(equipmentWardrobe);
  assert.equal(decoded.error, null);
  assert.deepEqual(
    decoded.items.map((item) => item.slot),
    [0, 2],
    "decoded pieces must keep their synthetic wardrobe slots",
  );
  assert.equal(decoded.items[0].name, "Azure Bluet");

  // A legacy wardrobe_contents blob and loadout.armor describe the same
  // wardrobe; the index must list it once, while equipment still appears.
  const withLegacy = findNbtContainers({
    inventory: { inv_contents: blob(), wardrobe_contents: blob() },
    loadout,
  });
  assert.equal(
    withLegacy.filter((entry) => entry.kind === "wardrobe").length,
    1,
    "legacy wardrobe_contents suppresses the duplicate loadout armor container",
  );
  assert.ok(withLegacy.some((entry) => entry.id === "inventory.wardrobe_contents"));
  assert.ok(withLegacy.some((entry) => entry.kind === "equipment_wardrobe"));
}

async function runInventoryRoutes(blob) {
  installMockFetch({
    "/v2/skyblock/profiles": () => Response.json({
      success: true,
      profiles: [{
        profile_id: profileId,
        cute_name: "Mango",
        selected: true,
        members: {
          [playerUuid]: {
            ...member(),
            loadout: {
              armor: { equipped_set: 0, 0: { id: 1, HELMET: blob() } },
              equipment: { equipped_set: 0, 0: { id: 1, EQUIPMENT_SLOT_1: blob(), EQUIPMENT_SLOT_4: blob() } },
            },
          },
        },
      }],
    }),
  });

  const indexResponse = await call(`/v1/player/inventories?uuid=${playerUuid}`);
  const index = await indexResponse.json();
  assert.equal(indexResponse.status, 200, JSON.stringify(index));
  const indexed = Object.fromEntries(index.data.containers.map((entry) => [entry.id, entry]));
  assert.equal(indexed["loadout.armor"]?.kind, "wardrobe");
  assert.equal(indexed["loadout.equipment"]?.kind, "equipment_wardrobe");
  assert.equal(indexed["loadout.equipment"]?.label, "Equipment Wardrobe");
  assert.ok(indexed["loadout.equipment"].encoded_bytes_estimate > 0, "multi-part containers report their size");

  const containerResponse = await call(`/v1/player/inventory?uuid=${playerUuid}&container=loadout.equipment`);
  const container = await containerResponse.json();
  assert.equal(containerResponse.status, 200, JSON.stringify(container));
  assert.equal(container.data.total_items, 2);
  assert.deepEqual(container.data.items.map((item) => item.slot), [0, 3]);

  const itemResponse = await call(`/v1/player/item?uuid=${playerUuid}&container=loadout.equipment&slot=3`);
  const item = await itemResponse.json();
  assert.equal(itemResponse.status, 200, JSON.stringify(item));
  assert.equal(item.data.item.slot, 3);
  assert.equal(item.data.item.name, "Azure Bluet");
}
