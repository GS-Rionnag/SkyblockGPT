import assert from "node:assert/strict";
import { call, installMockFetch, playerUuid } from "./_fixtures.mjs";
import { resetCaches } from "../../src/hypixel.js";

// A derived level's provenance must always be resolvable. Since 26de7b9
// hoisted provenance out of each item, that guarantee now runs through a
// `level` object's `ladder` pointer into the section's `level_provenance.
// ladders`, rather than through fields on the level object itself. This
// checks both directions: every pointer resolves to a real entry, and every
// entry is referenced by at least one item -- a dangling pointer or an
// unused entry both defeat the point of hoisting provenance in the first
// place.
function assertProvenanceResolves(levels, provenance, label) {
  const referenced = new Set();
  for (const level of levels) {
    if (!level.available) {
      assert.equal(level.ladder, undefined, `${label}: an unavailable level must not carry a ladder pointer`);
      continue;
    }
    assert.ok(level.ladder, `${label}: an available level must carry a ladder pointer`);
    assert.ok(
      provenance.ladders[level.ladder],
      `${label}: ladder "${level.ladder}" must resolve in level_provenance.ladders`
    );
    referenced.add(level.ladder);
  }
  for (const key of Object.keys(provenance.ladders)) {
    assert.ok(referenced.has(key), `${label}: level_provenance.ladders has unused entry "${key}"`);
  }
}

