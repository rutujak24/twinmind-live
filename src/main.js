import { Recorder } from './recorder.js';
import { chatCompletion, streamChatCompletion } from './groq.js';
import { loadSettings, saveSettings, getApiKey, saveApiKey, DEFAULTS } from './settings.js';

// ── State ──
let settings = loadSettings();
let transcript = []; // [{text, timestamp}]
let suggestionBatches = []; // [{timestamp, suggestions: [{type, preview}]}]
let chatHistory = []; // [{role, content, timestamp}]
let recorder = null;
let autoRefreshId = null;

// ── DOM refs ──
const $mic = document.getElementById('btn-mic');
const $transcript = document.getElementById('transcript');
const $suggestions = document.getElementById('suggestions');
const $refresh = document.getElementById('btn-refresh');
const $chatMessages = document.getElementById('chat-messages');
const $chatInput = document.getElementById('chat-input');
const $btnSend = document.getElementById('btn-send');
const $btnExport = document.getElementById('btn-export');
const $btnSettings = document.getElementById('btn-settings');
const $settingsModal = document.getElementById('settings-modal');
const $btnCloseSettings = document.getElementById('btn-close-settings');
const $btnSaveSettings = document.getElementById('btn-save-settings');

// ── Helpers ──
function ts() {
  return new Date().toLocaleTimeString();
}

function getFullTranscript() {
  return transcript.map((c) => c.text).join(' ');
}

