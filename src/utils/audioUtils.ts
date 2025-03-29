/**
 * Audio utility functions for processing, playback, and analysis of sound waves.
 * This file contains core functionality for working with the Web Audio API
 * and transforming abstract wave data into audible sound.
 */

import { SAMPLE_RATE, MAX_AMPLITUDE, AUDIO_DURATION } from '@/constants/audioConstants';
import { WavePoint } from './waveGenerators';
import { getNoteFromFrequency } from '@/constants/noteFrequencies';

/**
 * Creates an AudioContext with appropriate initialization options.
 * Uses a singleton pattern to ensure only one context exists.
 * @returns A new or existing AudioContext, or null if in a non-browser environment
 */
let audioContextInstance: AudioContext | null = null;
export function createAudioContext(): AudioContext | null {
  if (audioContextInstance) {
    // Return existing instance if already created and not closed
    if (audioContextInstance.state !== 'closed') {
      return audioContextInstance;
    }
  }
  
  // Check for browser environment
  if (typeof window === 'undefined') {
    return null;
  }
  
  try {
    // Use appropriate constructor with browser prefixes for compatibility
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      console.error('Web Audio API not supported in this browser');
      return null;
    }
    
    // Create a new audio context with optimal settings
    audioContextInstance = new AudioContextClass({
      latencyHint: 'interactive',
      sampleRate: SAMPLE_RATE
    });
    
    return audioContextInstance;
  } catch (error) {
    console.error('Failed to create AudioContext:', error);
    return null;
  }
}

/**
 * Creates an audio buffer from an array of wave points.
 * Converts the abstract wave representation to a format that can be played by the Web Audio API.
 * 
 * @param audioContext The AudioContext to use for buffer creation
 * @param waveData Array of points representing the waveform
 * @param duration Duration of the audio in seconds
 * @returns An AudioBuffer containing the waveform data
 */
export function createAudioBufferFromWave(
  audioContext: AudioContext,
  waveData: WavePoint[],
  duration: number = AUDIO_DURATION
): AudioBuffer {
  // Calculate buffer parameters
  const sampleRate = audioContext.sampleRate;
  const bufferSize = Math.floor(sampleRate * duration);
  
  // Create a new audio buffer (mono channel)
  const buffer = audioContext.createBuffer(1, bufferSize, sampleRate);
  const channelData = buffer.getChannelData(0);
  
  // If no wave data, return silent buffer
  if (waveData.length === 0) {
    // Fill with zeros (silence)
    for (let i = 0; i < bufferSize; i++) {
      channelData[i] = 0;
    }
    return buffer;
  }
  
  // Find maximum amplitude in the wave data for normalization
  const maxValue = Math.max(...waveData.map(point => Math.abs(point.value)));
  
  // Normalize factor (if max is zero, use 1 to avoid division by zero)
  const normalizationFactor = maxValue > 0 ? 1 / maxValue : 1;
  
  // Fill the buffer with normalized wave data
  for (let i = 0; i < bufferSize; i++) {
    // Calculate time position
    const t = i / sampleRate;
    
    // Find the corresponding value in the wave data
    // Use interpolation for smooth transitions between data points
    let value = 0;
    
    if (waveData.length < bufferSize) {
      // Case: fewer data points than buffer samples (need interpolation)
      const indexFloat = (t / duration) * (waveData.length - 1);
      const index1 = Math.floor(indexFloat);
      const index2 = Math.min(Math.ceil(indexFloat), waveData.length - 1);
      
      if (index1 === index2 || index1 >= waveData.length - 1) {
        // Edge case or exact match
        value = waveData[index1]?.value || 0;
      } else {
        // Linear interpolation between two points
        const weight = indexFloat - index1;
        value = (1 - weight) * waveData[index1].value + weight * waveData[index2].value;
      }
    } else {
      // Case: more data points than buffer samples (can directly sample)
      const index = Math.min(Math.floor((t / duration) * waveData.length), waveData.length - 1);
      value = waveData[index]?.value || 0;
    }
    
    // Normalize to [-1, 1] range and apply safety factor to prevent clipping
    channelData[i] = value * normalizationFactor * 0.95;
  }
  
  return buffer;
}

/**
 * Plays an audio buffer through the audio context.
 * Provides options for controlling volume and handling playback events.
 * 
 * @param audioContext The AudioContext to use for playback
 * @param buffer The AudioBuffer to play
 * @param onEnded Optional callback to execute when playback ends
 * @param volume Optional volume level (0.0 - 1.0)
 * @returns The created AudioBufferSourceNode for further control
 */
