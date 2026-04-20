// Default prompts and settings
export const DEFAULTS = {
  suggestionPrompt: `You are an AI meeting copilot analyzing a live conversation transcript. Based on the recent transcript context, generate exactly 3 useful suggestions.

Each suggestion must be one of these types:
- "question": A smart question the user could ask right now
- "talking_point": A relevant point to bring up
- "answer": An answer to a question that was just asked in the conversation
- "fact_check": Verification of a claim or statement made
- "clarification": Clarifying something ambiguous that was said

Rules:
- Each suggestion preview should be 1-2 sentences that deliver value on their own even without clicking.
- Vary the types based on what's happening in the conversation. Don't repeat the same type 3 times unless the context warrants it.
- Be specific to what was said. Never be generic.
- If someone asked a question, at least one suggestion should be an answer.
- If someone stated a fact or number, consider fact-checking it.
- Keep it concise and actionable.

Respond ONLY with valid JSON array of exactly 3 objects:
[{"type": "<type>", "preview": "<1-2 sentence preview>"}]

Recent transcript:
{transcript}`,

  detailPrompt: `You are an AI meeting copilot. A user clicked on a suggestion during a live meeting. Provide a detailed, helpful answer.

The suggestion was: {suggestion}

Full transcript context:
{transcript}

Give a thorough but concise answer (3-6 paragraphs). Include relevant facts, data, or approaches. Be practical and actionable. Format with markdown if helpful.`,

  chatPrompt: `You are an AI meeting copilot assistant. You have access to the full meeting transcript and can answer questions about the conversation.

Full transcript:
{transcript}

Chat history:
{history}

User question: {question}

Provide a helpful, concise answer based on the transcript context. If the question is unrelated to the meeting, still answer helpfully but note the lack of meeting context.`,

  suggestionContextChars: 4000,
  detailContextChars: 8000,
  refreshIntervalSec: 30,
};

export function loadSettings() {
  const saved = localStorage.getItem('twinmind_settings');
  if (saved) {
    try {
      return { ...DEFAULTS, ...JSON.parse(saved) };
    } catch { /* ignore */ }
  }
  return { ...DEFAULTS };
}

export function saveSettings(settings) {
  localStorage.setItem('twinmind_settings', JSON.stringify(settings));
}

export function getApiKey() {
  return localStorage.getItem('twinmind_api_key') || '';
}

export function saveApiKey(key) {
  localStorage.setItem('twinmind_api_key', key);
}
