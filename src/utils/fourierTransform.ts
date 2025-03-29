/**
 * Fourier Transform utilities for sound wave analysis and synthesis.
 * This file provides functions for decomposing waves into frequency components
 * and reconstructing waves from spectral data.
 */

import { WavePoint } from './waveGenerators';
import { SAMPLE_RATE } from '@/constants/audioConstants';

/**
 * Interface for Fourier series coefficients
 */
export interface FourierCoefficients {
  a0: number;            // DC component (constant term)
  a: number[];           // Cosine coefficients
  b: number[];           // Sine coefficients
}

/**
 * Interface for spectral data points
 */
export interface SpectralPoint {
  harmonic: number;      // Harmonic number or frequency bin
  frequency?: number;    // Optional frequency in Hz
  amplitude: number;     // Amplitude of the harmonic
  type?: string;         // Optional type/category (e.g., "DC", "Harmonic")
  phase?: number;        // Optional phase information in radians
}

/**
 * Calculates Fourier series coefficients for a periodic waveform.
 * Decomposes a wave into its harmonic components.
 * 
 * @param waveData Array of points representing the waveform
 * @param maxHarmonics Maximum number of harmonics to calculate
 * @returns Object containing Fourier coefficients (a0, a[], b[])
 */
export function calculateFourierCoefficients(
  waveData: WavePoint[], 
  maxHarmonics: number
): FourierCoefficients {
  // Initialize result object with empty coefficient arrays
  const coefficients: FourierCoefficients = { 
    a0: 0, 
    a: Array(maxHarmonics).fill(0), 
    b: Array(maxHarmonics).fill(0) 
  };
  
  // If no data or no frequency information, return empty coefficients
  if (waveData.length === 0 || !waveData[0].frequency) {
    return coefficients;
  }
  
  const N = waveData.length;
  const fundamentalFrequency = waveData[0].frequency!;
  
  // Calculate DC component (a0) - average of all values
  for (let i = 0; i < N; i++) {
    coefficients.a0 += waveData[i].value;
  }
  coefficients.a0 /= N;
  
  // Calculate coefficients for each harmonic
  for (let n = 1; n <= maxHarmonics; n++) {
    let an = 0; // Cosine coefficient
    let bn = 0; // Sine coefficient
    
    // Perform discrete approximation of continuous Fourier integral
    for (let i = 0; i < N; i++) {
      const t = waveData[i].t;
      const value = waveData[i].value;
      const angle = 2 * Math.PI * n * fundamentalFrequency * t;
      
      // Accumulate contribution to cosine coefficient
      an += value * Math.cos(angle);
      
      // Accumulate contribution to sine coefficient
      bn += value * Math.sin(angle);
    }
    
    // Normalize by number of samples and multiply by 2 (Fourier series formula)
    coefficients.a[n - 1] = (2 / N) * an;
    coefficients.b[n - 1] = (2 / N) * bn;
  }
  
  return coefficients;
}

/**
 * Reconstructs a waveform from Fourier coefficients.
 * Creates a time-domain representation from frequency-domain components.
 * 
 * @param coefficients Fourier coefficients object
 * @param duration Duration of the output waveform in seconds
 * @param frequency Fundamental frequency of the waveform
 * @param numHarmonics Number of harmonics to include in reconstruction
 * @returns Array of points representing the reconstructed waveform
 */
/**
 * Reconstructs a waveform from Fourier coefficients with better accuracy
 */
