"use client";

import React, { useState, useEffect, useRef } from 'react';
import { 
  generateSineWave, 
  generateSquareWave, 
  generateSawtoothWave, 
  generateTriangleWave, 
  WavePoint 
} from '@/utils/waveGenerators';
import { 
  calculateFourierCoefficients, 
  reconstructWaveFromFourier, 
  prepareSpectralData,
  FourierCoefficients,
  SpectralPoint
} from '@/utils/fourierTransform';
import { createAudioBufferFromWave, playAudioBuffer } from '@/utils/audioUtils';
import { WAVE_TYPES, SAMPLE_RATE, MAX_AMPLITUDE, DEFAULT_DURATION } from '@/constants/audioConstants';
import WaveChart from '@/components/common/WaveChart';
import SpectrumChart from '@/components/common/SpectrumChart';

/**
 * WaveAnalyzer component - An interactive tool for analyzing sound waves and their Fourier transforms
 */
const WaveAnalyzer: React.FC = () => {
  // State for wave parameters
  const [waveType, setWaveType] = useState<string>(WAVE_TYPES.SINE);
  const [frequency, setFrequency] = useState<number>(440);
  const [amplitude, setAmplitude] = useState<number>(10000);
  const [duration, setDuration] = useState<number>(DEFAULT_DURATION);
  const [numHarmonics, setNumHarmonics] = useState<number>(10);
  
  // State for analysis data
  const [waveData, setWaveData] = useState<WavePoint[]>([]);
  const [reconstructedWave, setReconstructedWave] = useState<WavePoint[]>([]);
  const [fourierCoefficients, setFourierCoefficients] = useState<FourierCoefficients>({ 
    a0: 0, 
    a: [], 
    b: [] 
  });
  const [spectralData, setSpectralData] = useState<SpectralPoint[]>([]);
  
  // State for audio playback
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  
  // Refs for Web Audio API objects
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  
  /**
   * Generates the wave based on selected parameters and calculates its Fourier transform
   */
  const generateWave = (): void => {
    let data: WavePoint[] = [];
    
    // Generate the appropriate wave type based on user selection
    switch (waveType) {
      case WAVE_TYPES.SINE:
        data = generateSineWave(frequency, amplitude, duration);
        break;
      case WAVE_TYPES.SQUARE:
        data = generateSquareWave(frequency, amplitude, duration);
        break;
      case WAVE_TYPES.SAWTOOTH:
        data = generateSawtoothWave(frequency, amplitude, duration);
        break;
      case WAVE_TYPES.TRIANGLE:
        data = generateTriangleWave(frequency, amplitude, duration);
        break;
      default:
        data = generateSineWave(frequency, amplitude, duration);
    }
    
    // Store the generated wave data
    setWaveData(data);
    
    // Calculate Fourier coefficients for the wave
    const coefficients = calculateFourierCoefficients(data, numHarmonics);
    setFourierCoefficients(coefficients);
    
    // Reconstruct the wave from Fourier coefficients
    const reconstructed = reconstructWaveFromFourier(
      coefficients, 
      duration, 
      frequency, 
      numHarmonics
    );
    setReconstructedWave(reconstructed);
    
    // Prepare data for spectrum visualization
    const spectral = prepareSpectralData(coefficients);
    setSpectralData(spectral);
  };
  
  /**
   * Plays either the original wave or the reconstructed wave
   * @param isOriginal - Whether to play the original wave (true) or reconstructed wave (false)
   */
  const playSound = (isOriginal: boolean): void => {
    // Initialize audio context if not already done
    if (!audioContextRef.current) {
      // Safety check for browser environment
      if (typeof window === 'undefined') return;
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    
    // Stop any currently playing sound
    if (sourceNodeRef.current) {
      sourceNodeRef.current.stop();
      sourceNodeRef.current = null;
    }
    
    const audioContext = audioContextRef.current;
    if (!audioContext) return;
    
    // Select which wave data to play
    const dataToPlay = isOriginal ? waveData : reconstructedWave;
    
    // Create an audio buffer for playback (1 second duration)
    const buffer = createAudioBufferFromWave(audioContext, dataToPlay, 1.0);
    
    // Play the sound
    sourceNodeRef.current = playAudioBuffer(audioContext, buffer, () => {
      setIsPlaying(false);
      sourceNodeRef.current = null;
    });
    
    setIsPlaying(true);
  };
  
  /**
   * Stops any currently playing sound
   */
  const stopSound = (): void => {
    if (sourceNodeRef.current) {
      sourceNodeRef.current.stop();
      sourceNodeRef.current = null;
    }
    setIsPlaying(false);
  };
  
  /**
   * Effect to regenerate the wave whenever relevant parameters change
   */
  useEffect(() => {
    generateWave();
  }, [waveType, frequency, amplitude, duration, numHarmonics]);
  
  /**
   * Cleanup effect to stop any playing sound when the component unmounts
   */
  useEffect(() => {
    return () => {
      if (sourceNodeRef.current) {
        sourceNodeRef.current.stop();
      }
    };
  }, []);
  
  /**
   * Calculates the mean squared error between original and reconstructed waves
   * as a measure of reconstruction accuracy
   */
  const calculateMSE = (): number => {
    if (waveData.length === 0 || reconstructedWave.length === 0) {
      return 0;
    }
    
    // Get samples at matching time points for comparison
    const originalSamples: number[] = [];
    const reconstructedSamples: number[] = [];
    
    // Sample at regular intervals for comparison
    const numSamples = 1000;
    for (let i = 0; i < numSamples; i++) {
      const t = i * (duration / numSamples);
      
      // Find closest points in both waves for this time
      const origIndex = waveData.findIndex(point => point.t >= t);
      const reconIndex = reconstructedWave.findIndex(point => point.t >= t);
      
      if (origIndex >= 0 && reconIndex >= 0) {
        originalSamples.push(waveData[origIndex].value);
        reconstructedSamples.push(reconstructedWave[reconIndex].value);
      }
    }
    
    // Calculate mean squared error
    let sumSquaredDiff = 0;
    for (let i = 0; i < originalSamples.length; i++) {
      const diff = originalSamples[i] - reconstructedSamples[i];
      sumSquaredDiff += diff * diff;
    }
    
    return sumSquaredDiff / originalSamples.length;
  };
  
  /**
   * Format MSE for display, scaling to a percentage
   */
  const getAccuracyPercentage = (): string => {
    const mse = calculateMSE();
    // Normalize by square of amplitude to get relative error
    const normalizedError = mse / (amplitude * amplitude);
    // Calculate accuracy percentage (100% - error%)
    const accuracy = Math.max(0, 100 * (1 - Math.sqrt(normalizedError)));
    return accuracy.toFixed(2);
  };
  
  return (
    <div className="p-4 bg-gray-50 min-h-screen">
      <h1 className="text-2xl font-bold mb-6 text-center">Анализатор звуковых волн на основе рядов Фурье</h1>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Control Panel */}
        <div className="bg-white p-4 rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-4">Параметры сигнала</h2>
          
          <div className="mb-4">
            <label className="block mb-2">Тип волны:</label>
            <select 
              className="w-full p-2 border rounded"
              value={waveType}
              onChange={(e) => setWaveType(e.target.value)}
            >
              {Object.entries(WAVE_TYPES).map(([key, value]) => (
                <option key={key} value={value}>{value}</option>
              ))}
            </select>
          </div>
          
          <div className="mb-4">
            <label className="block mb-2">Частота (Гц): {frequency} Гц</label>
            <input 
              type="range" 
              min="20" 
              max="2000" 
              step="1"
              value={frequency}
              onChange={(e) => setFrequency(Number(e.target.value))}
              className="w-full"
            />
          </div>
          
          <div className="mb-4">
            <label className="block mb-2">Амплитуда: {amplitude}</label>
            <input 
              type="range" 
              min="1000" 
              max="30000" 
              step="1000"
              value={amplitude}
              onChange={(e) => setAmplitude(Number(e.target.value))}
              className="w-full"
            />
          </div>
          
          <div className="mb-4">
            <label className="block mb-2">Число гармоник: {numHarmonics}</label>
            <input 
              type="range" 
              min="1" 
              max="50" 
              step="1"
              value={numHarmonics}
              onChange={(e) => setNumHarmonics(Number(e.target.value))}
              className="w-full"
            />
          </div>
          
          <div className="flex space-x-2 mt-6">
            <button 
              className="bg-blue-500 text-white py-2 px-4 rounded hover:bg-blue-600 disabled:bg-gray-400"
              onClick={() => playSound(true)}
              disabled={isPlaying}
            >
              Проиграть оригинал
            </button>
            <button 
              className="bg-green-500 text-white py-2 px-4 rounded hover:bg-green-600 disabled:bg-gray-400"
              onClick={() => playSound(false)}
              disabled={isPlaying}
            >
              Проиграть реконструкцию
            </button>
            <button 
              className="bg-red-500 text-white py-2 px-4 rounded hover:bg-red-600 disabled:bg-gray-400"
              onClick={stopSound}
              disabled={!isPlaying}
            >
              Стоп
            </button>
          </div>
        </div>
        
        {/* Spectral Analysis */}
        <div className="bg-white p-4 rounded-lg shadow">
          <SpectrumChart data={spectralData} />
          <div className="mt-4 text-sm">
            <p><strong>Постоянная составляющая (DC):</strong> {fourierCoefficients.a0.toFixed(2)}</p>
            <p><strong>Основная гармоника:</strong> {spectralData[1]?.amplitude.toFixed(2) || 0}</p>
            <p><strong>Точность реконструкции:</strong> {getAccuracyPercentage()}%</p>
          </div>
        </div>
        
        {/* Original Signal Chart */}
        <div className="bg-white p-4 rounded-lg shadow">
          <WaveChart 
            data={waveData} 
            title="Исходный сигнал" 
            color="#8884d8" 
            duration={duration} 
            amplitude={amplitude} 
          />
        </div>
        
        {/* Reconstructed Signal Chart */}
        <div className="bg-white p-4 rounded-lg shadow">
          <WaveChart 
            data={reconstructedWave} 
            title={`Восстановленный сигнал (${numHarmonics} гармоник)`} 
            color="#82ca9d" 
            duration={duration} 
            amplitude={amplitude} 
          />
        </div>
        
        {/* Explanation Section */}
        <div className="bg-white p-4 rounded-lg shadow lg:col-span-2">
          <h2 className="text-xl font-semibold mb-4">О проекте</h2>
          <p className="mb-2">
            Данный интерактивный комплекс демонстрирует принципы разложения периодических звуковых волн в ряд Фурье и обратного синтеза сигнала.
          </p>
          <p className="mb-2">
            <strong>Как использовать:</strong>
          </p>
          <ol className="list-decimal pl-5 mb-4">
            <li>Выберите тип волны (синусоида, прямоугольная, пилообразная или треугольная)</li>
            <li>Настройте частоту и амплитуду сигнала</li>
            <li>Укажите количество гармоник для восстановления сигнала</li>
            <li>Наблюдайте графики оригинального и восстановленного сигналов</li>
            <li>Изучите спектральный состав сигнала на диаграмме</li>
            <li>Прослушайте как оригинальный, так и восстановленный сигналы</li>
          </ol>
          <p className="mb-2">
            <strong>Примечания:</strong>
          </p>
          <ul className="list-disc pl-5">
            <li>Прямоугольная волна теоретически требует бесконечного числа нечетных гармоник для идеального восстановления</li>
            <li>Пилообразная волна содержит как четные, так и нечетные гармоники</li>
            <li>Увеличение числа гармоник улучшает точность реконструкции, особенно для волн с резкими переходами</li>
            <li>Спектральный анализ показывает амплитуды всех гармонических составляющих сигнала</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default WaveAnalyzer;