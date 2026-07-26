import { objectOrEmpty, optionalNumber, paginateRecords, stringOrNull } from "../util.js";
import { ClientError, json } from "../http.js";
import {
  normalizeUuid,
  readIntegerParameter,
  readOptionalUuidParameter,
  readTextParameter,
  requireEnumParameter,
  requireUuid,
} from "../params.js";
import { fetchHypixelJson } from "../hypixel.js";
import {
  achievementSkillLevels,
  compactSocialLinks,
  computeGuildLevel,
  normalizeRank,
  pickClaimedFlags,
  pickSkyblockAchievements,
} from "../network.js";

const GUILD_ID_PATTERN = /^[0-9a-f]{24}$/i;
const NETWORK_KINDS = new Set(["player", "status", "counts"]);

export async function handleGuild(url, env) {
  const page = readIntegerParameter(url, "page", 0, 0, 10_000);
  const limit = readIntegerParameter(url, "limit", 25, 1, 100);
  const playerUuid = readOptionalUuidParameter(url, "player");
  const guildName = readTextParameter(url, "name", 64, "");
  const guildId = readTextParameter(url, "id", 64, "");

  const provided = [playerUuid, guildName, guildId].filter(Boolean);
  if (provided.length !== 1) {
    throw new ClientError("Provide exactly one of player (a Minecraft UUID), name, or id.", 400);
  }
  if (guildId && !GUILD_ID_PATTERN.test(guildId)) {
    throw new ClientError("id must be a 24-character hexadecimal Hypixel guild ID.", 400);
  }

  const queryBy = playerUuid ? "player" : guildName ? "name" : "id";
  const payload = await fetchHypixelJson("/v2/guild", env, {
    player: playerUuid,
    name: guildName || null,
    id: guildId || null,
  }, { authenticated: true });

  // Upstream success with guild:null is a real "no guild" answer (player is
  // guildless, or no guild matched the name/id) — not an error.
  const guild = payload.guild && typeof payload.guild === "object" ? payload.guild : null;
  if (!guild) {
    return json({
      success: true,
      payload_kind: "hypixel_guild",
      payload_version: "1",
      data_present: false,
      data: {
        payload_kind: "hypixel_guild",
        payload_version: "1",
        data_present: false,
        available: false,
        query_by: queryBy,
        guild: null,
        queried_player: null,
        page,
        limit,
        total_items: 0,
        total_pages: 0,
        has_more: false,
        members: [],
        reason: queryBy === "player"
          ? "Hypixel returned no guild for that player: they are not in a guild."
          : "Hypixel returned no guild matching that lookup.",
      },
    });
  }

  const rawMembers = Array.isArray(guild.members) ? guild.members : [];
  const members = rawMembers.map(compactGuildMember);
  const queriedIndex = playerUuid
    ? members.findIndex((member) => member.uuid === playerUuid)
    : -1;
  const exp = optionalNumber(guild.exp);
  const { items: memberPage, ...pagination } = paginateRecords(members, page, limit);

  return json({
    success: true,
    payload_kind: "hypixel_guild",
    payload_version: "1",
    data_present: true,
    data: {
      payload_kind: "hypixel_guild",
      payload_version: "1",
      data_present: true,
      available: true,
      query_by: queryBy,
      guild: {
        id: stringOrNull(guild._id),
        name: stringOrNull(guild.name),
        tag: stringOrNull(guild.tag),
        tag_color: stringOrNull(guild.tagColor),
        description: stringOrNull(guild.description),
        created: optionalNumber(guild.created),
        exp,
        // Computed from exp via the SkyCrypt-transcribed guild EXP curve
        // (src/network.js); null when Hypixel exposed no exp.
        level: exp === null ? null : computeGuildLevel(exp),
        member_count: Array.isArray(guild.members) ? guild.members.length : null,
        skyblock_guild_exp: optionalNumber(objectOrEmpty(guild.guildExpByGameType).SKYBLOCK),
        publicly_listed: typeof guild.publiclyListed === "boolean" ? guild.publiclyListed : null,
      },
      queried_player: queriedIndex >= 0
        ? {
          ...members[queriedIndex],
          quest_participation: optionalNumber(objectOrEmpty(rawMembers[queriedIndex]).questParticipation),
        }
        : null,
      ...pagination,
      members: memberPage,
      reason: null,
    },
  });
}

function compactGuildMember(member) {
  const source = objectOrEmpty(member);
  return {
    uuid: stringOrNull(source.uuid) ? normalizeUuid(source.uuid) : null,
    rank: stringOrNull(source.rank),
    joined: optionalNumber(source.joined),
    // Sum of the rolling 7-day expHistory; null when Hypixel exposed none,
    // never a fabricated zero.
    weekly_exp: sumExpHistory(source.expHistory),
  };
}

function sumExpHistory(history) {
  if (!history || typeof history !== "object" || Array.isArray(history)) return null;
  let total = 0;
  let seen = false;
  for (const value of Object.values(history)) {
    const amount = optionalNumber(value);
    if (amount !== null) {
      total += amount;
      seen = true;
    }
  }
  return seen ? total : null;
}