export function reconstructWaveFromFourier(
  coefficients: FourierCoefficients,
  duration: number,
  frequency: number,
  numHarmonics: number
): WavePoint[] {
  // Calculate number of samples based on sample rate and duration
  const samples = Math.floor(SAMPLE_RATE * duration);
  const data: WavePoint[] = [];
  
  // Limit number of harmonics to available coefficients
  const actualHarmonics = Math.min(numHarmonics, coefficients.a.length, coefficients.b.length);
  
  // Create each sample point
  for (let i = 0; i < samples; i++) {
    const t = i / SAMPLE_RATE; // Time in seconds
    
    // Start with DC component
    let value = coefficients.a0;
    
    // Add contribution from each harmonic with proper phase preservation
    for (let n = 0; n < actualHarmonics; n++) {
      const harmonicNum = n + 1;
      const an = coefficients.a[n];
      const bn = coefficients.b[n];
      const angle = 2 * Math.PI * harmonicNum * frequency * t;
      
      // Add the harmonic components
      value += an * Math.cos(angle) + bn * Math.sin(angle);
    }
    
    // Add point to result array
    data.push({ t, value, frequency });
  }
  
  return data;
}

/**
 * Converts Fourier coefficients to amplitude and phase representation.
 * This representation is often more intuitive for understanding the spectrum.
 * 
 * @param coefficients Fourier coefficients object
 * @returns Array of amplitude and phase values for each harmonic
 */
export function convertToAmplitudePhase(
  coefficients: FourierCoefficients
): Array<{ harmonic: number; amplitude: number; phase: number }> {
  const result = [];
  
  // Process DC component (special case)
  result.push({
    harmonic: 0,
    amplitude: Math.abs(coefficients.a0),
    phase: coefficients.a0 >= 0 ? 0 : Math.PI // 0 or π phase for DC
  });
  
  // Process all harmonics
  for (let n = 0; n < coefficients.a.length; n++) {
    const an = coefficients.a[n];
    const bn = coefficients.b[n];
    
    // Calculate amplitude using Pythagorean theorem
    const amplitude = Math.sqrt(an * an + bn * bn);
    
    // Calculate phase using arctangent
    // atan2 properly handles the quadrant based on signs of an and bn
    let phase = Math.atan2(bn, an);
    
    // Ensure phase is in range [0, 2π)
    if (phase < 0) {
      phase += 2 * Math.PI;
    }
    
    result.push({
      harmonic: n + 1,
      amplitude,
      phase
    });
  }
  
  return result;
}

/**
 * Converts amplitude and phase representation back to Fourier coefficients.
 * 
 * @param amplitudePhase Array of amplitude and phase values
 * @returns Fourier coefficients object
 */
export function convertToFourierCoefficients(
  amplitudePhase: Array<{ harmonic: number; amplitude: number; phase: number }>
): FourierCoefficients {
  // Initialize result
  const result: FourierCoefficients = { a0: 0, a: [], b: [] };
  
  // Find the maximum harmonic number to determine array sizes
  const maxHarmonic = Math.max(...amplitudePhase.map(item => item.harmonic));
  
  // Initialize arrays with zeros
  result.a = Array(maxHarmonic).fill(0);
  result.b = Array(maxHarmonic).fill(0);
  
  // Process each harmonic
  for (const item of amplitudePhase) {
    if (item.harmonic === 0) {
      // DC component
      result.a0 = item.amplitude * (item.phase < Math.PI / 2 ? 1 : -1);
    } else {
      // Regular harmonic
      const index = item.harmonic - 1;
      
      // Convert from amplitude/phase to a/b coefficients
      result.a[index] = item.amplitude * Math.cos(item.phase);
      result.b[index] = item.amplitude * Math.sin(item.phase);
    }
  }
  
  return result;
}

/**
 * Prepares spectral data for visualization from Fourier coefficients.
 * Creates an array of points representing the spectrum of the signal.
 * 
 * @param coefficients Fourier coefficients object
 * @param fundamentalFrequency Optional frequency of the first harmonic
 * @returns Array of spectral points suitable for visualization
 */
