# Market playbook

Procedure for Bazaar, auction, and history questions. Never guess an operation name or substitute a data source.

## Live Bazaar

- Use `searchCompactSkyBlockBazaarProducts`, then `getCompactSkyBlockBazaarProduct` for exact orders.
- An ambiguous product name returns 400 with `candidates`; retry with one exact `product_id` from that list.
- Hypixel controls live Bazaar values.

## Bazaar rankings

`searchCompactSkyBlockBazaarProducts` ranks the whole snapshot server-side. Never crawl pages and sort manually; map the metric to `sort` plus `order`:

- flip margin: `sort=spread_percent&order=desc` (absolute coin margin: `sort=spread`).
- demand or supply volume: `sort=buy_volume` or `sort=sell_volume` with `order=desc`.
- weekly traffic: `sort=moving_week&order=desc`.
- price extremes: `sort=instant_buy` or `sort=instant_sell` with the needed `order`.

## Auction house value

- For AH value call `getCoflLowestBinAuctions` with the exact item ID. Use its first comparable cheapest-first listing as LBin.
- Use Worker `getLowestBinSkyBlockAuctions` only for explicit Hypixel verification, at most 4 pages per call.
- Use `browseCompactSkyBlockAuctionPage`, `lookupCompactSkyBlockAuctions` (raw UUIDs only), or `getCompactSkyBlockEndedAuctions` for other AH questions.

## Auction page browsing

`browseCompactSkyBlockAuctionPage` has two independent page parameters:

- `upstream_page` selects the official Hypixel AH page. The filters (`query`, `category`, `tier`, `bin`) apply only within that one upstream page.
- `result_page` pages through the filtered matches of that upstream page. Advancing `result_page` alone never scans more of the AH — increment `upstream_page` to scan further pages.
- Default order is upstream source order; `bin=true` switches the default to price ascending. `sort=ending`, `price_asc`, or `price_desc` override it.
- `page_lowest_bin` is scoped to that one filtered upstream page; never call it a global lowest BIN.

## Lowest-BIN segment walk

`getLowestBinSkyBlockAuctions` scans one segment of pages per call; a full scan is a walk across segments.

- Start at `start_page=0`. Keep `max_pages` identical on every call in the walk — the returned `segments_required`/`segment_index` are only coherent under a fixed tile size.
- Take `expected_last_updated` from the first response's `scan.snapshot_last_updated` and pass it on every following call, to reject a mixed snapshot.
- Continue by calling again with `start_page` set to the returned `next_start_page`. Keep the lowest `segment_lowest_bin` seen across every segment. The walk is done once `next_start_page` is null.
- `authoritative_lowest_bin` is a real global lowest BIN only when a segment's own scan is complete and consistent; it is null on every incomplete segment. Never call a `segment_lowest_bin` from an incomplete walk the global lowest BIN.
- A 409 means the AH snapshot changed mid-walk — restart at `start_page=0`. A 5xx means reduce `max_pages` and resume from the last `next_start_page`.
- `match_count_in_segment` is a lower bound (`match_count_is_lower_bound: true`): it stops counting once it has enough cheap confirmed matches. Never present it as an exact listing count. `name_prefilter_candidates` is the exact pre-decode population.

## History

- Resolve the exact item ID, then call SkyCofl. SkyCofl supplies current AH listings and history.
- Bazaar history for Bazaar items. Item-price history for AH items.
- Match the window and compare equivalent oldest and newest fields.

## SkyCofl operations

Pick the smallest window that answers the question; use the custom range only when the fixed windows do not fit.

- `getCoflBazaarSnapshot`: current Bazaar prices and order book for one exact item ID (optional ISO timestamp).
- `getCoflBazaarHistoryHour` / `getCoflBazaarHistoryDay` / `getCoflBazaarHistoryWeek`: fixed Bazaar windows — hour for intraday moves, day for short trend, week for weekly trend.
- `getCoflBazaarHistoryRange`: Bazaar history between ISO `start` and `end`, at most 31 days per call.
- `getCoflCurrentItemPrice`: SkyCofl's current price and availability for an exact AH or Bazaar item ID.
- `getCoflAuctionPriceHistoryDay` / `getCoflAuctionPriceHistoryWeek` / `getCoflAuctionPriceHistoryMonth`: AH item price history for one day, week, or month.
- `getCoflItemPriceAnalysis`: sales volume, typical prices, sell time, and volatility over `days` (default 7; long periods may need a paid SkyCofl tier).
- `getCoflLowestBinAuctions`: up to ten lowest active BINs, cheapest first — the normal current-LBin source.
- `getCoflSoldAuctions`: recently sold auctions; keep `pageSize` near 20 and never above 50.
- `getCoflAuctionDetails`: full details for one exact auction UUID.

## Rankings

- Call sequentially and avoid repeats.
