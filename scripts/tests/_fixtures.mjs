import { gzipSync } from "node:zlib";
import worker from "../../src/worker.js";

export const playerUuid = "0123456789abcdef0123456789abcdef";
export const profileId = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
export const itemNbt = "H4sIAAAAAAAAAB2NQQqCQBhGv1ErHaKu0KoLtGtnarRIhTpA/OGfDIwZ4wxUF/IeHiyyto/3eBKIIJQEIDx4qsJaYJK07m6FhG+p9hEdVMV7TXU3Wh+JWaW6h6ZXhODYGg5/LeZDfxt6nZR5XhYhgoIaxmKE8dsZXu20YwuJZfa0hmJrjbo6y134f8pTll5O5TnbbgAP05Qaqhk+8AVIrd2eoAAAAA==";

export const env = { HYPIXEL_API_KEY: "hypixel-test", GPT_SHARED_SECRET: "shared-test" };

// Minimal NBT writer so tests can build inventory blobs with exact item IDs,
// enchantment levels, and nested bag byte arrays. Type mapping: number ->
// Int32, string -> String, { __bytes } -> ByteArray, array -> List, object ->
// Compound. That subset is all the Worker's reader needs for these fixtures.
function nbtTypeOf(value) {
  if (typeof value === "number") return 3;
  if (typeof value === "string") return 8;
  if (Array.isArray(value)) return 9;
  if (value && typeof value === "object" && Array.isArray(value.__bytes)) return 7;
  if (value && typeof value === "object") return 10;
  throw new Error(`Unsupported NBT fixture value: ${value}`);
}

function writeNbtPayload(parts, value) {
  const type = nbtTypeOf(value);
  if (type === 3) {
    const buffer = Buffer.alloc(4);
    buffer.writeInt32BE(value);
    parts.push(buffer);
  } else if (type === 8) {
    const text = Buffer.from(value, "utf8");
    const length = Buffer.alloc(2);
    length.writeUInt16BE(text.length);
    parts.push(length, text);
  } else if (type === 7) {
    const length = Buffer.alloc(4);
    length.writeInt32BE(value.__bytes.length);
    parts.push(length, Buffer.from(value.__bytes.map((byte) => byte & 0xff)));
  } else if (type === 9) {
    const header = Buffer.alloc(5);
    header.writeUInt8(value.length ? nbtTypeOf(value[0]) : 10, 0);
    header.writeInt32BE(value.length, 1);
    parts.push(header);
    for (const item of value) writeNbtPayload(parts, item);
  } else {
    for (const [key, child] of Object.entries(value)) {
      parts.push(Buffer.from([nbtTypeOf(child)]));
      writeNbtPayload(parts, key);
      writeNbtPayload(parts, child);
    }
    parts.push(Buffer.from([0]));
  }
}

// Raw gzipped NBT bytes of an inventory root { i: [...items] } — the format
// nested *_backpack_data byte arrays store.
export function encodeItemsNbtBytes(items) {
  const parts = [Buffer.from([10]), Buffer.alloc(2)];
  writeNbtPayload(parts, { i: items });
  return [...gzipSync(Buffer.concat(parts))];
}

// Base64 blob form used by inventory containers.
export function encodeItemsNbt(items) {
  return Buffer.from(encodeItemsNbtBytes(items)).toString("base64");
}

export const nbtItem = (skyblockId, extraAttributes = {}, options = {}) => ({
  id: options.vanillaId ?? 397,
  Count: options.count ?? 1,
  ...(options.slot !== undefined ? { Slot: options.slot } : {}),
  tag: {
    display: { Name: options.name ?? skyblockId },
    ExtraAttributes: { id: skyblockId, ...extraAttributes },
  },
});

export const auction = (uuid, price, bin = true) => ({
  uuid,
  auctioneer: playerUuid,
  profile_id: profileId,
  start: 1,
  end: 9_999_999_999_999,
  item_name: "Azure Bluet",
  extra: "Azure Bluet Red Rose",
  category: "blocks",
  tier: "COMMON",
  starting_bid: price,
  highest_bid_amount: bin ? price : 0,
  bin,
  bids: [],
  item_bytes: { type: 0, data: itemNbt },
});

export const member = () => ({
  last_save: 100,
  collection: { COBBLESTONE: 750, DIAMOND: 25 },
  accessory_bag_storage: { selected_power: "fortuitous", highest_magical_power: 465 },
  forge: {
    forge_processes: {
      forge_1: {
        0: { id: "REFINED_MITHRIL", type: "REFINING", startTime: 1_700_000_000_000, duration_ms: 21_600_000 },
        1: { id: "REFINED_TITANIUM", type: "REFINING", startTime: 1_700_000_000_000 },
        2: { id: "PET", type: "CASTING", startTime: 1_700_000_000_000, endTime: 1_700_000_001_000 },
      },
    },
  },
  inventory: {
    talisman_bag: { type: 0, data: itemNbt },
    sacks_counts: { ENCHANTED_TITANIUM: 16, AZURE_BLUET: 0 },
  },
});

