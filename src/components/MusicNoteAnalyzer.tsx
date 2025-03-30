"use client";

import React, { useState, useEffect, useRef } from 'react';
import MusicSpectralChart from '@/components/MusicSpectralChart';
import { 
  identifyNote, 
  playAudioBuffer 
} from '@/utils/audioUtils';
import { SpectralPoint } from '@/utils/fourierTransform';
import { NOTE_FREQUENCIES, NOTE_NAMES_RU } from '@/constants/noteFrequencies';

/**
 * MusicNoteAnalyzer component - An interactive tool for analyzing musical notes and their spectral composition
 */
const MusicNoteAnalyzer: React.FC = () => {
  // State for note selection and audio parameters
  const [activeNotes, setActiveNotes] = useState<string[]>([]);
  const [waveformType, setWaveformType] = useState<string>('sine');
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [volume, setVolume] = useState<number>(0.5);
  
  // State for analysis results
  const [spectrum, setSpectrum] = useState<SpectralPoint[]>([]);
  const [detectedNotes, setDetectedNotes] = useState<Array<{
    note: string;
    nameRu: string;
    frequency: number;
    cents: string;
    amplitude: number;
  }>>([]);
  
  // Refs for Web Audio API objects
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  
  /**
   * Creates an audio buffer for a single note with the specified waveform
   */
  const createNoteBuffer = (
    audioContext: AudioContext,
    frequency: number,
    duration: number = 2.0
  ): AudioBuffer => {
    const sampleRate = audioContext.sampleRate;
    const bufferSize = Math.floor(sampleRate * duration);
    const buffer = audioContext.createBuffer(1, bufferSize, sampleRate);
    const channelData = buffer.getChannelData(0);
    
    // Constants for envelope shaping (ADSR - Attack, Decay, Sustain, Release)
    const attack = 0.1;    // 10% of duration for attack phase
    const decay = 0.1;     // 10% of duration for decay phase
    const sustain = 0.7;   // 70% amplitude for sustain level
    const release = 0.2;   // 20% of duration for release phase
    
    // Fill the buffer with the specified waveform
    for (let i = 0; i < bufferSize; i++) {
      const t = i / sampleRate;  // Time in seconds
      let value = 0;
      
      // Generate the appropriate waveform
      switch (waveformType) {
        case 'sine':
          value = Math.sin(2 * Math.PI * frequency * t);
          break;
          
        case 'square':
          value = Math.sin(2 * Math.PI * frequency * t) >= 0 ? 1 : -1;
          break;
          
        case 'sawtooth':
          value = 2 * ((frequency * t) % 1) - 1;
          break;
          
        case 'triangle':
          const phase = (frequency * t) % 1;
          value = phase < 0.5 
            ? 4 * phase - 1 
            : 3 - 4 * phase;
          break;
          
        default:
          value = Math.sin(2 * Math.PI * frequency * t);
      }
      
      // Apply an amplitude envelope to make the sound more natural
      let envelope = 1.0;
      if (t < attack * duration) {
        // Attack phase: linear increase from 0 to 1
        envelope = t / (attack * duration);
      } else if (t < (attack + decay) * duration) {
        // Decay phase: linear decrease from 1 to sustain level
        const decayProgress = (t - attack * duration) / (decay * duration);
        envelope = 1.0 - (1.0 - sustain) * decayProgress;
      } else if (t < duration - (release * duration)) {
        // Sustain phase: constant amplitude
        envelope = sustain;
      } else {
        // Release phase: linear decrease from sustain level to 0
        const releaseProgress = (t - (duration - release * duration)) / (release * duration);
        envelope = sustain * (1.0 - releaseProgress);
      }
      
      // Limit amplitude to 0.8 to prevent clipping
      channelData[i] = value * envelope * 0.8;
    }
    
    return buffer;
  };
  
  /**
   * Creates an audio buffer containing multiple notes (chord)
   */
  const createChordBuffer = (
    audioContext: AudioContext,
    frequencies: number[],
    duration: number = 2.0
  ): AudioBuffer => {
    if (frequencies.length === 0) {
      throw new Error('Необходимо указать хотя бы одну частоту');
    }
    
    // Create a buffer for the chord
    const sampleRate = audioContext.sampleRate;
    const bufferSize = Math.floor(sampleRate * duration);
    const chordBuffer = audioContext.createBuffer(1, bufferSize, sampleRate);
    const chordData = chordBuffer.getChannelData(0);
    
    // Fill the buffer with zeros initially
    for (let i = 0; i < bufferSize; i++) {
      chordData[i] = 0;
    }
    
    // Add each note to the chord
    frequencies.forEach(frequency => {
      // Create a buffer for this note
      const noteBuffer = createNoteBuffer(audioContext, frequency, duration);
      const noteData = noteBuffer.getChannelData(0);
      
      // Add the note data to the chord
      for (let i = 0; i < bufferSize; i++) {
        // Divide by the number of notes to maintain a reasonable amplitude
        chordData[i] += noteData[i] / frequencies.length;
      }
    });
    
    return chordBuffer;
  };
  
  /**
   * Performs spectral analysis on the audio buffer
   */
  const analyzeSpectrum = (audioContext: AudioContext, buffer: AudioBuffer): Promise<{ 
    spectrum: SpectralPoint[],
    detectedNotes: Array<{ note: string; nameRu: string; frequency: number; cents: string; amplitude: number; }>
  }> => {
    // Create an offline audio context for analysis
    const offlineContext = new OfflineAudioContext(
      1, 
      buffer.length, 
      audioContext.sampleRate
    );
    
    // Create an analyzer node
    const analyzerNode = offlineContext.createAnalyser();
    analyzerNode.fftSize = 8192; // Large FFT size for precise frequency analysis
    analyzerNode.smoothingTimeConstant = 0;
    
    // Create a source node for the buffer
    const sourceNode = offlineContext.createBufferSource();
    sourceNode.buffer = buffer;
    
    // Connect the source to the analyzer
    sourceNode.connect(analyzerNode);
    analyzerNode.connect(offlineContext.destination);
    
    // Start playback
    sourceNode.start(0);
    
    // Create arrays for frequency data
    const frequencyDataArray = new Float32Array(analyzerNode.frequencyBinCount);
    
    // Render the audio to get frequency data
    return offlineContext.startRendering().then(() => {
      // Get the frequency data
      analyzerNode.getFloatFrequencyData(frequencyDataArray);
      
      // Convert the frequency data to a usable format
      const spectrum: SpectralPoint[] = [];
      const frequencyResolution = audioContext.sampleRate / analyzerNode.fftSize;
      
      for (let i = 0; i < frequencyDataArray.length; i++) {
        const frequency = i * frequencyResolution;
        
        // Skip very low frequencies (below 20 Hz) and frequencies above 5000 Hz
        if (frequency < 20 || frequency > 5000) continue;
        
        // Convert from dB to linear amplitude and normalize
        // (dB values are negative, with 0 dB as maximum)
        const dBValue = frequencyDataArray[i];
        const amplitude = Math.pow(10, dBValue / 20);
        
        spectrum.push({
          harmonic: i,
          frequency: frequency,
          amplitude: amplitude
        });
      }
      
      // Find peaks in the spectrum (potential notes)
      const peaks = findPeaks(spectrum);
      
      // Convert peaks to musical notes
      const detectedNotes = peaks.map(peak => {
        const noteInfo = identifyNote(peak.frequency);
        return {
          note: noteInfo.note,
          nameRu: getNoteNameRu(noteInfo.note),
          frequency: peak.frequency,
          cents: noteInfo.cents > 0 ? `+${noteInfo.cents}` : noteInfo.cents.toString(),
          amplitude: peak.amplitude
        };
      });
      
      return { spectrum, detectedNotes };
    });
  };
  
  /**
   * Find peaks in the spectrum that might represent notes
   */
  const findPeaks = (spectrum: SpectralPoint[]): Array<{ frequency: number, amplitude: number }> => {
    const peaks: Array<{ frequency: number, amplitude: number }> = [];
    
    // Find the maximum amplitude to set a noise threshold
    const maxAmplitude = Math.max(...spectrum.map(item => item.amplitude));
    const threshold = maxAmplitude * 0.1; // Threshold at 10% of max amplitude
    
    // Find peaks in the spectrum
    for (let i = 1; i < spectrum.length - 1; i++) {
      const prev = spectrum[i - 1].amplitude;
      const current = spectrum[i].amplitude;
      const next = spectrum[i + 1].amplitude;
      const currentFrequency = spectrum[i].frequency; // Get frequency
      
      // Fix: Check if currentFrequency is a number
      if (current > threshold && current > prev && current > next && typeof currentFrequency === 'number') {
        peaks.push({
          frequency: currentFrequency, // Now it's confirmed to be a number
          amplitude: current
        });
      }
    }
    
    // Sort peaks by amplitude (highest first) and take top 10
    return peaks
      .sort((a, b) => b.amplitude - a.amplitude)
      .slice(0, 10);
  };
  
  /**
   * Get the Russian name of a note
   */
  const getNoteNameRu = (noteCode: string): string => {
    // Extract the note letter and octave (e.g., "C4" -> "C", "4")
    const noteLetter = noteCode.replace(/\d/g, '');
    const octave = noteCode.match(/\d+/)?.[0] || '';
    
    return `${NOTE_NAMES_RU[noteLetter]}${octave}`;
  };
  
  /**
   * Play the selected notes as a chord
   */
  const playNotes = async (): Promise<void> => {
    // Clear any previous errors
    setError('');
    
    // Validate input
    if (activeNotes.length === 0) {
      setError('Выберите хотя бы одну ноту');
      return;
    }
    
    // Initialize audio context
    let audioContext = audioContextRef.current;
    if (!audioContext || audioContext.state === 'closed') { 
      try {
        if (typeof window === 'undefined') throw new Error('Browser environment required');
        const AudioContextClass = window.AudioContext;
        if (!AudioContextClass) throw new Error('Web Audio API not supported');
        audioContext = new AudioContextClass();
        audioContextRef.current = audioContext;
      } catch (err: unknown) {
        console.error('Failed to create/get AudioContext:', err);
        // Type check before accessing message
        const message = err instanceof Error ? err.message : String(err);
        setError(`Ошибка аудио: ${message}`);
        return;
      }
    }
    
    // Resume audio context if it's suspended (critical for Chrome)
    if (audioContext.state === 'suspended') {
      try {
        await audioContext.resume();
      } catch (err) {
        console.error('Failed to resume AudioContext:', err);
        setError('Ошибка при активации аудио');
        return;
      }
    }
    
    // Stop any currently playing sound
    if (sourceNodeRef.current) {
      sourceNodeRef.current.stop();
      sourceNodeRef.current = null;
    }
    
    try {
      // Get frequencies for all selected notes
      const frequencies = activeNotes.map(note => NOTE_FREQUENCIES[note]);
      
      // Create a buffer with the chord
      const buffer = createChordBuffer(audioContext, frequencies);
      
      // Analyze the spectrum
      const analysisResults = await analyzeSpectrum(audioContext, buffer);
      setSpectrum(analysisResults.spectrum);
      setDetectedNotes(analysisResults.detectedNotes);
      
      // Play the sound
      sourceNodeRef.current = playAudioBuffer(audioContext, buffer, () => {
        setIsPlaying(false);
        sourceNodeRef.current = null;
      }, volume); 
      
      setIsPlaying(true);
      
      // Stop after 2 seconds
      setTimeout(() => {
        if (sourceNodeRef.current) {
          try { sourceNodeRef.current.stop(); } catch /* (e) */ { // Fix: Remove unused 'e'
            // Ignore errors if stopping already stopped node
          }
          sourceNodeRef.current = null;
        }
        setIsPlaying(false);
      }, 2000);
    } catch (err: unknown) {
      console.error('Error playing notes:', err);
      // Type check before accessing message
      const message = err instanceof Error ? err.message : String(err);
      setError(`Ошибка воспроизведения: ${message}`);
    }
  };
  
  /**
   * Stop playback
   */
  const stopPlayback = (): void => {
    if (sourceNodeRef.current) {
      sourceNodeRef.current.stop();
      sourceNodeRef.current = null;
    }
    setIsPlaying(false);
  };
  
  /**
   * Toggle note selection
   */
  const toggleNote = (note: string): void => {
    setActiveNotes(prev => 
      prev.includes(note) 
        ? prev.filter(n => n !== note) 
        : [...prev, note]
    );
  };
  
  /**
   * Clean up audio resources when component unmounts
   */
  useEffect(() => {
    return () => {
      if (sourceNodeRef.current) {
        sourceNodeRef.current.stop();
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);
  
  return (
    <div className="p-4 bg-gray-50 min-h-screen">
      <h1 className="text-2xl font-bold mb-6 text-center">Анализатор музыкальных нот</h1>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Note Selection Panel */}
        <div className="bg-white p-4 border rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-4">Выбор нот</h2>
          
          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
              {error}
            </div>
          )}
          
          <div className="mb-4">
            <label className="block mb-2">Тип волны:</label>
            <select 
              className="w-full p-2 border rounded"
              value={waveformType}
              onChange={(e) => setWaveformType(e.target.value)}
            >
              <option value="sine">Синусоида</option>
              <option value="square">Прямоугольная</option>
              <option value="sawtooth">Пилообразная</option>
              <option value="triangle">Треугольная</option>
            </select>
          </div>
          
          <div className="mb-4">
            <label className="block mb-2">Громкость:</label>
            <div className="flex items-center">
              <span className="mr-2 text-sm">0%</span>
              <input 
                type="range" 
                min="0" 
                max="1" 
                step="0.01"
                value={volume}
                onChange={(e) => setVolume(Number(e.target.value))}
                className="w-full"
              />
              <span className="ml-2 text-sm">{Math.round(volume * 100)}%</span>
            </div>
          </div>
          
          <div className="mb-4">
            <h3 className="font-semibold mb-2">Ноты:</h3>
            <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
              {Object.keys(NOTE_FREQUENCIES).map(note => (
                <button
                  key={note}
                  className={`p-2 rounded text-center ${
                    activeNotes.includes(note) 
                      ? 'bg-blue-500 text-white' 
                      : 'bg-gray-200 hover:bg-gray-300'
                  }`}
                  onClick={() => toggleNote(note)}
                >
                  {note}
                  <div className="text-xs">{NOTE_NAMES_RU[note.replace(/\d/g, '')]}</div>
                </button>
              ))}
            </div>
          </div>
          
          <div className="flex space-x-2 mt-6">
            <button 
              className="bg-[var(--primary)] hover:bg-[var(--primary-light)] text-white py-2 px-4 rounded transition-colors disabled:bg-gray-400"
              onClick={playNotes}
              disabled={isPlaying || activeNotes.length === 0}
            >
              Проиграть аккорд
            </button>
            <button 
              className="bg-red-500 text-white py-2 px-4 rounded hover:bg-red-600 disabled:bg-gray-400"
              onClick={stopPlayback}
              disabled={!isPlaying}
            >
              Стоп
            </button>
          </div>
        </div>
        
        {/* Detected Notes */}
        <div className="bg-white p-4 border rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-4">Определенные ноты</h2>
          
          {detectedNotes.length > 0 ? (
            <div className="overflow-auto max-h-64">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Нота</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Название</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Частота (Гц)</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Отклонение</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Амплитуда</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {detectedNotes.map((note, index) => (
                    <tr key={index} className={index < activeNotes.length ? "bg-blue-50" : ""}>
                      <td className="px-6 py-4 whitespace-nowrap">{note.note}</td>
                      <td className="px-6 py-4 whitespace-nowrap">{note.nameRu}</td>
                      <td className="px-6 py-4 whitespace-nowrap">{note.frequency.toFixed(2)}</td>
                      <td className="px-6 py-4 whitespace-nowrap">{note.cents}</td>
                      <td className="px-6 py-4 whitespace-nowrap">{note.amplitude.toFixed(4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-4 text-gray-500">
              Нет данных для анализа. Выберите ноты и нажмите Проиграть аккорд.
            </div>
          )}
        </div>
        
        {/* Enhanced Spectrum Graph */}
        <div className="bg-white p-4 border rounded-lg shadow lg:col-span-2">
          <MusicSpectralChart 
            data={spectrum} 
            selectedNotes={activeNotes}
            height={520}
          />
          
          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Peak Information Panel */}
            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
              <h3 className="text-lg font-semibold mb-3 text-gray-800">Основные пики</h3>
              {detectedNotes.length > 0 ? (
                <div className="space-y-3">
                  {detectedNotes.slice(0, 3).map((note, index) => (
                    <div 
                      key={index} 
                      className={`flex justify-between items-center p-3 rounded-md ${
                        index === 0 ? 'bg-blue-50 border border-blue-200' : 'bg-white border border-gray-100'
                      }`}
                    >
                      <div>
                        <div className="flex items-center">
                          <span className={`font-bold text-lg ${
                            index === 0 ? 'text-blue-700' : 'text-gray-700'
                          }`}>{note.note}</span>
                          <span className="ml-2 text-sm text-gray-500">({note.nameRu})</span>
                        </div>
                        <div className="text-sm text-gray-600 mt-1">
                          Отклонение: <span className={note.cents.startsWith("+ ") ? "text-orange-600" : "text-green-600"}>
                            {note.cents}
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-gray-900 font-medium">{note.frequency.toFixed(2)} Гц</div>
                        <div className="text-sm text-gray-500">
                          {index === 0 ? 'Доминирующая частота' : `${Math.round(note.amplitude / detectedNotes[0].amplitude * 100)}% от основной`}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 italic">Нет данных для анализа. Выберите ноты и нажмите Проиграть аккорд.</p>
              )}
            </div>
            
            {/* Harmonic Structure Panel */}
            {/* <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
              <h3 className="text-lg font-semibold mb-3 text-gray-800">Структура гармоник</h3>
              {waveformType !== 'sine' ? (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-medium text-gray-700">Тип волны:</span>
                    <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-md font-medium">{waveformType}</span>
                  </div>
                  
                  <div className="space-y-2">
                    {waveformType === 'square' && (
                      <>
                        <p className="text-sm text-gray-600">Содержит только нечётные гармоники (1, 3, 5, ...)</p>
                        <div className="flex gap-2 mt-2">
                          {[1, 3, 5, 7, 9].map(n => (
                            <span key={n} className="px-2 py-1 bg-gray-200 text-gray-800 rounded text-sm font-medium">
                              {n}
                            </span>
                          ))}
                        </div>
                      </>
                    )}
                    
                    {waveformType === 'sawtooth' && (
                      <>
                        <p className="text-sm text-gray-600">Содержит все гармоники с амплитудой 1/n</p>
                        <div className="flex gap-2 mt-2">
                          {[1, 2, 3, 4, 5].map(n => (
                            <span key={n} className="px-2 py-1 bg-gray-200 text-gray-800 rounded text-sm font-medium">
                              {n}
                            </span>
                          ))}
                        </div>
                      </>
                    )}
                    
                    {waveformType === 'triangle' && (
                      <>
                        <p className="text-sm text-gray-600">Содержит только нечётные гармоники с быстрым затуханием (1/n²)</p>
                        <div className="flex gap-2 mt-2">
                          {[1, 3, 5, 7].map(n => (
                            <span key={n} className="px-2 py-1 bg-gray-200 text-gray-800 rounded text-sm font-medium">
                              {n}
                            </span>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                  
                  <div className="mt-4 pt-3 border-t border-gray-200">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-medium text-gray-700">Чистота тона:</span>
                      <div className="flex items-center">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <svg 
                            key={i} 
                            className={`w-4 h-4 ${i < (waveformType === 'sine' ? 5 : waveformType === 'triangle' ? 3 : 1) ? 'text-yellow-500' : 'text-gray-300'}`} 
                            fill="currentColor" 
                            viewBox="0 0 20 20"
                          >
                            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                          </svg>
                        ))}
                      </div>
                    </div>
                    
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-gray-700">Богатство тембра:</span>
                      <div className="flex items-center">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <svg 
                            key={i} 
                            className={`w-4 h-4 ${i < (waveformType === 'sine' ? 1 : waveformType === 'triangle' ? 3 : 5) ? 'text-blue-500' : 'text-gray-300'}`} 
                            fill="currentColor" 
                            viewBox="0 0 20 20"
                          >
                            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                          </svg>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-blue-50 p-3 rounded-md border border-blue-200">
                  <p className="text-gray-700">Синусоида является чистым тоном и содержит только одну частоту без дополнительных гармоник.</p>
                  <p className="mt-2 text-sm text-gray-600">Это базовый строительный блок для всех звуков, обладающий максимальной чистотой, но минимальной тембральной окраской.</p>
                </div>
              )}
            </div> */}
          </div>
        </div>
        
        {/* Explanation Section */}
        <div className="bg-white p-4 rounded-lg border shadow lg:col-span-2">
          <h2 className="text-xl font-semibold mb-4">О музыкальных нотах и спектре</h2>
          
          <p className="mb-2">
            Данный модуль позволяет наглядно увидеть спектральный состав музыкальных нот и аккордов. 
            Каждая музыкальная нота соответствует определенной частоте колебаний. Например, 
            нота Ля первой октавы (A4) имеет стандартную частоту 440 Гц.
          </p>
          
          <p className="mb-2">
            Когда мы слышим музыкальный звук, то воспринимаем не только основную частоту (фундаментальную), 
            но и ее гармоники - частоты, кратные основной. Именно соотношение амплитуд этих гармоник 
            определяет тембр инструмента.
          </p>
          
          <p className="mb-4">
            В этом приложении вы можете:
          </p>
          
          <ul className="list-disc pl-5 mb-4">
            <li>Выбрать несколько нот для воспроизведения аккорда</li>
            <li>Изменить тип волны (синусоидальная, прямоугольная и т.д.), что влияет на спектральный состав</li>
            <li>Увидеть, какие ноты определяются в результате автоматического анализа спектра</li>
            <li>Наблюдать спектральный состав звука на графике</li>
          </ul>
          
          <p className="mb-2">
            <strong>Примечания:</strong>
          </p>
          
          <ul className="list-disc pl-5">
            <li>Чистая синусоида дает только одну частоту без гармоник</li>
            <li>Прямоугольная волна богата нечетными гармониками</li>
            <li>Пилообразная содержит и четные, и нечетные гармоники</li>
            <li>Музыкальные интервалы определяются отношением частот (например, октава - это отношение 2:1)</li>
            <li>Отклонение показывает, насколько частота отличается от идеальной частоты ноты (1 полутон = 100 центов)</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default MusicNoteAnalyzer;