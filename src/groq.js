import { getApiKey } from './settings.js';

const GROQ_API = 'https://api.groq.com/openai/v1';

export async function transcribeAudio(audioBlob) {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('No API key set. Open Settings to add your Groq API key.');

  const formData = new FormData();
  formData.append('file', audioBlob, 'audio.webm');
  formData.append('model', 'whisper-large-v3');
  formData.append('response_format', 'text');
  formData.append('language', 'en');

  const res = await fetch(`${GROQ_API}/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Transcription failed: ${err}`);
  }

  return (await res.text()).trim();
}

export async function chatCompletion(systemPrompt, userContent, { stream = false } = {}) {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('No API key set. Open Settings to add your Groq API key.');

  const body = {
    model: 'meta-llama/llama-4-scout-17b-16e-instruct',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ],
    temperature: 0.7,
    max_tokens: 2048,
    stream,
  };

  const res = await fetch(`${GROQ_API}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Chat completion failed: ${err}`);
  }

  if (stream) return res.body;

  const data = await res.json();
  return data.choices[0].message.content;
}
