/**
 * Functions for generating ideal wave forms with optimized performance
 */
import { WavePoint } from '@/utils/waveGenerators';
import { SAMPLE_RATE } from '@/constants/audioConstants';

// Cache for wave generation results
const waveCache = new Map<string, WavePoint[]>();

/**
 * Clears the cached wave data
 */
export function clearWaveCache(): void {
  waveCache.clear();
}

/**
 * Creates a cache key for wave generation
 */
function createCacheKey(type: string, frequency: number, amplitude: number, duration: number): string {
  return `${type}_${frequency}_${amplitude}_${duration}`;
}

/**
 * Generates an ideal square wave with perfect vertical transitions
 * Uses adaptive sampling to focus points near transitions while using fewer points in flat areas
 * 
 * @param frequency Frequency of the wave in Hz
 * @param amplitude Maximum amplitude of the wave
 * @param duration Duration of the wave in seconds
 * @returns Array of points representing the ideal square wave
 */
export function generateIdealSquareWave(
  frequency: number,
  amplitude: number,
  duration: number
): WavePoint[] {
  // Check cache first
  const cacheKey = createCacheKey('square', frequency, amplitude, duration);
  if (waveCache.has(cacheKey)) {
    return waveCache.get(cacheKey)!;
  }
  
  // Calculate how many periods will fit in the duration
  const period = 1 / frequency;
  const numPeriods = Math.ceil(duration * frequency);
  
  // Use adaptive sampling - more points at transitions, fewer in flat areas
  const transitionPointsPerEdge = 2; // Points to add at each transition edge
  const flatAreaPointsPerHalfPeriod = 10; // Points in flat areas
  
  // Estimate total points needed
  const totalPoints = numPeriods * (2 * transitionPointsPerEdge + 2 * flatAreaPointsPerHalfPeriod);
  const data: WavePoint[] = [];
  data.length = totalPoints; // Pre-allocate for better performance
  
  let index = 0;
  
  for (let periodNum = 0; periodNum < numPeriods; periodNum++) {
    const periodStart = periodNum * period;
    const halfPeriod = period / 2;
    
    // First transition (rising edge)
    const firstTransition = periodStart;
    if (firstTransition < duration) {
      // Just before transition
      data[index++] = { 
        t: Math.max(0, firstTransition - 0.00001), 
        value: -amplitude, 
        frequency 
      };
      
      // At and just after transition
      data[index++] = { t: firstTransition, value: amplitude, frequency };
    }
    
    // Flat section after first transition
    const flatPoints1 = flatAreaPointsPerHalfPeriod;
    for (let i = 0; i < flatPoints1; i++) {
      const t = firstTransition + (i + 1) * (halfPeriod / (flatPoints1 + 1));
      if (t < duration) {
        data[index++] = { t, value: amplitude, frequency };
      }
    }
    
    // Second transition (falling edge)
    const secondTransition = periodStart + halfPeriod;
    if (secondTransition < duration) {
      // Just before transition
      data[index++] = { 
        t: Math.max(0, secondTransition - 0.00001), 
        value: amplitude, 
        frequency 
      };
      
      // At and just after transition
      data[index++] = { t: secondTransition, value: -amplitude, frequency };
    }
    
    // Flat section after second transition
    const flatPoints2 = flatAreaPointsPerHalfPeriod;
    for (let i = 0; i < flatPoints2; i++) {
      const t = secondTransition + (i + 1) * (halfPeriod / (flatPoints2 + 1));
      if (t < duration) {
        data[index++] = { t, value: -amplitude, frequency };
      }
    }
  }
  
  // Trim array to actual used size
  if (index < data.length) {
    data.length = index;
  }
  
  // Cache the result
  waveCache.set(cacheKey, data);
  
  return data;
}

/**
 * Generates an ideal sawtooth wave with perfect vertical transitions
 * Uses adaptive sampling for optimal performance
 * 
 * @param frequency Frequency of the wave in Hz
 * @param amplitude Maximum amplitude of the wave
 * @param duration Duration of the wave in seconds
 * @returns Array of points representing the ideal sawtooth wave
 */