export function playAudioBuffer(
  audioContext: AudioContext,
  buffer: AudioBuffer,
  onEnded?: () => void,
  volume: number = 0.5
): AudioBufferSourceNode {
  // Resume audio context if suspended (autoplay policy handling)
  if (audioContext.state === 'suspended') {
    audioContext.resume();
  }
  
  // Create source node
  const source = audioContext.createBufferSource();
  source.buffer = buffer;
  
  // Create gain node for volume control
  const gainNode = audioContext.createGain();
  gainNode.gain.value = Math.max(0, Math.min(1, volume)); // Clamp volume between 0 and 1
  
  // Connect the audio processing chain
  source.connect(gainNode);
  gainNode.connect(audioContext.destination);
  
  // Set up ended event handler
  if (onEnded) {
    source.onended = onEnded;
  }
  
  // Start playback
  source.start();
  
  return source;
}

/**
 * Analyzes an audio buffer to extract spectral information.
 * Uses WebAudio's AnalyserNode for frequency domain conversion.
 * 
 * @param audioContext The AudioContext to use for analysis
 * @param buffer The AudioBuffer to analyze
 * @param fftSize FFT size for spectral resolution (power of 2)
 * @returns A Promise resolving to the frequency data array
 */
export async function analyzeAudioSpectrum(
  audioContext: AudioContext,
  buffer: AudioBuffer,
  fftSize: number = 2048
): Promise<{ 
  frequencyData: Float32Array; 
  frequencyBinCount: number;
  frequencyResolution: number;
}> {
  return new Promise((resolve) => {
    // Create an offline audio context for analysis
    // (allows processing without real-time playback)
    const offlineContext = new OfflineAudioContext(
      1, 
      buffer.length, 
      audioContext.sampleRate
    );
    
    // Create an analyzer node
    const analyzerNode = offlineContext.createAnalyser();
    analyzerNode.fftSize = fftSize;
    analyzerNode.smoothingTimeConstant = 0; // No smoothing for precise analysis
    
    // Create a source node for the buffer
    const sourceNode = offlineContext.createBufferSource();
    sourceNode.buffer = buffer;
    
    // Connect the source to the analyzer
    sourceNode.connect(analyzerNode);
    analyzerNode.connect(offlineContext.destination);
    
    // Start playback
    sourceNode.start(0);
    
    // Render the audio to get frequency data
    offlineContext.startRendering().then((renderedBuffer) => {
      // Create arrays for frequency data
      const frequencyData = new Float32Array(analyzerNode.frequencyBinCount);
      
      // Get the frequency data
      analyzerNode.getFloatFrequencyData(frequencyData);
      
      // Calculate frequency resolution (Hz per bin)
      const frequencyResolution = audioContext.sampleRate / fftSize;
      
      resolve({
        frequencyData,
        frequencyBinCount: analyzerNode.frequencyBinCount,
        frequencyResolution
      });
    });
  });
}

/**
 * Finds peaks in frequency data that might represent musical notes.
 * 
 * @param frequencyData The frequency domain data from analyzer
 * @param frequencyResolution The frequency resolution (Hz per bin)
 * @param threshold The minimum amplitude threshold as a fraction of the maximum amplitude
 * @param minFrequency Minimum frequency to consider (Hz)
 * @param maxFrequency Maximum frequency to consider (Hz)
 * @returns Array of detected peaks with frequency and amplitude
 */
export function findFrequencyPeaks(
  frequencyData: Float32Array,
  frequencyResolution: number,
  threshold: number = 0.1,
  minFrequency: number = 20,
  maxFrequency: number = 5000
): Array<{ frequency: number; amplitude: number }> {
  const peaks: Array<{ frequency: number; amplitude: number }> = [];
  
  // Convert from dB values to linear amplitude
  const linearAmplitudes = Array.from(frequencyData).map(db => Math.pow(10, db / 20));
  
  // Find the maximum amplitude to set the threshold
  const maxAmplitude = Math.max(...linearAmplitudes);
  const thresholdValue = maxAmplitude * threshold;
  
  // Identify peaks (local maxima above threshold)
  for (let i = 1; i < linearAmplitudes.length - 1; i++) {
    const frequency = i * frequencyResolution;
    
    // Skip frequencies outside our range of interest
    if (frequency < minFrequency || frequency > maxFrequency) {
      continue;
    }
    
    const prev = linearAmplitudes[i - 1];
    const current = linearAmplitudes[i];
    const next = linearAmplitudes[i + 1];
    
    // A peak is a point higher than both neighbors and above threshold
    if (current > thresholdValue && current > prev && current > next) {
      // For better precision, perform parabolic interpolation
      // to estimate the true peak position between samples
      const deltaX = (next - prev) / (2 * (2 * current - prev - next));
      const refinedFrequency = (i + deltaX) * frequencyResolution;
      
      peaks.push({
        frequency: refinedFrequency,
        amplitude: current
      });
    }
  }
  
  // Sort peaks by amplitude (highest first)
  return peaks.sort((a, b) => b.amplitude - a.amplitude);
}

