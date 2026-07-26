# API playbook

Which Worker operation to call per domain, and how to paginate. Follow this exactly. Never guess an operation name or parameter.

## Worker operations

- `getCompactSkyBlockProfiles`: list a player's profiles or resolve a requested profile name.
- `getCompactSkyBlockProfileSummary`: identity, SkyBlock level, currencies (bank, purse, essence, motes), skills, slayers, dungeons summary. Essence and motes balances exist only here and in `section=overview`.
- `getCompactSkyBlockProfileSection`: one profile section. `section` must be one of: overview, skills, slayers, dungeons, collections, mining, forge, foraging, stats, gear, pets, accessories, bestiary, rift, crimson_isle, farming, minions, trophy_fish, chocolate_factory, hunting, effects.
- `getTypedSkyBlockPlayerCollections`: typed collection progress (below).
- `getTypedSkyBlockBestiary`: computed Bestiary tiers and milestone (below).
- `getTypedSkyBlockAccessories`: typed Accessory Bag (below).
- `getCompactSkyBlockInventoryIndex`: discover which item containers exist; always call it before reading any container.
- `getCompactSkyBlockInventoryContainer`: page one container's items from the index.
- `getCompactSkyBlockInventoryItem`: full parsed data for one known container and slot.
- `getCompactSkyBlockSacks`: sack quantities (below).
- `getCompactSkyBlockPlayerExtra`: Museum, Garden, or a player's Bingo history via `kind=`.
- `getCompactSkyBlockResource`: official Items, Collections, Skills, Election, or current Bingo resources. Every kind is searchable and pageable: election pages candidates (plus `mayor`), bingo pages goals.
- `getCompactSkyBlockFeed`: `kind=news` for official SkyBlock news, `kind=firesales` for active and upcoming Fire Sales. Searchable and pageable; Fire Sale rows include a joined `item_name`. Every Fire Sale question uses this operation, never memory.
- `browseCompactSkyBlockAuctionPage`: filter and sort one official AH page (dual pagination — see `market-playbook.md`).
- `lookupCompactSkyBlockAuctions`: auctions by exactly one auction, player, or profile UUID. It accepts raw UUIDs only — resolve a username with `lookupMinecraftProfileByName` first.
- `getCompactSkyBlockEndedAuctions`: auctions sold in Hypixel's recent-ended window (about the last 60 seconds). Summary rows name the sold item (`item_id`, `item_name`, per-row `decode_status`); `query` matches auction, seller, or buyer UUID.
- `searchCompactSkyBlockBazaarProducts`, `getCompactSkyBlockBazaarProduct`, `getLowestBinSkyBlockAuctions`: market procedure in `market-playbook.md`.
- `getCompactHypixelGuild`: guild lookup by exactly one of `player` (UUID), `name`, or `id` (below).
- `getCompactHypixelNetworkPlayer`: network-level account identity, online status, or SKYBLOCK player counts via `kind=` — including the achievement skill fallback (below).

## Detail levels

- Operations with a `detail` parameter default to `summary`: compact records at the normal page size. `detail=full` adds lore, enchantments, attributes, ExtraAttributes, and parsed NBT, but caps the page at 5 items (10 for resources).
- For one specific item's full NBT, do not page a container at `detail=full`: take the slot from the summary listing and call `getCompactSkyBlockInventoryItem` for that exact container and slot.

## Truncated payloads

Several sections cap by size and flag it. Treat `true` as partial data, not the full record:

- Rift section: `payload_truncated`.
- `stats`: `lifetime_counters_truncated` on the lifetime counters map.
- `garden`: `garden_truncated`.
- Museum items: each entry's `decoded_items_truncated` (a multi-item donation exceeded the per-entry cap).
- Any decoded item (gear, inventories, accessories, museum, auctions): `attributes_truncated` / `enchantments_truncated` when it carries more than the capped list.
- Full item detail: `contained_bags_truncated` and each `contained_items[].items_truncated` (nested bag decode caps).
- Bazaar product, auction page/lookup/ended, resources, and feed: `truncated` on `data` when order books, bids, NBT, or records were size-capped.
- Ended-auction summary rows past the per-call decode budget: `decode_status=decode_budget_exhausted` with null `item_id`/`item_name` — undecoded, not itemless.

