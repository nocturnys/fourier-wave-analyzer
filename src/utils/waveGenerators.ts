/**
 * Wave generation utilities for creating different types of audio waveforms.
 * This file provides functions for synthesizing various periodic signals
 * that serve as the basis for sound generation and analysis.
 */

import { SAMPLE_RATE, MAX_AMPLITUDE } from '@/constants/audioConstants';

/**
 * Interface representing a single point in a waveform.
 * Contains both the time value and the corresponding amplitude.
 */
export interface WavePoint {
  t: number;           // Time in seconds
  value: number;       // Amplitude value at time t
  frequency?: number;  // Optional stored frequency for the wave
}

/**
 * Type of wave generation function.
 * All wave generators conform to this type signature.
 */
export type WaveGenerator = (
  frequency: number,
  amplitude: number,
  duration: number
) => WavePoint[];

/**
 * Generates a sine wave - the most basic waveform with a single frequency component.
 * Produces a smooth, pure tone with no additional harmonic content.
 * The formula is: value = amplitude * sin(2π * frequency * time)
 * 
 * @param frequency Frequency of the sine wave in Hz
 * @param amplitude Maximum amplitude of the wave
 * @param duration Duration of the wave in seconds
 * @returns Array of points representing the sine wave
 */
export function generateSineWave(
  frequency: number,
  amplitude: number,
  duration: number
): WavePoint[] {
  // Calculate the number of samples based on sample rate and duration
  const samples = Math.floor(SAMPLE_RATE * duration);
  const data: WavePoint[] = [];
  
  // Generate each sample point
  for (let i = 0; i < samples; i++) {
    // Calculate time for this sample
    const t = i / SAMPLE_RATE;
    
    // Calculate the sine value at this time
    // sin(2π * frequency * time) produces one complete cycle per 1/frequency seconds
    const value = amplitude * Math.sin(2 * Math.PI * frequency * t);
    
    // Add point to the result array
    data.push({ t, value, frequency });
  }
  
  return data;
}

/**
 * Generates a cosine wave - functionally identical to a sine wave but with a 90° phase shift.
 * Used when a specific phase relationship is needed.
 * The formula is: value = amplitude * cos(2π * frequency * time)
 * 
 * @param frequency Frequency of the cosine wave in Hz
 * @param amplitude Maximum amplitude of the wave
 * @param duration Duration of the wave in seconds
 * @returns Array of points representing the cosine wave
 */
export function generateCosineWave(
  frequency: number,
  amplitude: number,
  duration: number
): WavePoint[] {
  const samples = Math.floor(SAMPLE_RATE * duration);
  const data: WavePoint[] = [];
  
  for (let i = 0; i < samples; i++) {
    const t = i / SAMPLE_RATE;
    const value = amplitude * Math.cos(2 * Math.PI * frequency * t);
    data.push({ t, value, frequency });
  }
  
  return data;
}

/**
 * Generates a square wave - alternates between maximum and minimum amplitude values.
 * Creates a bright, buzzy tone rich in odd-numbered harmonics.
 * The formula is: value = amplitude * sign(sin(2π * frequency * time))
 * 
 * @param frequency Frequency of the square wave in Hz
 * @param amplitude Maximum amplitude of the wave
 * @param duration Duration of the wave in seconds
 * @returns Array of points representing the square wave
 */
export function generateSquareWave(
  frequency: number,
  amplitude: number,
  duration: number
): WavePoint[] {
  const samples = Math.floor(SAMPLE_RATE * duration);
  const data: WavePoint[] = [];
  
  for (let i = 0; i < samples; i++) {
    const t = i / SAMPLE_RATE;
    
    // Calculate period and position within period
    const period = 1 / frequency;
    const normalizedPosition = (t % period) / period;
    
    // Square wave is simply determined by position in cycle:
    // First half of cycle: positive amplitude
    // Second half of cycle: negative amplitude
    const value = normalizedPosition < 0.5 ? amplitude : -amplitude;
    
    data.push({ t, value, frequency });
  }
  
  return data;
}

