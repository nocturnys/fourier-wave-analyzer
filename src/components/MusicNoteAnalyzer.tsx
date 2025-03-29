"use client";

import React, { useState, useEffect, useRef } from 'react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer 
} from 'recharts';
import { NOTE_FREQUENCIES, NOTE_NAMES_RU } from '@/constants/noteFrequencies';
import { createAudioBufferFromWave, identifyNote, playAudioBuffer } from '@/utils/audioUtils';
import { SpectralPoint } from '@/utils/fourierTransform';

/**
 * MusicNoteAnalyzer component - An interactive tool for analyzing musical notes and their spectral composition
 */
const MusicNoteAnalyzer: React.FC = () => {
  // State for note selection and audio parameters
  const [activeNotes, setActiveNotes] = useState<string[]>([]);
  const [waveformType, setWaveformType] = useState<string>('sine');
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  
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
  const analyzerNodeRef = useRef<AnalyserNode | null>(null);
  
  /**
   * Initialize the audio context if needed
   */
  const initializeAudioContext = (): AudioContext | null => {
    if (audioContextRef.current) {
      return audioContextRef.current;
    }
    
    try {
      // Safety check for browser environment
      if (typeof window === 'undefined') return null;
      
      const AudioContext = window.AudioContext || window.AudioContext;
      if (!AudioContext) {
        setError('Web Audio API не поддерживается вашим браузером');
        return null;
      }
      
      audioContextRef.current = new AudioContext();
      return audioContextRef.current;
    } catch (err) {
      setError('Ошибка при инициализации аудиоконтекста');
      console.error('Audio context initialization error:', err);
      return null;
    }
  };
  
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
  const analyzeSpectrum = (audioContext: AudioContext, buffer: AudioBuffer): {
    spectrum: SpectralPoint[],
    detectedNotes: Array<{ note: string; nameRu: string; frequency: number; cents: string; amplitude: number; }>
  } => {
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
      
      // A peak is where the current value is higher than both neighbors
      // and above the threshold
      if (current > threshold && current > prev && current > next) {
        peaks.push({
          frequency: spectrum[i].frequency,
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
    const audioContext = initializeAudioContext();
    if (!audioContext) return;
    
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
      });
      
      setIsPlaying(true);
      
      // Stop after 2 seconds
      setTimeout(() => {
        if (sourceNodeRef.current) {
          sourceNodeRef.current.stop();
          sourceNodeRef.current = null;
        }
        setIsPlaying(false);
      }, 2000);
    } catch (err) {
      console.error('Error playing notes:', err);
      setError('Ошибка при воспроизведении нот');
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
   * Prepare data for spectrum visualization
   */
  const prepareSpectrumData = (): SpectralPoint[] => {
    // Reduce the number of points for better performance
    return spectrum
      .filter((_, index) => index % 5 === 0) // Take every 5th point
      .filter(item => item.frequency < 2000); // Limit to 2000 Hz for better visualization
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
        <div className="bg-white p-4 rounded-lg shadow">
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
              className="bg-blue-500 text-white py-2 px-4 rounded hover:bg-blue-600 disabled:bg-gray-400"
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
        <div className="bg-white p-4 rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-4">Определенные ноты</h2>
          
          {detectedNotes.length > 0 ? (
            <div className="overflow-auto max-h-64">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Нота</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Название</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Частота (Гц)</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Отклонение (центы)</th>
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
              Нет данных для анализа. Выберите ноты и нажмите "Проиграть аккорд".
            </div>
          )}
        </div>
        
        {/* Spectrum Graph */}
        <div className="bg-white p-4 rounded-lg shadow lg:col-span-2">
          <h2 className="text-xl font-semibold mb-4">Спектральный анализ</h2>
          
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart 
                data={prepareSpectrumData()} 
                margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="frequency" 
                  label={{ value: 'Частота (Гц)', position: 'insideBottomRight', offset: -10 }} 
                />
                <YAxis 
                  label={{ value: 'Амплитуда', angle: -90, position: 'insideLeft' }} 
                />
                <Tooltip 
                  formatter={(value: number) => [value.toFixed(5), 'Амплитуда']}
                  labelFormatter={(label: number) => `Частота: ${label.toFixed(2)} Гц`}
                />
                <Legend />
                <Line 
                  type="monotone" 
                  dataKey="amplitude" 
                  stroke="#8884d8" 
                  dot={false} 
                  name="Спектральная составляющая"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          
          <div className="mt-4">
            <h3 className="font-semibold mb-2">Выбранные ноты:</h3>
            <div className="flex flex-wrap gap-2">
              {activeNotes.map(note => (
                <span key={note} className="px-2 py-1 bg-blue-100 rounded">
                  {note} ({NOTE_NAMES_RU[note.replace(/\d/g, '')]}) - {NOTE_FREQUENCIES[note].toFixed(2)} Гц
                </span>
              ))}
            </div>
          </div>
        </div>
        
        {/* Explanation Section */}
        <div className="bg-white p-4 rounded-lg shadow lg:col-span-2">
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
            <li>Отклонение в центах показывает, насколько частота отличается от идеальной частоты ноты (1 полутон = 100 центов)</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default MusicNoteAnalyzer;