export async function run() {
  // player_stats is nested. The old filter tested the key `kills` against
  // /kill/, then dropped it because its value is an object.
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
            player_stats: {
              kills: { total: 5_000, zombie: 1_200 },
              deaths: { total: 40 },
              highest_critical_damage: 1_000_000,
              mining: { ores_mined: 900 },
              auctions: { created: 3 },
            },
          },
        },
      }],
    }),
  });

  const response = await call(`/v1/player/section?uuid=${playerUuid}&section=stats`);
  const stats = await response.json();
  assert.equal(response.status, 200, JSON.stringify(stats));

  const combat = stats.data.combat.lifetime_counters;
  assert.equal(combat["kills.total"], 5_000, "nested kill counters must be reached");
  assert.equal(combat["kills.zombie"], 1_200);
  assert.equal(combat["deaths.total"], 40);
  assert.equal(combat.highest_critical_damage, 1_000_000, "scalars must still work");

  const mining = stats.data.mining.lifetime_counters;
  assert.equal(mining["mining.ores_mined"], 900);
  assert.equal(mining["kills.total"], undefined, "category regexes must still scope");

  // A small, ordinary fixture must not be flagged truncated — a flag that is
  // always true is as useless as no flag at all.
  assert.equal(stats.data.lifetime_counters_truncated, false, "small player_stats must not be flagged truncated");

  // Dedicated stat buckets: an absent player_stats sub-object is unavailable
  // (null fields), never zeroed. This fixture exposes auctions but no
  // dragon_fight, mythos, races, candy, or pet milestones.
  assert.equal(stats.data.dragons.available, false);
  assert.equal(stats.data.dragons.most_damage, null, "no dragon_fight object means null, not zero");
  assert.equal(stats.data.mythos.available, false);
  assert.equal(stats.data.mythos.kills, null);
  assert.equal(stats.data.races.available, false);
  assert.equal(stats.data.races.best_times, null);
  assert.equal(stats.data.auctions.available, true, "the auctions bucket picks up the exposed object");
  assert.equal(stats.data.auctions.created, 3);
  assert.equal(stats.data.auctions.gold_spent, null, "an absent counter inside a present object stays null");
  assert.equal(stats.data.gifts.available, false);
  assert.equal(stats.data.candy_collected.available, false);
  assert.equal(stats.data.pets_milestones.available, false);
  assert.equal(stats.data.highest_critical_damage, 1_000_000);

  // A player_stats payload that genuinely exceeds sanitize's entry cap (900
  // at this depth) must flip the flag to true. This fails if the report
  // plumbing is removed from compactStats's lifetime_counters call.
  const wideStats = {};
  for (let i = 0; i < 901; i += 1) wideStats[`stat_${i}`] = i;
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
            player_stats: wideStats,
          },
        },
      }],
    }),
  });
  const wideResponse = await call(`/v1/player/section?uuid=${playerUuid}&section=stats`);
  const wideStatsBody = await wideResponse.json();
  assert.equal(wideResponse.status, 200, JSON.stringify(wideStatsBody));
  assert.equal(wideStatsBody.data.lifetime_counters_truncated, true, "an over-cap player_stats must be flagged truncated");

  // Museum decodes the paginated page and never ships raw base64.
  installMockFetch();
  const museumResponse = await call(`/v1/player/extra?uuid=${playerUuid}&kind=museum`);
  const museum = await museumResponse.json();
  assert.equal(museumResponse.status, 200, JSON.stringify(museum));

  // The museum key is the donated item's ID; the blob is its NBT. The shared
  // fixture blob decodes to RED_ROSE:3 ("Azure Bluet") — verified, not assumed.
  const entry = museum.data.items[0];
  assert.equal(entry.item_id, "ZOMBIE_SWORD", "museum key is preserved");
  assert.ok(Array.isArray(entry.decoded_items), "decoded_items must be a list, not just the first record");
  assert.equal(entry.decoded_items[0].skyblock_id, "RED_ROSE:3", "page items must be decoded");
  assert.equal(entry.decoded_items[0].name, "Azure Bluet");
  assert.equal(entry.blob_present, true, "a decodable blob must report presence");
  assert.equal(entry.decode_error, null);
  assert.equal(entry.decoded_items_truncated, false, "a single-item blob must not be flagged as truncated");
  assert.equal(entry.item, undefined, "the old singular item field must be gone");
  assert.equal(entry.data, undefined, "raw blob must not ship");
  assert.equal(entry.blob, undefined, "internal blob ref must not ship");
  assert.equal(entry.borrowing, false, "no upstream borrowing flag means an owned donation");
  assert.equal(entry.featured_slot, "A_1");
  assert.equal(entry.decoded_items[0].lore, undefined, "summary museum entries must not carry expanded detail");
  assert.equal(museum.data.detail, "summary");
  const borrowedEntry = museum.data.items.find((record) => record.item_id === "UNDEAD_SWORD");
  assert.equal(borrowedEntry.borrowing, true, "a loaned donation must be flagged");
  assert.equal(borrowedEntry.featured_slot, null);
  assert.equal(museum.data.members[0].value, 1234);
  assert.equal(museum.data.members[0].total_entries, 3, "two items entries plus one special");

  // detail=full expands the decoded items and tightens the page bound like
  // the inventory container route.
  const fullMuseumResponse = await call(`/v1/player/extra?uuid=${playerUuid}&kind=museum&detail=full&limit=9`);
  const fullMuseum = await fullMuseumResponse.json();
  assert.equal(fullMuseumResponse.status, 200, JSON.stringify(fullMuseum));
  assert.equal(fullMuseum.data.detail, "full");
  assert.equal(fullMuseum.data.limit, 5, "full museum detail caps entries per page at 5");
  assert.equal(fullMuseum.data.requested_limit, 9);
  const fullEntry = fullMuseum.data.items[0];
  assert.ok(Array.isArray(fullEntry.decoded_items[0].lore), "full detail expands decoded museum items");
  assert.ok(fullEntry.decoded_items[0].extra_attributes, "full detail carries ExtraAttributes");

  const badMuseumDetail = await call(`/v1/player/extra?uuid=${playerUuid}&kind=museum&detail=everything`);
  assert.equal(badMuseumDetail.status, 400, "detail must be summary or full");

  // compactGarden wraps the whole returned object in sanitize. A small,
  // ordinary garden payload must not be flagged truncated.
  installMockFetch({
    "/v2/skyblock/garden": () => Response.json({
      success: true,
      garden: { uuid: playerUuid, garden_experience: 5_000, unlocked_plots_ids: ["beginner_1"] },
    }),
  });
  const gardenResponse = await call(`/v1/player/extra?uuid=${playerUuid}&kind=garden`);
  const garden = await gardenResponse.json();
  assert.equal(gardenResponse.status, 200, JSON.stringify(garden));
  assert.equal(garden.data.garden_truncated, false, "a small garden payload must not be flagged truncated");
  assert.equal(garden.data.garden_experience, 5_000, "sibling fields must survive alongside the new flag");

  // A garden payload that genuinely exceeds sanitize's array cap (250 at
  // this depth) must flip the flag to true. This fails if the report
  // plumbing is removed from compactGarden's sanitize call.
  installMockFetch({
    "/v2/skyblock/garden": () => Response.json({
      success: true,
      garden: {
        uuid: playerUuid,
        garden_experience: 5_000,
        unlocked_plots_ids: Array.from({ length: 251 }, (_, i) => `plot_${i}`),
      },
    }),
  });
  const wideGardenResponse = await call(`/v1/player/extra?uuid=${playerUuid}&kind=garden`);
  const wideGarden = await wideGardenResponse.json();
  assert.equal(wideGardenResponse.status, 200, JSON.stringify(wideGarden));
  assert.equal(wideGarden.data.garden_truncated, true, "an over-cap garden payload must be flagged truncated");

  // section=pets must return an object, not the bare array Hypixel's
  // OpenAPI schema (CompactDataResponse.data: object) forbids. One pet has a
  // known rarity (must derive a leveled, sourced level); a second has no
  // tier at all (must report the level unavailable, never guess a ladder).
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
            pets_data: {
              pets: [
                { uuid: "pet-1", type: "ENDER_DRAGON", exp: 4_600_000, active: true, tier: "LEGENDARY", heldItem: null },
                { uuid: "pet-2", type: "SOME_PET", exp: 500, active: false },
              ],
            },
          },
        },
      }],
    }),
  });
  const petsResponse = await call(`/v1/player/section?uuid=${playerUuid}&section=pets`);
  const petsBody = await petsResponse.json();
  assert.equal(petsResponse.status, 200, JSON.stringify(petsBody));
  assert.equal(Array.isArray(petsBody.data), false, "section=pets must return an object, matching the OpenAPI contract");
  assert.equal(petsBody.data.available, true);
  assert.equal(petsBody.data.total_pets, 2);
  assert.equal(petsBody.data.returned, 2);
  assert.equal(petsBody.data.truncated, false);
  assert.equal(petsBody.data.pets.length, 2);
  assert.equal(petsBody.data.pets[0].exp, 4_600_000, "exp must survive alongside the new level field");

  // Provenance now lives once per response, in level_provenance, with each
  // pet pointing at the ladder it used.
  const petProvenance = petsBody.data.level_provenance;
  assert.equal(petProvenance.level_source, "static_table");
  assert.ok(petProvenance.table_version);
  assert.equal(petProvenance.verify_on_wiki, true);
  assertProvenanceResolves(petsBody.data.pets.map((pet) => pet.level), petProvenance, "pets");

  const knownPetLevel = petsBody.data.pets[0].level;
  assert.equal(knownPetLevel.available, true, "a pet with a known rarity must derive a level");
  assert.ok(knownPetLevel.ladder, "a known-rarity pet's level must carry a ladder pointer");
  const knownPetLadder = petProvenance.ladders[knownPetLevel.ladder];
  assert.notEqual(knownPetLadder.source_authority, null, "a known-rarity pet's ladder must carry its source authority");
  assert.ok(knownPetLadder.source_url, "a known-rarity pet's ladder must carry a source URL");

  const unknownPetLevel = petsBody.data.pets[1].level;
  assert.equal(unknownPetLevel.available, false, "a pet with no rarity must report its level unavailable, not guess a ladder");
  assert.equal(unknownPetLevel.ladder, undefined, "an unavailable pet level must not carry a ladder pointer");

  // Missing pet data entirely (no pets_data.pets, no pets) must read as
  // unavailable, not as an empty list presented as though the player has
  // zero pets.
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
  const noPetsResponse = await call(`/v1/player/section?uuid=${playerUuid}&section=pets`);
  const noPetsBody = await noPetsResponse.json();
  assert.equal(noPetsResponse.status, 200, JSON.stringify(noPetsBody));
  assert.equal(noPetsBody.data.available, false);
  assert.ok(noPetsBody.data.reason, "missing pet data must explain why, not just report available:false");
  assert.deepEqual(noPetsBody.data.pets, [], "still shaped as an object with an empty pets list, not a bare array");
  assert.deepEqual(
    noPetsBody.data.level_provenance.ladders, {},
    "no pets means no ladder was used, so level_provenance.ladders must be empty, not carry unused entries"
  );

  // section=slayers must derive a level for a known boss, carrying full
  // provenance (Hypixel publishes no slayer XP ladder itself).
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
            slayer: {
              slayer_quest: {
                type: "zombie",
                tier: 3,
                start_timestamp: 1_700_000_000_000,
                completion_state: 1,
                combat_xp: 1_500,
                recent_mob_kills: Array.from({ length: 12 }, (_, i) => ({ xp: 100 + i, timestamp: 1_700_000_000_000 + i })),
              },
              slayer_bosses: { zombie: { xp: 1_000_000, claimed_levels: { level_1: true } } },
            },
          },
        },
      }],
    }),
  });
  const slayersResponse = await call(`/v1/player/section?uuid=${playerUuid}&section=slayers`);
  const slayersBody = await slayersResponse.json();
  assert.equal(slayersResponse.status, 200, JSON.stringify(slayersBody));
  const zombieLevel = slayersBody.data.zombie.level;
  assert.equal(zombieLevel.available, true, "a known slayer boss must derive a level");
  assert.equal(zombieLevel.level, 9, "1,000,000 XP is the top zombie threshold");
  assert.ok(zombieLevel.ladder, "a known slayer boss's level must carry a ladder pointer");

  const slayerProvenance = slayersBody.data.level_provenance;
  assert.equal(slayerProvenance.level_source, "static_table");
  assert.ok(slayerProvenance.table_version);
  assert.equal(slayerProvenance.verify_on_wiki, true);
  assertProvenanceResolves([zombieLevel], slayerProvenance, "slayers");

  const zombieLadder = slayerProvenance.ladders[zombieLevel.ladder];
  assert.equal(zombieLadder.source_authority, "wiki");
  assert.ok(zombieLadder.source_url);

  // The active slayer quest ships alongside the per-boss records, with the
  // rolling recent-kill window capped.
  const activeQuest = slayersBody.data.active_quest;
  assert.equal(activeQuest.available, true);
  assert.equal(activeQuest.type, "zombie");
  assert.equal(activeQuest.tier, 3);
  assert.equal(activeQuest.start_timestamp, 1_700_000_000_000);
  assert.equal(activeQuest.completion_state, 1);
  assert.equal(activeQuest.combat_xp, 1_500);
  assert.equal(activeQuest.recent_mob_kills.length, 10, "recent mob kills must cap, not ship the whole window");
  assert.equal(activeQuest.recent_mob_kills_truncated, true);
  assert.equal(activeQuest.recent_mob_kills[0].xp, 100, "capped entries keep Hypixel's own order");

  // No slayer_quest object -> the quest is unavailable, never "no quest".
  installMockFetch({
    "/v2/skyblock/profiles": () => Response.json({
      success: true,
      profiles: [{
        profile_id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        cute_name: "Mango",
        selected: true,
        members: {
          [playerUuid]: { last_save: 100, slayer: { slayer_bosses: { zombie: { xp: 5 } } } },
        },
      }],
    }),
  });
  const noQuestResponse = await call(`/v1/player/section?uuid=${playerUuid}&section=slayers`);
  const noQuestBody = await noQuestResponse.json();
  assert.equal(noQuestResponse.status, 200, JSON.stringify(noQuestBody));
  assert.equal(noQuestBody.data.active_quest.available, false);
  assert.equal(noQuestBody.data.active_quest.type, null, "an unexposed quest reads null, never a zeroed record");
  assert.equal(noQuestBody.data.active_quest.recent_mob_kills_truncated, false);

  // section=dungeons must derive both a Catacombs level and a class level.
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
            dungeons: {
              selected_dungeon_class: "tank",
              dungeon_types: { catacombs: { experience: 50 } },
              player_classes: { tank: { experience: 50 } },
            },
          },
        },
      }],
    }),
  });
  const dungeonsResponse = await call(`/v1/player/section?uuid=${playerUuid}&section=dungeons`);
  const dungeonsBody = await dungeonsResponse.json();
  assert.equal(dungeonsResponse.status, 200, JSON.stringify(dungeonsBody));
  const catacombsLevel = dungeonsBody.data.dungeon_types.catacombs.level;
  assert.equal(catacombsLevel.available, true, "catacombs XP must derive a level");
  assert.equal(catacombsLevel.level, 1);
  assert.ok(catacombsLevel.ladder, "catacombs level must carry a ladder pointer");
  const tankLevel = dungeonsBody.data.player_classes.tank.level;
  assert.equal(tankLevel.available, true, "class XP must derive a level");
  assert.equal(tankLevel.level, 1);
  assert.ok(tankLevel.ladder, "class level must carry a ladder pointer");

  const dungeonProvenance = dungeonsBody.data.level_provenance;
  assertProvenanceResolves([catacombsLevel, tankLevel], dungeonProvenance, "dungeons");

  const catacombsLadder = dungeonProvenance.ladders[catacombsLevel.ladder];
  assert.equal(catacombsLadder.source_authority, "wiki");

  // dungeon_class comes from wiki.hypixel.net rather than the pinned
  // hypixelskyblock.minecraft.wiki (see levels.js), but the owner has decided
  // both wikis are acceptable sources for ladder data, so its authority is
  // "wiki" like every other ladder. Which wiki it actually came from still
  // lives in source_url, kept per-ladder rather than hoisted to
  // level_provenance's top level -- this is the assertion that would catch a
  // regression that flattened it away.
  const classLadder = dungeonProvenance.ladders[tankLevel.ladder];
  assert.equal(classLadder.source_authority, "wiki", "both wikis are acceptable for ladder data (owner decision)");
  assert.ok(classLadder.source_url.includes("wiki.hypixel.net"), "source_url still records which wiki this ladder came from");

  // Overflow fields ride on every dungeons level derivation, even below the
  // cap, and absent lifetime scalars stay null.
  assert.equal(catacombsLevel.level_with_overflow, 1, "below the cap the overflow level equals the level");
  assert.equal(catacombsLevel.overflow_xp, 0);
  assert.equal(tankLevel.level_with_overflow, 1, "classes share the cosmetic continuation");
  assert.equal(dungeonsBody.data.dungeon_types.catacombs.best_run_per_floor, null, "no best_runs upstream means unavailable, not empty");
  assert.equal(dungeonsBody.data.dungeon_types.catacombs.best_runs_available, false);
  assert.equal(dungeonsBody.data.secrets, null, "absent lifetime secrets is null, never zero");
  assert.equal(dungeonsBody.data.last_dungeon_run, null);
  assert.equal(dungeonsBody.data.daily_runs, null);

  // section=bestiary is now the computed milestone rollup (SkyCrypt bracket
  // math), never the raw kills blob. 55 Enderman kills on the Private Island
  // family (bracket 1: 20/40/60/...) is tier 2 with tier 3 at 60 kills.
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
            bestiary: {
              kills: { enderman_1: 30, enderman_2: 25, brand_new_mob_1: 7 },
              milestone: { last_claimed_milestone: 2 },
            },
          },
        },
      }],
    }),
  });
  const bestiaryResponse = await call(`/v1/player/section?uuid=${playerUuid}&section=bestiary`);
  const bestiaryBody = await bestiaryResponse.json();
  assert.equal(bestiaryResponse.status, 200, JSON.stringify(bestiaryBody));
  assert.equal(bestiaryBody.data_present, true, "envelope must mirror the section's own data_present");
  assert.equal(bestiaryBody.data.milestone, 2, "one family at tier 2 is the whole milestone");
  assert.equal(bestiaryBody.data.bestiary_level, 0.2, "Bestiary level is milestone / 10");
  assert.equal(bestiaryBody.data.families_unlocked, 1);
  assert.equal(bestiaryBody.data.families_maxed, 0);
  assert.equal(bestiaryBody.data.families_total, 208, "the transcribed SkyCrypt table carries 208 families");
  assert.ok(bestiaryBody.data.max_milestone > 0);
  assert.equal(bestiaryBody.data.untracked_kill_keys, 1, "a kill key outside the table is counted, not dropped");
  assert.equal(bestiaryBody.data.last_claimed_milestone, 2);
  const privateIsland = bestiaryBody.data.categories.find((entry) => entry.category_id === "dynamic");
  assert.equal(privateIsland.category_name, "Private Island");
  assert.equal(privateIsland.families_unlocked, 1);
  assert.equal(privateIsland.milestone, 2);
  assert.equal(bestiaryBody.data.families, undefined, "the 200+ family list must not ship on the section route");

  // No kills object at all -> unavailable, never a zeroed milestone.
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
  const noBestiaryResponse = await call(`/v1/player/section?uuid=${playerUuid}&section=bestiary`);
  const noBestiaryBody = await noBestiaryResponse.json();
  assert.equal(noBestiaryResponse.status, 200, JSON.stringify(noBestiaryBody));
  assert.equal(noBestiaryBody.data_present, false);
  assert.equal(noBestiaryBody.data.milestone, null, "missing bestiary data is null, never zero");
  assert.equal(noBestiaryBody.data.families_unlocked, null);
  assert.ok(noBestiaryBody.data.reason);

  // A fixed pet-count cap cannot bound response bytes: size depends on what
  // each pet carries, not how many pets there are. compactPets used to cap
  // at a flat PET_PAGE_CAP (250), which only "worked" because its own test
  // fixture was unrealistically lean (uuid/type/tier/exp/active only). Real
  // pets commonly carry heldItem, and often skin and candyUsed too --
  // compactPets picks all three (see PET_FIELDS) -- so a real collector's
  // 250-pet profile 502'd against src/http.js's 80,000-char cap even though
  // the lean fixture passed comfortably. This fixture is the realistic case
  // that used to 502: 250 pets, each carrying heldItem, skin, and
  // candyUsed, with long, realistic identifiers throughout (full-length pet
  // UUIDs, a long real pet type name, the longest rarity string). It goes
  // through the actual worker response pipeline, including the same
  // 80,000-char enforcement in src/http.js every other route goes through,
  // not a hand-assembled approximation.
  const widePets = Array.from({ length: 250 }, (_, i) => ({
    uuid: `${String(i).padStart(8, "0")}-1111-2222-3333-444444444444`,
    type: "PROTECTOR_DRAGON",
    exp: 4_600_000 + i,
    active: i === 0,
    tier: "LEGENDARY",
    heldItem: "MINOS_RELIC",
    skin: "PROTECTOR_DRAGON_ANIMATED",
    candyUsed: 10,
  }));
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
            pets_data: { pets: widePets },
          },
        },
      }],
    }),
  });
  const widePetsResponse = await call(`/v1/player/section?uuid=${playerUuid}&section=pets`);
  const widePetsText = await widePetsResponse.text();
  assert.equal(widePetsResponse.status, 200, widePetsText);
  assert.ok(
    widePetsText.length < 80_000,
    `a 250-pet response with heldItem+skin+candyUsed must stay under the 80,000-char cap (measured ${widePetsText.length})`
  );
  const widePetsBody = JSON.parse(widePetsText);
  // total_pets always reports what Hypixel actually exposed, even when the
  // byte budget means fewer than that are returned -- reporting the
  // truncated count as the total would be exactly the "missing data
  // reported as fact" failure this project forbids.
  assert.equal(widePetsBody.data.total_pets, 250);
  assert.ok(
    widePetsBody.data.returned < 250,
    `a realistic 250-pet profile must be truncated by the byte budget, not returned in full (measured ${widePetsBody.data.returned})`
  );
  assert.equal(widePetsBody.data.truncated, true, "a realistic 250-pet profile must be flagged truncated");
  assert.equal(
    widePetsBody.data.truncation_reason, "response_size_budget",
    "truncation caused by the byte budget must say so, not just flip a boolean"
  );
  assert.equal(widePetsBody.data.pets.length, widePetsBody.data.returned);
  // The active pet (index 0 of the fixture) must survive truncation: it is
  // sorted to the front, so if truncation dropped it, the sort/truncation
  // ordering is broken, not just the byte accounting.
  assert.ok(
    widePetsBody.data.pets.some((pet) => pet.active === true),
    "an active pet must survive truncation, not be arbitrarily dropped"
  );
  assertProvenanceResolves(widePetsBody.data.pets.map((pet) => pet.level), widePetsBody.data.level_provenance, "wide pets");

  // A small, realistic fixture -- nowhere near the byte budget -- must not
  // be truncated at all: truncated must mean data was actually dropped, not
  // be a flag that fires regardless of size.
  const smallPets = Array.from({ length: 3 }, (_, i) => ({
    uuid: `${String(i).padStart(8, "0")}-1111-2222-3333-444444444444`,
    type: "PROTECTOR_DRAGON",
    exp: 4_600_000 + i,
    active: i === 0,
    tier: "LEGENDARY",
    heldItem: "MINOS_RELIC",
    skin: "PROTECTOR_DRAGON_ANIMATED",
    candyUsed: 10,
  }));
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
            pets_data: { pets: smallPets },
          },
        },
      }],
    }),
  });
  const smallPetsResponse = await call(`/v1/player/section?uuid=${playerUuid}&section=pets`);
  const smallPetsBody = await smallPetsResponse.json();
  assert.equal(smallPetsResponse.status, 200, JSON.stringify(smallPetsBody));
  assert.equal(smallPetsBody.data.total_pets, 3);
  assert.equal(smallPetsBody.data.returned, 3, "a small fixture well under budget must return every pet");
  assert.equal(smallPetsBody.data.returned, smallPetsBody.data.total_pets);
  assert.equal(smallPetsBody.data.truncated, false, "a small fixture must not be flagged truncated");
  assert.equal(smallPetsBody.data.truncation_reason, null, "an untruncated response must not carry a truncation reason");
  assert.equal(smallPetsBody.data.pet_care.available, false, "no pet_care object means unavailable, not an empty record");
  assert.equal(smallPetsBody.data.pet_care.pet_types_sacrificed_count, null);

  // --- New profile sections. Each declares data_present itself, and the
  // envelope must mirror it: absent upstream object means unavailable, never
  // a zeroed-out section.
  const sectionMock = (memberData) => ({
    "/v2/skyblock/profiles": () => Response.json({
      success: true,
      profiles: [{
        profile_id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        cute_name: "Mango",
        selected: true,
        members: { [playerUuid]: { last_save: 100, ...memberData } },
      }],
    }),
  });
  const getSection = async (section) => {
    const response = await call(`/v1/player/section?uuid=${playerUuid}&section=${section}`);
    const body = await response.json();
    assert.equal(response.status, 200, JSON.stringify(body));
    return body;
  };

  // crimson_isle: present.
  installMockFetch(sectionMock({
    nether_island_player_data: {
      kuudra_completed_tiers: { none: 3, hot: 1, highest_wave_hot: 12 },
      dojo: { dojo_points_mob_kb: 1000, dojo_time_mob_kb: 61, dojo_points_snake: 350 },
      selected_faction: "mages",
      mages_reputation: 1200,
      barbarians_reputation: -300,
      abiphone: {
        contact_data: { elle: {}, dusk: {} },
        active_contacts: ["elle"],
        operator_chip: { repaired_index: 1 },
      },
      matriarch: { pearls_collected: 5, last_attempt: 1_700_000_000_000 },
      kuudra_party_finder: { group_builder: { tier: "HOT", combat_level_required: 30 } },
      quests: { pablo_quest: { flower: 1 }, chicken_quest: { handed: 2 }, miniboss_data: { ashfang: true } },
      last_minibosses_killed: ["ASHFANG"],
    },
  }));
  const crimson = await getSection("crimson_isle");
  assert.equal(crimson.data_present, true, "envelope must mirror the section's own data_present");
  assert.equal(crimson.data.available, true);
  assert.equal(crimson.data.kuudra.total_completions, 4);
  assert.equal(crimson.data.kuudra.tiers.hot.completions, 1);
  assert.equal(crimson.data.kuudra.tiers.hot.highest_wave, 12);
  assert.equal(crimson.data.kuudra.tiers.fiery.completions, 0, "an absent tier with the object present is a real zero");
  assert.equal(crimson.data.kuudra.tiers.fiery.highest_wave, null, "an unreached wave stays null, never zero");
  assert.equal(crimson.data.dojo.tests.mob_kb.name, "Force");
  assert.equal(crimson.data.dojo.tests.mob_kb.points, 1000);
  assert.equal(crimson.data.dojo.tests.mob_kb.rank, "S");
  assert.equal(crimson.data.dojo.tests.snake.rank, "D", "350 points lands in the 200-point D bracket");
  assert.equal(crimson.data.dojo.tests.archer.points, null, "an unattempted test has no points, not zero");
  assert.equal(crimson.data.dojo.tests.archer.rank, null, "an unattempted test has no rank, not F");
  assert.equal(crimson.data.factions.selected_faction, "mages");
  assert.equal(crimson.data.factions.barbarians_reputation, -300);
  assert.equal(crimson.data.abiphone.contact_count, 2);
  assert.equal(crimson.data.abiphone.active_contact_count, 1);
  assert.equal(crimson.data.matriarch.pearls_collected, 5);
  assert.equal(crimson.data.matriarch.last_attempt, 1_700_000_000_000);
  assert.deepEqual(crimson.data.last_minibosses_killed, ["ASHFANG"]);
  assert.ok(crimson.data.quests.available);

  // crimson_isle: whole object missing -> unavailable, not zeros.
  installMockFetch(sectionMock({}));
  const noCrimson = await getSection("crimson_isle");
  assert.equal(noCrimson.data_present, false, "envelope data_present must be false when the object is absent");
  assert.equal(noCrimson.data.available, false);
  assert.equal(noCrimson.data.kuudra.available, false);
  assert.ok(noCrimson.data.reason, "a missing section must explain why");

  // farming: present, with contest ordering, medal counting, pelts, garden.
  installMockFetch(sectionMock({
    jacobs_contest: {
      talked: true,
      medals_inv: { bronze: 1, silver: 2, gold: 3 },
      perks: { double_drops: 15, farming_level_cap: 10 },
      personal_bests: { WHEAT: 100_000 },
      unique_brackets: { gold: ["WHEAT"], platinum: [], diamond: [] },
      contests: {
        "285:1_4:WHEAT": { collected: 50 },
        "285:2_11:CACTUS": {
          collected: 1_000,
          claimed_rewards: true,
          claimed_position: 5,
          claimed_participants: 100,
          claimed_medal: "gold",
        },
      },
    },
    quests: { trapper_quest: { pelt_count: 42 } },
    garden_player_data: { copper: 500, larva_consumed: 3 },
  }));
  const farming = await getSection("farming");
  assert.equal(farming.data_present, true);
  assert.equal(farming.data.jacobs.medals_inventory.gold, 3);
  assert.equal(farming.data.jacobs.perks.double_drops, 15);
  assert.equal(farming.data.jacobs.personal_bests.WHEAT, 100_000);
  assert.equal(farming.data.jacobs.contests.total_contests, 2);
  assert.equal(farming.data.jacobs.contests.claimed_medal_counts.gold, 1);
  assert.equal(farming.data.jacobs.contests.claimed_medal_counts.bronze, 0);
  assert.equal(farming.data.jacobs.contests.recent[0].crop, "CACTUS", "contests must order most-recent first");
  assert.equal(farming.data.jacobs.contests.recent[0].claimed_medal, "gold");
  assert.equal(farming.data.jacobs.contests.contests_truncated, false);
  assert.equal(farming.data.trapper.pelt_count, 42);
  assert.equal(farming.data.garden_player_data.copper, 500);
  assert.equal(farming.data.garden_player_data.larva_consumed, 3);

  // farming: a lifetime contests map must stay bounded through the real
  // response pipeline, while totals still report the full set.
  const manyContests = {};
  for (let i = 0; i < 300; i += 1) {
    manyContests[`${100 + Math.floor(i / 50)}:${1 + (i % 12)}_${1 + (i % 28)}:CROP_${i}`] = {
      collected: 100 + i,
      claimed_rewards: true,
      claimed_position: 10,
      claimed_participants: 500,
      claimed_medal: "silver",
    };
  }
  installMockFetch(sectionMock({ jacobs_contest: { contests: manyContests } }));
  const wideFarmingResponse = await call(`/v1/player/section?uuid=${playerUuid}&section=farming`);
  const wideFarmingText = await wideFarmingResponse.text();
  assert.equal(wideFarmingResponse.status, 200, wideFarmingText);
  assert.ok(
    wideFarmingText.length < 80_000,
    `a 300-contest history must stay under the 80,000-char cap (measured ${wideFarmingText.length})`
  );
  const wideFarming = JSON.parse(wideFarmingText);
  assert.equal(wideFarming.data.jacobs.contests.total_contests, 300, "the true total must survive truncation");
  assert.equal(wideFarming.data.jacobs.contests.returned, 25);
  assert.equal(wideFarming.data.jacobs.contests.contests_truncated, true);
  assert.equal(wideFarming.data.jacobs.contests.claimed_medal_counts.silver, 300, "medal counts run over the full set, not the returned page");

  // farming: nothing exposed -> unavailable.
  installMockFetch(sectionMock({}));
  const noFarming = await getSection("farming");
  assert.equal(noFarming.data_present, false);
  assert.equal(noFarming.data.available, false);
  assert.ok(noFarming.data.reason);

  // minions: crafted_generators must union across ALL profile members.
  installMockFetch({
    "/v2/skyblock/profiles": () => Response.json({
      success: true,
      profiles: [{
        profile_id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        cute_name: "Mango",
        selected: true,
        community_upgrades: {
          currently_upgrading: null,
          upgrade_states: [
            { upgrade: "minion_slots", tier: 1, started_ms: 1_700_000_000_000, claimed_ms: 1_700_000_100_000 },
            { upgrade: "minion_slots", tier: 2, started_ms: 1_700_000_200_000, claimed_ms: 1_700_000_300_000 },
            { upgrade: "island_size", tier: 4, started_ms: 1_700_000_000_000, claimed_ms: 1_700_000_100_000 },
          ],
        },
        members: {
          [playerUuid]: {
            last_save: 100,
            player_data: { crafted_generators: ["COBBLESTONE_1", "COBBLESTONE_2", "WHEAT_1"] },
          },
          ffffffffffffffffffffffffffffffff: {
            player_data: { crafted_generators: ["COBBLESTONE_2", "WHEAT_5", "SNOW_11"] },
          },
        },
      }],
    }),
  });
  const minions = await getSection("minions");
  assert.equal(minions.data_present, true);
  assert.equal(minions.data.unique_minions_crafted, 5, "the union must dedupe the shared COBBLESTONE_2");
  assert.equal(minions.data.members_with_crafted_data, 2);
  const cobble = minions.data.minion_types.find((entry) => entry.minion_id === "COBBLESTONE");
  assert.equal(cobble.max_tier_crafted, 2);
  assert.equal(cobble.tiers_crafted, 2);
  const snow = minions.data.minion_types.find((entry) => entry.minion_id === "SNOW");
  assert.equal(snow.max_tier_crafted, 11, "double-digit tiers must parse");
  assert.equal(minions.data.slots_from_unique_crafts, 6, "5 uniques reach the 5-crafts row of the slot table");
  assert.equal(minions.data.next_slot.unique_crafts_required, 15);
  assert.equal(minions.data.next_slot.remaining_crafts, 10);
  assert.equal(minions.data.community_upgrades.available, true);
  assert.equal(minions.data.community_upgrades.highest_tiers.minion_slots, 2, "community bonus slots stay a separate tier, never folded into the table total");
  assert.equal(minions.data.community_upgrades.highest_tiers.island_size, 4);

  // minions: no member exposes crafted_generators -> unavailable.
  installMockFetch(sectionMock({}));
  const noMinions = await getSection("minions");
  assert.equal(noMinions.data_present, false);
  assert.equal(noMinions.data.crafted_generators_present, false);
  assert.equal(noMinions.data.unique_minions_crafted, null, "no crafted data means null, not zero");
  assert.equal(noMinions.data.slots_from_unique_crafts, null);
  assert.ok(noMinions.data.reason);

  // trophy_fish: the flat <id>/<id>_<tier> keys normalize into typed records.
  installMockFetch(sectionMock({
    trophy_fish: {
      total_caught: 7,
      blobfish: 5,
      blobfish_bronze: 4,
      blobfish_silver: 1,
      lava_horse: 2,
      lava_horse_bronze: 2,
      rewards: [1],
      last_caught: "BLOBFISH_SILVER",
    },
  }));
  const trophy = await getSection("trophy_fish");
  assert.equal(trophy.data_present, true);
  assert.equal(trophy.data.total_caught, 7);
  assert.equal(trophy.data.fish.length, 18, "all 18 known fish must be reported");
  const blobfish = trophy.data.fish.find((entry) => entry.fish_id === "BLOBFISH");
  assert.equal(blobfish.total, 5);
  assert.equal(blobfish.bronze, 4);
  assert.equal(blobfish.silver, 1);
  assert.equal(blobfish.gold, 0, "an uncaught tier with the object present is a real zero");
  assert.equal(blobfish.highest_tier, "silver");
  const flyfish = trophy.data.fish.find((entry) => entry.fish_id === "FLYFISH");
  assert.equal(flyfish.total, 0);
  assert.equal(flyfish.highest_tier, null, "a never-caught fish has no highest tier");
  assert.equal(trophy.data.rewards.current_stage, "Bronze Hunter");
  assert.equal(trophy.data.last_caught, "BLOBFISH_SILVER");

  // trophy_fish: object missing -> unavailable, with an empty typed list.
  installMockFetch(sectionMock({}));
  const noTrophy = await getSection("trophy_fish");
  assert.equal(noTrophy.data_present, false);
  assert.equal(noTrophy.data.available, false);
  assert.equal(noTrophy.data.total_caught, null, "missing data is null, never zero");
  assert.deepEqual(noTrophy.data.fish, []);
  assert.ok(noTrophy.data.reason);

  // chocolate_factory: present, with the rabbit map summarized.
  installMockFetch(sectionMock({
    events: {
      easter: {
        chocolate: 100,
        total_chocolate: 5_000,
        chocolate_since_prestige: 50,
        chocolate_level: 3,
        rabbit_barn_capacity_level: 5,
        employees: { rabbit_bro: 10 },
        time_tower: { level: 2, charges: 1 },
        shop: { year: 4 },
        rabbits: {
          zeta: 5,
          apex: 1,
          collected_eggs: { breakfast: 3 },
          collected_locations: { winter_island: ["spot_a", "spot_b"] },
        },
      },
    },
  }));
  const chocolate = await getSection("chocolate_factory");
  assert.equal(chocolate.data_present, true);
  assert.equal(chocolate.data.chocolate, 100);
  assert.equal(chocolate.data.total_chocolate, 5_000);
  assert.equal(chocolate.data.prestige_level, 3);
  assert.equal(chocolate.data.rabbit_barn_capacity_level, 5);
  assert.equal(chocolate.data.time_tower.level, 2);
  assert.equal(chocolate.data.rabbits.unique_rabbits, 2);
  assert.equal(chocolate.data.rabbits.total_rabbits_found, 6);
  assert.equal(chocolate.data.rabbits.top_rabbits[0].rabbit, "zeta", "top rabbits sort by count descending");
  assert.equal(chocolate.data.rabbits.rabbits_truncated, false);
  assert.equal(chocolate.data.rabbits.collected_location_count, 2);

  // chocolate_factory: a huge rabbit map must be summarized, bounded, and
  // flagged -- never shipped raw.
  const manyRabbits = { collected_eggs: { breakfast: 1 } };
  for (let i = 0; i < 600; i += 1) manyRabbits[`rabbit_with_a_long_collectible_name_${i}`] = 1 + (i % 9);
  installMockFetch(sectionMock({
    events: { easter: { chocolate: 1, rabbits: manyRabbits } },
  }));
  const wideChocolateResponse = await call(`/v1/player/section?uuid=${playerUuid}&section=chocolate_factory`);
  const wideChocolateText = await wideChocolateResponse.text();
  assert.equal(wideChocolateResponse.status, 200, wideChocolateText);
  assert.ok(
    wideChocolateText.length < 80_000,
    `a 600-rabbit collection must stay under the 80,000-char cap (measured ${wideChocolateText.length})`
  );
  const wideChocolate = JSON.parse(wideChocolateText);
  assert.equal(wideChocolate.data.rabbits.unique_rabbits, 600, "the true unique-rabbit total must survive truncation");
  assert.equal(wideChocolate.data.rabbits.top_rabbits.length, 30);
  assert.equal(wideChocolate.data.rabbits.rabbits_truncated, true);

  // chocolate_factory: object missing -> unavailable.
  installMockFetch(sectionMock({ events: {} }));
  const noChocolate = await getSection("chocolate_factory");
  assert.equal(noChocolate.data_present, false);
  assert.equal(noChocolate.data.available, false);
  assert.ok(noChocolate.data.reason);

  // hunting: shards, attribute stacks, and temples.
  installMockFetch(sectionMock({
    shards: {
      owned: [{ id: "CROCODILE", owned: 3 }],
      traps: { active_traps: [{ location: "GALATEA" }] },
      fused: { CROCODILE: 2 },
    },
    attributes: { stacks: { hunter: 5 } },
    temples: { unlocked_temples: ["TEMPLE_1"] },
  }));
  const hunting = await getSection("hunting");
  assert.equal(hunting.data_present, true);
  assert.equal(hunting.data.shards.owned_count, 1);
  assert.equal(hunting.data.shards.owned[0].id, "CROCODILE");
  assert.equal(hunting.data.shards.traps.active_trap_count, 1);
  assert.equal(hunting.data.shards.fused.CROCODILE, 2);
  assert.equal(hunting.data.attribute_stacks.stacks.hunter, 5);
  assert.equal(hunting.data.temples.unlocked_temple_count, 1);
  assert.deepEqual(hunting.data.temples.unlocked_temples, ["TEMPLE_1"]);

  // hunting: everything missing -> unavailable.
  installMockFetch(sectionMock({}));
  const noHunting = await getSection("hunting");
  assert.equal(noHunting.data_present, false);
  assert.equal(noHunting.data.available, false);
  assert.equal(noHunting.data.shards.available, false);
  assert.ok(noHunting.data.reason);

  // foraging: the 2025 member.foraging quest object must be emitted alongside
  // foraging_core, not silently dropped whenever foraging_core exists.
  installMockFetch(sectionMock({
    foraging_core: { forests_whispers: 10 },
    foraging: {
      fish_family: { collected: 3 },
      hina: { tasks: ["gift"] },
      tree_gifts: { total: 2 },
      songs: { harp: true },
    },
  }));
  const foraging = await getSection("foraging");
  assert.equal(foraging.data.forest_whispers.current, 10, "existing foraging fields must be untouched");
  assert.equal(foraging.data.quests.available, true);
  assert.equal(foraging.data.quests.fish_family.collected, 3, "the new quest object must not be dead data");
  assert.deepEqual(foraging.data.quests.hina.tasks, ["gift"]);
  assert.equal(foraging.data.quests.songs.harp, true);

  // foraging: no quest object -> quests unavailable, core output unchanged.
  installMockFetch(sectionMock({ foraging_core: { forests_whispers: 4 } }));
  const foragingNoQuests = await getSection("foraging");
  assert.equal(foragingNoQuests.data.quests.available, false);
  assert.equal(foragingNoQuests.data.forest_whispers.current, 4);

  // --- effects: full capped lists, cookie flag, and god-potion detection
  // derived only from exposed effect names.
  installMockFetch(sectionMock({
    profile: { cookie_buff_active: true },
    player_data: {
      active_effects: [
        { effect: "speed", level: 8, modifiers: [{ key: "caffeinated", amp: 2 }], ticks_remaining: 35_000, infinite: false },
        { effect: "god_potion", level: 1, modifiers: [], ticks_remaining: 100_000, infinite: false },
      ],
      paused_effects: [],
      disabled_potion_effects: ["blindness"],
      temp_stat_buffs: [{ stat: 0, key: "cookie", amount: 20, expire_at: 1_700_000_000_000 }],
    },
  }));
  const effects = await getSection("effects");
  assert.equal(effects.data_present, true, "envelope must mirror the section's own data_present");
  assert.equal(effects.data.available, true);
  assert.equal(effects.data.booster_cookie_active, true);
  assert.equal(effects.data.active_effects.count, 2);
  assert.equal(effects.data.active_effects.effects[0].effect, "speed");
  assert.equal(effects.data.active_effects.effects[0].modifiers[0].key, "caffeinated", "modifiers must survive sanitize depth");
  assert.equal(effects.data.active_effects.effects[0].modifiers[0].amp, 2);
  assert.equal(effects.data.active_effects.truncated, false);
  assert.equal(effects.data.paused_effects.count, 0, "a present empty list is a real zero, not unavailable");
  assert.deepEqual(effects.data.disabled_potion_effects.effects, ["blindness"]);
  assert.equal(effects.data.temp_stat_buffs.count, 1);
  assert.equal(effects.data.temp_stat_buffs.buffs[0].key, "cookie");
  assert.equal(effects.data.god_potion_effect_present, true, "a god_potion effect in the list must be detected");

  // effects: lists present without a god-potion effect -> false, not null.
  installMockFetch(sectionMock({
    player_data: { active_effects: [{ effect: "speed", level: 1 }] },
  }));
  const plainEffects = await getSection("effects");
  assert.equal(plainEffects.data.god_potion_effect_present, false);
  assert.equal(plainEffects.data.booster_cookie_active, null, "no member.profile object means the cookie state is unknown, not false");
  assert.equal(plainEffects.data.paused_effects.count, null, "an absent list is unavailable (null), never zero");
  assert.equal(plainEffects.data.paused_effects.truncated, false);

  // effects: nothing exposed -> unavailable with null counts.
  installMockFetch(sectionMock({}));
  const noEffects = await getSection("effects");
  assert.equal(noEffects.data_present, false);
  assert.equal(noEffects.data.available, false);
  assert.equal(noEffects.data.active_effects.count, null);
  assert.equal(noEffects.data.god_potion_effect_present, null, "no effect list means god potion presence is unknown, never false");
  assert.ok(noEffects.data.reason);

  // overview embeds the counts-only effects summary.
  installMockFetch(sectionMock({
    profile: { cookie_buff_active: false },
    player_data: {
      active_effects: [{ effect: "speed", level: 1 }],
      disabled_potion_effects: ["blindness", "water_breathing"],
    },
  }));
  const overviewEffects = await getSection("overview");
  assert.equal(overviewEffects.data.effects.available, true);
  assert.equal(overviewEffects.data.effects.active_effect_count, 1);
  assert.equal(overviewEffects.data.effects.disabled_effect_count, 2);
  assert.equal(overviewEffects.data.effects.paused_effect_count, null, "absent list stays null in the summary too");
  assert.equal(overviewEffects.data.effects.temp_stat_buff_count, null);
  assert.equal(overviewEffects.data.effects.booster_cookie_active, false, "an exposed false cookie flag is real data");
  assert.equal(overviewEffects.data.effects.god_potion_effect_present, false);
  assert.equal(overviewEffects.data.effects.effects, undefined, "the overview summary must stay counts-only");

  // --- stats player_misc bucket: player_data/item_data misc counters.
  installMockFetch(sectionMock({
    player_data: {
      death_count: 123,
      last_death: 1_700_000_000_000,
      fishing_treasure_caught: 456,
      reaper_peppers_eaten: 3,
      visited_zones: ["hub", "dynamic", "mining_3"],
      visited_modes: ["island", "dungeon"],
      perks: { forbidden_speed: 2, permanent_strength: 5 },
    },
    item_data: { soulflow: 42_000, favorite_arrow: "REINFORCED_IRON_ARROW", teleporter_pill_consumed: true },
  }));
  const miscStats = (await getSection("stats")).data.player_misc;
  assert.equal(miscStats.available, true);
  assert.equal(miscStats.death_count, 123);
  assert.equal(miscStats.last_death, 1_700_000_000_000);
  assert.equal(miscStats.last_death_iso, "2023-11-14T22:13:20.000Z", "an unambiguous Unix-ms last_death derives an ISO form");
  assert.equal(miscStats.fishing_treasure_caught, 456);
  assert.equal(miscStats.reaper_peppers_eaten, 3);
  assert.equal(miscStats.visited_zones.count, 3);
  assert.deepEqual(miscStats.visited_zones.zones, ["hub", "dynamic", "mining_3"]);
  assert.equal(miscStats.visited_zones.truncated, false);
  assert.equal(miscStats.visited_modes.count, 2);
  assert.equal(miscStats.perks.permanent_strength, 5);
  assert.equal(miscStats.item_data.available, true);
  assert.equal(miscStats.item_data.soulflow, 42_000);
  assert.equal(miscStats.item_data.favorite_arrow, "REINFORCED_IRON_ARROW");
  assert.equal(miscStats.item_data.teleporter_pill_consumed, true);

  // player_misc: an ambiguous (non-Unix-ms) last_death must not fabricate a
  // date, and missing objects stay null, never zero.
  installMockFetch(sectionMock({ player_data: { last_death: 726_219 } }));
  const ambiguousMisc = (await getSection("stats")).data.player_misc;
  assert.equal(ambiguousMisc.last_death, 726_219, "the raw upstream value always ships");
  assert.equal(ambiguousMisc.last_death_iso, null, "a small last_death is not Unix ms; converting it would fabricate a 1970 date");
  assert.equal(ambiguousMisc.death_count, null, "absent counters stay null, never zero");
  assert.equal(ambiguousMisc.visited_zones.count, null);
  assert.equal(ambiguousMisc.perks, null);
  assert.equal(ambiguousMisc.item_data.available, false);
  assert.equal(ambiguousMisc.item_data.soulflow, null);

  // --- dungeons floor detail: best_run_per_floor picks the single best run
  // per floor by total score; the raw best_runs arrays never ship.
  installMockFetch(sectionMock({
    dungeons: {
      selected_dungeon_class: "mage",
      secrets: 4_321,
      daily_runs: { current_day_stamp: 19_900, completed_runs_count: 3 },
      last_dungeon_run: 1_700_000_000_000,
      dungeon_types: {
        catacombs: {
          experience: 569_809_640 + 450_000_000,
          highest_tier_completed: 7,
          tier_completions: { 6: 10, 7: 4 },
          fastest_time: { 7: 480_000 },
          most_damage_mage: { 7: 1_500_000 },
          most_healing: { 7: 400_000 },
          mobs_killed: { 7: 5_000 },
          most_mobs_killed: { 7: 320 },
          watcher_kills: { 7: 40 },
          best_runs: {
            7: [
              {
                timestamp: 1_600_000_000_000,
                score_exploration: 90, score_speed: 60, score_skill: 90, score_bonus: 0,
                dungeon_class: "mage", elapsed_time: 600_000, damage_dealt: 1_000_000,
                deaths: 1, mobs_killed: 300, secrets_found: 20,
              },
              {
                timestamp: 1_650_000_000_000,
                score_exploration: 99, score_speed: 80, score_skill: 100, score_bonus: 17,
                dungeon_class: "archer", elapsed_time: 480_000, damage_dealt: 2_000_000,
                deaths: 0, mobs_killed: 350, secrets_found: 30,
              },
            ],
          },
        },
        master_catacombs: {
          tier_completions: { 1: 2 },
          best_runs: {
            1: [{
              timestamp: 1_660_000_000_000,
              score_exploration: 95, score_speed: 70, score_skill: 95, score_bonus: 5,
              dungeon_class: "tank", elapsed_time: 500_000, damage_dealt: 900_000,
              deaths: 0, mobs_killed: 200, secrets_found: 10,
            }],
          },
        },
      },
      player_classes: { mage: { experience: 569_809_640 + 200_000_000 } },
    },
  }));
  const detailedDungeons = await getSection("dungeons");
  const cata = detailedDungeons.data.dungeon_types.catacombs;
  const bestF7 = cata.best_run_per_floor["7"];
  assert.equal(bestF7.total_score, 296, "the 296-total-score run must beat the 240 one");
  assert.equal(bestF7.dungeon_class, "archer");
  assert.equal(bestF7.timestamp, 1_650_000_000_000);
  assert.equal(bestF7.elapsed_time, 480_000);
  assert.equal(bestF7.deaths, 0);
  assert.equal(bestF7.secrets_found, 30);
  assert.equal(bestF7.runs_recorded, 2, "how many runs Hypixel kept must survive the top-1 cut");
  assert.equal(cata.best_runs, undefined, "raw best_runs arrays must never ship");
  assert.equal(cata.best_runs_available, true);
  assert.equal(cata.most_damage_mage["7"], 1_500_000);
  assert.equal(cata.most_healing["7"], 400_000);
  assert.equal(cata.most_mobs_killed["7"], 320);
  assert.equal(cata.watcher_kills["7"], 40);
  const masterCata = detailedDungeons.data.dungeon_types.master_catacombs;
  assert.equal(masterCata.best_run_per_floor["1"].dungeon_class, "tank", "Master Mode floors carry their own best runs");
  assert.equal(masterCata.level.available, false, "Master Catacombs shares regular Catacombs XP, so no level of its own");

  // Lifetime member.dungeons scalars ship at the section's top level.
  assert.equal(detailedDungeons.data.secrets, 4_321);
  assert.equal(detailedDungeons.data.daily_runs.completed_runs_count, 3);
  assert.equal(detailedDungeons.data.last_dungeon_run, 1_700_000_000_000);

  // Catacombs 51+: the capped fields keep their semantics; the flat 200m
  // cosmetic continuation rides alongside, for classes too.
  assert.equal(cata.level.level, 50);
  assert.equal(cata.level.progress_to_next_level, 1);
  assert.equal(cata.level.level_with_overflow, 52, "450m past the cap is two whole 200m cosmetic levels");
  assert.equal(cata.level.overflow_xp, 450_000_000);
  const mageClass = detailedDungeons.data.player_classes.mage;
  assert.equal(mageClass.level.level, 50);
  assert.equal(mageClass.level.level_with_overflow, 51, "the 200m step applies to class levels too");

  // The overview embed stays lean: no floor detail, but overflow still rides.
  const overviewWithDungeons = await getSection("overview");
  const overviewCata = overviewWithDungeons.data.dungeons.dungeon_types.catacombs;
  assert.equal(overviewCata.best_run_per_floor, undefined, "floor detail must not bloat the overview embed");
  assert.equal(overviewCata.most_damage_mage, undefined);
  assert.equal(overviewCata.level.level_with_overflow, 52, "overflow is cheap and ships everywhere dungeon levels do");

  // --- stats dedicated buckets, present case: bounded named picks with
  // upstream key names, never dependent on the lifetime_counters blob.
  installMockFetch(sectionMock({
    player_stats: {
      highest_critical_damage: 2_500_000,
      end_island: {
        dragon_fight: {
          ender_crystals_destroyed: 12,
          most_damage: { best: 1_100_000, superior: 1_100_000 },
          fastest_kill: { best: 32_000, superior: 32_000 },
          highest_rank: { best: 1 },
          amount_summoned: { total: 9, superior: 4 },
          summoning_eyes_contributed: { total: 40, superior: 24 },
        },
      },
      mythos: {
        kills: 300,
        burrows_dug_next: { total: 100, LEGENDARY: 4 },
        burrows_dug_combat: { total: 50 },
        burrows_dug_treasure: { total: 45 },
        burrows_chains_complete: { total: 25 },
      },
      races: {
        foraging_race_best_time: 40_000,
        dungeon_hub: { crystal_core_anything_no_return_best_time: 12_000 },
      },
      auctions: {
        created: 100, won: 40, gold_spent: 1_000_000, gold_earned: 2_000_000,
        total_sold: { LEGENDARY: 5, total: 60 }, total_bought: { total: 22 },
      },
      gifts: { total_given: 10, total_received: 3 },
      winter: { most_snowballs_hit: 50, most_damage_dealt: 4_000 },
      candy_collected: {
        total: 500,
        green_candy: 300,
        purple_candy: 200,
        spooky_festival_101: { total: 40, green_candy: 30, purple_candy: 10 },
      },
      pets: { milestone: { sea_creatures_killed: 5_000, ores_mined: 100_000 } },
    },
  }));
  const bucketStats = (await getSection("stats")).data;
  assert.equal(bucketStats.dragons.available, true);
  assert.equal(bucketStats.dragons.ender_crystals_destroyed, 12);
  assert.equal(bucketStats.dragons.most_damage.superior, 1_100_000);
  assert.equal(bucketStats.dragons.summoning_eyes_contributed.total, 40);
  assert.equal(bucketStats.mythos.available, true);
  assert.equal(bucketStats.mythos.kills, 300);
  assert.equal(bucketStats.mythos.burrows_dug_next.LEGENDARY, 4);
  assert.equal(bucketStats.races.available, true);
  assert.equal(bucketStats.races.best_times.foraging_race_best_time, 40_000);
  assert.equal(
    bucketStats.races.best_times.dungeon_hub.crystal_core_anything_no_return_best_time,
    12_000,
    "nested dungeon-hub race variants must survive"
  );
  assert.equal(bucketStats.races.races_truncated, false);
  assert.equal(bucketStats.auctions.gold_spent, 1_000_000);
  assert.equal(bucketStats.auctions.total_sold.LEGENDARY, 5);
  assert.equal(bucketStats.gifts.total_given, 10);
  assert.equal(bucketStats.winter.most_snowballs_hit, 50);
  assert.equal(bucketStats.candy_collected.total, 500);
  assert.equal(bucketStats.candy_collected.total_festivals_recorded, 1);
  assert.equal(
    bucketStats.candy_collected.recent_festivals.spooky_festival_101.total,
    40,
    "per-festival counters must survive sanitize depth, not collapse to [omitted]"
  );
  assert.equal(bucketStats.pets_milestones.sea_creatures_killed, 5_000);
  assert.equal(bucketStats.highest_critical_damage, 2_500_000);

  // --- farming/taming per-player caps clamp the resource ladder. The skills
  // resource is cached module-level, so reset before overriding it.
  const capLevels = Array.from({ length: 60 }, (_, i) => ({ level: i + 1, totalExpRequired: (i + 1) * 100 }));
  const capSkillsResource = () => Response.json({
    success: true,
    lastUpdated: 123,
    version: "test",
    skills: {
      FARMING: { name: "Farming", maxLevel: 60, levels: capLevels },
      TAMING: { name: "Taming", maxLevel: 60, levels: capLevels },
    },
  });
  resetCaches();
  installMockFetch({
    ...sectionMock({
      jacobs_contest: { perks: { farming_level_cap: 2 } },
      pets_data: { pet_care: { pet_types_sacrificed: ["PIG", "PIG", "COW"] } },
      player_data: { experience: { SKILL_FARMING: 999_999, SKILL_TAMING: 999_999 } },
    }),
    "/v2/resources/skyblock/skills": capSkillsResource,
  });
  const cappedSkills = (await getSection("skills")).data;
  const farmingSkill = cappedSkills.skills.farming;
  assert.equal(farmingSkill.level, 52, "farming stops at 50 + jacobs farming_level_cap, not the resource's 60");
  assert.equal(farmingSkill.max_level, 52);
  assert.equal(farmingSkill.progress_to_next_level, 1);
  assert.equal(farmingSkill.level_cap.effective, 52);
  assert.equal(farmingSkill.level_cap.base, 50);
  assert.equal(farmingSkill.level_cap.bonus, 2);
  assert.equal(farmingSkill.level_cap.source, "member.jacobs_contest.perks.farming_level_cap");
  const tamingSkill = cappedSkills.skills.taming;
  assert.equal(tamingSkill.level, 52, "taming counts UNIQUE sacrificed pet types (the duplicate PIG dedupes)");
  assert.equal(tamingSkill.max_level, 52);
  assert.equal(tamingSkill.level_cap.pet_types_sacrificed_count, 2);
  assert.equal(tamingSkill.level_cap.source, "member.pets_data.pet_care.pet_types_sacrificed");

  // The same member's sacrificed list ships in section=pets for verification,
  // deduped, while a missing pets array still reads unavailable.
  const petCarePets = (await getSection("pets")).data;
  assert.equal(petCarePets.available, false, "no pets array still reads as unavailable pets");
  assert.equal(petCarePets.pet_care.available, true);
  assert.deepEqual(petCarePets.pet_care.pet_types_sacrificed, ["PIG", "COW"], "sacrificed list is deduped");
  assert.equal(petCarePets.pet_care.pet_types_sacrificed_count, 2);

  // An absurd upstream perk value clamps to +10 and never exceeds the ladder.
  installMockFetch({
    ...sectionMock({
      jacobs_contest: { perks: { farming_level_cap: 99 } },
      player_data: { experience: { SKILL_FARMING: 999_999 } },
    }),
    "/v2/resources/skyblock/skills": capSkillsResource,
  });
  const clampedSkills = (await getSection("skills")).data;
  assert.equal(clampedSkills.skills.farming.max_level, 60, "cap bonus clamps at +10 and never exceeds the resource ladder");
  assert.equal(clampedSkills.skills.farming.level, 60);
  assert.equal(clampedSkills.skills.farming.level_cap.effective, 60);

  // --- regression: section=overview must pass the skills resource through,
  // deriving levels exactly as the summary route does.
  resetCaches();
  installMockFetch(sectionMock({ player_data: { experience: { SKILL_MINING: 175 } } }));
  const overviewLevels = await getSection("overview");
  assert.equal(overviewLevels.data.skills.threshold_source, "Hypixel skills resource");
  assert.equal(
    overviewLevels.data.skills.skills.mining.level,
    2,
    "regression: section=overview used to drop the skill resource and report every level null"
  );
  assert.equal(overviewLevels.data.skills.skills.mining.max_level, 3);
  assert.equal(overviewLevels.data.skills.levels_calculated, true);
  resetCaches();
}
