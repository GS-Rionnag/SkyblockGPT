# Custom GPT configuration

## Name

SkyBlockGPT

## Description

An unofficial Hypixel SkyBlock assistant that checks live profiles, HotM/HotF, skills, gear, accessories, inventories, NBT, Bazaar, auctions, and market history—then does the math and gives sourced progression advice. Not affiliated with or endorsed by Hypixel. Made by GS

## Conversation starters

GPT Builder silently truncates each conversation starter at 300 characters. Keep every starter at or below 300; nothing enforces this automatically.

1. Ask me which item I want, then walk the auction house to an authoritative lowest BIN: loop every segment from next_start_page, restart at page 0 on a 409 snapshot change, and report whether authoritative_lowest_bin is real or still null. Then price the Bazaar craft against it with median stats.
2. Ask for my IGN and profile, then derive every level Hypixel ships only as raw XP: all six slayers (vampire caps at 5, the rest at 9), Catacombs, and each dungeon class. Show XP, derived level, XP to next, and each ladder source_url, then rank which grind buys the most levels per million XP.
3. Ask for my IGN, then pull my pets. Reconcile total_pets against returned and explain any truncation before concluding. Derive each pet level from its own rarity ladder, Golden Dragon on its own curve, then rank my ten most valuable pets by XP remaining to max and Bazaar cost to finish.
4. Ask for my IGN, then pull my typed bestiary families. Report my milestone and Bestiary level, then rank the ten families closest to their next tier by kills still needed, treating tier: null as unknown rather than guessed, and tell me which grind is actually worth my time.

## Capabilities

- Web Search: on, for the official Hypixel SkyBlock Wiki and correctly matched images.
- Code Interpreter & Data Analysis: on, for optimization, statistics, and charts.
- Image Generation: optional; never substitute generated art for factual wiki images.

## Actions

1. `actions/minecraft-username.openapi.json`
   - Authentication: None
   - Privacy policy: `https://privacy.microsoft.com/en-us/privacystatement`
2. `actions/hypixel-worker.openapi.json`
   - Authentication: API key
   - Header: `X-GPT-Key`
   - Value: the same private value stored as the Worker's `GPT_SHARED_SECRET`
   - Privacy policy: `https://skyblock-gpt-proxy.girishsonic8.workers.dev/privacy`
3. `actions/skycofl.openapi.json`
   - Authentication: API key using Bearer authentication
   - Value: the raw SkyCofl account token, without `Bearer` or quotes
   - Privacy policy: `https://coflnet.com/privacy`

## Knowledge

Upload every file in `gpt/knowledge/` to the GPT's Knowledge section:

- `api-playbook.md`
- `calculations.md`
- `market-playbook.md`

The instructions name these files and tell the GPT to open the matching one before acting. Renaming a file without updating the instructions breaks retrieval; `npm test` fails if the two disagree.

Conversations can reveal Knowledge file contents to users. These files hold only public behavior rules, and no credential may ever be placed in them.

## Sync steps

Paste `gpt/instructions.md` into the GPT's Instructions field, and replace any changed Knowledge upload with its current copy. A stale Knowledge file produces no error—the GPT just follows outdated procedure. Never put credentials in this repository.

