# SkyBlockGPT project context

## Product summary

SkyBlockGPT is an unofficial public Custom GPT for Hypixel SkyBlock. It combines live/player-specific API data with official wiki verification and then performs progression, inventory, crafting, Forge, Bazaar, auction, and statistical analysis.

Public GPT: `https://chatgpt.com/g/g-6a551449ab448191889f07e54162659f-skyblockgpt`

Creator contact: Discord `gs._`

The intended voice is a veteran SkyBlock player who has seen everything and is unimpressed by all of it: blunt, arrogant, funny, and openly dismissive, while still handing over every number and source in full. Nonchalance is tone, never effort. The GPT roasts builds, gear, and decisions hard, but never the person—no personal attacks or slurs, including toward third-party players a user looked up, because the GPT is public and the Hypixel playerbase skews young. It reads as a human player rather than an assistant, but never claims to be human if sincerely asked. Answers stay direct, sourced, and willing to say that data is unavailable. Each chat supplies an IGN, and the system must never assume the creator's identity.

## System architecture

```text
Public user
   |
   v
SkyBlockGPT in ChatGPT
   |-- Minecraft Services Action --> username -> UUID
   |-- Unified Worker Action ------> Cloudflare Worker
   |                                   |-- Hypixel player/profile APIs
   |                                   |-- Hypixel resources/Bazaar/AH APIs
   |                                   `-- NBT decode, filtering, pagination
   |-- Direct SkyCofl Action ------> history, sold auctions, AH comparables
   `-- Web search -----------------> official Hypixel SkyBlock Wiki + images
```

The Worker exists because raw Hypixel profiles, Bazaar payloads, and auction pages are too large and inconsistent for reliable Custom GPT Actions. It selects a profile, decodes NBT, normalizes fields, filters records, and paginates data before ChatGPT sees it.

## Trust and data-source boundaries

| Question | Authoritative source | Notes |
|---|---|---|
| IGN to UUID | Minecraft Services Action | Resolve per requested player; reuse only in the current chat. |
| Player/profile state | Hypixel through Worker | API-enabled/missing fields remain unavailable, never zero. |
| Current Bazaar | Hypixel through Worker | Distinguish instant buy/sell from order/offer prices and include timestamp. |
| Current Hypixel auctions | Hypixel through Worker | Page scans can be partial; lowest-BIN completeness must be explicit. |
| AH history/sold/comparables | Direct SkyCofl Action | Authentication lives in ChatGPT, never the Worker/repository. |
| Item facts/mechanics/recipes | Official Hypixel SkyBlock Wiki | Verify the exact current page for every item-specific answer. |
| Player item modifiers | Decoded Hypixel NBT | Reforges, stars, enchants, attributes, gemstones, and lore are instance data. |
| Images | Exact wiki/search result | Prefer 1-3 matched images for nontrivial content; never fabricate URLs. |

Do not use forums, SkyCrypt, or remembered facts as a substitute for an available authoritative source. If the sources conflict, report the conflict and identify which source controls which kind of fact.

## Worker surface

Public routes:

| Route | Purpose |
|---|---|
| `GET /health` | Service/version check; no authentication. |
| `GET /privacy` | Public privacy policy required by the GPT Action. |

Every route below requires `X-GPT-Key` and is defined in `actions/hypixel-worker.openapi.json`:

