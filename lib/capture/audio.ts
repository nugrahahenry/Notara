import { TARGET_SAMPLE_RATE } from './constants';

// Whisper natively processes 16 kHz audio. Resampling each slice before WAV
// encoding keeps the request below Vercel's body limit without changing the
// existing transcribe-and-discard flow.
export async function sliceAudioBuffer(
  buffer: AudioBuffer,
  start: number,
  end: number,
): Promise<AudioBuffer> {
  const startSample = Math.round(start * buffer.sampleRate);
  const frameCount = Math.max(
    0,
    Math.min(Math.round((end - start) * buffer.sampleRate), buffer.length - startSample),
  );

  const sourceChannels: Float32Array[] = [];
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    sourceChannels.push(buffer.getChannelData(channel));
  }

  const OfflineContext =
    window.OfflineAudioContext ||
    (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext })
      .webkitOfflineAudioContext;

  const targetLength = Math.max(
    1,
    Math.ceil((frameCount / buffer.sampleRate) * TARGET_SAMPLE_RATE),
  );
  const offline = new OfflineContext(1, targetLength, TARGET_SAMPLE_RATE);

  const monoSource = offline.createBuffer(1, Math.max(1, frameCount), buffer.sampleRate);
  const monoData = monoSource.getChannelData(0);
  for (let index = 0; index < frameCount; index++) {
    let sum = 0;
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      sum += sourceChannels[channel][startSample + index];
    }
    monoData[index] = sum / buffer.numberOfChannels;
  }

  const node = offline.createBufferSource();
  node.buffer = monoSource;
  node.connect(offline.destination);
  node.start();

  return offline.startRendering();
}

export function bufferToWav(buffer: AudioBuffer): Blob {
  const channelCount = buffer.numberOfChannels;
  const byteBuffer = new ArrayBuffer(buffer.length * 2 + 44);
  const view = new DataView(byteBuffer);
  const channels: Float32Array[] = [];
  let offset = 0;
  let position = 0;

  const setUint16 = (data: number) => {
    view.setUint16(position, data, true);
    position += 2;
  };

  const setUint32 = (data: number) => {
    view.setUint32(position, data, true);
    position += 4;
  };

  setUint32(0x46464952);
  setUint32(36 + buffer.length * 2);
  setUint32(0x45564157);
  setUint32(0x20746d66);
  setUint32(16);
  setUint16(1);
  setUint16(channelCount);
  setUint32(buffer.sampleRate);
  setUint32(buffer.sampleRate * 2 * channelCount);
  setUint16(2 * channelCount);
  setUint16(16);
  setUint32(0x61746164);
  setUint32(buffer.length * 2);

  for (let channel = 0; channel < channelCount; channel++) {
    channels.push(buffer.getChannelData(channel));
  }

  while (position < buffer.length) {
    for (let channel = 0; channel < channelCount; channel++) {
      let sample = Math.max(-1, Math.min(1, channels[channel][position]));
      sample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(44 + offset, sample, true);
      offset += 2;
    }
    position += 1;
  }

  return new Blob([byteBuffer], { type: 'audio/wav' });
}

export function getAudioDuration(file: File | Blob): Promise<number> {
  return new Promise((resolve) => {
    const audio = new Audio();
    const objectUrl = URL.createObjectURL(file);
    audio.src = objectUrl;
    audio.onloadedmetadata = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(Math.round(audio.duration));
    };
    audio.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(0);
    };
  });
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const unit = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const unitIndex = Math.floor(Math.log(bytes) / Math.log(unit));

  return `${parseFloat((bytes / unit ** unitIndex).toFixed(2))} ${sizes[unitIndex]}`;
}