export function defaultHandlers() {
  return {
    "/v2/skyblock/profiles": () => Response.json({
      success: true,
      profiles: [{
        profile_id: profileId,
        cute_name: "Mango",
        selected: true,
        members: { [playerUuid]: member() },
      }],
    }),

    "/v2/resources/skyblock/collections": () => Response.json({
      success: true,
      lastUpdated: 123,
      version: "test",
      collections: {
        MINING: {
          name: "Mining",
          items: {
            COBBLESTONE: {
              name: "Cobblestone",
              maxTiers: 3,
              tiers: [
                { tier: 1, amountRequired: 50, unlocks: ["Cobblestone Minion Recipe"] },
                { tier: 2, amountRequired: 100, unlocks: ["Compactor Recipe"] },
                { tier: 3, amountRequired: 1000, unlocks: ["Haste Ring Recipe"] },
              ],
            },
          },
        },
      },
    }),

    "/v2/resources/skyblock/items": () => Response.json({
      success: true,
      lastUpdated: 123,
      items: [
        { id: "RED_ROSE:3", name: "Azure Bluet" },
        { id: "ENCHANTED_TITANIUM", name: "Enchanted Titanium" },
        { id: "BOOSTER_COOKIE", name: "Booster Cookie" },
        { id: "WOLF_TALISMAN", name: "Wolf Talisman", tier: "COMMON", category: "ACCESSORY" },
        { id: "WOLF_RING", name: "Wolf Ring", tier: "RARE", category: "ACCESSORY" },
        { id: "HEGEMONY_ARTIFACT", name: "Hegemony Artifact", tier: "LEGENDARY", category: "ACCESSORY" },
        { id: "ABICASE", name: "Abicase", tier: "RARE", category: "ACCESSORY" },
        { id: "ZOMBIE_TALISMAN", name: "Zombie Talisman", tier: "COMMON", category: "ACCESSORY" },
        { id: "PARTY_HAT_CRAB", name: "Crab Hat", tier: "EPIC", category: "ACCESSORY" },
      ],
    }),

    "/v2/resources/skyblock/skills": () => Response.json({
      success: true,
      lastUpdated: 123,
      version: "test",
      skills: {
        MINING: {
          name: "Mining",
          maxLevel: 3,
          levels: [
            { level: 1, totalExpRequired: 50 },
            { level: 2, totalExpRequired: 175 },
            { level: 3, totalExpRequired: 375 },
          ],
        },
      },
    }),

    "/v2/resources/skyblock/election": () => Response.json({
      success: true, lastUpdated: 123, mayor: { key: "test", name: "Test Mayor" },
    }),

    "/v2/resources/skyblock/bingo": () => Response.json({
      success: true, lastUpdated: 123, id: 1, goals: [{ id: "goal", name: "Goal" }],
    }),

    "/v2/skyblock/bazaar": () => Response.json({
      success: true,
      lastUpdated: 456,
      products: {
        BOOSTER_COOKIE: {
          product_id: "BOOSTER_COOKIE",
          sell_summary: [{ amount: 4, pricePerUnit: 100, orders: 1 }],
          buy_summary: [{ amount: 5, pricePerUnit: 90, orders: 2 }],
          quick_status: {
            productId: "BOOSTER_COOKIE",
            sellPrice: 100, sellVolume: 10, sellMovingWeek: 70, sellOrders: 3,
            buyPrice: 90, buyVolume: 20, buyMovingWeek: 140, buyOrders: 4,
          },
        },
      },
    }),

    "/v2/skyblock/auctions": (url) => {
      const page = Number(url.searchParams.get("page") || 0);
      return Response.json({
        success: true,
        page,
        totalPages: 2,
        totalAuctions: 4,
        lastUpdated: 456,
        auctions: page === 0
          ? [auction("a", 100), auction("b", 75), auction("c", 1, false)]
          : [auction("d", 50)],
      });
    },

    "/v2/skyblock/auctions_ended": () => Response.json({
      success: true,
      lastUpdated: 456,
      auctions: [{
        auction_id: "ended-1",
        seller: playerUuid,
        seller_profile: profileId,
        buyer: "ffffffffffffffffffffffffffffffff",
        timestamp: 1_700_000_000_000,
        price: 4200,
        bin: true,
        item_bytes: itemNbt,
      }],
    }),

    "/v2/skyblock/auction": () => Response.json({
      success: true,
      auctions: [auction("lookup-1", 999)],
    }),

    "/v2/skyblock/museum": () => Response.json({
      success: true,
      profile: {
        [playerUuid]: {
          value: 1234,
          appraisal: false,
          items: {
            ZOMBIE_SWORD: { donated_time: 1_700_000_000_000, featured_slot: "A_1", items: { type: 0, data: itemNbt } },
            UNDEAD_SWORD: { donated_time: 1_700_000_000_002, borrowing: true, items: { type: 0, data: itemNbt } },
          },
          special: [{ donated_time: 1_700_000_000_001, items: { type: 0, data: itemNbt } }],
        },
      },
    }),

    "/v2/skyblock/garden": () => Response.json({
      success: true,
      garden: { uuid: profileId, garden_experience: 5000, unlocked_plots_ids: ["beginner_1"] },
    }),

    "/v2/skyblock/bingo": () => Response.json({
      success: true,
      events: [{ key: 1, points: 40, completed_goals: ["goal"] }],
    }),

    "/v2/skyblock/news": () => Response.json({
      success: true,
      items: [{ title: "Update", link: "https://hypixel.net/x", text: "notes" }],
    }),

    "/v2/skyblock/firesales": () => Response.json({
      success: true,
      sales: [{ item_id: "DYE", start: 1, end: 2, amount: 3, price: 4 }],
    }),

    // exp 3,000,000 crosses exactly six levels of the SkyCrypt guild curve
    // (100k+150k+250k+500k+750k+1m consumed, 250k left under the 1.25m step).
    "/v2/guild": () => Response.json({
      success: true,
      guild: {
        _id: "5f0000000000000000000abc",
        name: "Test Guild",
        tag: "TEST",
        tagColor: "DARK_AQUA",
        created: 1_600_000_000_000,
        exp: 3_000_000,
        guildExpByGameType: { SKYBLOCK: 2_000_000, BEDWARS: 500 },
        publiclyListed: true,
        members: [
          {
            uuid: playerUuid,
            rank: "Guild Master",
            joined: 1_600_000_000_001,
            questParticipation: 7,
            expHistory: { "2026-07-24": 100, "2026-07-23": 50 },
          },
          {
            uuid: "ffffffffffffffffffffffffffffffff",
            rank: "Member",
            joined: 1_600_000_000_002,
            expHistory: { "2026-07-24": 25 },
          },
          { uuid: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee", rank: "Member", joined: 1_600_000_000_003 },
        ],
      },
    }),

    // No skyblock_angler on purpose: fishing must fall back to null, not 0.
    "/v2/player": () => Response.json({
      success: true,
      player: {
        uuid: playerUuid,
        displayname: "TestPlayer",
        newPackageRank: "MVP_PLUS",
        monthlyPackageRank: "SUPERSTAR",
        firstLogin: 1_500_000_000_000,
        lastLogin: 1_700_000_000_000,
        socialMedia: { links: { DISCORD: "test#0000", HYPIXEL: "https://hypixel.net/members/x" } },
        claimed_potato_talisman: 1_600_000_000_000,
        achievements: {
          skyblock_harvester: 30,
          skyblock_excavator: 25,
          skyblock_combat: 44,
          skyblock_gatherer: 21,
          skyblock_augmentation: 20,
          skyblock_concoctor: 12,
          skyblock_domesticator: 33,
          skyblock_dungeoneer: 40,
          skyblock_slayer: 22,
          skyblock_hard_working_miner: 9,
          skyblock_treasure_hunter: 15,
          bedwars_level: 100,
        },
      },
    }),

    "/v2/status": () => Response.json({
      success: true,
      uuid: playerUuid,
      session: { online: true, gameType: "SKYBLOCK", mode: "dynamic_island", map: "Private Island" },
    }),

    "/v2/counts": () => Response.json({
      success: true,
      playerCount: 35_000,
      games: {
        SKYBLOCK: { players: 21_000, modes: { dynamic_island: 8_000, hub: 5_000 } },
        BEDWARS: { players: 9_000 },
      },
    }),
  };
}

export let fetchLog = [];

export function installMockFetch(overrides = {}) {
  const handlers = { ...defaultHandlers(), ...overrides };
  fetchLog = [];
  globalThis.fetch = async (input) => {
    const url = input instanceof URL
      ? input
      : new URL(typeof input === "string" ? input : input.url);
    fetchLog.push(url.pathname);
    const handler = handlers[url.pathname];
    if (!handler) throw new Error(`Unexpected upstream URL: ${url}`);
    return handler(url);
  };
}

export function countFetches(pathname) {
  return fetchLog.filter((entry) => entry === pathname).length;
}

export const call = async (path, authenticated = true) => worker.fetch(
  new Request(`https://worker.test${path}`, {
    headers: authenticated ? { "X-GPT-Key": "shared-test" } : {},
  }),
  env,
);
