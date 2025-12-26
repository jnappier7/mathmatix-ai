#!/bin/bash
#
# Clear existing problems and re-import from item-bank.csv
#
# Usage: ./scripts/reimport.sh
#

echo "========================================="
echo "  CLEAR & RE-IMPORT ITEM BANK"
echo "========================================="
echo ""

# Step 1: Clear existing problems
echo "Step 1: Clearing existing problems..."
node scripts/clearProblems.js
if [ $? -ne 0 ]; then
  echo "❌ Failed to clear problems"
  exit 1
fi

echo ""
echo "Step 2: Re-importing item bank..."
node scripts/importItemBank.js item-bank.csv

echo ""
echo "========================================="
echo "  DONE"
echo "========================================="
