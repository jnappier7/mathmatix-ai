#!/usr/bin/env node

/**
 * VirusTotal Domain Check for mathmatix.ai
 *
 * Checks the current VirusTotal detection status and reports
 * which vendors are flagging the domain.
 *
 * Usage:
 *   VIRUSTOTAL_API_KEY=your_key node scripts/check-virustotal.js
 *
 * Get a free API key at: https://www.virustotal.com/gui/join-us
 */

const https = require('https');

const DOMAIN = 'mathmatix.ai';
const API_KEY = process.env.VIRUSTOTAL_API_KEY;

if (!API_KEY) {
  console.error('Error: VIRUSTOTAL_API_KEY environment variable is required.');
  console.error('Get a free key at: https://www.virustotal.com/gui/join-us');
  process.exit(1);
}

function vtRequest(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'www.virustotal.com',
      path,
      method: 'GET',
      headers: {
        'x-apikey': API_KEY,
        'Accept': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(JSON.parse(data));
        } else {
          reject(new Error(`VirusTotal API returned ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

async function checkDomain() {
  console.log(`\nChecking VirusTotal status for: ${DOMAIN}`);
  console.log('='.repeat(50));

  const result = await vtRequest(`/api/v3/domains/${DOMAIN}`);
  const analysis = result.data.attributes.last_analysis_results;
  const stats = result.data.attributes.last_analysis_stats;

  // Summary
  console.log('\n--- Detection Summary ---');
  console.log(`  Harmless:    ${stats.harmless}`);
  console.log(`  Undetected:  ${stats.undetected}`);
  console.log(`  Malicious:   ${stats.malicious}`);
  console.log(`  Suspicious:  ${stats.suspicious}`);
  console.log(`  Timeout:     ${stats.timeout}`);

  const totalFlagged = stats.malicious + stats.suspicious;
  const totalEngines = Object.keys(analysis).length;
  console.log(`\n  TOTAL: ${totalFlagged}/${totalEngines} vendors flagging`);

  // Detailed detections
  const phishing = [];
  const malicious = [];
  const suspicious = [];
  const other = [];

  for (const [vendor, info] of Object.entries(analysis)) {
    if (info.category === 'malicious') {
      const cat = (info.result || 'malicious').toLowerCase();
      if (cat.includes('phish')) {
        phishing.push({ vendor, result: info.result });
      } else {
        malicious.push({ vendor, result: info.result });
      }
    } else if (info.category === 'suspicious') {
      suspicious.push({ vendor, result: info.result });
    }
  }

  if (phishing.length > 0) {
    console.log('\n--- Flagging as Phishing ---');
    for (const { vendor, result } of phishing) {
      console.log(`  ${vendor}: ${result}`);
    }
  }

  if (malicious.length > 0) {
    console.log('\n--- Flagging as Malicious ---');
    for (const { vendor, result } of malicious) {
      console.log(`  ${vendor}: ${result}`);
    }
  }

  if (suspicious.length > 0) {
    console.log('\n--- Flagging as Suspicious ---');
    for (const { vendor, result } of suspicious) {
      console.log(`  ${vendor}: ${result}`);
    }
  }

  if (totalFlagged === 0) {
    console.log('\n  All clear — no vendors flagging the domain.');
  }

  // Reputation score
  const reputation = result.data.attributes.reputation;
  console.log(`\n--- Domain Reputation Score: ${reputation} ---`);
  if (reputation < 0) {
    console.log('  (Negative score indicates poor reputation)');
  } else if (reputation === 0) {
    console.log('  (Neutral — domain has no community votes)');
  } else {
    console.log('  (Positive reputation)');
  }

  // Categories from different vendors
  const categories = result.data.attributes.categories || {};
  if (Object.keys(categories).length > 0) {
    console.log('\n--- Vendor Categories ---');
    for (const [vendor, category] of Object.entries(categories)) {
      console.log(`  ${vendor}: ${category}`);
    }
  }

  console.log(`\n  View full report: https://www.virustotal.com/gui/domain/${DOMAIN}`);
  console.log('');

  // Exit with non-zero if flagged
  if (totalFlagged > 0) {
    process.exit(1);
  }
}

checkDomain().catch((err) => {
  console.error('Error:', err.message);
  process.exit(2);
});
