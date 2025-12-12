#!/bin/bash

# ADAPTIVE SCREENER API TEST SCRIPT
# Tests the complete screener flow using cURL

BASE_URL="http://localhost:3000"

echo "=========================================="
echo "ADAPTIVE SCREENER API TEST"
echo "=========================================="
echo ""

# You'll need to be logged in first
# Replace this with your actual session cookie after logging in
SESSION_COOKIE="connect.sid=YOUR_SESSION_COOKIE_HERE"

echo "Step 1: Start Screener"
echo "----------------------"
START_RESPONSE=$(curl -s -X POST "$BASE_URL/api/screener/start" \
  -H "Cookie: $SESSION_COOKIE" \
  -H "Content-Type: application/json")

echo "$START_RESPONSE" | jq '.'

# Extract sessionId from response
SESSION_ID=$(echo "$START_RESPONSE" | jq -r '.sessionId')

if [ "$SESSION_ID" == "null" ]; then
  echo "ERROR: Failed to start screener. Make sure you're logged in."
  echo "To get your session cookie:"
  echo "1. Log in to MathMatix in your browser"
  echo "2. Open DevTools (F12) → Application → Cookies"
  echo "3. Copy the 'connect.sid' value"
  echo "4. Replace YOUR_SESSION_COOKIE_HERE in this script"
  exit 1
fi

echo ""
echo "Session ID: $SESSION_ID"
echo ""

# Loop for 10 questions
for i in {1..10}; do
  echo "=========================================="
  echo "Question $i"
  echo "=========================================="

  # Get next problem
  echo "Getting next problem..."
  PROBLEM=$(curl -s "$BASE_URL/api/screener/next-problem?sessionId=$SESSION_ID" \
    -H "Cookie: $SESSION_COOKIE")

  echo "$PROBLEM" | jq '.'

  # Check if we should stop (interview or complete)
  ACTION=$(echo "$PROBLEM" | jq -r '.nextAction // "continue"')
  if [ "$ACTION" != "continue" ]; then
    echo ""
    echo "Screener phase complete! Moving to: $ACTION"
    break
  fi

  # Extract problem details
  PROBLEM_ID=$(echo "$PROBLEM" | jq -r '.problem.problemId')
  PROBLEM_CONTENT=$(echo "$PROBLEM" | jq -r '.problem.content')

  echo ""
  echo "Problem: $PROBLEM_CONTENT"
  echo -n "Your answer: "
  read USER_ANSWER

  # Record start time
  START_TIME=$(date +%s)

  # Submit answer
  echo ""
  echo "Submitting answer..."

  # Calculate response time
  END_TIME=$(date +%s)
  RESPONSE_TIME=$((END_TIME - START_TIME))

  SUBMIT_RESPONSE=$(curl -s -X POST "$BASE_URL/api/screener/submit-answer" \
    -H "Cookie: $SESSION_COOKIE" \
    -H "Content-Type: application/json" \
    -d "{
      \"sessionId\": \"$SESSION_ID\",
      \"problemId\": \"$PROBLEM_ID\",
      \"answer\": $USER_ANSWER,
      \"responseTime\": $RESPONSE_TIME
    }")

  echo "$SUBMIT_RESPONSE" | jq '.'

  # Check if correct
  CORRECT=$(echo "$SUBMIT_RESPONSE" | jq -r '.correct')
  FEEDBACK=$(echo "$SUBMIT_RESPONSE" | jq -r '.feedback')
  NEXT_ACTION=$(echo "$SUBMIT_RESPONSE" | jq -r '.nextAction')

  echo ""
  if [ "$CORRECT" == "true" ]; then
    echo "✅ $FEEDBACK"
  else
    echo "❌ $FEEDBACK"
  fi

  # Show theta estimate
  THETA=$(echo "$SUBMIT_RESPONSE" | jq -r '.session.theta // .report.theta')
  CONFIDENCE=$(echo "$SUBMIT_RESPONSE" | jq -r '.session.confidence // .report.confidence')

  echo "Current Ability (θ): $THETA"
  echo "Confidence: $CONFIDENCE"
  echo ""

  # Check if we should transition to interview
  if [ "$NEXT_ACTION" == "interview" ] || [ "$NEXT_ACTION" == "complete" ]; then
    echo "Screener complete! Transitioning to: $NEXT_ACTION"
    echo ""
    break
  fi

  sleep 1
done

# Get final report
echo "=========================================="
echo "FINAL REPORT"
echo "=========================================="

REPORT=$(curl -s "$BASE_URL/api/screener/report?sessionId=$SESSION_ID" \
  -H "Cookie: $SESSION_COOKIE")

echo "$REPORT" | jq '.'

echo ""
echo "Test complete!"