/**
 * Generates a sawtooth wave - linear ramp from minimum to maximum value, then sudden drop.
 * Creates a bright, harsh tone containing both odd and even harmonics.
 * The formula is: value = amplitude * (2 * (t*frequency % 1) - 1)
 * 
 * @param frequency Frequency of the sawtooth wave in Hz
 * @param amplitude Maximum amplitude of the wave
 * @param duration Duration of the wave in seconds
 * @returns Array of points representing the sawtooth wave
 */
export function generateSawtoothWave(
  frequency: number,
  amplitude: number,
  duration: number
): WavePoint[] {
  const samples = Math.floor(SAMPLE_RATE * duration);
  const data: WavePoint[] = [];
  
  for (let i = 0; i < samples; i++) {
    const t = i / SAMPLE_RATE;
    
    // Sawtooth wave rises linearly from -amplitude to +amplitude over each period
    // (t * frequency) gives how many cycles have occurred
    // % 1 gives position within current cycle (0 to 1)
    // * 2 - 1 scales to range -1 to 1
    const normalizedPosition = (t * frequency) % 1;
    const value = amplitude * (2 * normalizedPosition - 1);
    
    data.push({ t, value, frequency });
  }
  
  return data;
}

/**
 * Generates an inverse sawtooth wave - linear ramp down, then sudden rise.
 * The formula is: value = amplitude * (1 - 2 * (t*frequency % 1))
 * 
 * @param frequency Frequency of the inverse sawtooth wave in Hz
 * @param amplitude Maximum amplitude of the wave
 * @param duration Duration of the wave in seconds
 * @returns Array of points representing the inverse sawtooth wave
 */
export function generateInverseSawtoothWave(
  frequency: number,
  amplitude: number,
  duration: number
): WavePoint[] {
  const samples = Math.floor(SAMPLE_RATE * duration);
  const data: WavePoint[] = [];
  
  for (let i = 0; i < samples; i++) {
    const t = i / SAMPLE_RATE;
    
    // Inverse sawtooth falls linearly from +amplitude to -amplitude
    const normalizedPosition = (t * frequency) % 1;
    const value = amplitude * (1 - 2 * normalizedPosition);
    
    data.push({ t, value, frequency });
  }
  
  return data;
}

/**
 * Generates a triangle wave - linear ramp up and down.
 * Creates a mellow tone with only odd harmonics that decrease rapidly with frequency.
 * The formula uses a piecewise linear function over four segments of the period.
 * 
 * @param frequency Frequency of the triangle wave in Hz
 * @param amplitude Maximum amplitude of the wave
 * @param duration Duration of the wave in seconds
 * @returns Array of points representing the triangle wave
 */
export function generateTriangleWave(
  frequency: number,
  amplitude: number,
  duration: number
): WavePoint[] {
  const samples = Math.floor(SAMPLE_RATE * duration);
  const data: WavePoint[] = [];
  
  for (let i = 0; i < samples; i++) {
    const t = i / SAMPLE_RATE;
    
    // Determine position within one cycle (0 to 1)
    const normalizedPosition = (t * frequency) % 1;
    
    // Triangle wave has different slopes in different portions of the cycle
    let value;
    if (normalizedPosition < 0.25) {
      // First quarter: rise from 0 to amplitude
      value = amplitude * (4 * normalizedPosition);
    } else if (normalizedPosition < 0.75) {
      // Second and third quarters: fall from amplitude to -amplitude
      value = amplitude * (2 - 4 * normalizedPosition);
    } else {
      // Fourth quarter: rise from -amplitude to 0
      value = amplitude * (4 * normalizedPosition - 4);
    }
    
    data.push({ t, value, frequency });
  }
  
  return data;
}

/**
 * Generates white noise - random values with uniform distribution.
 * Creates a hissing sound with equal energy across all frequencies.
 * 
 * @param amplitude Maximum amplitude of the noise
 * @param duration Duration of the noise in seconds
 * @returns Array of points representing white noise
 */
export function generateWhiteNoise(
  amplitude: number,
  duration: number
): WavePoint[] {
  const samples = Math.floor(SAMPLE_RATE * duration);
  const data: WavePoint[] = [];
  
  for (let i = 0; i < samples; i++) {
    const t = i / SAMPLE_RATE;
    
    // Random value between -amplitude and +amplitude
    const value = amplitude * (2 * Math.random() - 1);
    
    data.push({ t, value });
  }
  
  return data;
}

