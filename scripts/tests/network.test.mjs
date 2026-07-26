import assert from "node:assert/strict";
import { resetCaches } from "../../src/hypixel.js";
import { call, countFetches, installMockFetch, playerUuid } from "./_fixtures.mjs";

export async function run() {
  installMockFetch();
  resetCaches();

  // Both new routes require the shared secret exactly like every /v1 route.
  assert.equal((await call(`/v1/guild?player=${playerUuid}`, false)).status, 401);
  assert.equal((await call(`/v1/network?uuid=${playerUuid}`, false)).status, 401);

  // Exactly one guild selector: none, two, or a malformed id all reject.
  assert.equal((await call("/v1/guild")).status, 400);
  assert.equal((await call(`/v1/guild?player=${playerUuid}&name=Test%20Guild`)).status, 400);
  assert.equal((await call("/v1/guild?id=not-a-guild-id")).status, 400);
  assert.equal((await call("/v1/guild?player=not-a-uuid")).status, 400);

  const guildResponse = await call(`/v1/guild?player=${playerUuid}`);
  const guild = await guildResponse.json();
  assert.equal(guildResponse.status, 200, JSON.stringify(guild));
  assert.equal(guild.payload_kind, "hypixel_guild");
  assert.equal(guild.data_present, true);
  assert.equal(guild.data.query_by, "player");
  assert.equal(guild.data.guild.name, "Test Guild");
  assert.equal(guild.data.guild.tag, "TEST");
  assert.equal(guild.data.guild.tag_color, "DARK_AQUA");
  assert.equal(guild.data.guild.created, 1_600_000_000_000);
  assert.equal(guild.data.guild.exp, 3_000_000);
  assert.equal(guild.data.guild.level, 6, "3,000,000 exp crosses six levels of the SkyCrypt guild curve");
  assert.equal(guild.data.guild.member_count, 3);
  assert.equal(guild.data.guild.skyblock_guild_exp, 2_000_000);
  assert.equal(guild.data.queried_player.uuid, playerUuid);
  assert.equal(guild.data.queried_player.rank, "Guild Master");
  assert.equal(guild.data.queried_player.joined, 1_600_000_000_001);
  assert.equal(guild.data.queried_player.quest_participation, 7);
  assert.equal(guild.data.queried_player.weekly_exp, 150, "weekly exp sums the expHistory days");
  assert.equal(guild.data.members.length, 3);
  const silentMember = guild.data.members.find((member) => member.uuid === "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee");
  assert.equal(silentMember.weekly_exp, null, "no expHistory means weekly exp is unknown, never zero");

  // Member pagination.
  const paged = await (await call(`/v1/guild?player=${playerUuid}&page=1&limit=1`)).json();
  assert.equal(paged.data.total_items, 3);
  assert.equal(paged.data.total_pages, 3);
  assert.equal(paged.data.has_more, true);
  assert.equal(paged.data.members.length, 1);
  assert.equal(paged.data.members[0].uuid, "ffffffffffffffffffffffffffffffff");

  // Name lookup forwards only the name upstream; queried_player stays null
  // and an empty member list is a real result.
  installMockFetch({
    "/v2/guild": (url) => {
      assert.equal(url.searchParams.get("name"), "Test Guild");
      assert.equal(url.searchParams.get("player"), null);
      assert.equal(url.searchParams.get("id"), null);
      return Response.json({ success: true, guild: { name: "Test Guild", exp: 50_000, members: [] } });
    },
  });
  const byName = await (await call("/v1/guild?name=Test%20Guild")).json();
  assert.equal(byName.data.query_by, "name");
  assert.equal(byName.data.guild.level, 0, "50,000 exp sits below the 100,000 first level cost");
  assert.equal(byName.data.guild.skyblock_guild_exp, null, "missing per-game exp is unavailable, not zero");
  assert.equal(byName.data.queried_player, null);
  assert.deepEqual(byName.data.members, []);

  // Upstream success with guild:null is a real guildless answer.
  installMockFetch({ "/v2/guild": () => Response.json({ success: true, guild: null }) });
  const guildless = await (await call(`/v1/guild?player=${playerUuid}`)).json();
  assert.equal(guildless.success, true);
  assert.equal(guildless.data_present, false);
  assert.equal(guildless.data.guild, null);
  assert.deepEqual(guildless.data.members, []);
  assert.ok(guildless.data.reason);

  // Network player: aggressive pick from the huge /v2/player payload.
  installMockFetch();
  const playerResponse = await call(`/v1/network?kind=player&uuid=${playerUuid}`);
  const network = await playerResponse.json();
  assert.equal(playerResponse.status, 200, JSON.stringify(network));
  assert.equal(network.payload_kind, "network_player");
  assert.equal(network.data_present, true);
  assert.equal(network.data.displayname, "TestPlayer");
  assert.equal(network.data.rank_key, "SUPERSTAR", "monthlyPackageRank outranks newPackageRank");
  assert.equal(network.data.rank, "MVP++");
  assert.equal(network.data.discord, "test#0000");
  assert.equal(network.data.social_media_links.HYPIXEL, "https://hypixel.net/members/x");
  assert.equal(network.data.first_login, 1_500_000_000_000);
  assert.equal(network.data.last_login, 1_700_000_000_000);
  assert.equal(network.data.skyblock_achievements.skyblock_dungeoneer, 40);
  assert.equal(network.data.skyblock_achievements.skyblock_treasure_hunter, 15);
  assert.equal(network.data.skyblock_achievements.bedwars_level, undefined, "non-SkyBlock achievements are dropped");
  // SkyCrypt src/stats/skills.js fallback mapping, achievement -> skill level.
  assert.equal(network.data.achievement_skill_levels.farming, 30);
  assert.equal(network.data.achievement_skill_levels.mining, 25);
  assert.equal(network.data.achievement_skill_levels.combat, 44);
  assert.equal(network.data.achievement_skill_levels.foraging, 21);
  assert.equal(network.data.achievement_skill_levels.enchanting, 20);
  assert.equal(network.data.achievement_skill_levels.alchemy, 12);
  assert.equal(network.data.achievement_skill_levels.taming, 33);
  assert.equal(network.data.achievement_skill_levels.fishing, null, "a missing achievement is unknown, never zero");
  assert.equal(network.data.claimed_flags.claimed_potato_talisman, 1_600_000_000_000);

  // kind defaults to player.
  const defaulted = await (await call(`/v1/network?uuid=${playerUuid}`)).json();
  assert.equal(defaulted.kind, "player");
  assert.equal(defaulted.payload_kind, "network_player");

  // Staff rank beats the monthly rank; absent achievements stay unavailable.
  installMockFetch({
    "/v2/player": () => Response.json({
      success: true,
      player: { displayname: "Tuber", rank: "YOUTUBER", monthlyPackageRank: "SUPERSTAR", newPackageRank: "MVP_PLUS" },
    }),
  });
  const tuber = await (await call(`/v1/network?kind=player&uuid=${playerUuid}`)).json();
  assert.equal(tuber.data.rank_key, "YOUTUBER");
  assert.equal(tuber.data.rank, "YOUTUBE");
  assert.equal(tuber.data.achievements_present, false);
  assert.equal(tuber.data.skyblock_achievements, null, "no achievements object means unavailable, not empty");
  assert.equal(tuber.data.achievement_skill_levels, null);
  assert.equal(tuber.data.last_login, null, "a hidden lastLogin is unavailable, not a fact");

  installMockFetch({
    "/v2/player": () => Response.json({ success: true, player: { displayname: "OldVip", packageRank: "VIP" } }),
  });
  const vip = await (await call(`/v1/network?uuid=${playerUuid}`)).json();
  assert.equal(vip.data.rank_key, "VIP");
  assert.equal(vip.data.rank, "VIP");

  // Upstream success with player:null.
  installMockFetch({ "/v2/player": () => Response.json({ success: true, player: null }) });
  const nobody = await (await call(`/v1/network?uuid=${playerUuid}`)).json();
  assert.equal(nobody.data_present, false);
  assert.ok(nobody.data.reason);

  // Status: a visible session reports the exact location fields.
  installMockFetch();
  const online = await (await call(`/v1/network?kind=status&uuid=${playerUuid}`)).json();
  assert.equal(online.payload_kind, "network_status");
  assert.equal(online.data_present, true);
  assert.equal(online.data.online, true);
  assert.equal(online.data.game_type, "SKYBLOCK");
  assert.equal(online.data.mode, "dynamic_island");
  assert.equal(online.data.map, "Private Island");

  // online:false is indistinguishable from a privacy-hidden session, so the
  // status is unavailable, never "offline" as fact.
  installMockFetch({
    "/v2/status": () => Response.json({ success: true, uuid: playerUuid, session: { online: false } }),
  });
  const hidden = await (await call(`/v1/network?kind=status&uuid=${playerUuid}`)).json();
  assert.equal(hidden.data_present, false);
  assert.equal(hidden.data.online, null);
  assert.match(hidden.data.reason, /unavailable/);

  // Counts: SKYBLOCK totals plus per-mode counts, cached about a minute.
  installMockFetch();
  resetCaches();
  const counts = await (await call("/v1/network?kind=counts")).json();
  assert.equal(counts.payload_kind, "network_counts");
  assert.equal(counts.data_present, true);
  assert.equal(counts.data.network_players, 35_000);
  assert.equal(counts.data.skyblock_players, 21_000);
  assert.deepEqual(counts.data.modes, { dynamic_island: 8_000, hub: 5_000 });
  await call("/v1/network?kind=counts");
  assert.equal(countFetches("/v2/counts"), 1, "counts responses are served from the 60s cache");

  // Missing SKYBLOCK counts are unavailable, not zero players.
  installMockFetch({ "/v2/counts": () => Response.json({ success: true, playerCount: 10, games: {} }) });
  resetCaches();
  const noCounts = await (await call("/v1/network?kind=counts")).json();
  assert.equal(noCounts.data_present, false);
  assert.equal(noCounts.data.skyblock_players, null);
  assert.ok(noCounts.data.reason);

  // Validation: player/status need a UUID; unknown kinds reject.
  assert.equal((await call("/v1/network?kind=player")).status, 400);
  assert.equal((await call("/v1/network?kind=status")).status, 400);
  assert.equal((await call(`/v1/network?kind=bogus&uuid=${playerUuid}`)).status, 400);

  // Leave clean mocks and caches for the suites that follow.
  installMockFetch();
  resetCaches();
}