function getRecentTranscript(maxChars) {
  const full = getFullTranscript();
  return full.slice(-maxChars);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ── Transcript ──
function renderTranscript() {
  $transcript.innerHTML = transcript
    .map(
      (c) =>
        `<div class="transcript-chunk"><div class="timestamp">${escapeHtml(c.timestamp)}</div>${escapeHtml(c.text)}</div>`
    )
    .join('');
  $transcript.scrollTop = $transcript.scrollHeight;
}

function onNewTranscript(text) {
  transcript.push({ text, timestamp: ts() });
  renderTranscript();
}

// ── Suggestions ──
async function fetchSuggestions() {
  const recentText = getRecentTranscript(settings.suggestionContextChars);
  if (!recentText.trim()) return;

  // Show loading
  const loadingEl = document.createElement('div');
  loadingEl.className = 'suggestion-batch';
  loadingEl.innerHTML = '<div class="batch-time">Generating suggestions... <span class="loading"></span></div>';
  $suggestions.prepend(loadingEl);

  const prompt = settings.suggestionPrompt.replace('{transcript}', recentText);

  try {
    const raw = await chatCompletion(
      'You are a helpful meeting copilot. Respond only with valid JSON.',
      prompt
    );

    loadingEl.remove();

    // Parse JSON from response
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error('No JSON array in response');
    const suggestions = JSON.parse(jsonMatch[0]);

    if (Array.isArray(suggestions) && suggestions.length > 0) {
      suggestionBatches.unshift({ timestamp: ts(), suggestions });
      renderSuggestions();
    }
  } catch (err) {
    loadingEl.remove();
    console.error('Suggestion fetch error:', err);
  }
}

function renderSuggestions() {
  $suggestions.innerHTML = suggestionBatches
    .map(
      (batch) =>
        `<div class="suggestion-batch">
          <div class="batch-time">${escapeHtml(batch.timestamp)}</div>
          ${batch.suggestions
            .map(
              (s, i) =>
                `<div class="suggestion-card" data-batch="${suggestionBatches.indexOf(batch)}" data-idx="${i}">
                  <div class="suggestion-type">${escapeHtml(s.type)}</div>
                  <div class="suggestion-text">${escapeHtml(s.preview)}</div>
                </div>`
            )
            .join('')}
        </div>`
    )
    .join('');
}

async function onSuggestionClick(batchIdx, idx) {
  const suggestion = suggestionBatches[batchIdx].suggestions[idx];
  const fullText = getFullTranscript().slice(-settings.detailContextChars);
  const prompt = settings.detailPrompt
    .replace('{suggestion}', suggestion.preview)
    .replace('{transcript}', fullText);

  // Add suggestion to chat as user message
  const userMsg = `📌 ${suggestion.type}: ${suggestion.preview}`;
  chatHistory.push({ role: 'user', content: userMsg, timestamp: ts() });
  const assistantMsg = { role: 'assistant', content: '', timestamp: ts() };
  chatHistory.push(assistantMsg);
  renderChat();

  try {
    await streamChatCompletion(
      'You are a helpful meeting copilot providing detailed answers.',
      prompt,
      (partial) => {
        assistantMsg.content = partial;
        renderChat();
      }
    );
  } catch (err) {
    assistantMsg.content = `Error: ${err.message}`;
    renderChat();
  }
}

// ── Chat ──
function renderChat() {
  $chatMessages.innerHTML = chatHistory
    .map(
      (m) =>
        `<div class="chat-msg ${m.role}">
          ${escapeHtml(m.content)}
          <div class="chat-timestamp">${escapeHtml(m.timestamp)}</div>
        </div>`
    )
    .join('');
  $chatMessages.scrollTop = $chatMessages.scrollHeight;
}

async function sendChatMessage() {
  const question = $chatInput.value.trim();
  if (!question) return;
  $chatInput.value = '';

  chatHistory.push({ role: 'user', content: question, timestamp: ts() });
  const assistantMsg = { role: 'assistant', content: '', timestamp: ts() };
  chatHistory.push(assistantMsg);
  renderChat();

  const fullText = getFullTranscript().slice(-settings.detailContextChars);
  const historyStr = chatHistory
    .slice(-20)
    .map((m) => `${m.role}: ${m.content}`)
    .join('\n');

  const prompt = settings.chatPrompt
    .replace('{transcript}', fullText)
    .replace('{history}', historyStr)
    .replace('{question}', question);

  try {
    await streamChatCompletion(
      'You are a helpful meeting copilot assistant.',
      prompt,
      (partial) => {
        assistantMsg.content = partial;
        renderChat();
      }
    );
  } catch (err) {
    assistantMsg.content = `Error: ${err.message}`;
    renderChat();
  }
}

// ── Mic ──
async function toggleMic() {
  if (recorder && recorder.recording) {
    recorder.stop();
    recorder = null;
    $mic.textContent = '🎙️ Start';
    $mic.classList.remove('recording');
    clearInterval(autoRefreshId);
  } else {
    if (!getApiKey()) {
      $settingsModal.classList.remove('hidden');
      return;
    }
    recorder = new Recorder(onNewTranscript);
    const intervalMs = settings.refreshIntervalSec * 1000;
    await recorder.start(intervalMs);
    $mic.textContent = '⏹ Stop';
    $mic.classList.add('recording');

    // Auto-refresh suggestions after each transcript chunk
    autoRefreshId = setInterval(() => {
      // Wait a bit for transcription to arrive, then fetch suggestions
      setTimeout(fetchSuggestions, 3000);
    }, intervalMs);
  }
}

// ── Export ──
function exportSession() {
  const data = {
    exportedAt: new Date().toISOString(),
    transcript: transcript,
    suggestionBatches: suggestionBatches,
    chatHistory: chatHistory,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `twinmind-session-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Settings ──
function openSettings() {
  settings = loadSettings();
  document.getElementById('setting-api-key').value = getApiKey();
  document.getElementById('setting-suggestion-prompt').value = settings.suggestionPrompt;
  document.getElementById('setting-detail-prompt').value = settings.detailPrompt;
  document.getElementById('setting-chat-prompt').value = settings.chatPrompt;
  document.getElementById('setting-suggestion-context').value = settings.suggestionContextChars;
  document.getElementById('setting-detail-context').value = settings.detailContextChars;
  $settingsModal.classList.remove('hidden');
}

function saveSettingsFromUI() {
  const apiKey = document.getElementById('setting-api-key').value.trim();
  if (apiKey) saveApiKey(apiKey);

  settings = {
    suggestionPrompt: document.getElementById('setting-suggestion-prompt').value,
    detailPrompt: document.getElementById('setting-detail-prompt').value,
    chatPrompt: document.getElementById('setting-chat-prompt').value,
    suggestionContextChars: parseInt(document.getElementById('setting-suggestion-context').value) || DEFAULTS.suggestionContextChars,
    detailContextChars: parseInt(document.getElementById('setting-detail-context').value) || DEFAULTS.detailContextChars,
    refreshIntervalSec: DEFAULTS.refreshIntervalSec,
  };
  saveSettings(settings);
  $settingsModal.classList.add('hidden');
}

// ── Event listeners ──
$mic.addEventListener('click', toggleMic);
$refresh.addEventListener('click', async () => {
  // Force stop and restart current recording segment to get fresh transcript
  if (recorder && recorder.recording && recorder.mediaRecorder.state === 'recording') {
    recorder.mediaRecorder.stop(); // triggers transcription + restart
    // Wait for transcription then fetch suggestions
    setTimeout(fetchSuggestions, 4000);
  } else {
    await fetchSuggestions();
  }
});

$suggestions.addEventListener('click', (e) => {
  const card = e.target.closest('.suggestion-card');
  if (!card) return;
  const batchIdx = parseInt(card.dataset.batch);
  const idx = parseInt(card.dataset.idx);
  onSuggestionClick(batchIdx, idx);
});

$btnSend.addEventListener('click', sendChatMessage);
$chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendChatMessage();
});

$btnExport.addEventListener('click', exportSession);
$btnSettings.addEventListener('click', openSettings);
$btnCloseSettings.addEventListener('click', () => $settingsModal.classList.add('hidden'));
$btnSaveSettings.addEventListener('click', saveSettingsFromUI);

// Close modal on backdrop click
$settingsModal.addEventListener('click', (e) => {
  if (e.target === $settingsModal) $settingsModal.classList.add('hidden');
});