| Route | Operation ID | Purpose |
|---|---|---|
| `/v1/player/profiles` | `getCompactSkyBlockProfiles` | List compact profiles/cute names and membership. |
| `/v1/player/summary` | `getCompactSkyBlockProfileSummary` | Selected/requested profile overview, currencies, calculated skills. |
| `/v1/player/section` | `getCompactSkyBlockProfileSection` | One bounded section such as mining, forge, foraging, stats, gear, pets, crimson_isle, farming, minions, trophy_fish, chocolate_factory, hunting, effects, or the bestiary milestone summary. |
| `/v1/player/collections` | `getTypedSkyBlockPlayerCollections` | Typed, pageable collection progress: co-op summed amounts, claimed tiers from `unlocked_coll_tiers`, per-member amounts, optional unlocked rewards. |
| `/v1/player/bestiary` | `getTypedSkyBlockBestiary` | Typed, pageable Bestiary families with computed tiers from SkyCrypt-transcribed brackets; unknown families report `tier: null`. |
| `/v1/player/accessories` | `getTypedSkyBlockAccessories` | Typed accessory-bag contents, computed Magical Power (SkyCrypt rules), selected power, pagination. |
| `/v1/player/inventories` | `getCompactSkyBlockInventoryIndex` | Available NBT container index (including `rift_*` and shared carnival containers) plus wardrobe/loadout metadata; use before reading a container. |
| `/v1/player/inventory` | `getCompactSkyBlockInventoryContainer` | Page through one decoded container. |
| `/v1/player/item` | `getCompactSkyBlockInventoryItem` | Expanded detail for a selected item only, including decoded nested backpack/cake-bag contents. |
| `/v1/player/sacks` | `getCompactSkyBlockSacks` | Quantities from `sacks_counts`; owning a Sack item is not a quantity. |
| `/v1/player/extra` | `getCompactSkyBlockPlayerExtra` | Museum (borrowing flags, optional full item detail), Garden, and Bingo auxiliary data. |
| `/v1/resources` | `getCompactSkyBlockResource` | Search official Items, Collections, Skills, Election, or Bingo resources; every kind is searchable and pageable (election pages candidates plus mayor, bingo pages goals). |
| `/v1/feed` | `getCompactSkyBlockFeed` | Searchable, pageable news and Fire Sales feeds; Fire Sale rows join a display `item_name`. |
| `/v1/guild` | `getCompactHypixelGuild` | Guild by exactly one of player UUID, name, or id: identity, exp, SkyCrypt-curve level, SkyBlock guild exp, queried-player membership, paginated members. `guild: null` with `data_present=false` is a real guildless answer. |
| `/v1/network` | `getCompactHypixelNetworkPlayer` | Network-level data via `kind=`: player identity (normalized rank, social links, `skyblock_*` achievement skill fallback), visible-session status (hidden = unavailable, never "offline"), or SKYBLOCK player counts. |
| `/v1/bazaar/products` | `searchCompactSkyBlockBazaarProducts` | Search/filter/sort the Bazaar product index. |
| `/v1/bazaar/product` | `getCompactSkyBlockBazaarProduct` | Exact current product order summaries and quick status. |
| `/v1/auctions/page` | `browseCompactSkyBlockAuctionPage` | Filter/sort one upstream auction page. |
| `/v1/auctions/lowest-bin` | `getLowestBinSkyBlockAuctions` | Exact item-ID BIN scan with scan completeness and ascending comparables. |
| `/v1/auctions/lookup` | `lookupCompactSkyBlockAuctions` | Auction/player/profile lookup. |
| `/v1/auctions/ended` | `getCompactSkyBlockEndedAuctions` | Recent ended-auction data; summary rows carry budgeted identity decode (`item_id`, `item_name`, `decode_status`). |

The separate Action schemas intentionally use different domains:

- `api.minecraftservices.com`: one username lookup operation, no auth.
- `sky.coflnet.com`: Bazaar/AH history and auction evidence, Bearer auth stored in ChatGPT.
- `skyblock-gpt-proxy.girishsonic8.workers.dev`: all compact Hypixel operations, custom `X-GPT-Key` auth.

ChatGPT allows no more than 30 operations per Action set and rejects duplicate Action-set domains. Keep all Worker operations in its single unified schema.

## Response semantics

- `success: true` means the route completed, not that every optional field was present.
- `payload_kind` lets GPT instructions distinguish typed sections from generic/placeholder-looking data.
- `data_present: false` means unavailable or not exposed. Do not reinterpret it as zero.
- Empty typed arrays can be valid real results.
- Pagination fields and `has_more` must remain accurate.
- A page-local minimum is not a global minimum. Use explicit scan metadata.
- `needs_wiki_duration` on a Forge process means Hypixel omitted enough timing data; the GPT must verify the recipe duration on the exact wiki page before calculating.
- Effective Strength/Fortune and similar live totals can depend on held item, location, pets, armor, perks, buffs, and server state. Profile stats are evidence, not always a live Stats-menu total.
- Personal and co-op bank components have independent API availability. Preserve balance scope instead of calling a partial amount the total.
- `computed_magical_power` is Worker-computed from SkyCrypt-transcribed rules (see the accessories notes below); `null` means the accessory bag or the item catalog was unavailable — unknown, never zero. `reported_magical_power` mirrors raw bag settings and is normally null; `highest_magical_power` is a lifetime peak, not current MP.
- Skill `max_level` is per player: Farming rises with the Jacob's contest `farming_level_cap` perk and Taming with unique sacrificed pet types. The `level_cap` object records base/bonus/source so the cap stays auditable; a per-player cap never raises the resource ladder's maximum.
- Dungeon `best_run_per_floor` ships exactly one run per floor — the best by summed score fields. A run with no score fields has `total_score: null` and is never treated as a zero-score run; `runs_recorded` preserves how many runs Hypixel kept for the floor.
- Market, resource, and feed routes (`/v1/bazaar/product`, `/v1/auctions/page`, `/v1/auctions/lookup`, `/v1/auctions/ended`, `/v1/resources`, `/v1/feed`) return a `truncated` flag when size caps trimmed order books, bids, NBT, or records. Ended-auction summary rows carry a per-row `decode_status`; `decode_budget_exhausted` means the row went undecoded this call, not that the auction had no item.
- Collection tier truth is `claimed_tier`, parsed from `member.player_data.unlocked_coll_tiers` (tier = segment after the last colon). `coop_total_amount`/`coop_achieved_tier` reflect profile-wide progress; `amount`/`member_amount`/`achieved_tier` cover only the queried member and understate co-op profiles. `coop_totals_complete: false` means some members hid collections, so co-op totals are partial.
- `/v1/guild`: `guild: null` with `data_present: false` is a real guildless answer, not an error. `/v1/network` `kind=status`: `data_present: false` means the session is unavailable — offline and privacy-hidden are indistinguishable, so "offline" is never stated as fact. `kind=player` `achievement_skill_levels` are levels (not XP) derived from SkyBlock achievements, the fallback when profile skill XP is hidden; a null skill is unknown, never zero.

