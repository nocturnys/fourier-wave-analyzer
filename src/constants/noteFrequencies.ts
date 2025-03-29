/**
 * Musical note frequencies and naming constants.
 * This file provides the frequency values for standard musical notes and their name mappings.
 */

/**
 * Standard note frequencies in Hz, based on A4 = 440 Hz and equal temperament tuning.
 * Covers the range from C4 (middle C) to C5 (an octave above), which is commonly used
 * for musical analysis and demonstration.
 */
export const NOTE_FREQUENCIES: Record<string, number> = {
    'C4': 261.63, // До первой октавы (middle C)
    'C#4': 277.18,
    'D4': 293.66, // Ре
    'D#4': 311.13,
    'E4': 329.63, // Ми
    'F4': 349.23, // Фа
    'F#4': 369.99,
    'G4': 392.00, // Соль
    'G#4': 415.30,
    'A4': 440.00, // Ля (standard reference pitch)
    'A#4': 466.16,
    'B4': 493.88, // Си
    'C5': 523.25  // До второй октавы (one octave above middle C)
  };
  
  /**
   * Extended note frequencies covering a wider range of octaves.
   * This expanded set includes notes from C2 to C7, covering the range of most musical instruments.
   * Frequencies are calculated using the formula: f = 440 * 2^((n-69)/12), where n is the MIDI note number.
   */
  export const EXTENDED_NOTE_FREQUENCIES: Record<string, number> = {
    // Octave 2
    'C2': 65.41,
    'C#2': 69.30,
    'D2': 73.42,
    'D#2': 77.78,
    'E2': 82.41,
    'F2': 87.31,
    'F#2': 92.50,
    'G2': 98.00,
    'G#2': 103.83,
    'A2': 110.00,
    'A#2': 116.54,
    'B2': 123.47,
    
    // Octave 3
    'C3': 130.81,
    'C#3': 138.59,
    'D3': 146.83,
    'D#3': 155.56,
    'E3': 164.81,
    'F3': 174.61,
    'F#3': 185.00,
    'G3': 196.00,
    'G#3': 207.65,
    'A3': 220.00,
    'A#3': 233.08,
    'B3': 246.94,
    
    // Octave 4 (same as NOTE_FREQUENCIES)
    'C4': 261.63,
    'C#4': 277.18,
    'D4': 293.66,
    'D#4': 311.13,
    'E4': 329.63,
    'F4': 349.23,
    'F#4': 369.99,
    'G4': 392.00,
    'G#4': 415.30,
    'A4': 440.00,
    'A#4': 466.16,
    'B4': 493.88,
    
    // Octave 5
    'C5': 523.25,
    'C#5': 554.37,
    'D5': 587.33,
    'D#5': 622.25,
    'E5': 659.25,
    'F5': 698.46,
    'F#5': 739.99,
    'G5': 783.99,
    'G#5': 830.61,
    'A5': 880.00,
    'A#5': 932.33,
    'B5': 987.77,
    
    // Octave 6
    'C6': 1046.50,
    'C#6': 1108.73,
    'D6': 1174.66,
    'D#6': 1244.51,
    'E6': 1318.51,
    'F6': 1396.91,
    'F#6': 1479.98,
    'G6': 1567.98,
    'G#6': 1661.22,
    'A6': 1760.00,
    'A#6': 1864.66,
    'B6': 1975.53,
    
    // Octave 7 - First note only
    'C7': 2093.00,
  };
  
  /**
   * Russian note names mapping (without octave)
   * Provides translation of note names from standard English notation to Russian notation.
   */
  export const NOTE_NAMES_RU: Record<string, string> = {
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
  
  /**
   * Alternative notation systems
   * Some musical traditions use different naming conventions for the same notes.
   */
  export const ALTERNATIVE_NOTATION: Record<string, Record<string, string>> = {
    // German/Northern European notation
    'GERMAN': {
      'H': 'B',   // In German notation, H represents B natural
      'B': 'Bb'   // In German notation, B represents B flat
    },
    // Solmization (Do-Re-Mi system)
    'SOLFEGE': {
      'C': 'Do',
      'D': 'Re',
      'E': 'Mi',
      'F': 'Fa',
      'G': 'Sol',
      'A': 'La',
      'B': 'Ti'
    }
  };
  
  /**
   * Major scale intervals in semitones
   * Used for calculating notes in a given major scale
   */
  export const MAJOR_SCALE_INTERVALS = [0, 2, 4, 5, 7, 9, 11];
  
  /**
   * Minor scale intervals in semitones (natural minor)
   * Used for calculating notes in a given minor scale
   */
  export const MINOR_SCALE_INTERVALS = [0, 2, 3, 5, 7, 8, 10];
  
  /**
   * Common musical interval ratios
   * These frequency ratios define the mathematical relationships between notes
   */
  export const INTERVAL_RATIOS = {
    'UNISON': 1,                   // Same note
    'MINOR_SECOND': Math.pow(2, 1/12),  // One semitone
    'MAJOR_SECOND': Math.pow(2, 2/12),  // Two semitones (whole tone)
    'MINOR_THIRD': Math.pow(2, 3/12),   // Three semitones
    'MAJOR_THIRD': Math.pow(2, 4/12),   // Four semitones
    'PERFECT_FOURTH': Math.pow(2, 5/12), // Five semitones
    'TRITONE': Math.pow(2, 6/12),       // Six semitones
    'PERFECT_FIFTH': Math.pow(2, 7/12),  // Seven semitones
    'MINOR_SIXTH': Math.pow(2, 8/12),    // Eight semitones
    'MAJOR_SIXTH': Math.pow(2, 9/12),    // Nine semitones
    'MINOR_SEVENTH': Math.pow(2, 10/12),  // Ten semitones
    'MAJOR_SEVENTH': Math.pow(2, 11/12),  // Eleven semitones
    'OCTAVE': 2                     // Twelve semitones
  };
  
  /**
   * Gets the frequency of a note by its name.
   * Falls back to extended frequencies if not found in the basic range.
   * @param noteName The name of the note (e.g., "A4", "C#5")
   * @returns The frequency in Hz, or undefined if not found
   */
  export function getNoteFrequency(noteName: string): number | undefined {
    return NOTE_FREQUENCIES[noteName] || EXTENDED_NOTE_FREQUENCIES[noteName];
  }
  
  /**
   * Calculates the frequency of any note by MIDI note number.
   * This allows getting frequencies outside the predefined constants.
   * @param midiNoteNumber The MIDI note number (A4 = 69)
   * @returns The frequency in Hz
   */
  export function getFrequencyByMidiNote(midiNoteNumber: number): number {
    // Standard formula: f = 440 * 2^((n-69)/12)
    return 440 * Math.pow(2, (midiNoteNumber - 69) / 12);
  }
  
  /**
   * Calculates the closest MIDI note number for a given frequency.
   * @param frequency The frequency in Hz
   * @returns The closest MIDI note number
   */
  export function getMidiNoteFromFrequency(frequency: number): number {
    // Inverse of the standard formula: n = 69 + 12*log2(f/440)
    return Math.round(69 + 12 * Math.log2(frequency / 440));
  }
  
  /**
   * Gets the note name from a frequency.
   * @param frequency The frequency in Hz
   * @returns Object containing the note name and cents deviation
   */
  export function getNoteFromFrequency(frequency: number): { 
    note: string; 
    cents: number 
  } {
    // Calculate the MIDI note number
    const midiNote = getMidiNoteFromFrequency(frequency);
    
    // Calculate cents deviation (1 semitone = 100 cents)
    const exactMidiNote = 69 + 12 * Math.log2(frequency / 440);
    const cents = Math.round((exactMidiNote - midiNote) * 100);
    
    // Convert MIDI note number to note name
    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const octave = Math.floor((midiNote - 12) / 12);
    const noteIndex = midiNote % 12;
    
    const note = noteNames[noteIndex] + octave;
    
    return { note, cents };
  }