export function generateIdealSawtoothWave(
  frequency: number,
  amplitude: number,
  duration: number
): WavePoint[] {
  // Check cache first
  const cacheKey = createCacheKey('sawtooth', frequency, amplitude, duration);
  if (waveCache.has(cacheKey)) {
    return waveCache.get(cacheKey)!;
  }
  
  const period = 1 / frequency;
  const numPeriods = Math.ceil(duration * frequency);
  
  // Adaptive sampling parameters
  const transitionPoints = 2; // Points at steep transitions
  const rampPoints = 20;      // Points along the ramp
  
  // Estimate total points needed and pre-allocate
  const totalPoints = numPeriods * (transitionPoints + rampPoints);
  const data: WavePoint[] = [];
  data.length = totalPoints;
  
  let index = 0;
  
  for (let periodNum = 0; periodNum < numPeriods; periodNum++) {
    const periodStart = periodNum * period;
    
    // Transition from max to min (reset point)
    const resetPoint = periodStart;
    if (resetPoint < duration) {
      // Point just before transition
      if (periodNum > 0) { // Skip for first period
        data[index++] = { 
          t: Math.max(0, resetPoint - 0.00001), 
          value: amplitude, 
          frequency 
        };
      }
      
      // Point at transition
      data[index++] = { t: resetPoint, value: -amplitude, frequency };
    }
    
    // Ramp points from min to max
    for (let i = 1; i <= rampPoints; i++) {
      const t = periodStart + (i * period / rampPoints);
      if (t < duration) {
        // Linear ramp from -amplitude to amplitude
        const value = -amplitude + (2 * amplitude * (i / rampPoints));
        data[index++] = { t, value, frequency };
      }
    }
  }
  
  // Trim array to actual used size
  if (index < data.length) {
    data.length = index;
  }
  
  // Cache the result
  waveCache.set(cacheKey, data);
  
  return data;
}

/**
 * Generates an ideal triangle wave with perfect linear segments
 * 
 * @param frequency Frequency of the wave in Hz
 * @param amplitude Maximum amplitude of the wave
 * @param duration Duration of the wave in seconds
 * @returns Array of points representing the ideal triangle wave
 */
export function generateIdealTriangleWave(
  frequency: number,
  amplitude: number,
  duration: number
): WavePoint[] {
  // Check cache first
  const cacheKey = createCacheKey('triangle', frequency, amplitude, duration);
  if (waveCache.has(cacheKey)) {
    return waveCache.get(cacheKey)!;
  }
  
  const period = 1 / frequency;
  const numPeriods = Math.ceil(duration * frequency);
  
  // Points per segment - use fewer points because triangle waves are linear
  const pointsPerQuarterPeriod = 5; 
  
  // Estimate total points needed and pre-allocate
  const totalPoints = numPeriods * 4 * pointsPerQuarterPeriod;
  const data: WavePoint[] = [];
  data.length = totalPoints;
  
  let index = 0;
  
  for (let periodNum = 0; periodNum < numPeriods; periodNum++) {
    const periodStart = periodNum * period;
    const quarterPeriod = period / 4;
    
    // First quarter: Rise from 0 to amplitude
    for (let i = 0; i <= pointsPerQuarterPeriod; i++) {
      const t = periodStart + (i * quarterPeriod / pointsPerQuarterPeriod);
      if (t < duration) {
        const value = amplitude * (i / pointsPerQuarterPeriod);
        data[index++] = { t, value, frequency };
      }
    }
    
    // Second quarter: Fall from amplitude to 0
    for (let i = 0; i <= pointsPerQuarterPeriod; i++) {
      const t = periodStart + quarterPeriod + (i * quarterPeriod / pointsPerQuarterPeriod);
      if (t < duration) {
        const value = amplitude * (1 - i / pointsPerQuarterPeriod);
        data[index++] = { t, value, frequency };
      }
    }
    
    // Third quarter: Fall from 0 to -amplitude
    for (let i = 0; i <= pointsPerQuarterPeriod; i++) {
      const t = periodStart + 2 * quarterPeriod + (i * quarterPeriod / pointsPerQuarterPeriod);
      if (t < duration) {
        const value = -amplitude * (i / pointsPerQuarterPeriod);
        data[index++] = { t, value, frequency };
      }
    }
    
    // Fourth quarter: Rise from -amplitude to 0
    for (let i = 0; i <= pointsPerQuarterPeriod; i++) {
      const t = periodStart + 3 * quarterPeriod + (i * quarterPeriod / pointsPerQuarterPeriod);
      if (t < duration) {
        const value = -amplitude * (1 - i / pointsPerQuarterPeriod);
        data[index++] = { t, value, frequency };
      }
    }
  }
  
  // Trim array to actual used size
  if (index < data.length) {
    data.length = index;
  }
  
  // Remove duplicate points at segment junctions
  const deduplicated = [data[0]];
  for (let i = 1; i < data.length; i++) {
    if (data[i].t !== data[i-1].t) {
      deduplicated.push(data[i]);
    }
  }
  
  // Cache the result
  waveCache.set(cacheKey, deduplicated);
  
  return deduplicated;
}

/**
 * Factory function to get the appropriate ideal wave generator based on wave type
 * 
 * @param waveType Type of wave to generate
 * @returns Function to generate the ideal wave
 */
export function getIdealWaveGenerator(waveType: string): (frequency: number, amplitude: number, duration: number) => WavePoint[] {
  switch (waveType) {
    case 'Прямоугольная':
      return generateIdealSquareWave;
    case 'Пилообразная':
      return generateIdealSawtoothWave;
    case 'Треугольная':
      return generateIdealTriangleWave;
    default:
      // For sine wave, the ideal is the same as generated
      return () => [];
  }
}