## Slayer and dungeon levels

- `section=slayers` and `section=dungeons` return derived levels from static tables, not from any Hypixel resource — Hypixel publishes XP thresholds for skills only via its `skills` resource. Each item's `level` object (`available`, `level`, `level_with_progress`, `xp_into_level`, `xp_for_next_level`, `progress_to_next_level`) carries a `ladder` pointer into the section's single `level_provenance.ladders` map.
- Every ladder is `source_authority: wiki` and carries a `source_url` in `level_provenance.ladders[ladder]` — derived levels come from static tables, not a Hypixel endpoint. Verify against that `source_url` when a level is load-bearing (dungeon-class player levels are sourced from `wiki.hypixel.net`, since the pinned wiki publishes no class-leveling page; every other ladder is from the pinned wiki).
- `dungeons` splits `dungeon_types` (only Catacombs has a sourced ladder; other dungeon types report level unavailable) from `player_classes` (all five classes share the `dungeon_class` ladder). Master Mode floors live under `dungeon_types.master_catacombs`; it shares regular Catacombs XP, so it derives no level of its own.
- `level.available: false` means the level could not be derived (no XP exposed, or no matching ladder); never report it as level 0.
- Past 50, `level` stays capped; `level_with_overflow`/`overflow_xp` report the flat 200m-XP cosmetic continuation for Catacombs and class levels. Report the overflow level as cosmetic, never as a raised cap.
- `section=dungeons` also returns lifetime `secrets`, `daily_runs`, `last_dungeon_run` (Unix ms), per-floor class damage records and `watcher_kills`, and `best_run_per_floor`: the single best recorded run per floor by total score, with `runs_recorded` counting what Hypixel kept. `best_runs_available: false` means Hypixel exposed none. The summary/overview dungeons embed omits floor detail — call the section for it.
- `section=slayers` also returns `active_quest` (current slayer quest: type, tier, start, `combat_xp`, capped `recent_mob_kills`); `available: false` means Hypixel exposed no quest object, not "no quest".

## Pets

- `section=pets` returns an object, not a list: `available`, `total_pets`, `returned`, `truncated`, `truncation_reason`, `level_provenance`, `pets`, `reason`. It is budgeted by response size, so a large collection truncates.
- `total_pets` is always the player's true pet count; `returned` is only how many pets came back this call. Never report `returned` as the total.
- When `truncated` is true, say the pet list is partial and name why (`truncation_reason`: `response_size_budget` or `pet_count_cap`).
- Pet levels use the same `level`/`level_provenance` shape as slayers and dungeons, keyed by rarity ladder (or `golden_dragon` for that pet).

## Domain sections

