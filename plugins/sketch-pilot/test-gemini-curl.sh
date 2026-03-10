#!/bin/bash
source .env
curl -H 'Content-Type: application/json' \
     -d '{"contents":[{"parts":[{"text":"Explain the Gemini image generation API."}]}]}' \
     "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}"
