import assert from "node:assert/strict";
import { decodeContainer, findNbtContainers } from "../../src/items.js";
import { call, installMockFetch, itemNbt, member, playerUuid, profileId } from "./_fixtures.mjs";

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
