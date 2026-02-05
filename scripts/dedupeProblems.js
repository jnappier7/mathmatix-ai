/**
 * Problem Deduplication Script
 *
 * Identifies and removes duplicate problems based on prompt text.
 * Keeps the most recent version of each duplicate.
 *
 * Run: node scripts/dedupeProblems.js
 * Outputs: docs/problems-deduped.json
 */

const fs = require('fs');

const problems = JSON.parse(fs.readFileSync('./docs/mathmatixdb.problems.json', 'utf8'));

console.log('=== PROBLEM DEDUPLICATION ===\n');
console.log(`Starting with ${problems.length} problems\n`);

// Group by normalized prompt
const byPrompt = {};
problems.forEach(p => {
  const key = p.prompt.trim().toLowerCase();
  if (!byPrompt[key]) byPrompt[key] = [];
  byPrompt[key].push(p);
});

// Identify duplicates
const duplicates = Object.entries(byPrompt).filter(([k, v]) => v.length > 1);
console.log(`Found ${duplicates.length} duplicate prompt groups\n`);

// Keep the most recent version of each duplicate
const toRemove = new Set();
duplicates.forEach(([prompt, copies]) => {
  // Sort by createdAt descending (keep newest)
  copies.sort((a, b) => {
    const dateA = new Date(a.createdAt?.$date || a.createdAt || 0);
    const dateB = new Date(b.createdAt?.$date || b.createdAt || 0);
    return dateB - dateA;
  });

  // Mark all but the first (newest) for removal
  for (let i = 1; i < copies.length; i++) {
    toRemove.add(copies[i].problemId);
  }
});

console.log(`Removing ${toRemove.size} duplicate problems\n`);

// Filter out duplicates
const deduped = problems.filter(p => !toRemove.has(p.problemId));

console.log(`Result: ${deduped.length} unique problems\n`);

// Show examples of removed duplicates
console.log('Examples of removed duplicates:');
duplicates.slice(0, 5).forEach(([prompt, copies]) => {
  console.log(`  "${prompt.substring(0, 50)}..." (${copies.length} copies -> 1)`);
});

// Save deduped file
fs.writeFileSync('./docs/problems-deduped.json', JSON.stringify(deduped, null, 2));
console.log('\nSaved to docs/problems-deduped.json');

// Also output IDs for database removal
const removeIds = Array.from(toRemove);
fs.writeFileSync('./docs/duplicate-ids-to-remove.json', JSON.stringify(removeIds, null, 2));
console.log(`Saved ${removeIds.length} IDs to docs/duplicate-ids-to-remove.json`);