/**
 * Generates a pulse wave with variable duty cycle.
 * The duty cycle controls the proportion of high vs low state.
 * 
 * @param frequency Frequency of the pulse wave in Hz
 * @param amplitude Maximum amplitude of the wave
 * @param duration Duration of the wave in seconds
 * @param dutyCycle Proportion of period at high value (0.0 to 1.0)
 * @returns Array of points representing the pulse wave
 */
export function generatePulseWave(
  frequency: number,
  amplitude: number,
  duration: number,
  dutyCycle: number = 0.5
): WavePoint[] {
  // Clamp duty cycle to valid range
  const clampedDutyCycle = Math.max(0, Math.min(1, dutyCycle));
  
  const samples = Math.floor(SAMPLE_RATE * duration);
  const data: WavePoint[] = [];
  
  for (let i = 0; i < samples; i++) {
    const t = i / SAMPLE_RATE;
    
    // Determine position within one cycle (0 to 1)
    const normalizedPosition = (t * frequency) % 1;
    
    // Output is high for duty cycle portion of the period, low for the rest
    const value = normalizedPosition < clampedDutyCycle ? amplitude : -amplitude;
    
    data.push({ t, value, frequency });
  }
  
  return data;
}

/**
 * Combines multiple waves by adding them together.
 * This is the principle of wave superposition in physics.
 * 
 * @param waveArrays Arrays of wave points to combine
 * @param amplitudeScaling Scaling factor to prevent clipping (0.0 to 1.0)
 * @returns Array of points representing the combined wave
 */
export function combineWaves(
  waveArrays: WavePoint[][],
  amplitudeScaling: number = 0.8
): WavePoint[] {
  if (waveArrays.length === 0) {
    return [];
  }
  
  // Use the first wave's length and time points as reference
  const referenceWave = waveArrays[0];
  const result: WavePoint[] = [];
  
  for (let i = 0; i < referenceWave.length; i++) {
    const t = referenceWave[i].t;
    
    // Sum the values from all waves at this time point
    let sumValue = 0;
    for (const wave of waveArrays) {
      // Ensure we don't go out of bounds
      if (i < wave.length) {
        sumValue += wave[i].value;
      }
    }
    
    // Apply scaling to prevent clipping
    sumValue *= amplitudeScaling;
    
    // Add the combined point to the result
    result.push({ t, value: sumValue });
  }
  
  return result;
}

/**
 * Creates a wave with a specified number of harmonics based on a fundamental frequency.
 * Used to demonstrate Fourier synthesis by adding together harmonically related waves.
 * 
 * @param fundamentalFrequency Base frequency in Hz
 * @param harmonicWeights Array of amplitude weights for each harmonic
 * @param baseAmplitude Maximum amplitude for the fundamental frequency
 * @param duration Duration of the wave in seconds
 * @returns Array of points representing the harmonic wave
 */
export function generateHarmonicWave(
  fundamentalFrequency: number,
  harmonicWeights: number[],
  baseAmplitude: number,
  duration: number
): WavePoint[] {
  // Array to store all harmonics
  const harmonics: WavePoint[][] = [];
  
  // Generate each harmonic
  for (let i = 0; i < harmonicWeights.length; i++) {
    if (harmonicWeights[i] !== 0) {
      const harmonicNumber = i + 1;
      const frequency = fundamentalFrequency * harmonicNumber;
      const amplitude = baseAmplitude * harmonicWeights[i];
      
      // Use sine wave for each harmonic
      harmonics.push(generateSineWave(frequency, amplitude, duration));
    }
  }
  
  // Combine all harmonics
  return combineWaves(harmonics);
}

/**
 * Generates a square wave using Fourier synthesis (sum of odd sine harmonics).
 * Demonstrates the mathematical relationship between square waves and sinusoids.
 * 
 * @param frequency Frequency of the square wave in Hz
 * @param amplitude Maximum amplitude of the wave
 * @param duration Duration of the wave in seconds
 * @param numHarmonics Number of harmonics to include
 * @returns Array of points representing the synthesized square wave
 */
