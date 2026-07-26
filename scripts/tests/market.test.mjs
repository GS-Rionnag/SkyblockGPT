import assert from "node:assert/strict";
import { auction, call, installMockFetch, itemNbt, playerUuid, profileId } from "./_fixtures.mjs";
import { resetCaches } from "../../src/hypixel.js";

export async function run() {
  installMockFetch();
  resetCaches();

  const bazaarSearch = await (await call("/v1/bazaar/products?query=booster")).json();
  assert.equal(bazaarSearch.payload_kind, "bazaar_product_index");
  assert.equal(bazaarSearch.data.items[0].product_id, "BOOSTER_COOKIE");

  const bazaarProduct = await (await call("/v1/bazaar/product?product=BOOSTER_COOKIE")).json();
  assert.equal(bazaarProduct.payload_kind, "bazaar_product");
  assert.equal(bazaarProduct.data.sell_summary[0].pricePerUnit, 100);
  assert.equal(bazaarProduct.data.truncated, false, "an uncut product must not claim truncation");

  const lowest = await (await call("/v1/auctions/lowest-bin?item=RED_ROSE%3A3")).json();
  assert.equal(lowest.data.scan.complete, true);
  assert.equal(lowest.data.authoritative_lowest_bin.bin_price, 50);
  assert.deepEqual(lowest.data.auctions.map((entry) => entry.bin_price), [50, 75, 100]);

  const page = await (await call("/v1/auctions/page?upstream_page=0&bin=true&sort=price_desc")).json();
  assert.deepEqual(page.data.items.map((entry) => entry.current_price), [100, 75]);
  assert.equal(page.data.truncated, false);

  // Ended-auction summary rows: identity-only decode names the sold item.
  const ended = await (await call("/v1/auctions/ended")).json();
  assert.equal(ended.data.items[0].item_id, "RED_ROSE:3", "summary rows must expose the decoded SkyBlock item ID");
  assert.equal(ended.data.items[0].item_name, "Azure Bluet");
  assert.equal(ended.data.items[0].decode_status, "decoded");
  assert.equal(ended.data.decode_budget, 40);
  assert.equal(ended.data.decodes_performed, 1);
  assert.equal(ended.data.decode_budget_exhausted, false);
  assert.equal(ended.data.truncated, false);

  // Full detail keeps the complete decoded item instead of identity fields.
  const endedFull = await (await call("/v1/auctions/ended?detail=full")).json();
  assert.equal(endedFull.data.items[0].decoded_item.skyblock_id, "RED_ROSE:3");
  assert.equal(endedFull.data.items[0].decode_status, undefined, "full rows carry decoded_item, not summary identity fields");

  // The ended-auction query now matches the buyer UUID too.
  const byBuyer = await (await call("/v1/auctions/ended?query=ffffffffffffffffffffffffffffffff")).json();
  assert.equal(byBuyer.data.total_items, 1, "buyer UUIDs must be searchable");
  const noQueryMatch = await (await call("/v1/auctions/ended?query=cccccccccccccccccccccccccccccccc")).json();
  assert.equal(noQueryMatch.data.total_items, 0);

  // A row without item_bytes is unavailable, not zero and not a failed decode.
  installMockFetch({
    "/v2/skyblock/auctions_ended": () => Response.json({
      success: true,
      lastUpdated: 456,
      auctions: [{ auction_id: "no-bytes", seller: playerUuid, timestamp: 1, price: 5, bin: true }],
    }),
  });
  const noBytes = await (await call("/v1/auctions/ended")).json();
  assert.equal(noBytes.data.items[0].decode_status, "no_item_bytes");
  assert.equal(noBytes.data.items[0].item_id, null);
  assert.equal(noBytes.data.items[0].item_name, null);
  assert.equal(noBytes.data.decodes_performed, 0, "a missing blob must not consume decode budget");

  // Budget exhaustion: a max-size page decodes its first 40 rows, then marks
  // the tail decode_budget_exhausted instead of silently dropping identity.
  installMockFetch({
    "/v2/skyblock/auctions_ended": () => Response.json({
      success: true,
      lastUpdated: 456,
      auctions: Array.from({ length: 45 }, (_, index) => ({
        auction_id: `ended-${index}`,
        seller: playerUuid,
        buyer: "ffffffffffffffffffffffffffffffff",
        timestamp: 1_700_000_000_000 + index,
        price: 100 + index,
        bin: true,
        item_bytes: itemNbt,
      })),
    }),
  });
  const exhausted = await (await call("/v1/auctions/ended?limit=50")).json();
  assert.equal(exhausted.data.items.length, 45);
  assert.equal(exhausted.data.decodes_performed, 40);
  assert.equal(exhausted.data.decode_budget_exhausted, true);
  assert.equal(exhausted.data.items[39].decode_status, "decoded");
  assert.equal(exhausted.data.items[40].decode_status, "decode_budget_exhausted");
  assert.equal(exhausted.data.items[40].item_id, null, "an undecoded row must stay unavailable, never guessed");
  assert.equal(exhausted.data.items[40].item_name, null);

  // Auction lookup reports the upstream snapshot timestamp; the fixture omits
  // it, so it must surface as null (unavailable), never zero.
  installMockFetch();
  const lookup = await (await call(`/v1/auctions/lookup?player=${playerUuid}`)).json();
  assert.ok("source_last_updated" in lookup.data);
  assert.equal(lookup.data.source_last_updated, null);
  assert.equal(lookup.data.truncated, false);

  // A full-detail auction with an over-cap bid list flags data.truncated.
  installMockFetch({
    "/v2/skyblock/auction": () => Response.json({
      success: true,
      auctions: [{
        ...auction("lookup-trunc", 999),
        bids: Array.from({ length: 151 }, (_, index) => ({ bidder: playerUuid, amount: index })),
      }],
    }),
  });
  const truncatedLookup = await (await call(`/v1/auctions/lookup?uuid=${"b".repeat(32)}`)).json();
  assert.equal(truncatedLookup.data.truncated, true, "a cut bid list must surface the truncated flag");
  assert.equal(truncatedLookup.data.items[0].bids.length, 150);

  // Ambiguous Bazaar display name: 400 with exact-ID candidates, not a 404.
  resetCaches();
  installMockFetch({
    "/v2/resources/skyblock/items": () => Response.json({
      success: true,
      lastUpdated: 123,
      items: [
        { id: "TWIN_A", name: "Twin Item" },
        { id: "TWIN_B", name: "Twin Item" },
      ],
    }),
    "/v2/skyblock/bazaar": () => Response.json({
      success: true,
      lastUpdated: 456,
      products: {
        TWIN_A: { product_id: "TWIN_A", sell_summary: [], buy_summary: [], quick_status: {} },
        TWIN_B: { product_id: "TWIN_B", sell_summary: [], buy_summary: [], quick_status: {} },
      },
    }),
  });
  const ambiguousResponse = await call("/v1/bazaar/product?product=Twin_Item");
  assert.equal(ambiguousResponse.status, 400);
  const ambiguous = await ambiguousResponse.json();
  assert.equal(ambiguous.success, false);
  assert.deepEqual(ambiguous.candidates, [
    { product_id: "TWIN_A", display_name: "Twin Item" },
    { product_id: "TWIN_B", display_name: "Twin Item" },
  ]);

  // An over-cap order book flags data.truncated on the product route.
  resetCaches();
  installMockFetch({
    "/v2/skyblock/bazaar": () => Response.json({
      success: true,
      lastUpdated: 456,
      products: {
        BOOSTER_COOKIE: {
          product_id: "BOOSTER_COOKIE",
          sell_summary: Array.from({ length: 201 }, (_, index) => ({ amount: 1, pricePerUnit: index, orders: 1 })),
          buy_summary: [],
          quick_status: { productId: "BOOSTER_COOKIE" },
        },
      },
    }),
  });
  const truncatedProduct = await (await call("/v1/bazaar/product?product=BOOSTER_COOKIE")).json();
  assert.equal(truncatedProduct.data.truncated, true);
  assert.equal(truncatedProduct.data.sell_summary.length, 200);

  // Fire Sales: pagination, query, and item_id -> display-name join.
  resetCaches();
  installMockFetch({
    "/v2/skyblock/firesales": () => Response.json({
      success: true,
      lastUpdated: 789,
      sales: [
        { item_id: "BOOSTER_COOKIE", start: 1, end: 2, amount: 3, price: 4 },
        { item_id: "DYE_UNKNOWN", start: 5, end: 6, amount: 7, price: 8 },
      ],
    }),
  });
  const firesales = await (await call("/v1/feed?kind=firesales")).json();
  assert.equal(firesales.data.source_last_updated, 789);
  assert.equal(firesales.data.total_items, 2);
  assert.equal(firesales.data.sales[0].item_name, "Booster Cookie", "known item IDs must join a display name");
  assert.equal(firesales.data.sales[1].item_name, null, "unknown item IDs stay null, never guessed");
  assert.equal(firesales.data.truncated, false);

  const firesalePage = await (await call("/v1/feed?kind=firesales&limit=1&page=1")).json();
  assert.equal(firesalePage.data.page, 1);
  assert.equal(firesalePage.data.sales.length, 1);
  assert.equal(firesalePage.data.sales[0].item_id, "DYE_UNKNOWN");
  assert.equal(firesalePage.data.has_more, false);

  const firesaleByName = await (await call("/v1/feed?kind=firesales&query=booster")).json();
  assert.equal(firesaleByName.data.total_items, 1, "the query must match the joined display name");
  assert.equal(firesaleByName.data.sales[0].item_id, "BOOSTER_COOKIE");

  // News keeps its items field and gains query support; the fixture has no
  // lastUpdated, so source_last_updated must be null, not zero.
  const news = await (await call("/v1/feed?kind=news&query=update")).json();
  assert.equal(news.data.total_items, 1);
  assert.equal(news.data.items[0].title, "Update");
  assert.equal(news.data.source_last_updated, null);
  const newsMiss = await (await call("/v1/feed?kind=news&query=zzzzzz")).json();
  assert.equal(newsMiss.data.total_items, 0);
  assert.deepEqual(newsMiss.data.items, []);

  const badFeedLimit = await call("/v1/feed?kind=news&limit=0");
  assert.equal(badFeedLimit.status, 400);

  // Election resource: candidates are pageable records, filtered by query.
  resetCaches();
  installMockFetch({
    "/v2/resources/skyblock/election": () => Response.json({
      success: true,
      lastUpdated: 123,
      mayor: {
        key: "diana",
        name: "Diana",
        election: {
          year: 99,
          candidates: [
            { key: "diana", name: "Diana", perks: [{ name: "Mythological Ritual" }], votes: 4000 },
            { key: "paul", name: "Paul", votes: 100 },
          ],
        },
      },
      current: {
        year: 100,
        candidates: [
          { key: "aatrox", name: "Aatrox", votes: 10 },
          { key: "cole", name: "Cole", votes: 20 },
        ],
      },
    }),
  });
  const election = await (await call("/v1/resources?kind=election")).json();
  assert.equal(election.data.total_items, 4, "concluded and current candidates must both be records");
  assert.equal(election.data.mayor.name, "Diana");
  assert.equal(election.data.current_election_year, 100);

  const electionQuery = await (await call("/v1/resources?kind=election&query=aatrox")).json();
  assert.equal(electionQuery.data.total_items, 1);
  assert.equal(electionQuery.data.items[0].key, "aatrox");
  assert.equal(electionQuery.data.items[0].election, "current");
  assert.equal(electionQuery.data.items[0].election_year, 100);

  const electionPage = await (await call("/v1/resources?kind=election&limit=3&page=1")).json();
  assert.equal(electionPage.data.items.length, 1, "limit and page must apply to election records");
  assert.equal(electionPage.data.total_pages, 2);
  assert.equal(electionPage.data.has_more, false);

  // Bingo resource: goals are pageable records, filtered by query.
  const bingo = await (await call("/v1/resources?kind=bingo&query=goal")).json();
  assert.equal(bingo.data.total_items, 1);
  assert.equal(bingo.data.bingo_id, 1);
  assert.equal(bingo.data.items[0].id, "goal");
  const bingoMiss = await (await call("/v1/resources?kind=bingo&query=nomatch")).json();
  assert.equal(bingoMiss.data.total_items, 0);
  assert.deepEqual(bingoMiss.data.items, [], "an empty filtered goal list is a real empty result");

  // Realistic AH: 90 upstream pages against a 4-page cap. This is production.
  // The old fixture only ever mocked totalPages: 2, which is why the
  // permanently-false `complete` flag went unnoticed.
  installMockFetch({
    "/v2/skyblock/auctions": (url) => {
      const page = Number(url.searchParams.get("page") || 0);
      return Response.json({
        success: true,
        page,
        totalPages: 90,
        totalAuctions: 90_000,
        lastUpdated: 456,
        auctions: [auction(`p${page}`, 1_000 + page)],
      });
    },
  });

  const big = await (await call("/v1/auctions/lowest-bin?item=RED_ROSE%3A3")).json();
  assert.equal(big.data.scan.complete, false, "4-page cap cannot cover 90 pages");
  assert.equal(big.data.authoritative_lowest_bin, null);
  assert.equal(big.data.scan.segments_required, 23, "ceil(90 / 4)");
  assert.equal(big.data.scan.segment_index, 0);
  assert.equal(big.data.scan.next_start_page, 4);
  assert.equal(big.data.segment_lowest_bin.bin_price, 1_000);

  // Segment 2 reports its index and keeps segments_required stable.
  const second = await (await call("/v1/auctions/lowest-bin?item=RED_ROSE%3A3&start_page=4")).json();
  assert.equal(second.data.scan.segment_index, 1);
  assert.equal(second.data.scan.segments_required, 23);
  assert.equal(second.data.scan.next_start_page, 8);
  assert.equal(second.data.segment_lowest_bin.bin_price, 1_004);

  // Lazy decode: stop once `limit` cheap matches are confirmed. With limit=1
  // over 4 pages of matching auctions, only one decode should happen.
  const lazy = await (await call("/v1/auctions/lowest-bin?item=RED_ROSE%3A3&limit=1")).json();
  assert.equal(lazy.data.auctions.length, 1);
  assert.equal(lazy.data.scan.decodes_performed, 1, "must not decode past the limit");
  assert.equal(lazy.data.scan.decode_budget_exhausted, false);
  assert.equal(lazy.data.match_count_is_lower_bound, true);

  // The retired eager-decode cap is gone.
  assert.equal(lazy.data.scan.candidate_decode_truncated, undefined);

  // Exactly-at-budget regression: 60 BIN candidates that all pass the name
  // prefilter (searching for "Enchanted Titanium") but all decode to a
  // different item (the shared fixture blob is RED_ROSE:3), so none of them
  // ever becomes a match. decodesPerformed lands on exactly decodeBudget (60)
  // having drained every one of the 60 candidates — nothing was skipped, so
  // the scan was genuinely exhaustive and decode_budget_exhausted must be
  // false, not a false positive from landing on the budget number.
  installMockFetch({
    "/v2/skyblock/auctions": () => Response.json({
      success: true,
      page: 0,
      totalPages: 1,
      totalAuctions: 60,
      lastUpdated: 456,
      auctions: Array.from({ length: 60 }, (_, index) => ({
        uuid: `budget-${index}`,
        auctioneer: playerUuid,
        profile_id: profileId,
        start: 1,
        end: 9_999_999_999_999,
        item_name: "Enchanted Titanium",
        extra: "",
        category: "misc",
        tier: "COMMON",
        starting_bid: 100 + index,
        highest_bid_amount: 100 + index,
        bin: true,
        bids: [],
        item_bytes: { type: 0, data: itemNbt },
      })),
    }),
  });

  const atBudget = await (await call("/v1/auctions/lowest-bin?item=ENCHANTED_TITANIUM")).json();
  assert.equal(atBudget.data.scan.name_prefilter_candidates, 60, "all 60 auctions must pass the name prefilter");
  assert.equal(atBudget.data.scan.decodes_performed, 60, "every candidate must have been decoded");
  assert.equal(atBudget.data.scan.decode_failures, 0, "the shared fixture blob decodes cleanly, it just doesn't match");
  assert.equal(atBudget.data.match_count_in_segment, 0, "none of the 60 decode to ENCHANTED_TITANIUM");
  assert.equal(atBudget.data.scan.decode_budget_exhausted, false, "draining every candidate is not budget exhaustion");
}