- Kuudra completions/waves, Dojo points and ranks, faction reputation, Abiphone, Matriarch pearls, Crimson quests: `section=crimson_isle`. Envelope `data_present=false` means Hypixel exposed no Crimson Isle object; with it present, an absent Kuudra tier is a real zero but an unreached `highest_wave` stays null.
- Jacob's medals, contest perks, per-crop personal bests, unique brackets, Trapper pelts, Garden copper/larvas: `section=farming`. Only the 25 most recent contests return; `total_contests` and `claimed_medal_counts` cover the full history — never call the returned page complete when `contests_truncated` is true. Medal counts use only Hypixel's `claimed_medal`; unclaimed contests are never guessed a medal.
- Crafted minions, unique-craft count, bonus-slot progress, community upgrades: `section=minions`. Crafted data unions every co-op member; `slots_from_unique_crafts` comes from a static wiki-sourced table, and community-shop minion slots are a separate tier — report them separately, never as one invented total.
- Trophy fish per-tier counts, net reward stages, last catch: `section=trophy_fish`. All 18 fish return as typed records; with data present, zero counts are real zeros.
- Chocolate, prestige, barn, employees, Time Tower, rabbits: `section=chocolate_factory`. The rabbit list is summarized: trust `unique_rabbits`/`total_rabbits_found` for totals, and treat `top_rabbits` as a sample when `rabbits_truncated` is true.
- Attribute shards, shard traps and fusions, attribute stacks, temples: `section=hunting`. Hunting-update foraging quests (fish family, Hina, tree gifts, songs) live in `section=foraging` under `quests`.
- Dragon fights, Mythological Ritual, race times, AH lifetime totals, gifts, Winter event, candy, pet milestones: `section=stats` dedicated buckets (`dragons`, `mythos`, `races`, `auctions`, `gifts`, `winter`, `candy_collected`, `pets_milestones`), each with its own `available` flag. Prefer them over grepping `lifetime_counters`, which can truncate. Race times are milliseconds.
- Deaths, last death, fishing treasure, Reaper Peppers, visited zones/modes, essence-shop perks, soulflow, favorite arrow, teleporter pill: `section=stats` under `player_misc`. `last_death` ships raw; `last_death_iso` is only set when the raw value is unambiguously Unix ms.
- Potion effects and buffs: `section=effects` returns capped `active_effects`, `paused_effects`, `disabled_potion_effects`, and `temp_stat_buffs` lists plus `booster_cookie_active` and `god_potion_effect_present` (derived only from exposed effect names; null means unknown, not "no"). A null list `count` is unavailable; a present empty list is real. `section=overview` embeds the counts-only `effects` summary.

## Bestiary

- Bestiary questions use `getTypedSkyBlockBestiary`: per-family `kills`, computed `tier`/`max_tier`, `next_tier_kills`, plus overall `milestone` and `bestiary_level` (milestone / 10). `query` searches family and island names server-side; paginate `data.families`.
- Tiers come from a static bracket table transcribed from SkyCrypt, not a Hypixel endpoint. A family with `in_bracket_table: false` reports raw kills with `tier: null` — say the tier is unavailable, never estimate it.
- `section=bestiary` returns only the milestone rollup and per-island category summary; call the typed operation for family detail.

## Reviews

- Mining review: call summary, `mining`, `stats`, `gear`, and the inventory index. `mining` carries HotM.
- Foraging review: call `foraging` for HotF perks, selected ability, tokens, Forest Whispers, and progression.
- Forge: call `forge`. If `needs_wiki_duration` is set, verify the exact duration on the item's wiki page and calculate the finish time from it.
- Worn gear: `gear`.
- Use `stats` for calculated skills and lifetime counters, not a live Stats-menu snapshot. Effective totals depend on gear, pets, perks, buffs, and location.
- A lone `received_free_tier` is incomplete.

## Accessories

- Accessory questions must use `getTypedSkyBlockAccessories` and paginate `data.accessories`.
- `query` searches accessory item IDs and display names server-side; use it instead of paging the whole bag for one accessory.
- Never substitute the generic `accessories` section.
- Magical Power comes from `computed_magical_power` (SkyCrypt rules: only the highest tier per accessory family counts — `duplicates_ignored` shows what was skipped; recombobulation bumps rarity; Hegemony counts double inside the accessory sum; `components` adds the Abicase and consumed Rift Prism bonuses). `null` means the bag or item catalog was unavailable — never estimate MP. Ids in `unknown_tier_ids` contributed 0 MP; call their MP unverified. `reported_magical_power` mirrors raw bag settings and is normally null; `highest_magical_power` is a lifetime peak, not current MP.

## Collections

