// Audio system for WEEEEEEE!

export function setupAudio(ctx) {
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();

  // Create master gain node for volume control
  const masterGain = audioContext.createGain();
  masterGain.connect(audioContext.destination);
  masterGain.gain.value = ctx.config.audio?.masterVolume ?? 0.5;

  ctx.audio = {
    context: audioContext,
    masterGain,
    sounds: {},
    loops: {},
    muted: false,
  };

  // Preload custom wee sound
  loadWeeSound(ctx);

  // Resume audio context on user interaction (required by browsers)
  const resumeAudio = () => {
    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }
  };

  document.addEventListener('click', resumeAudio, { once: true });
  document.addEventListener('keydown', resumeAudio, { once: true });
}

async function loadWeeSound(ctx) {
  try {
    const response = await fetch('sounds/wee.m4a');
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await ctx.audio.context.decodeAudioData(arrayBuffer);
    ctx.audio.sounds.wee = audioBuffer;
  } catch (error) {
    console.warn('Failed to load custom wee sound, will use synthesized version:', error);
  }
}

export function playWindSound(ctx) {
  if (!ctx.audio || ctx.audio.muted) return;

  const audio = ctx.audio;
  const ac = audio.context;

  console.log('[Audio] playWindSound called, windPlaying:', audio.loops.windPlaying);

  // Prevent starting a new wind sound if one is already playing
  // Check if wind source exists and hasn't been stopped yet
  if (audio.loops.windPlaying) {
    console.log('[Audio] Wind already playing, skipping');
    return; // Already playing, don't start another
  }

  console.log('[Audio] Starting new wind sound');

  // Stop existing wind sound if any
  if (audio.loops.wind) {
    try {
      audio.loops.wind.stop();
      audio.loops.wind.disconnect();
    } catch (e) {
      // Already stopped/disconnected
    }
    audio.loops.wind = null;
  }
  if (audio.loops.windBandpass) {
    try {
      audio.loops.windBandpass.disconnect();
    } catch (e) {
      // Already disconnected
    }
    audio.loops.windBandpass = null;
  }
  if (audio.loops.windFilter) {
    try {
      audio.loops.windFilter.disconnect();
    } catch (e) {
      // Already disconnected
    }
    audio.loops.windFilter = null;
  }
  if (audio.loops.windGain) {
    try {
      audio.loops.windGain.disconnect();
    } catch (e) {
      // Already disconnected
    }
    audio.loops.windGain = null;
  }

  // Create white noise for wind
  const bufferSize = 2 * ac.sampleRate;
  const noiseBuffer = ac.createBuffer(1, bufferSize, ac.sampleRate);
  const output = noiseBuffer.getChannelData(0);

  for (let i = 0; i < bufferSize; i++) {
    output[i] = Math.random() * 2 - 1;
  }

  const whiteNoise = ac.createBufferSource();
  whiteNoise.buffer = noiseBuffer;
  whiteNoise.loop = true;

  // Filter to create wind-like sound
  const bandpass = ac.createBiquadFilter();
  bandpass.type = 'bandpass';
  bandpass.frequency.value = 800;
  bandpass.Q.value = 0.5;

  const lowpass = ac.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = 3000;

  const windGain = ac.createGain();
  windGain.gain.value = 0.005;

  whiteNoise.connect(bandpass);
  bandpass.connect(lowpass);
  lowpass.connect(windGain);
  windGain.connect(audio.masterGain);

  whiteNoise.start();

  audio.loops.wind = whiteNoise;
  audio.loops.windBandpass = bandpass;
  audio.loops.windFilter = lowpass;
  audio.loops.windGain = windGain;
  audio.loops.windPlaying = true;
}

export function updateWindSound(ctx, speed, verticalVelocity) {
  if (!ctx.audio || !ctx.audio.loops.windFilter || ctx.audio.muted) return;

  const normalizedSpeed = Math.min(speed / 100, 2);
  const isDiving = verticalVelocity < -10;

  // Increase pitch and volume when going faster or diving
  const targetFreq = 2000 + normalizedSpeed * 2000 + (isDiving ? 1000 : 0);
  const targetVolume = 0.005 + normalizedSpeed * 0.015 + (isDiving ? 0.01 : 0);

  ctx.audio.loops.windFilter.frequency.value = targetFreq;
  ctx.audio.loops.windGain.gain.value = Math.min(targetVolume, 0.04);
}