export function prepareSpectralData(
  coefficients: FourierCoefficients,
  fundamentalFrequency?: number
): SpectralPoint[] {
  const spectral: SpectralPoint[] = [];
  
  // Add DC component
  spectral.push({ 
    harmonic: 0, 
    amplitude: Math.abs(coefficients.a0), 
    type: 'DC',
    ...(fundamentalFrequency && { frequency: 0 })
  });
  
  // Add all harmonics
  for (let i = 0; i < coefficients.a.length; i++) {
    const harmonicNum = i + 1;
    const an = coefficients.a[i];
    const bn = coefficients.b[i];
    
    // Calculate amplitude using Pythagorean theorem
    const amplitude = Math.sqrt(an * an + bn * bn);
    
    // Calculate phase
    const phase = Math.atan2(bn, an);
    
    spectral.push({
      harmonic: harmonicNum,
      amplitude,
      phase,
      type: 'Harmonic',
      ...(fundamentalFrequency && { frequency: fundamentalFrequency * harmonicNum })
    });
  }
  
  return spectral;
}

/**
 * Calculates accuracy of Fourier reconstruction compared to original waveform.
 * Uses Mean Squared Error (MSE) and normalized accuracy metrics.
 * 
 * @param original Original waveform points
 * @param reconstructed Reconstructed waveform points
 * @returns Object containing MSE and normalized accuracy percentage
 */
/**
 * Calculates accuracy of Fourier reconstruction compared to original waveform.
 * Uses normalized Mean Squared Error (MSE) for more reliable accuracy metrics.
 * 
 * @param original Original waveform points
 * @param reconstructed Reconstructed waveform points
 * @returns Object containing MSE and normalized accuracy percentage
 */
export function calculateReconstructionAccuracy(
  original: WavePoint[],
  reconstructed: WavePoint[]
): { mse: number; accuracyPercent: number } {
  // If either array is empty, return zero accuracy
  if (original.length === 0 || reconstructed.length === 0) {
    return { mse: Infinity, accuracyPercent: 0 };
  }
  
  // Sample at regular intervals for comparison
  const numSamples = 1000;
  const originalSamples: number[] = [];
  const reconstructedSamples: number[] = [];
  
  // Find the common time range
  const originalDuration = original[original.length - 1].t - original[0].t;
  const reconstructedDuration = reconstructed[reconstructed.length - 1].t - reconstructed[0].t;
  const duration = Math.min(originalDuration, reconstructedDuration);
  
  // Sample both waveforms at matching time points
  for (let i = 0; i < numSamples; i++) {
    const t = original[0].t + (i * duration / numSamples);
    
    // Find closest points in both waves
    const origIndex = findClosestPointIndex(original, t);
    const reconIndex = findClosestPointIndex(reconstructed, t);
    
    if (origIndex >= 0 && reconIndex >= 0) {
      originalSamples.push(original[origIndex].value);
      reconstructedSamples.push(reconstructed[reconIndex].value);
    }
  }
  
  // Calculate mean squared error
  let sumSquaredDiff = 0;
  let sumSquaredOriginal = 0;
  
  for (let i = 0; i < originalSamples.length; i++) {
    const diff = originalSamples[i] - reconstructedSamples[i];
    sumSquaredDiff += diff * diff;
    sumSquaredOriginal += originalSamples[i] * originalSamples[i];
  }
  
  // Calculate MSE
  const mse = sumSquaredDiff / originalSamples.length;
  
  // Calculate normalized error as a percentage of original power
  const originalPower = sumSquaredOriginal / originalSamples.length;
  
  // Calculate accuracy percentage using simple normalization
  let accuracyPercent;
  
  if (originalPower > 0) {
    // Calculate normalized error ratio (0 to 1, where 0 is perfect)
    // Limit to 1.0 maximum error ratio
    const errorRatio = Math.min(1, mse / originalPower);
    
    // Convert to accuracy percentage (100% means perfect reconstruction)
    accuracyPercent = 100 * (1 - errorRatio);
  } else {
    // Edge case: if original signal is all zeros
    accuracyPercent = mse === 0 ? 100 : 0;
  }
  
  // Ensure the value is within bounds
  accuracyPercent = Math.max(0, Math.min(100, accuracyPercent));
  
  return { mse, accuracyPercent };
}