- Collection and craftability audits use `getTypedSkyBlockPlayerCollections` with `include_unlocks=true`.
- `query` searches collection ID, display name, or category server-side; use it for single-collection questions.
- Collection progress is co-op-shared. Per entry, `claimed_tier` (from the game's unlocked-tier list) is the tier truth; `coop_total_amount`/`coop_achieved_tier` reflect profile-wide progress; `member_amount` (= `amount`) and `achieved_tier` cover only the queried member's own contribution and understate co-op profiles. When `coop_totals_complete` is false, some members hid collections, so co-op totals are partial.
- Compare the claimed tier to the Collections resource and the exact item wiki. Count alone does not prove usability.

## Inventories and sacks

- For items, call the inventory index, then its paginated container. Request full item detail only for needed NBT or lore.
- Paginate only as needed.
- Rift items live in dedicated `rift_*` containers in the index; the `rift` section truncates its raw blobs, so never read items from it. Shared Carnival masks appear as a `carnival_masks` container.
- Summary items carry `enchantment_levels`/`attribute_levels` maps — use them for level questions instead of full detail.
- The index's `loadout` object reports the equipped wardrobe/equipment set and saved loadout configs (name, armor set, power stone, pet, tuning slot); `null` means Hypixel exposed none.
- Full item detail decodes nested backpack/cake-bag contents into `contained_items` (bounded; check `items_truncated`).
- Sack quantities: `getCompactSkyBlockSacks`. Owning a Sack item does not reveal its contents. Missing `sacks_counts` is unavailable, not zero.
- Sacks support server-side `query` search plus `sort` (`quantity`, `item_id`, or `name`) with `order=asc|desc`; default is quantity descending.
- Call Inventory API disabled only when no container was exposed. Decode errors are a different case.

## Guild and network

- Guild questions use `getCompactHypixelGuild` with exactly one of `player` (a resolved UUID), `name`, or `id`. `data.guild.level` is computed from guild exp via the SkyCrypt-transcribed curve; `skyblock_guild_exp` is the guild's SkyBlock-earned exp. `queried_player` (rank, joined, quest participation, `weekly_exp` = summed 7-day expHistory) fills only for `player` lookups. Paginate `data.members` (same row shape; a null `weekly_exp` is unknown, not zero). `data_present=false` with `guild: null` is a real "no guild" answer, not an error.
- `getCompactHypixelNetworkPlayer` `kind=player` reads the network account, not a SkyBlock profile: displayname, normalized rank (`rank` display tag, `rank_key`, `derived_from`), `social_media_links` and `discord`, `first_login`/`last_login` (Unix ms; a null `last_login` is privacy-hidden, never "never logged in"), `skyblock_*` achievements, and claim flags.
- Skill fallback: when profile skill XP is unavailable (skills API off), use `achievement_skill_levels` from `kind=player` — skill LEVELS, not XP, derived from skyblock achievements (harvester=farming, excavator=mining, combat, gatherer=foraging, angler=fishing, augmentation=enchanting, concoctor=alchemy, domesticator=taming). A null skill is unknown, never zero. Label these achievement-derived; they can lag real levels and carry no XP progress.
- `kind=status`: `data_present=true` only for a visible session (`online`, `game_type`, `mode`, `map`). `data_present=false` means the status is unavailable — offline and privacy-hidden are indistinguishable, so never state the player is offline as fact.
- `kind=counts`: current network total plus SKYBLOCK per-mode player counts; needs no uuid.

## Official resources

- `getCompactSkyBlockResource` for official Items, Collections, Skills, Election, or current Bingo data. Search first; request full detail only for exact matches.
- `getCompactSkyBlockPlayerExtra` for Museum, Garden, or a player's Bingo history. Museum results are paginated and support server-side `query` item search; search first instead of paging every entry.
- Museum entries carry `borrowing` (true = loaned, not owned) and `featured_slot`. `detail=full` expands each entry's decoded items but caps the page at 5 entries and 4 items per entry; the upstream `value` per member is Hypixel's own figure — never compute museum prices.