/**
 * Identifies musical notes from a list of frequency peaks.
 * Maps frequencies to note names and calculates tuning deviation.
 * 
 * @param peaks Array of frequency peaks with amplitude
 * @returns Array of identified notes with detailed information
 */
export function identifyNotesFromPeaks(
  peaks: Array<{ frequency: number; amplitude: number }>
): Array<{
  note: string;
  nameRu: string;
  frequency: number;
  cents: string;
  amplitude: number;
}> {
  return peaks.map(peak => {
    // Get note information from the frequency
    const noteInfo = getNoteFromFrequency(peak.frequency);
    
    // Get Russian name from note
    const noteBase = noteInfo.note.replace(/\d+$/, ''); // Remove octave number
    const octave = noteInfo.note.match(/\d+$/)?.[0] || '';
    
    // Format the cents value (include + sign for positive values)
    const centsFormatted = noteInfo.cents > 0 
      ? `+${noteInfo.cents}` 
      : noteInfo.cents.toString();
    
    return {
      note: noteInfo.note,
      nameRu: `${getNoteNameRu(noteBase)}${octave}`,
      frequency: peak.frequency,
      cents: centsFormatted,
      amplitude: peak.amplitude
    };
  });
}

/**
 * Helper function to get Russian note name
 * Implemented here to avoid circular dependencies
 */
function getNoteNameRu(noteLetter: string): string {
  const ruNames: Record<string, string> = {
    'C': 'До',
    'C#': 'До#',
    'D': 'Ре',
    'D#': 'Ре#',
    'E': 'Ми',
    'F': 'Фа',
    'F#': 'Фа#',
    'G': 'Соль',
    'G#': 'Соль#',
    'A': 'Ля',
    'A#': 'Ля#',
    'B': 'Си'
  };
  
  return ruNames[noteLetter] || noteLetter;
}

/**
 * Applies an ADSR envelope to an audio buffer for more natural sound.
 * ADSR = Attack, Decay, Sustain, Release - parameters that shape amplitude over time.
 * 
 * @param buffer The AudioBuffer to modify
 * @param attack Attack time as a fraction of total duration
 * @param decay Decay time as a fraction of total duration
 * @param sustain Sustain level as a fraction of peak amplitude
 * @param release Release time as a fraction of total duration
 * @returns A new AudioBuffer with the envelope applied
 */
export function applyEnvelopeToBuffer(
  audioContext: AudioContext,
  buffer: AudioBuffer,
  attack: number = 0.1,
  decay: number = 0.1,
  sustain: number = 0.7,
  release: number = 0.2
): AudioBuffer {
  // Create a new buffer with the same parameters
  const newBuffer = audioContext.createBuffer(
    buffer.numberOfChannels,
    buffer.length,
    buffer.sampleRate
  );
  
  // Process each channel (usually just one for mono)
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const inputData = buffer.getChannelData(channel);
    const outputData = newBuffer.getChannelData(channel);
    
    const duration = buffer.duration;
    const attackSamples = Math.floor(attack * duration * buffer.sampleRate);
    const decaySamples = Math.floor(decay * duration * buffer.sampleRate);
    const releaseSamples = Math.floor(release * duration * buffer.sampleRate);
    const sustainStart = attackSamples + decaySamples;
    const releaseStart = buffer.length - releaseSamples;
    
    // Apply envelope to each sample
    for (let i = 0; i < buffer.length; i++) {
      let envelopeGain;
      
      if (i < attackSamples) {
        // Attack phase: linear ramp from 0 to 1
        envelopeGain = i / attackSamples;
      } else if (i < sustainStart) {
        // Decay phase: linear ramp from 1 to sustain level
        const decayProgress = (i - attackSamples) / decaySamples;
        envelopeGain = 1 - (1 - sustain) * decayProgress;
      } else if (i < releaseStart) {
        // Sustain phase: constant level
        envelopeGain = sustain;
      } else {
        // Release phase: linear ramp from sustain to 0
        const releaseProgress = (i - releaseStart) / releaseSamples;
        envelopeGain = sustain * (1 - releaseProgress);
      }
      
      // Apply envelope to the sample
      outputData[i] = inputData[i] * envelopeGain;
    }
  }
  
  return newBuffer;
}