export async function handleNetwork(url, env) {
  const kind = requireEnumParameter(url, "kind", NETWORK_KINDS, "player");

  if (kind === "counts") {
    return handleNetworkCounts(env);
  }
  const uuid = requireUuid(url);
  if (kind === "status") {
    return handleNetworkStatus(uuid, env);
  }
  return handleNetworkPlayer(uuid, env);
}

async function handleNetworkPlayer(uuid, env) {
  const payload = await fetchHypixelJson("/v2/player", env, { uuid }, { authenticated: true });
  const player = payload.player && typeof payload.player === "object" ? payload.player : null;

  if (!player) {
    return json({
      success: true,
      uuid,
      kind: "player",
      payload_kind: "network_player",
      payload_version: "1",
      data_present: false,
      data: {
        payload_kind: "network_player",
        payload_version: "1",
        data_present: false,
        available: false,
        reason: "Hypixel returned no network player record for that UUID.",
      },
    });
  }

  const achievements = player.achievements && typeof player.achievements === "object" && !Array.isArray(player.achievements)
    ? player.achievements
    : null;
  const socialLinks = compactSocialLinks(player);

  return json({
    success: true,
    uuid,
    kind: "player",
    payload_kind: "network_player",
    payload_version: "1",
    data_present: true,
    data: {
      payload_kind: "network_player",
      payload_version: "1",
      data_present: true,
      available: true,
      displayname: stringOrNull(player.displayname),
      // Normalized via the SkyCrypt parseRank precedence (src/network.js).
      ...normalizeRank(player),
      social_media_links: socialLinks,
      discord: socialLinks ? socialLinks.DISCORD ?? null : null,
      first_login: optionalNumber(player.firstLogin),
      // Null when hidden by the player's API privacy settings — unavailable,
      // not "never logged in".
      last_login: optionalNumber(player.lastLogin),
      achievements_present: achievements !== null,
      // skyblock_* tiered achievements only; the raw map spans every game.
      skyblock_achievements: pickSkyblockAchievements(achievements),
      // Skill LEVELS (not XP) from achievements — the fallback when the
      // SkyBlock profile API exposes no skill experience. Missing keys are
      // null, never zero.
      achievement_skill_levels: achievementSkillLevels(achievements),
      claimed_flags: pickClaimedFlags(player),
      reason: null,
    },
  });
}

async function handleNetworkStatus(uuid, env) {
  const payload = await fetchHypixelJson("/v2/status", env, { uuid }, { authenticated: true });
  const session = objectOrEmpty(payload.session);

  if (session.online !== true) {
    // Hypixel reports online:false both for real offline players and for
    // sessions hidden by API privacy settings; the two are indistinguishable,
    // so the status is unavailable — never "offline" as fact.
    return json({
      success: true,
      uuid,
      kind: "status",
      payload_kind: "network_status",
      payload_version: "1",
      data_present: false,
      data: {
        payload_kind: "network_status",
        payload_version: "1",
        data_present: false,
        available: false,
        online: null,
        game_type: null,
        mode: null,
        map: null,
        reason: "Hypixel exposed no active session. The player may be offline or hiding online status in API settings; treat the status as unavailable, never as confirmed offline.",
      },
    });
  }

  return json({
    success: true,
    uuid,
    kind: "status",
    payload_kind: "network_status",
    payload_version: "1",
    data_present: true,
    data: {
      payload_kind: "network_status",
      payload_version: "1",
      data_present: true,
      available: true,
      online: true,
      game_type: stringOrNull(session.gameType),
      mode: stringOrNull(session.mode),
      map: stringOrNull(session.map),
      reason: null,
    },
  });
}

async function handleNetworkCounts(env) {
  const payload = await fetchHypixelJson("/v2/counts", env, {}, { authenticated: true });
  const skyblock = objectOrEmpty(objectOrEmpty(payload.games).SKYBLOCK);
  const skyblockPlayers = optionalNumber(skyblock.players);

  if (skyblockPlayers === null) {
    return json({
      success: true,
      kind: "counts",
      payload_kind: "network_counts",
      payload_version: "1",
      data_present: false,
      data: {
        payload_kind: "network_counts",
        payload_version: "1",
        data_present: false,
        available: false,
        network_players: optionalNumber(payload.playerCount),
        skyblock_players: null,
        modes: null,
        reason: "Hypixel exposed no SKYBLOCK player counts.",
      },
    });
  }

  // Per-mode SKYBLOCK counts; null when Hypixel exposed no mode map at all
  // (missing data is unavailable, not an empty island).
  let modes = null;
  if (skyblock.modes && typeof skyblock.modes === "object" && !Array.isArray(skyblock.modes)) {
    modes = {};
    for (const [mode, count] of Object.entries(skyblock.modes)) {
      const value = optionalNumber(count);
      if (value !== null) modes[mode] = value;
    }
  }

  return json({
    success: true,
    kind: "counts",
    payload_kind: "network_counts",
    payload_version: "1",
    data_present: true,
    data: {
      payload_kind: "network_counts",
      payload_version: "1",
      data_present: true,
      available: true,
      network_players: optionalNumber(payload.playerCount),
      skyblock_players: skyblockPlayers,
      modes,
      reason: null,
    },
  });
}
