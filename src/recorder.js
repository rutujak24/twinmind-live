import { transcribeAudio } from './groq.js';

export class Recorder {
  constructor(onTranscript) {
    this.onTranscript = onTranscript;
    this.mediaRecorder = null;
    this.stream = null;
    this.chunks = [];
    this.intervalId = null;
    this.recording = false;
  }

  async start(intervalMs = 30000) {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.recording = true;
    this._startSegment();

    this.intervalId = setInterval(() => {
      if (!this.recording) return;
      // Stop current segment and start new one
      this.mediaRecorder.stop();
    }, intervalMs);
  }

  _startSegment() {
    this.chunks = [];
    this.mediaRecorder = new MediaRecorder(this.stream, {
      mimeType: this._getSupportedMime(),
    });

    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };

    this.mediaRecorder.onstop = async () => {
      const blob = new Blob(this.chunks, { type: this.mediaRecorder.mimeType });
      this.chunks = [];

      if (this.recording) {
        this._startSegment();
      }

      // Transcribe
      if (blob.size > 0) {
        try {
          const text = await transcribeAudio(blob);
          if (text) this.onTranscript(text);
        } catch (err) {
          console.error('Transcription error:', err);
        }
      }
    };

    this.mediaRecorder.start();
  }

  stop() {
    this.recording = false;
    clearInterval(this.intervalId);
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
    }
  }

  _getSupportedMime() {
    const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
    for (const t of types) {
      if (MediaRecorder.isTypeSupported(t)) return t;
    }
    return 'audio/webm';
  }
}
