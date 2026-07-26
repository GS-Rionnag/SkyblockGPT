import assert from "node:assert/strict";
import { call, installMockFetch, playerUuid } from "./_fixtures.mjs";

const bestiaryMock = (memberData) => ({
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

export async function run() {
  // A family with a known bracket must compute the exact SkyCrypt tier walk:
  // Private Island Enderman (cap 200, bracket 1: 20/40/60/100/200) at
  // 30 + 25 = 55 kills sits at tier 2, next tier at 60 kills, max tier 5.
  // A kill key outside the transcribed table ships raw with tier null.
  installMockFetch(bestiaryMock({
    bestiary: {
      kills: { enderman_1: 30, enderman_2: 25, brand_new_mob_1: 7 },
      milestone: { last_claimed_milestone: 2 },
    },
  }));

  const response = await call(`/v1/player/bestiary?uuid=${playerUuid}&query=enderman`);
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  assert.equal(body.payload_kind, "player_bestiary");
  assert.equal(body.data_present, true);
  assert.equal(body.data.available, true);

  // Overall rollup runs over the FULL family set, not the queried page.
  assert.equal(body.data.milestone, 2, "one tier-2 family is the whole milestone");
  assert.ok(body.data.max_milestone > 0);
  assert.equal(body.data.bestiary_level, 0.2, "Bestiary level is milestone / 10 (SkyCrypt formula)");
  assert.equal(body.data.families_total, 208, "the transcribed SkyCrypt table carries 208 families");
  assert.equal(body.data.families_unlocked, 1);
  assert.equal(body.data.families_maxed, 0);
  assert.equal(body.data.untracked_kill_keys, 1);
  assert.equal(body.data.last_claimed_milestone, 2);

  // The query matched only the two Enderman families (Private Island and
  // The End), server-side.
  assert.equal(body.data.query, "enderman");
  assert.equal(body.data.total_items, 2);
  const privateIslandEnderman = body.data.families.find((family) => family.category_id === "dynamic");
  assert.equal(privateIslandEnderman.name, "Enderman");
  assert.equal(privateIslandEnderman.kills, 55, "kills sum every per-level kill key of the family");
  assert.equal(privateIslandEnderman.tier, 2);
  assert.equal(privateIslandEnderman.max_tier, 5, "cap 200 is the fifth bracket-1 threshold");
  assert.equal(privateIslandEnderman.maxed, false);
  assert.equal(privateIslandEnderman.next_tier_kills, 60);
  assert.equal(privateIslandEnderman.kills_to_next_tier, 5);
  assert.equal(privateIslandEnderman.max_kills, 200);
  assert.equal(privateIslandEnderman.in_bracket_table, true);
  const endEnderman = body.data.families.find((family) => family.category_id === "combat_3");
  assert.equal(endEnderman.kills, 0, "with the kills object present, an absent kill key is a real zero");
  assert.equal(endEnderman.tier, 0);

  // An untracked kill key is findable by its raw key, complete, and never
  // guessed a tier.
  const untrackedResponse = await call(`/v1/player/bestiary?uuid=${playerUuid}&query=brand_new_mob`);
  const untrackedBody = await untrackedResponse.json();
  assert.equal(untrackedResponse.status, 200, JSON.stringify(untrackedBody));
  assert.equal(untrackedBody.data.total_items, 1);
  const untracked = untrackedBody.data.families[0];
  assert.equal(untracked.family_id, "untracked:brand_new_mob_1");
  assert.equal(untracked.kills, 7, "raw kills ship complete even without a bracket");
  assert.equal(untracked.tier, null, "an unknown family's tier is null, never guessed");
  assert.equal(untracked.max_tier, null);
  assert.equal(untracked.next_tier_kills, null);
  assert.equal(untracked.in_bracket_table, false);

  // Pagination walks the full 209-record list (208 families + 1 untracked).
  const pageOne = await (await call(`/v1/player/bestiary?uuid=${playerUuid}&limit=100&page=0`)).json();
  assert.equal(pageOne.data.total_items, 209);
  assert.equal(pageOne.data.total_pages, 3);
  assert.equal(pageOne.data.families.length, 100);
  assert.equal(pageOne.data.has_more, true);
  const pageThree = await (await call(`/v1/player/bestiary?uuid=${playerUuid}&limit=100&page=2`)).json();
  assert.equal(pageThree.data.families.length, 9);
  assert.equal(pageThree.data.has_more, false);
  const firstIds = new Set(pageOne.data.families.map((family) => family.family_id));
  assert.ok(pageThree.data.families.every((family) => !firstIds.has(family.family_id)), "pages must not overlap");

  // Whole pages stay comfortably inside the 80,000-char response cap.
  const pageText = await (await call(`/v1/player/bestiary?uuid=${playerUuid}&limit=100&page=0`)).text();
  assert.ok(pageText.length < 80_000, `a 100-family page must fit the response cap (measured ${pageText.length})`);

  // No kills object -> unavailable, never a zeroed milestone or empty-but-
  // presented-as-real family list.
  installMockFetch(bestiaryMock({}));
  const missingResponse = await call(`/v1/player/bestiary?uuid=${playerUuid}`);
  const missingBody = await missingResponse.json();
  assert.equal(missingResponse.status, 200, JSON.stringify(missingBody));
  assert.equal(missingBody.data_present, false);
  assert.equal(missingBody.data.available, false);
  assert.equal(missingBody.data.milestone, null, "missing data is null, never zero");
  assert.equal(missingBody.data.bestiary_level, null);
  assert.equal(missingBody.data.families_unlocked, null);
  assert.deepEqual(missingBody.data.families, []);
  assert.ok(missingBody.data.reason);

  // Validation: a malformed UUID is rejected at the boundary.
  const invalid = await call(`/v1/player/bestiary?uuid=not-a-uuid`);
  assert.equal(invalid.status, 400);
}