export function generateSquareWaveFourier(
  frequency: number,
  amplitude: number,
  duration: number,
  numHarmonics: number = 10
): WavePoint[] {
  const harmonics: WavePoint[][] = [];
  
  // Square wave consists of odd harmonics with amplitude 1/n
  for (let n = 1; n <= numHarmonics * 2; n += 2) {
    const harmonicFrequency = frequency * n;
    const harmonicAmplitude = amplitude * (4 / (n * Math.PI));
    
    harmonics.push(generateSineWave(harmonicFrequency, harmonicAmplitude, duration));
  }
  
  return combineWaves(harmonics);
}

/**
 * Generates a sawtooth wave using Fourier synthesis (sum of all sine harmonics).
 * Demonstrates the mathematical relationship between sawtooth waves and sinusoids.
 * 
 * @param frequency Frequency of the sawtooth wave in Hz
 * @param amplitude Maximum amplitude of the wave
 * @param duration Duration of the wave in seconds
 * @param numHarmonics Number of harmonics to include
 * @returns Array of points representing the synthesized sawtooth wave
 */
export function generateSawtoothWaveFourier(
  frequency: number,
  amplitude: number,
  duration: number,
  numHarmonics: number = 10
): WavePoint[] {
  const harmonics: WavePoint[][] = [];
  
  // Sawtooth wave consists of all harmonics with alternating signs
  for (let n = 1; n <= numHarmonics; n++) {
    const harmonicFrequency = frequency * n;
    const harmonicAmplitude = amplitude * (2 / (n * Math.PI)) * (n % 2 === 0 ? -1 : 1);
    
    harmonics.push(generateSineWave(harmonicFrequency, harmonicAmplitude, duration));
  }
  
  return combineWaves(harmonics);
}

/**
 * Generates a triangle wave using Fourier synthesis (sum of odd sine harmonics with specific phases).
 * Demonstrates the mathematical relationship between triangle waves and sinusoids.
 * 
 * @param frequency Frequency of the triangle wave in Hz
 * @param amplitude Maximum amplitude of the wave
 * @param duration Duration of the wave in seconds
 * @param numHarmonics Number of harmonics to include
 * @returns Array of points representing the synthesized triangle wave
 */
export function generateTriangleWaveFourier(
  frequency: number,
  amplitude: number,
  duration: number,
  numHarmonics: number = 10
): WavePoint[] {
  const harmonics: WavePoint[][] = [];
  
  // Triangle wave consists of odd harmonics with amplitude 1/n^2
  for (let n = 1; n <= numHarmonics * 2; n += 2) {
    const harmonicFrequency = frequency * n;
    const harmonicAmplitude = amplitude * (8 / (Math.PI * Math.PI * n * n)) * (n % 4 === 1 ? 1 : -1);
    
    harmonics.push(generateSineWave(harmonicFrequency, harmonicAmplitude, duration));
  }
  
  return combineWaves(harmonics);
}

/**
 * Applies an amplitude envelope to a wave.
 * Used to shape the volume of a sound over time (e.g., ADSR envelope).
 * 
 * @param wavePoints Original wave points
 * @param attackTime Time (seconds) for volume to reach maximum
 * @param decayTime Time (seconds) to fall to sustain level
 * @param sustainLevel Sustained amplitude level (0.0 to 1.0)
 * @param releaseTime Time (seconds) to fall from sustain to zero
 * @returns Wave points with envelope applied
 */
