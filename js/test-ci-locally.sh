#!/bin/bash

# Test JavaScript CI locally as it runs in GitHub Actions
# This script simulates the GitHub Actions workflow for JavaScript

set -e  # Exit on error

echo "🚀 Testing JavaScript CI locally (simulating GitHub Actions)"
echo "============================================"

# Change to js directory
cd "$(dirname "$0")"

# Check Node.js version
echo "📦 Node.js version:"
node --version
echo ""

# Install dependencies
echo "📦 Installing dependencies..."
npm ci
echo ""

# Build
echo "🔨 Building..."
npm run build
echo ""

# Lint
echo "🔍 Linting..."
npm run lint
echo ""

# Type check
echo "📝 Type checking..."
npm run typecheck
echo ""

# Install Playwright browsers if needed
echo "🌐 Installing Playwright browsers..."
npx playwright install --with-deps chromium
echo ""

# Run Playwright tests
echo "🧪 Running Playwright tests..."

# Load environment variables from parent .env if it exists
if [ -f "../.env" ]; then
    echo "📋 Loading environment variables from ../.env"
    export $(cat ../.env | grep -v '^#' | xargs)
fi

# Check if environment variables are set
if [ -z "$DNS" ] || [ -z "$ZONEID" ] || [ -z "$API" ]; then
    echo "⚠️  Warning: DNS, ZONEID, or API environment variables not set!"
    echo "   Tests may fail without these Cloudflare credentials."
    echo "   Set them with: export DNS=domain.com ZONEID=zone-id API=api-token"
    echo ""
else
    echo "✅ Environment variables loaded (DNS=$DNS)"
fi

npm test

echo ""
echo "✅ All CI tests completed successfully!"