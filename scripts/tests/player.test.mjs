import assert from "node:assert/strict";
import { resetCaches } from "../../src/hypixel.js";
import { call, encodeItemsNbt, installMockFetch, nbtItem, playerUuid, profileId } from "./_fixtures.mjs";

export async function run() {
  installMockFetch();

  const collectionsResponse = await call(`/v1/player/collections?uuid=${playerUuid}&query=cobble&include_unlocks=true`);
  const collections = await collectionsResponse.json();
  assert.equal(collectionsResponse.status, 200, JSON.stringify(collections));
  assert.equal(collections.payload_kind, "player_collections");
  assert.equal(collections.data.collections[0].achieved_tier, 2);
  assert.equal(collections.data.collections[0].next_tier, 3);
  assert.deepEqual(collections.data.collections[0].unlocked_rewards, ["Cobblestone Minion Recipe", "Compactor Recipe"]);
  // Solo profile: the co-op sum equals the member's own amount, and no
  // unlocked_coll_tiers in the fixture means the claimed tier is unknown.
  assert.equal(collections.data.collections[0].member_amount, 750);
  assert.equal(collections.data.collections[0].coop_total_amount, 750);
  assert.equal(collections.data.collections[0].coop_achieved_tier, 2);
  assert.equal(collections.data.collections[0].claimed_tier, null, "no unlocked_coll_tiers means claimed tiers are unknown, not zero");
  assert.equal(collections.data.claimed_tiers_present, false);
  assert.equal(collections.data.members_with_collection_data, 1);
  assert.equal(collections.data.total_members, 1);
  assert.equal(collections.data.coop_totals_complete, true);

  // Co-op: collection progress is shared, so the summed amount crosses a
  // tier the single member's own amount never reaches, and
  // unlocked_coll_tiers is the claimed-tier truth. COBBLESTONE tiers are
  // 50/100/1000 (see _fixtures.mjs): member A's 40 alone is tier 0, but
  // A+B's 110 crosses tier 2.
  installMockFetch({
    "/v2/skyblock/profiles": () => Response.json({
      success: true,
      profiles: [{
        profile_id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        cute_name: "Mango",
        selected: true,
        members: {
          [playerUuid]: {
            last_save: 100,
            collection: { COBBLESTONE: 40 },
            player_data: { unlocked_coll_tiers: ["COBBLESTONE:1", "COBBLESTONE:2"] },
          },
          ffffffffffffffffffffffffffffffff: {
            collection: { COBBLESTONE: 70, LOG: 500 },
          },
        },
      }],
    }),
  });
  const coopResponse = await call(`/v1/player/collections?uuid=${playerUuid}`);
  const coop = await coopResponse.json();
  assert.equal(coopResponse.status, 200, JSON.stringify(coop));
  assert.equal(coop.data_present, true);
  const cobble = coop.data.collections.find((entry) => entry.collection_id === "COBBLESTONE");
  assert.equal(cobble.member_amount, 40);
  assert.equal(cobble.amount, 40, "amount keeps its original member-own semantic");
  assert.equal(cobble.achieved_tier, 0, "the member's own 40 sits below the 50-kill tier 1");
  assert.equal(cobble.coop_total_amount, 110, "co-op amounts sum across every profile member");
  assert.equal(cobble.coop_achieved_tier, 2, "the 110 co-op total crosses the 100 tier-2 requirement");
  assert.equal(cobble.claimed_tier, 2, "unlocked_coll_tiers is the claimed-tier truth");
  // A collection only a co-op partner worked appears with the member's own
  // amount unknown -- never fabricated as zero.
  const log = coop.data.collections.find((entry) => entry.collection_id === "LOG");
  assert.equal(log.member_amount, null);
  assert.equal(log.coop_total_amount, 500);
  assert.equal(log.claimed_tier, 0, "with the claimed-tier list present, an unlisted collection is a real zero");
  assert.equal(log.achieved_tier, null, "no member amount means no member-inferred tier");
  assert.equal(coop.data.claimed_tiers_present, true);
  assert.equal(coop.data.members_with_collection_data, 2);
  assert.equal(coop.data.total_members, 2);
  assert.equal(coop.data.coop_totals_complete, true);
  assert.equal(coop.data.total_collected, 40, "total_collected keeps its member-own semantic");
  assert.equal(coop.data.coop_total_collected, 610);

  // A co-op member hiding collections makes the co-op totals partial --
  // flagged, never presented as complete.
  installMockFetch({
    "/v2/skyblock/profiles": () => Response.json({
      success: true,
      profiles: [{
        profile_id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        cute_name: "Mango",
        selected: true,
        members: {
          [playerUuid]: { last_save: 100, collection: { COBBLESTONE: 40 } },
          ffffffffffffffffffffffffffffffff: { last_save: 100 },
        },
      }],
    }),
  });
  const partialCoop = await (await call(`/v1/player/collections?uuid=${playerUuid}`)).json();
  assert.equal(partialCoop.data.coop_totals_complete, false);
  assert.equal(partialCoop.data.members_with_collection_data, 1);

  // Nothing exposed anywhere -> unavailable, empty typed list.
  installMockFetch({
    "/v2/skyblock/profiles": () => Response.json({
      success: true,
      profiles: [{
        profile_id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        cute_name: "Mango",
        selected: true,
        members: { [playerUuid]: { last_save: 100 } },
      }],
    }),
  });
  const noCollectionsResponse = await call(`/v1/player/collections?uuid=${playerUuid}`);
  const noCollections = await noCollectionsResponse.json();
  assert.equal(noCollectionsResponse.status, 200, JSON.stringify(noCollections));
  assert.equal(noCollections.data_present, false);
  assert.equal(noCollections.data.available, false);
  assert.deepEqual(noCollections.data.collections, []);
  assert.ok(noCollections.data.reason);

  installMockFetch();

  const accessoriesResponse = await call(`/v1/player/accessories?uuid=${playerUuid}`);
  const accessories = await accessoriesResponse.json();
  assert.equal(accessoriesResponse.status, 200, JSON.stringify(accessories));
  assert.equal(accessories.payload_kind, "player_accessories");
  assert.equal(accessories.data.total_accessories, 1);
  assert.equal(accessories.data.selected_power, "fortuitous");
  assert.equal(accessories.data.highest_magical_power, 465);
  // The fixture's RED_ROSE:3 carries no catalog tier: it must land in
  // unknown_tier_ids with 0 MP, never a guessed rarity.
  assert.equal(accessories.data.reported_magical_power, null, "Hypixel never reports current MP");
  assert.deepEqual(accessories.data.computed_magical_power.unknown_tier_ids, ["RED_ROSE:3"]);
  assert.equal(accessories.data.computed_magical_power.total, 0);

  await runComputedMagicalPower();

  const forgeResponse = await call(`/v1/player/section?uuid=${playerUuid}&section=forge`);
  const forge = await forgeResponse.json();
  assert.equal(forgeResponse.status, 200, JSON.stringify(forge));
  assert.equal(forge.payload_kind, "profile_section_forge");
  assert.equal(forge.data.processes.length, 3);
  assert.equal(forge.data.processes.some((process) => process.needs_wiki_duration), true);

  const sacksResponse = await call(`/v1/player/sacks?uuid=${playerUuid}&query=titanium`);
  const sacks = await sacksResponse.json();
  assert.equal(sacksResponse.status, 200, JSON.stringify(sacks));
  assert.equal(sacks.data.items[0].item_id, "ENCHANTED_TITANIUM");
  assert.equal(sacks.data.items[0].quantity, 16);
}