export function applyEnvelope(
  wavePoints: WavePoint[],
  attackTime: number,
  decayTime: number,
  sustainLevel: number,
  releaseTime: number
): WavePoint[] {
  // Calculate timing parameters
  const totalDuration = wavePoints[wavePoints.length - 1].t;
  const attackEnd = attackTime;
  const decayEnd = attackEnd + decayTime;
  const releaseStart = totalDuration - releaseTime;
  
  // Ensure sustain level is between 0 and 1
  const clampedSustainLevel = Math.max(0, Math.min(1, sustainLevel));
  
  // Apply envelope
  return wavePoints.map(point => {
    const t = point.t;
    let envelopeGain;
    
    if (t < attackEnd) {
      // Attack phase: linear increase from 0 to 1
      envelopeGain = t / attackTime;
    } else if (t < decayEnd) {
      // Decay phase: linear decrease from 1 to sustainLevel
      envelopeGain = 1 - (1 - clampedSustainLevel) * ((t - attackEnd) / decayTime);
    } else if (t < releaseStart) {
      // Sustain phase
      envelopeGain = clampedSustainLevel;
    } else {
      // Release phase: linear decrease from sustainLevel to 0
      envelopeGain = clampedSustainLevel * (1 - (t - releaseStart) / releaseTime);
    }
    
    // Apply envelope to amplitude
    return {
      t: point.t,
      value: point.value * envelopeGain,
      frequency: point.frequency
    };
  });
}

/**
 * Applies a frequency modulation to a carrier wave.
 * Creates complex timbres through FM synthesis.
 * 
 * @param carrierFrequency Base frequency of the sound in Hz
 * @param modulatorFrequency Frequency of the modulating oscillator in Hz
 * @param modulationIndex Amount of modulation (higher = more complex sound)
 * @param amplitude Maximum amplitude of the output
 * @param duration Duration of the sound in seconds
 * @returns Array of points representing the FM synthesized wave
 */
export function generateFMWave(
  carrierFrequency: number,
  modulatorFrequency: number,
  modulationIndex: number,
  amplitude: number,
  duration: number
): WavePoint[] {
  const samples = Math.floor(SAMPLE_RATE * duration);
  const data: WavePoint[] = [];
  
  for (let i = 0; i < samples; i++) {
    const t = i / SAMPLE_RATE;
    
    // FM synthesis formula: A * sin(2π * fc * t + I * sin(2π * fm * t))
    // where fc is carrier frequency, fm is modulator frequency, I is modulation index
    
    // Calculate the modulation term
    const modulation = modulationIndex * Math.sin(2 * Math.PI * modulatorFrequency * t);
    
    // Apply modulation to the carrier
    const value = amplitude * Math.sin(2 * Math.PI * carrierFrequency * t + modulation);
    
    data.push({ t, value, frequency: carrierFrequency });
  }
  
  return data;
}

/**
 * Modifies a wave by applying frequency-dependent amplitude scaling.
 * Simulates the effect of a filter on the signal.
 * 
 * @param wavePoints Original wave points
 * @param filterType Type of filter (lowpass, highpass, bandpass, etc.)
 * @param cutoffFrequency Frequency at which filtering begins
 * @param resonance Emphasis at the cutoff frequency
 * @returns Wave points with filter applied
 */
export function applyFilter(
  wavePoints: WavePoint[],
  filterType: 'lowpass' | 'highpass' | 'bandpass',
  cutoffFrequency: number,
  resonance: number = 1.0
): WavePoint[] {
  // Filter implementation would typically use a more sophisticated
  // algorithm like Butterworth or Biquad filters.
  // This is a simple approximation for demonstration purposes.
  
  // For a realistic implementation, we would need to use proper digital
  // filter theory, which is beyond the scope of this demonstration.
  
  // Placeholder returning the original wave
  // In a real implementation, this would analyze the frequency content
  // and apply appropriate attenuation/emphasis
  return [...wavePoints];
}

/**
 * Factory function to create a wave generator by name.
 * Provides a unified interface for accessing wave generators.
 * 
 * @param type The type of wave to generate
 * @returns A function that generates the specified wave type
 */
export function getWaveGenerator(
  type: 'sine' | 'cosine' | 'square' | 'sawtooth' | 'triangle' | 'pulse'
): WaveGenerator {
  switch (type) {
    case 'sine':
      return generateSineWave;
    case 'cosine':
      return generateCosineWave;
    case 'square':
      return generateSquareWave;
    case 'sawtooth':
      return generateSawtoothWave;
    case 'triangle':
      return generateTriangleWave;
    case 'pulse':
      return (frequency, amplitude, duration) => 
        generatePulseWave(frequency, amplitude, duration);
    default:
      // Default to sine wave
      return generateSineWave;
  }
}