/**
 * Converts an array of audio samples to an AudioBuffer.
 * Useful for converting raw PCM data to playable format.
 * 
 * @param audioContext The AudioContext to use
 * @param samples Array of audio samples (normalized to [-1, 1])
 * @param sampleRate Optional custom sample rate (defaults to context rate)
 * @returns An AudioBuffer containing the samples
 */
export function samplesToAudioBuffer(
  audioContext: AudioContext,
  samples: Float32Array | number[],
  sampleRate?: number
): AudioBuffer {
  const buffer = audioContext.createBuffer(
    1,  // Mono
    samples.length,
    sampleRate || audioContext.sampleRate
  );
  
  // Copy samples to the buffer
  const channelData = buffer.getChannelData(0);
  
  if (samples instanceof Float32Array) {
    // If already Float32Array, copy directly
    channelData.set(samples);
  } else {
    // Convert number[] to Float32Array
    for (let i = 0; i < samples.length; i++) {
      channelData[i] = samples[i];
    }
  }
  
  return buffer;
}

/**
 * Converts wave points to an array of normalized audio samples.
 * Useful for preparing data for visualization or further processing.
 * 
 * @param wavePoints Array of wave points
 * @returns Float32Array of normalized samples in range [-1, 1]
 */
export function wavePointsToSamples(wavePoints: WavePoint[]): Float32Array {
  const samples = new Float32Array(wavePoints.length);
  
  // Find maximum value for normalization
  const maxValue = Math.max(...wavePoints.map(point => Math.abs(point.value)));
  const normalizationFactor = maxValue > 0 ? 1 / maxValue : 1;
  
  // Convert each point to a normalized sample
  for (let i = 0; i < wavePoints.length; i++) {
    samples[i] = wavePoints[i].value * normalizationFactor;
  }
  
  return samples;
}

/**
 * Normalizes audio samples to a target amplitude.
 * 
 * @param samples Audio samples to normalize
 * @param targetAmplitude Target peak amplitude (0.0 - 1.0)
 * @returns Normalized samples
 */
export function normalizeSamples(
  samples: Float32Array | number[],
  targetAmplitude: number = 0.9
): Float32Array {
  // Find the peak amplitude
  let maxAmplitude = 0;
  for (let i = 0; i < samples.length; i++) {
    const absValue = Math.abs(samples[i]);
    if (absValue > maxAmplitude) {
      maxAmplitude = absValue;
    }
  }
  
  // Create the output array
  const normalizedSamples = new Float32Array(samples.length);
  
  // Apply normalization if needed
  if (maxAmplitude > 0) {
    const normalizationFactor = targetAmplitude / maxAmplitude;
    for (let i = 0; i < samples.length; i++) {
      normalizedSamples[i] = samples[i] * normalizationFactor;
    }
  } else {
    // If all samples are zero, just return zeros
    normalizedSamples.fill(0);
  }
  
  return normalizedSamples;
}

/**
 * Calculates the RMS (Root Mean Square) of an audio signal.
 * RMS is a measure of the average power, correlating with perceived loudness.
 * 
 * @param samples Audio samples
 * @returns The RMS value
 */
export function calculateRMS(samples: Float32Array | number[]): number {
  if (samples.length === 0) return 0;
  
  let sumOfSquares = 0;
  for (let i = 0; i < samples.length; i++) {
    sumOfSquares += samples[i] * samples[i];
  }
  
  return Math.sqrt(sumOfSquares / samples.length);
}

export function identifyNote(frequency: number): { note: string; cents: number } {
  return getNoteFromFrequency(frequency);
}

/**
 * Safely disposes of audio resources to prevent memory leaks.
 * 
 * @param source AudioBufferSourceNode to dispose
 * @param nodes Additional AudioNodes to disconnect
 */
export function disposeAudioResources(
  source: AudioBufferSourceNode | null,
  ...nodes: AudioNode[]
): void {
  if (source) {
    try {
      source.stop();
      source.disconnect();
    } catch (e) {
      // Ignore errors if already stopped
    }
  }
  
  // Disconnect all additional nodes
  nodes.forEach(node => {
    try {
      node.disconnect();
    } catch (e) {
      // Ignore errors
    }
  });
}