/**
 * Helper function to find the index of the point with the closest time value.
 * 
 * @param points Array of wave points
 * @param time Target time value
 * @returns Index of the closest point, or -1 if array is empty
 */
// function findClosestPointIndex(points: WavePoint[], time: number): number {
//   if (points.length === 0) return -1;
  
//   // If time is outside the range of points, return the closest endpoint
//   if (time <= points[0].t) return 0;
//   if (time >= points[points.length - 1].t) return points.length - 1;
  
//   // Use linear search for small arrays, binary search for larger ones
//   if (points.length < 100) {
//     // Linear search for small arrays
//     let closestIndex = 0;
//     let minDistance = Math.abs(points[0].t - time);
    
//     for (let i = 1; i < points.length; i++) {
//       const distance = Math.abs(points[i].t - time);
//       if (distance < minDistance) {
//         minDistance = distance;
//         closestIndex = i;
//       }
//     }
    
//     return closestIndex;
//   } else {
//     // Binary search for larger arrays
//     let left = 0;
//     let right = points.length - 1;
    
//     while (right - left > 1) {
//       const mid = Math.floor((left + right) / 2);
//       if (points[mid].t < time) {
//         left = mid;
//       } else {
//         right = mid;
//       }
//     }
    
//     // Determine which of the two closest points is actually closest
//     const leftDiff = Math.abs(points[left].t - time);
//     const rightDiff = Math.abs(points[right].t - time);
    
//     return leftDiff < rightDiff ? left : right;
//   }
// }
/**
 * Helper function to find the index of the point with the closest time value.
 * 
 * @param points Array of wave points
 * @param time Target time value
 * @returns Index of the closest point, or -1 if array is empty
 */
function findClosestPointIndex(points: WavePoint[], time: number): number {
  if (points.length === 0) return -1;
  
  // Binary search for more efficient lookup with large arrays
  let left = 0;
  let right = points.length - 1;
  
  // Handle edge cases
  if (time <= points[left].t) return left;
  if (time >= points[right].t) return right;
  
  // Binary search for the closest point
  while (right - left > 1) {
    const mid = Math.floor((left + right) / 2);
    if (points[mid].t < time) {
      left = mid;
    } else {
      right = mid;
    }
  }
  
  // Determine which of the two closest points is actually closest
  const leftDiff = Math.abs(points[left].t - time);
  const rightDiff = Math.abs(points[right].t - time);
  
  return leftDiff < rightDiff ? left : right;
}

/**
 * Performs Fast Fourier Transform (FFT) on a discrete signal.
 * More efficient than DFT for power-of-two sized inputs.
 * 
 * @param signal Input signal (should have length that is a power of 2)
 * @returns Object containing real and imaginary parts of the FFT
 */
export function fft(signal: number[]): { real: number[]; imag: number[] } {
  const n = signal.length;
  
  // Check if length is a power of 2
  if (n & (n - 1)) {
    throw new Error('FFT requires input length to be a power of 2');
  }
  
  // Base case
  if (n === 1) {
    return { real: [signal[0]], imag: [0] };
  }
  
  // Divide input into even and odd indices
  const even = signal.filter((_, i) => i % 2 === 0);
  const odd = signal.filter((_, i) => i % 2 === 1);
  
  // Recursive FFT on even and odd parts
  const evenResult = fft(even);
  const oddResult = fft(odd);
  
  // Combine results
  const real = new Array(n);
  const imag = new Array(n);
  
  for (let k = 0; k < n / 2; k++) {
    // Twiddle factor calculation
    const theta = -2 * Math.PI * k / n;
    const cosTheta = Math.cos(theta);
    const sinTheta = Math.sin(theta);
    
    // Complex multiplication with twiddle factor
    const oddRealK = oddResult.real[k];
    const oddImagK = oddResult.imag[k];
    const twiddledReal = oddRealK * cosTheta - oddImagK * sinTheta;
    const twiddledImag = oddRealK * sinTheta + oddImagK * cosTheta;
    
    // Combine even and odd parts
    real[k] = evenResult.real[k] + twiddledReal;
    imag[k] = evenResult.imag[k] + twiddledImag;
    
    real[k + n / 2] = evenResult.real[k] - twiddledReal;
    imag[k + n / 2] = evenResult.imag[k] - twiddledImag;
  }
  
  return { real, imag };
}

