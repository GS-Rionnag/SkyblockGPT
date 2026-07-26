import {
  createTruncationReport,
  objectOrEmpty,
  optionalNumber,
  paginateRecords,
  pick,
  sanitize,
} from "../util.js";
import { json } from "../http.js";
import {
  readDetailParameter,
  readIntegerParameter,
  readTextParameter,
  requireEnumParameter,
} from "../params.js";
import { fetchHypixelJson, fetchSkyBlockItemNameMap } from "../hypixel.js";
import { compactCollectionItem, flattenCollections } from "../sections.js";

const RESOURCE_KINDS = new Set(["collections", "skills", "items", "election", "bingo"]);
const FEED_KINDS = new Set(["news", "firesales"]);

export async function handleResources(url, env) {
  const kind = requireEnumParameter(url, "kind", RESOURCE_KINDS);
  const detail = readDetailParameter(url);
  const query = readTextParameter(url, "query", 100, "").toLowerCase();
  const page = readIntegerParameter(url, "page", 0, 0, 10_000);
  const requestedLimit = readIntegerParameter(url, "limit", 25, 1, 50);
  const limit = detail === "full" ? Math.min(requestedLimit, 10) : requestedLimit;
  const payload = await fetchHypixelJson(`/v2/resources/skyblock/${kind}`, env, {}, {
    authenticated: false,
  });

  const report = createTruncationReport();
  const recordDepth = detail === "full" ? 8 : 5;
  const recordEntries = detail === "full" ? 500 : 150;
  let records;
  let extra = {};
  if (kind === "items") {
    records = (Array.isArray(payload.items) ? payload.items : [])
      .filter((item) => resourceRecordMatches(item, query))
      .sort((left, right) => String(left.id || "").localeCompare(String(right.id || "")))
      .map((item) => detail === "full" ? sanitize(item, 8, 500, report) : compactResourceItem(item));
  } else if (kind === "collections") {
    records = flattenCollections(payload.collections || {})
      .filter((item) => resourceRecordMatches(item, query))
      .sort((left, right) => String(left.id || "").localeCompare(String(right.id || "")))
      .map((item) => detail === "full" ? sanitize(item, 8, 500, report) : compactCollectionItem(item));
  } else if (kind === "election") {
    // Pageable records are the candidates of the latest concluded election
    // (under mayor.election) and the currently running election, if any. An
    // empty current list is a real between-elections state, not missing data.
    records = electionCandidateRecords(payload)
      .filter((candidate) => resourceRecordMatches(candidate, query))
      .map((candidate) => sanitize(candidate, recordDepth, recordEntries, report));
    // The concluded election's candidates already appear as records, so the
    // mayor summary drops its nested election block instead of repeating it.
    const { election: _concludedElection, ...mayorSummary } = objectOrEmpty(payload.mayor);
    extra = {
      mayor: payload.mayor ? sanitize(mayorSummary, 6, 300, report) : null,
      current_election_year: optionalNumber(objectOrEmpty(payload.current).year),
    };
  } else if (kind === "bingo") {
    records = (Array.isArray(payload.goals) ? payload.goals : [])
      .filter((goal) => resourceRecordMatches(goal, query))
      .map((goal) => sanitize(goal, recordDepth, recordEntries, report));
    extra = { bingo_id: optionalNumber(payload.id) };
  } else {
    records = Object.entries(payload.skills || {})
      .map(([id, value]) => ({ id, ...objectOrEmpty(value) }))
      .filter((item) => resourceRecordMatches(item, query))
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((item) => sanitize(item, recordDepth, recordEntries, report));
  }

  return json({
    success: true,
    kind,
    data: {
      source_last_updated: optionalNumber(payload.lastUpdated),
      source_version: payload.version || null,
      query: query || null,
      detail,
      ...extra,
      truncated: report.truncated,
      ...paginateRecords(records, page, limit),
    },
  });
}

function electionCandidateRecords(payload) {
  const concluded = objectOrEmpty(objectOrEmpty(payload.mayor).election);
  const current = objectOrEmpty(payload.current);
  const withElection = (election, year) => (candidate) => ({
    election,
    election_year: optionalNumber(year),
    ...objectOrEmpty(candidate),
  });
  return [
    ...(Array.isArray(concluded.candidates) ? concluded.candidates : []).map(withElection("latest_concluded", concluded.year)),
    ...(Array.isArray(current.candidates) ? current.candidates : []).map(withElection("current", current.year)),
  ];
}

export async function handleFeed(url, env) {
  const kind = requireEnumParameter(url, "kind", FEED_KINDS);
  const query = readTextParameter(url, "query", 100, "").toLowerCase();
  const page = readIntegerParameter(url, "page", 0, 0, 10_000);
  const limit = readIntegerParameter(url, "limit", 25, 1, 50);
  const endpoint = kind === "news" ? "/v2/skyblock/news" : "/v2/skyblock/firesales";
  const [payload, itemNames] = await Promise.all([
    fetchHypixelJson(endpoint, env, {}, { authenticated: false }),
    // Firesales expose only internal item IDs; join display names from the
    // cached items resource. A failed join means item_name: null, never a
    // failed feed request.
    kind === "firesales" ? fetchSkyBlockItemNameMap(env).catch(() => null) : Promise.resolve(null),
  ]);

  const report = createTruncationReport();
  let records;
  if (kind === "news") {
    records = (Array.isArray(payload.items) ? payload.items : [])
      .filter((item) => !query || `${item?.title || ""} ${item?.text || ""} ${item?.link || ""}`.toLowerCase().includes(query))
      .map((item) => sanitize(item, 6, 300, report));
  } else {
    records = (Array.isArray(payload.sales) ? payload.sales : [])
      .map((sale) => ({
        ...sanitize(objectOrEmpty(sale), 6, 300, report),
        item_name: (itemNames ? itemNames.get(sale?.item_id) : null) ?? null,
      }))
      .filter((sale) => !query || `${sale.item_id || ""} ${sale.item_name || ""}`.toLowerCase().includes(query));
  }

  const { items, ...pagination } = paginateRecords(records, page, limit);
  return json({
    success: true,
    kind,
    data: {
      source_last_updated: optionalNumber(payload.lastUpdated),
      query: query || null,
      truncated: report.truncated,
      ...pagination,
      // Firesales keep their original `sales` field name.
      ...(kind === "news" ? { items } : { sales: items }),
    },
  });
}

function compactResourceItem(item) {
  return sanitize(pick(item, [
    "id", "name", "material", "category", "tier", "npc_sell_price", "color", "stats", "soulbound", "museum", "generator", "furniture", "glowing",
  ]), 6, 200);
}

function resourceRecordMatches(record, query) {
  if (!query) return true;
  const id = String(record?.id || "").toLowerCase();
  const key = String(record?.key || "").toLowerCase();
  const name = String(record?.name || "").toLowerCase();
  return id.includes(query) || key.includes(query) || name.includes(query);
}
