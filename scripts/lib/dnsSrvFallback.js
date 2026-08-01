// scripts/lib/dnsSrvFallback.js
// Preload shim for child seeders spawned by scripts/seedAll.js.
//
// Two of the seeders (seedCalcTopupItems, backfillAnswerEquivalents) carry
// their own "local resolver can't do the Atlas SRV lookup" workaround; the
// other seven do not, so on a box with a broken resolver a full seed run dies
// partway through — after skills, before items — which is the one failure mode
// an all-in-one runner has to absorb.
//
// seedAll does the SRV probe once, up front, and exports MM_SEED_DNS_SERVERS
// when the fallback is needed. This module is passed to each child via
// `node --require`, so the override is in place before mongoose connects,
// without editing nine scripts to each learn the same trick.
const dns = require('dns');

const servers = (process.env.MM_SEED_DNS_SERVERS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

if (servers.length) {
  dns.setServers(servers);
}
