#!/bin/bash

# Cross-platform test runner that uses xvfb-run on Linux, direct run on macOS

if command -v xvfb-run &> /dev/null; then
    # Linux with xvfb-run available
    echo "Running tests with xvfb-run (Linux)"
    xvfb-run -a "$@"
else
    # macOS or other systems without xvfb-run
    echo "Running tests directly (no xvfb-run)"
    "$@"
fi