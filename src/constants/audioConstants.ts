/**
 * Constants related to audio processing, generation, and analysis.
 * This file centralizes all audio configuration parameters used throughout the application.
 */

/**
 * Sample rate for audio processing (samples per second).
 * 44100 Hz is the standard CD-quality audio rate and provides sufficient
 * frequency resolution for analyzing signals up to ~22kHz (Nyquist limit).
 */
export const SAMPLE_RATE = 44100;

/**
 * Maximum amplitude value for 16-bit PCM audio.
 * In 16-bit audio, values range from -32768 to 32767 (2^15).
 * This constant sets the upper bound for amplitude values.
 */
export const MAX_AMPLITUDE = 32767;

/**
 * Default duration (in seconds) for wave visualization.
 * This shorter duration is used for displaying waves in charts to show
 * a meaningful portion of waveform cycles while maintaining detail.
 */
export const DEFAULT_DURATION = 0.02;

/**
 * Default duration (in seconds) for audio playback.
 * This longer duration is used when generating audio for playback to
 * provide an adequate listening experience.
 */
export const AUDIO_DURATION = 1.0;

/**
 * Minimum frequency (in Hz) for audible tones.
 * The typical lower limit of human hearing is around 20Hz.
 */
export const MIN_FREQUENCY = 20;

/**
 * Maximum frequency (in Hz) for frequency analysis.
 * The typical upper limit of human hearing is around 20kHz,
 * but we limit analysis to frequencies below 2kHz for clearer visualization.
 */
export const MAX_ANALYSIS_FREQUENCY = 2000;

/**
 * Bit depth for audio processing.
 * 16-bit is standard for CD-quality audio.
 * Used for initializing audio contexts.
 */
export const BIT_DEPTH = 16;

/**
 * Available wave types in the application.
 * These types represent different waveform patterns that can be
 * generated and analyzed in the application.
 */
export const WAVE_TYPES = {
  /**
   * Sine wave - smooth, pure tone with a single frequency component.
   * Fundamental building block in Fourier analysis.
   */
  SINE: 'Синусоида',
  
  /**
   * Square wave - alternates between two fixed values.
   * Contains only odd-numbered harmonics.
   */
  SQUARE: 'Прямоугольная',
  
  /**
   * Sawtooth wave - linear rise followed by sharp fall.
   * Contains all harmonics, both odd and even.
   */
  SAWTOOTH: 'Пилообразная',
  
  /**
   * Triangle wave - linear rise and fall.
   * Contains only odd-numbered harmonics with faster amplitude decay.
   */
  TRIANGLE: 'Треугольная',
  
  /**
   * Custom waveform - user-defined or complex waveform.
   * Used for special cases or user-generated content.
   */
  CUSTOM: 'Пользовательская'
};

/**
 * Default FFT size for spectral analysis.
 * Higher values provide better frequency resolution at the cost of
 * reduced temporal resolution. Power of 2 values (2^n) are required.
 * 2048 provides good balance between detail and performance.
 */
export const DEFAULT_FFT_SIZE = 2048;

/**
 * Interface for audio processing options.
 * Used to provide consistent configuration parameters across components.
 */
export interface AudioProcessingOptions {
  sampleRate: number;
  bitDepth: number;
  channels: number;
  duration: number;
}

/**
 * Default audio processing options.
 * Provides standard configuration values for audio processing functions.
 */
export const DEFAULT_AUDIO_OPTIONS: AudioProcessingOptions = {
  sampleRate: SAMPLE_RATE,
  bitDepth: BIT_DEPTH,
  channels: 1, // Mono audio
  duration: AUDIO_DURATION
};

/**
 * Maximum number of harmonics to consider in Fourier analysis.
 * Limiting the number of harmonics improves performance while still
 * capturing the essential characteristics of most audio signals.
 */
export const MAX_HARMONICS = 50;

/**
 * Default number of harmonics to use in Fourier reconstruction.
 * This value represents a reasonable starting point that captures
 * the fundamental character of most waveforms.
 */
export const DEFAULT_HARMONICS = 10;

/**
 * ADSR (Attack, Decay, Sustain, Release) envelope parameters.
 * These values define the amplitude envelope for synthesized notes.
 */
export const ENVELOPE_SETTINGS = {
  // Attack time as percentage of total duration
  ATTACK: 0.1,
  // Decay time as percentage of total duration
  DECAY: 0.1,
  // Sustain level as percentage of maximum amplitude
  SUSTAIN: 0.7,
  // Release time as percentage of total duration
  RELEASE: 0.2
};

/**
 * WebAudio API initialization options.
 * Used when creating AudioContext instances.
 */
export const AUDIO_CONTEXT_OPTIONS = {
  // Sample rate matching our constant
  sampleRate: SAMPLE_RATE,
  // For best audio quality
  latencyHint: 'interactive'
};