/**
 * Calculates the power spectrum from FFT results.
 * 
 * @param fftResult FFT output containing real and imaginary parts
 * @param sampleRate Sample rate of the original signal in Hz
 * @returns Array of spectral points with frequency and amplitude
 */
export function calculatePowerSpectrum(
  fftResult: { real: number[]; imag: number[] },
  sampleRate: number
): SpectralPoint[] {
  const { real, imag } = fftResult;
  const n = real.length;
  
  // We only need the first half of the FFT result (up to Nyquist frequency)
  const nyquistIndex = Math.floor(n / 2);
  const result: SpectralPoint[] = [];
  
  for (let i = 0; i <= nyquistIndex; i++) {
    // Calculate absolute value of complex number (magnitude)
    const amplitude = Math.sqrt(real[i] * real[i] + imag[i] * imag[i]) / n;
    
    // Calculate corresponding frequency for this bin
    const frequency = i * sampleRate / n;
    
    result.push({
      harmonic: i,
      frequency,
      amplitude,
      // Calculate phase if needed
      phase: Math.atan2(imag[i], real[i])
    });
  }
  
  return result;
}

/**
 * Filters Fourier coefficients to keep only significant harmonics.
 * Useful for removing noise and focusing on the most important components.
 * 
 * @param coefficients Original Fourier coefficients
 * @param threshold Amplitude threshold (relative to the largest harmonic)
 * @returns Filtered coefficients with small harmonics set to zero
 */
export function filterFourierCoefficients(
  coefficients: FourierCoefficients,
  threshold: number = 0.01
): FourierCoefficients {
  // Create a copy of the input
  const filtered: FourierCoefficients = {
    a0: coefficients.a0,
    a: [...coefficients.a],
    b: [...coefficients.b]
  };
  
  // Find the maximum amplitude
  let maxAmplitude = 0;
  for (let i = 0; i < coefficients.a.length; i++) {
    const amplitude = Math.sqrt(
      coefficients.a[i] * coefficients.a[i] + 
      coefficients.b[i] * coefficients.b[i]
    );
    maxAmplitude = Math.max(maxAmplitude, amplitude);
  }
  
  // Apply threshold
  const absoluteThreshold = maxAmplitude * threshold;
  
  for (let i = 0; i < filtered.a.length; i++) {
    const amplitude = Math.sqrt(
      filtered.a[i] * filtered.a[i] + 
      filtered.b[i] * filtered.b[i]
    );
    
    if (amplitude < absoluteThreshold) {
      filtered.a[i] = 0;
      filtered.b[i] = 0;
    }
  }
  
  return filtered;
}

/**
 * Extracts the dominant harmonics from Fourier coefficients.
 * Identifies the most significant frequency components.
 * 
 * @param coefficients Fourier coefficients
 * @param count Maximum number of harmonics to extract
 * @returns Array of top harmonics with their amplitudes and frequencies
 */
export function extractDominantHarmonics(
  coefficients: FourierCoefficients,
  count: number = 5
): Array<{ harmonic: number; amplitude: number }> {
  // Calculate amplitude for each harmonic
  const harmonics = coefficients.a.map((an, index) => {
    const bn = coefficients.b[index];
    const amplitude = Math.sqrt(an * an + bn * bn);
    return {
      harmonic: index + 1,
      amplitude
    };
  });
  
  // Sort by amplitude (descending)
  harmonics.sort((a, b) => b.amplitude - a.amplitude);
  
  // Return top N harmonics
  return harmonics.slice(0, count);
}