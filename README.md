# TwinMind Live Suggestions

An AI meeting copilot that listens to live audio, transcribes in real-time, and surfaces contextual suggestions during conversations.

## Features

- **Live Transcription**: Captures mic audio and transcribes in ~30s chunks using Groq's Whisper Large V3
- **Smart Suggestions**: Generates 3 contextual suggestions every refresh cycle — questions, talking points, answers, fact-checks, or clarifications
- **Chat Panel**: Click suggestions for detailed answers or ask free-form questions with full transcript context
- **Session Export**: Export transcript + suggestions + chat as JSON
- **Configurable**: Editable prompts, context windows, and settings

## Stack

- **Frontend**: Vanilla JS + Vite (no framework overhead)
- **Transcription**: Groq Whisper Large V3
- **LLM**: Groq `openai/gpt-oss-120b` (GPT-OSS 120B)
- **Hosting**: Vercel

## Setup

```bash
npm install
npm run dev
```

Open `http://localhost:5173`, paste your Groq API key in Settings, and click Start.

## Prompt Strategy

### Suggestions
The suggestion prompt classifies each suggestion by type (question, talking_point, answer, fact_check, clarification) and instructs the model to vary types based on conversational context. Key design decisions:
- If someone asks a question, at least one suggestion should be an answer
- If a factual claim is made, a fact-check is surfaced
- Previews deliver standalone value without needing to click
- Recent transcript window (default 4000 chars) balances context vs latency

### Detail Answers
When a suggestion is clicked, a separate prompt with larger context window (8000 chars) generates a thorough 3-6 paragraph answer.

### Chat
Free-form chat includes full transcript + recent chat history for continuity.