## Profile and inventory behavior

When no profile selector is supplied, the Worker selects Hypixel's selected profile and otherwise the most recently saved suitable profile. A selector may be a cute name or profile ID. The GPT should not demand a profile ID when an IGN is sufficient.

Inventory access is deliberately two-stage:

1. Request the inventory index.
2. Follow only relevant containers with pagination.
3. Request expanded item detail only when NBT/lore/modifiers are required.

This avoids connector resource limits. Never replace it with a route that dumps the full profile or every decoded item in one response.

Hypixel stores the armor Wardrobe and the Equipment Wardrobe under `member.loadout` as one NBT blob per piece. The Worker aggregates them into the synthetic containers `loadout.armor` (kind `wardrobe`) and `loadout.equipment` (kind `equipment_wardrobe`), with item slot `set * 4 + piece offset`. When a legacy `wardrobe_contents` blob is present, it wins and the duplicate `loadout.armor` container is suppressed. The index also returns a `loadout` metadata object (equipped set numbers, saved loadout configs); `null` means Hypixel exposed none.

Container discovery uses an explicit allowlist of known roots (`member.inventory`, the legacy top-level keys, `member.shared_inventory`, and `member.rift.inventory` with a `rift_` id prefix) instead of a substring scan. Container ids are stable contract values. Magical Power is computed in the Worker from SkyCrypt-transcribed tables (`src/accessories.js`): only the highest tier per accessory upgrade family counts, recombobulation bumps rarity one step, Hegemony Artifact counts double, Abicase adds `floor(active Abiphone contacts / 2)`, and a consumed Rift Prism adds 11. Hypixel exposes no current-MP field, so `computed_magical_power: null` (bag or item catalog unavailable) means unknown, never zero.

## Market behavior

Hypixel is the live source for Bazaar and the verification source for active auctions. SkyCofl is the historical/comparable source. Do not silently mix:

- Bazaar instant-buy versus instant-sell.
- Bazaar buy-order versus sell-offer series.
- AH average versus median versus lowest BIN.
- Different history windows.
- Items with incompatible NBT/modifiers.
- Bazaar products and AH-only items.

Money-making and purchase recommendations must state timestamp, source, assumptions, fees when known, liquidity evidence, and whether the scan is complete.

## Product behavior stored outside code

`gpt/instructions.md` is production configuration, not ordinary documentation. It must remain below 8,000 characters and tells the model how to call Actions, interpret availability, verify wiki facts, use images, calculate values, and speak.

`gpt/config.md` contains the public listing and authentication map. Durable requirements include:

- Description ends with `Made by GS`.
- Creator contact is Discord `gs._`.
- Code Interpreter & Data Analysis remains enabled for optimization, statistics, and charts.
- Web Search remains enabled for exact wiki pages and matched images.
- Conversation starters should be niche, specific, and math-heavy enough to stress the Actions.

## Versioning

Two versions currently exist for different purposes:

- `package.json` version: repository/release ZIP version.
- Worker `UPSTREAM_USER_AGENT` and `/health` version: deployed gateway/API behavior version.

When the Worker contract or meaningful behavior changes, update the Worker version strings together. When cutting a repository release, update `package.json` and tag `v<version>`. Do not assume the two version numbers are interchangeable.

## Automation and manual boundaries

Automated:

- OpenAPI/ChatGPT-limit validation.
- Mocked Worker integration tests.
- Wrangler dry-run in CI.
- Worker deployment from relevant changes on `main`.
- Clean ZIP creation on `v*` tags.

Manual:

- Pasting changed `gpt/instructions.md` into the GPT Builder.
- Replacing a changed Action schema in its existing Action set.
- Rechecking Action authentication and Preview behavior.
- Clicking **Update** in the GPT Builder.

OpenAI does not provide a supported public Custom GPT configuration API used by this project. Do not add Playwright/session-cookie automation for the builder.

## Known failure modes

- `ResponseTooLargeError`/resource-limit: endpoint returned too much; add filtering/pagination or narrow the request.
- Action unavailable in a chat: platform/plan/model availability, not automatically a Worker bug and not a mobile-only issue.
- Duplicate Action domain: a second Action set uses the Worker domain; update the existing set instead.
- Missing HotM/HotF/bank/sacks: inspect actual returned paths and availability flags before blaming user API settings.
- `ClientResponseError`: surface the normalized upstream/connector error and test the narrow endpoint; do not fabricate fallback data.
- `429`: stop repeated calls and respect upstream rate limits.
- SkyCofl blocked from Worker: keep SkyCofl direct; do not proxy it through Cloudflare merely to evade provider controls.

## Definition of done

The implementation, OpenAPI contract, tests, GPT instructions/config, and these docs must describe the same behavior. Verification must pass, secrets must stay out of Git, responses must stay bounded, live/partial/unknown values must be labeled correctly, and the owner must receive any required manual GPT sync steps.
