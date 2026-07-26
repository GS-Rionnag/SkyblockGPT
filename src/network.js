// Network-level (non-SkyBlock) Hypixel domain helpers: guild leveling, rank
// normalization, and the skyblock_* achievement skill fallback. Tables are
// transcribed from the SkyCrypt source, never invented from memory.

import { objectOrEmpty, optionalNumber, stringOrNull } from "./util.js";

// Guild EXP needed per level; past the table's end every further level costs
// the last entry (3,000,000 EXP).
// Source: SkyCrypt src/constants/leveling.js (GUILD_XP).
const GUILD_EXP_PER_LEVEL = [
  100000, 150000, 250000, 500000, 750000, 1000000, 1250000, 1500000, 2000000, 2500000, 2500000, 2500000, 2500000,
  2500000, 3000000,
];

// Defensive bound only; real guilds sit far below it. The SkyCrypt loop is
// uncapped, but a corrupt upstream exp value must not spin the Worker.
const GUILD_LEVEL_HARD_CAP = 100_000;

// Source: SkyCrypt src/helper.js getGuildLevel() — subtract each level's cost
// while the remaining exp strictly exceeds it.
export function computeGuildLevel(exp) {
  let remaining = optionalNumber(exp);
  if (remaining === null || remaining < 0) return null;
  let level = 0;
  while (level < GUILD_LEVEL_HARD_CAP) {
    const needed = GUILD_EXP_PER_LEVEL[Math.min(GUILD_EXP_PER_LEVEL.length - 1, level)];
    if (remaining > needed) {
      remaining -= needed;
      level += 1;
    } else {
      return level;
    }
  }
  return level;
}

// Display tags per normalized rank key.
// Source: SkyCrypt src/constants/misc.js (RANKS), tag + plus concatenated.
const RANK_TAGS = {
  OWNER: "OWNER",
  ADMIN: "ADMIN",
  GAME_MASTER: "GM",
  YOUTUBER: "YOUTUBE",
  SUPERSTAR: "MVP++",
  MVP_PLUS: "MVP+",
  MVP: "MVP",
  VIP_PLUS: "VIP+",
  VIP: "VIP",
  "PIG+++": "PIG+++",
  MAYOR: "MAYOR",
  MINISTER: "MINISTER",
};

// Precedence transcribed from SkyCrypt src/helper.js parseRank(): prefix,
// then rank (unless NORMAL), then monthlyPackageRank (unless NONE), then
// newPackageRank, then packageRank. A resolved NONE stays rankless without
// falling through to a lower-precedence field, exactly like SkyCrypt.
export function normalizeRank(player) {
  const source = objectOrEmpty(player);
  let key = null;
  let derivedFrom = null;
  const prefix = stringOrNull(source.prefix);
  if (prefix) {
    key = prefix.replaceAll(/§[0-9a-fk-or]/gi, "").replaceAll(/[[\]]/g, "").trim();
    derivedFrom = "prefix";
  } else if (stringOrNull(source.rank) && source.rank !== "NORMAL") {
    key = source.rank.trim();
    derivedFrom = "rank";
  } else if (stringOrNull(source.monthlyPackageRank) && source.monthlyPackageRank !== "NONE") {
    key = source.monthlyPackageRank.trim();
    derivedFrom = "monthlyPackageRank";
  } else if (stringOrNull(source.newPackageRank)) {
    key = source.newPackageRank.trim();
    derivedFrom = "newPackageRank";
  } else if (stringOrNull(source.packageRank)) {
    key = source.packageRank.trim();
    derivedFrom = "packageRank";
  }
  if (!key || key === "NONE" || key === "NORMAL") {
    return { rank_key: null, rank: null, derived_from: derivedFrom };
  }
  return { rank_key: key, rank: RANK_TAGS[key] || key, derived_from: derivedFrom };
}

// Achievement -> skill-level fallback mapping. These skyblock_* achievement
// values are skill LEVELS (not XP), used when the profile API exposes no
// player_data.experience.
// Source: SkyCrypt src/stats/skills.js getLevels() achievement branch.
export const ACHIEVEMENT_SKILL_MAP = {
  farming: "skyblock_harvester",
  mining: "skyblock_excavator",
  combat: "skyblock_combat",
  foraging: "skyblock_gatherer",
  fishing: "skyblock_angler",
  enchanting: "skyblock_augmentation",
  alchemy: "skyblock_concoctor",
  taming: "skyblock_domesticator",
};

// Levels keyed by skill name; a missing achievement is null, never zero.
// Null when the whole achievements object was not exposed.
export function achievementSkillLevels(achievements) {
  if (!achievements || typeof achievements !== "object" || Array.isArray(achievements)) return null;
  const levels = {};
  for (const [skill, achievementKey] of Object.entries(ACHIEVEMENT_SKILL_MAP)) {
    levels[skill] = optionalNumber(achievements[achievementKey]);
  }
  return levels;
}

// Only skyblock_* tiered achievements survive the pick: the raw /v2/player
// achievements map spans every Hypixel game and is far too large to return.
export function pickSkyblockAchievements(achievements) {
  if (!achievements || typeof achievements !== "object" || Array.isArray(achievements)) return null;
  const picked = {};
  for (const key of Object.keys(achievements).sort()) {
    if (!key.startsWith("skyblock_")) continue;
    const value = optionalNumber(achievements[key]);
    if (value !== null) picked[key] = value;
  }
  return picked;
}

// Trivially picked top-level claim flags (claimed_potato_talisman and
// friends). Values are Hypixel's raw claim timestamps (Unix ms) or booleans.
export function pickClaimedFlags(player) {
  const source = objectOrEmpty(player);
  const flags = {};
  let kept = 0;
  for (const key of Object.keys(source).sort()) {
    if (!key.startsWith("claimed_") && !key.startsWith("scorpius_bribe_")) continue;
    const value = source[key];
    if (!["string", "number", "boolean"].includes(typeof value)) continue;
    flags[key] = value;
    kept += 1;
    if (kept >= 60) break;
  }
  return flags;
}

// socialMedia.links with only non-empty string values; null when the player
// exposed no links (missing data is unavailable, not an empty set).
export function compactSocialLinks(player) {
  const links = objectOrEmpty(objectOrEmpty(objectOrEmpty(player).socialMedia).links);
  const picked = {};
  for (const [key, value] of Object.entries(links)) {
    if (typeof value === "string" && value.trim()) picked[key] = value.trim().slice(0, 300);
  }
  return Object.keys(picked).length ? picked : null;
}