export function playDingSound(ctx, distance) {
  if (!ctx.audio || ctx.audio.muted) return;

  const ac = ctx.audio.context;
  const now = ac.currentTime;

  // Create oscillator for ding
  const osc = ac.createOscillator();
  osc.type = 'sine';

  // Pitch varies based on distance (closer = higher pitch)
  const basePitch = 800 + (6 - distance) * 200;
  osc.frequency.setValueAtTime(basePitch, now);
  osc.frequency.exponentialRampToValueAtTime(basePitch * 0.5, now + 0.3);

  const gain = ac.createGain();
  const volume = Math.max(0.05, 0.3 * (6 - distance) / 6);
  gain.gain.setValueAtTime(volume, now);
  gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);

  osc.connect(gain);
  gain.connect(ctx.audio.masterGain);

  osc.start(now);
  osc.stop(now + 0.3);
}

export function playCrashSound(ctx) {
  if (!ctx.audio || ctx.audio.muted) return;

  const ac = ctx.audio.context;
  const now = ac.currentTime;

  // Create noise burst for crash
  const bufferSize = ac.sampleRate * 0.5;
  const noiseBuffer = ac.createBuffer(1, bufferSize, ac.sampleRate);
  const output = noiseBuffer.getChannelData(0);

  for (let i = 0; i < bufferSize; i++) {
    output[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.1));
  }

  const noise = ac.createBufferSource();
  noise.buffer = noiseBuffer;

  const filter = ac.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(2000, now);
  filter.frequency.exponentialRampToValueAtTime(100, now + 0.5);

  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.4, now);
  gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);

  noise.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.audio.masterGain);

  noise.start(now);
}

export function playWeeSound(ctx) {
  if (!ctx.audio || ctx.audio.muted) return;

  const ac = ctx.audio.context;
  const now = ac.currentTime;

  // Use custom recorded sound if available
  if (ctx.audio.sounds.wee) {
    const source = ac.createBufferSource();
    source.buffer = ctx.audio.sounds.wee;

    const gain = ac.createGain();
    gain.gain.value = 0.5;

    source.connect(gain);
    gain.connect(ctx.audio.masterGain);

    source.start(now);
    return;
  }

  // Fallback to synthesized sound
  const osc = ac.createOscillator();
  osc.type = 'sawtooth';

  // Start high and descend
  osc.frequency.setValueAtTime(600, now);
  osc.frequency.exponentialRampToValueAtTime(300, now + 0.8);

  const gain = ac.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.25, now + 0.05);
  gain.gain.setValueAtTime(0.25, now + 0.6);
  gain.gain.exponentialRampToValueAtTime(0.01, now + 0.8);

  // Add vibrato for voice-like quality
  const vibrato = ac.createOscillator();
  vibrato.frequency.value = 5;
  const vibratoGain = ac.createGain();
  vibratoGain.gain.value = 20;
  vibrato.connect(vibratoGain);
  vibratoGain.connect(osc.frequency);

  osc.connect(gain);
  gain.connect(ctx.audio.masterGain);

  osc.start(now);
  vibrato.start(now);
  osc.stop(now + 0.8);
  vibrato.stop(now + 0.8);
}

export function stopAllSounds(ctx) {
  if (!ctx.audio) return;

  // Stop all looping sounds
  if (ctx.audio.loops.wind) {
    try {
      ctx.audio.loops.wind.stop();
      ctx.audio.loops.wind.disconnect();
    } catch (e) {
      // Already stopped
    }
    ctx.audio.loops.wind = null;
  }
  if (ctx.audio.loops.windBandpass) {
    try {
      ctx.audio.loops.windBandpass.disconnect();
    } catch (e) {
      // Already disconnected
    }
    ctx.audio.loops.windBandpass = null;
  }
  if (ctx.audio.loops.windFilter) {
    try {
      ctx.audio.loops.windFilter.disconnect();
    } catch (e) {
      // Already disconnected
    }
    ctx.audio.loops.windFilter = null;
  }
  if (ctx.audio.loops.windGain) {
    try {
      ctx.audio.loops.windGain.disconnect();
    } catch (e) {
      // Already disconnected
    }
    ctx.audio.loops.windGain = null;
  }
  ctx.audio.loops.windPlaying = false;
}

export function setVolume(ctx, volume) {
  if (!ctx.audio) return;
  ctx.audio.masterGain.gain.value = Math.max(0, Math.min(1, volume));
}

export function setMuted(ctx, muted) {
  if (!ctx.audio) return;
  ctx.audio.muted = muted;

  if (muted) {
    stopAllSounds(ctx);
  }
}