async function runComputedMagicalPower() {
  // Mixed bag exercising every SkyCrypt MP rule at once: upgrade family
  // (only WOLF_RING counts), recombobulation (Hegemony legendary -> mythic,
  // doubled), exact duplicates (higher-rarity Zombie Talisman wins), aliases
  // (both Party Hats are one accessory), Abicase contacts, consumed Rift
  // Prism, and an id the catalog does not know.
  const profilesHandler = () => Response.json({
    success: true,
    profiles: [{
      profile_id: profileId,
      cute_name: "Mango",
      selected: true,
      members: {
        [playerUuid]: {
          last_save: 100,
          accessory_bag_storage: { selected_power: "fortuitous", highest_magical_power: 465 },
          rift: { access: { consumed_prism: true } },
          nether_island_player_data: { abiphone: { active_contacts: ["a", "b", "c", "d", "e"] } },
          inventory: {
            talisman_bag: {
              type: 0,
              data: encodeItemsNbt([
                nbtItem("WOLF_TALISMAN"),
                nbtItem("WOLF_RING"),
                nbtItem("HEGEMONY_ARTIFACT", { rarity_upgrades: 1 }),
                nbtItem("ABICASE", { model: "SUMSUNG_1" }),
                nbtItem("ZOMBIE_TALISMAN"),
                nbtItem("ZOMBIE_TALISMAN", { rarity_upgrades: 1 }),
                nbtItem("PARTY_HAT_CRAB"),
                nbtItem("PARTY_HAT_CRAB_ANIMATED"),
                nbtItem("MYSTERY_CHARM"),
              ]),
            },
          },
        },
      },
    }],
  });

  installMockFetch({ "/v2/skyblock/profiles": profilesHandler });
  resetCaches();

  const response = await call(`/v1/player/accessories?uuid=${playerUuid}`);
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  assert.equal(body.data.total_accessories, 9, "every decoded accessory stays listed");

  const computed = body.data.computed_magical_power;
  // WOLF_RING 8 + Hegemony mythic 22*2 + ABICASE 8 + uncommon Zombie 5 +
  // Party Hat 12 = 77; Abicase floor(5/2) = 2; Rift Prism 11.
  assert.equal(computed.accessory_magical_power, 77);
  assert.equal(computed.total, 90);
  assert.equal(computed.accessories_counted, 6);
  assert.equal(computed.duplicates_ignored, 3, "wolf talisman, duplicate zombie, aliased party hat");
  assert.deepEqual(computed.components, { hegemony: 44, abicase: 2, rift_prism: 11 });
  assert.deepEqual(computed.per_rarity.rare, { count: 2, magical_power: 16 });
  assert.deepEqual(computed.per_rarity.mythic, { count: 1, magical_power: 44 }, "recombobulation bumps the base tier");
  assert.deepEqual(computed.per_rarity.uncommon, { count: 1, magical_power: 5 });
  assert.deepEqual(computed.per_rarity.epic, { count: 1, magical_power: 12 });
  assert.deepEqual(computed.per_rarity.common, { count: 0, magical_power: 0 });
  assert.deepEqual(computed.unknown_tier_ids, ["MYSTERY_CHARM"], "unknown catalog tiers are flagged, not guessed");

  // Items catalog unavailable: computed MP is null, never zero, while the
  // decoded bag itself still returns.
  installMockFetch({
    "/v2/skyblock/profiles": profilesHandler,
    "/v2/resources/skyblock/items": () => Response.json({ success: false, cause: "down" }, { status: 503 }),
  });
  resetCaches();
  const degradedResponse = await call(`/v1/player/accessories?uuid=${playerUuid}`);
  const degraded = await degradedResponse.json();
  assert.equal(degradedResponse.status, 200, JSON.stringify(degraded));
  assert.equal(degraded.data.computed_magical_power, null);
  assert.equal(degraded.data.total_accessories, 9);

  // Restore the default mocks and caches for the tests that follow.
  installMockFetch();
  resetCaches();
}
