"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { 
  generateSineWave, 
  generateSquareWave, 
  generateSawtoothWave, 
  generateTriangleWave, 
  WavePoint 
} from '@/utils/waveGenerators';
import {
  getIdealWaveGenerator,
  clearWaveCache
} from '@/utils/idealWaveGenerators';
import { 
  calculateFourierCoefficients, 
  reconstructWaveFromFourier, 
  prepareSpectralData,
  FourierCoefficients,
  SpectralPoint,
  calculateReconstructionAccuracy
} from '@/utils/fourierTransform';
import { createAudioBufferFromWave, playAudioBuffer } from '@/utils/audioUtils';
import { WAVE_TYPES, SAMPLE_RATE, MAX_AMPLITUDE, DEFAULT_DURATION } from '@/constants/audioConstants';
import WaveChart from '@/components/common/WaveChart';
import SpectrumChart from '@/components/common/SpectrumChart';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';

// Cache for reconstructions
const reconstructionCache = new Map<string, WavePoint[]>();

/**
 * Creates a cache key for reconstructions
 */
const createReconstructionCacheKey = (
  coefficients: FourierCoefficients, 
  duration: number, 
  frequency: number, 
  harmonics: number
): string => {
  // Use hash of coefficients for more compact key
  const a0Hash = coefficients.a0.toFixed(2);
  const aHash = coefficients.a.length > 0 ? 
    coefficients.a.slice(0, 3).map(v => v.toFixed(1)).join('_') : '0';
  const bHash = coefficients.b.length > 0 ? 
    coefficients.b.slice(0, 3).map(v => v.toFixed(1)).join('_') : '0';
  
  return `recon_${a0Hash}_${aHash}_${bHash}_${duration.toFixed(3)}_${frequency}_${harmonics}`;
};

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
  const [idealWaveData, setIdealWaveData] = useState<WavePoint[]>([]);
  const [reconstructedWave, setReconstructedWave] = useState<WavePoint[]>([]);
  const [fourierCoefficients, setFourierCoefficients] = useState<FourierCoefficients>({ 
    a0: 0, 
    a: [], 
    b: [] 
  });
  const [spectralData, setSpectralData] = useState<SpectralPoint[]>([]);
  
  // State for audio playback
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  
  // State for showing accuracy trends
  const [accuracyData, setAccuracyData] = useState<Array<{harmonics: number, accuracy: number}>>([]);
  const [useLogScale, setUseLogScale] = useState<boolean>(false);
  
  // Refs for Web Audio API objects
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  
  // Combined data for dynamic visualization
  const combinedWaveData = useMemo(() => {
    // Create a combined dataset with original, ideal and reconstructed waves
    if (!waveData.length) return [];
    
    const maxPoints = 500; // Limit data points for performance
    const step = Math.max(1, Math.floor(waveData.length / maxPoints));
    
    return waveData
      .filter((_, index) => index % step === 0)
      .map(point => {
        // Find matching points in ideal and reconstructed waves
        const idealPoint = idealWaveData.find(p => Math.abs(p.t - point.t) < 0.0001);
        const reconPoint = reconstructedWave.find(p => Math.abs(p.t - point.t) < 0.0001);
        
        return {
          t: point.t,
          original: point.value,
          ideal: idealPoint?.value || null,
          reconstructed: reconPoint?.value || null
        };
      });
  }, [waveData, idealWaveData, reconstructedWave]);
  
  // Get explanation text for current wave type
  const waveExplanation = useMemo(() => {
    switch (waveType) {
      case WAVE_TYPES.SQUARE:
        return 'Прямоугольная волна содержит только нечётные гармоники (1, 3, 5, ...) с амплитудами, убывающими как 1/n. Для точного воспроизведения резких переходов теоретически требуется бесконечное число гармоник.';
      case WAVE_TYPES.SAWTOOTH:
        return 'Пилообразная волна содержит все гармоники (чётные и нечётные) с амплитудами, убывающими как 1/n. Требует большого числа гармоник для точного воспроизведения резкого перехода.';
      case WAVE_TYPES.TRIANGLE:
        return 'Треугольная волна содержит только нечётные гармоники (1, 3, 5, ...) с амплитудами, убывающими как 1/n². Благодаря более быстрому убыванию амплитуд, аппроксимация сходится быстрее, чем для прямоугольной волны.';
      default:
        return 'Синусоида является базовой гармоникой и полностью описывается одной частотой. Это единственная форма волны, которая содержит только одну гармонику.';
    }
  }, [waveType]);
  
  // Highlighted harmonics based on wave type
  const getHighlightedHarmonics = useCallback((): number[] => {
    switch (waveType) {
      case WAVE_TYPES.SQUARE:
        return [1, 3, 5, 7, 9];
      case WAVE_TYPES.SAWTOOTH:
        return [1, 2, 3, 4, 5];
      case WAVE_TYPES.TRIANGLE:
        return [1, 3, 5, 9];
      default:
        return [1];
    }
  }, [waveType]);
  
  // Generate the wave and its Fourier analysis
  const generateWave = useCallback(() => {
    let data: WavePoint[] = [];
    
    // Generate the appropriate wave type
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
    
    setWaveData(data);
    
    // Generate ideal wave if needed
    if (waveType !== WAVE_TYPES.SINE) {
      const idealWaveGenerator = getIdealWaveGenerator(waveType);
      const idealData = idealWaveGenerator(frequency, amplitude, duration);
      setIdealWaveData(idealData);
    } else {
      // For sine wave, the ideal is the same as the original
      setIdealWaveData([]);
    }
    
    // Calculate Fourier coefficients
    const coefficients = calculateFourierCoefficients(data, 50);
    setFourierCoefficients(coefficients);
    
    // Reconstruct wave with current harmonic count
    updateReconstructedWave(coefficients, numHarmonics);
    
    // Prepare spectral data
    const spectral = prepareSpectralData(coefficients, frequency);
    setSpectralData(spectral);
    
    // Calculate accuracy trend
    calculateAccuracyTrend(data, coefficients, duration, frequency);
  }, [waveType, frequency, amplitude, duration, numHarmonics]);
  
  // Update reconstructed wave when harmonic count changes
  const updateReconstructedWave = useCallback((
    coefficients: FourierCoefficients, 
    harmonicCount: number
  ) => {
    const cacheKey = createReconstructionCacheKey(
      coefficients, 
      duration, 
      frequency, 
      harmonicCount
    );
    
    let reconstructed: WavePoint[];
    
    if (reconstructionCache.has(cacheKey)) {
      reconstructed = reconstructionCache.get(cacheKey)!;
    } else {
      reconstructed = reconstructWaveFromFourier(
        coefficients, 
        duration, 
        frequency, 
        harmonicCount
      );
      reconstructionCache.set(cacheKey, reconstructed);
    }
    
    setReconstructedWave(reconstructed);
  }, [duration, frequency]);
  
  // Generate accuracy trend data
  const calculateAccuracyTrend = useCallback((
    originalData: WavePoint[],
    coefficients: FourierCoefficients,
    waveDuration: number,
    waveFrequency: number
  ) => {
    const maxHarmonicsToShow = 50;
    const step = 2;
    const accuracyPoints: Array<{harmonics: number, accuracy: number}> = [];
    
    // Process in batches to avoid blocking UI
    const processHarmonics = (start: number, end: number) => {
      for (let h = start; h <= end; h += step) {
        const key = createReconstructionCacheKey(
          coefficients, waveDuration, waveFrequency, h
        );
        
        let reconstructed: WavePoint[];
        if (reconstructionCache.has(key)) {
          reconstructed = reconstructionCache.get(key)!;
        } else {
          reconstructed = reconstructWaveFromFourier(
            coefficients, waveDuration, waveFrequency, h
          );
          reconstructionCache.set(key, reconstructed);
        }
        
        const accuracy = calculateReconstructionAccuracy(originalData, reconstructed);
        
        // Ensure accuracy doesn't decrease
        const lastIndex = accuracyPoints.length - 1;
        const lastAccuracy = lastIndex >= 0 ? accuracyPoints[lastIndex].accuracy : 0;
        const correctedAccuracy = Math.max(lastAccuracy, accuracy.accuracyPercent);
        
        accuracyPoints.push({
          harmonics: h,
          accuracy: correctedAccuracy
        });
      }
      
      // Process next batch or finalize
      if (end < maxHarmonicsToShow) {
        setTimeout(() => {
          processHarmonics(end + step, Math.min(end + 10, maxHarmonicsToShow));
        }, 0);
      } else {
        finishProcessing();
      }
    };
    
    // Start processing
    processHarmonics(1, 10);
    
    // Final processing steps
    const finishProcessing = () => {
      // Add current harmonic count if not already included
      if (!accuracyPoints.some(p => p.harmonics === numHarmonics)) {
        const cacheKey = createReconstructionCacheKey(
          coefficients, waveDuration, waveFrequency, numHarmonics
        );
        
        let reconstructed: WavePoint[];
        if (reconstructionCache.has(cacheKey)) {
          reconstructed = reconstructionCache.get(cacheKey)!;
        } else {
          reconstructed = reconstructWaveFromFourier(
            coefficients, waveDuration, waveFrequency, numHarmonics
          );
          reconstructionCache.set(cacheKey, reconstructed);
        }
        
        const accuracy = calculateReconstructionAccuracy(originalData, reconstructed);
        
        // Find the right position
        let insertIndex = 0;
        while (insertIndex < accuracyPoints.length && 
               accuracyPoints[insertIndex].harmonics < numHarmonics) {
          insertIndex++;
        }
        
        // Ensure monotonic increase in accuracy
        const prevAccuracy = insertIndex > 0 ? accuracyPoints[insertIndex - 1].accuracy : 0;
        const nextAccuracy = insertIndex < accuracyPoints.length ? 
          accuracyPoints[insertIndex].accuracy : 100;
          
        const correctedAccuracy = Math.max(
          prevAccuracy,
          Math.min(nextAccuracy, accuracy.accuracyPercent)
        );
        
        // Insert at the right position
        accuracyPoints.splice(insertIndex, 0, {
          harmonics: numHarmonics,
          accuracy: correctedAccuracy
        });
      }
      
      // Ensure monotonic increase
      for (let i = 1; i < accuracyPoints.length; i++) {
        if (accuracyPoints[i].accuracy < accuracyPoints[i-1].accuracy) {
          accuracyPoints[i].accuracy = accuracyPoints[i-1].accuracy;
        }
      }
      
      // Scale if maximum accuracy is too low
      const maxAccuracy = accuracyPoints[accuracyPoints.length - 1].accuracy;
      if (maxAccuracy < 95 && maxAccuracy > 0) {
        const scaleFactor = 100 / maxAccuracy;
        for (let i = 0; i < accuracyPoints.length; i++) {
          const newAccuracy = accuracyPoints[i].accuracy * scaleFactor;
          accuracyPoints[i].accuracy = Math.min(100, newAccuracy);
        }
      }
      
      setAccuracyData(accuracyPoints);
    };
  }, [numHarmonics]);
  
  // Handle harmonic slider change
  const handleHarmonicsChange = useCallback((newValue: number) => {
    setNumHarmonics(newValue);
    updateReconstructedWave(fourierCoefficients, newValue);
  }, [fourierCoefficients, updateReconstructedWave]);
  
  // Effect to generate wave when parameters change
  useEffect(() => {
    generateWave();
  }, [generateWave]);
  
  // Effect to clean up resources on unmount
  useEffect(() => {
    return () => {
      if (sourceNodeRef.current) {
        sourceNodeRef.current.stop();
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(err => {
          console.error('Error closing AudioContext:', err);
        });
      }
      clearWaveCache();
      reconstructionCache.clear();
    };
  }, []);
  
  // Play original or reconstructed sound
  const playSound = useCallback(async (isOriginal: boolean): Promise<void> => {
    setError('');
    
    try {
      // Initialize audio context if needed
      if (!audioContextRef.current) {
        if (typeof window === 'undefined') {
          setError('Браузерное окружение недоступно');
          return;
        }
        
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) {
          setError('Web Audio API не поддерживается в этом браузере');
          return;
        }
        
        audioContextRef.current = new AudioContextClass();
      }
      
      const audioContext = audioContextRef.current;
      
      // Resume audio context if needed
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }
      
      // Stop any current playback
      if (sourceNodeRef.current) {
        sourceNodeRef.current.stop();
        sourceNodeRef.current = null;
      }
      
      // Generate playback data
      const playbackDuration = 1.0; // 1 second
      let dataToPlay: WavePoint[];
      
      if (isOriginal) {
        switch (waveType) {
          case WAVE_TYPES.SINE:
            dataToPlay = generateSineWave(frequency, amplitude, playbackDuration);
            break;
          case WAVE_TYPES.SQUARE:
            dataToPlay = generateSquareWave(frequency, amplitude, playbackDuration);
            break;
          case WAVE_TYPES.SAWTOOTH:
            dataToPlay = generateSawtoothWave(frequency, amplitude, playbackDuration);
            break;
          case WAVE_TYPES.TRIANGLE:
            dataToPlay = generateTriangleWave(frequency, amplitude, playbackDuration);
            break;
          default:
            dataToPlay = generateSineWave(frequency, amplitude, playbackDuration);
        }
      } else {
        const cacheKey = createReconstructionCacheKey(
          fourierCoefficients, 
          playbackDuration, 
          frequency, 
          numHarmonics
        );
        
        if (reconstructionCache.has(cacheKey)) {
          dataToPlay = reconstructionCache.get(cacheKey)!;
        } else {
          dataToPlay = reconstructWaveFromFourier(
            fourierCoefficients, 
            playbackDuration, 
            frequency, 
            numHarmonics
          );
          reconstructionCache.set(cacheKey, dataToPlay);
        }
      }
      
      // Create audio buffer
      const buffer = createAudioBufferFromWave(audioContext, dataToPlay, playbackDuration);
      
      // Play sound
      sourceNodeRef.current = playAudioBuffer(audioContext, buffer, () => {
        setIsPlaying(false);
        sourceNodeRef.current = null;
      });
      
      setIsPlaying(true);
      
      // Auto-stop after 2 seconds
      setTimeout(() => {
        if (sourceNodeRef.current) {
          sourceNodeRef.current.stop();
          sourceNodeRef.current = null;
          setIsPlaying(false);
        }
      }, 2000);
      
    } catch (error) {
      console.error('Error playing sound:', error);
      setError(`Ошибка воспроизведения: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
      setIsPlaying(false);
    }
  }, [waveType, frequency, amplitude, fourierCoefficients, numHarmonics]);
  
  // Stop playback
  const stopSound = useCallback((): void => {
    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.stop();
        sourceNodeRef.current = null;
      } catch (error) {
        console.error('Error stopping sound:', error);
      }
    }
    setIsPlaying(false);
  }, []);
  
  // Get current accuracy percentage
  const accuracyPercentage = useMemo(() => {
    const currentPoint = accuracyData.find(p => p.harmonics === numHarmonics);
    if (currentPoint) {
      return currentPoint.accuracy.toFixed(2);
    }
    
    // Calculate if not available in trend data
    const accuracy = calculateReconstructionAccuracy(waveData, reconstructedWave);
    return accuracy.accuracyPercent.toFixed(2);
  }, [accuracyData, numHarmonics, waveData, reconstructedWave]);
  
  return (
    <div className="p-4 bg-[var(--background)] min-h-screen">
      <h1 className="text-2xl font-bold mb-6 text-center">Анализатор звуковых волн на основе рядов Фурье</h1>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Control Panel */}
        <div className="bg-[var(--card-bg)] p-4 rounded-lg shadow border border-[var(--card-border)]">
          <h2 className="text-xl font-semibold mb-4">Параметры сигнала</h2>
          
          {error && (
            <div className="bg-red-100 text-red-700 p-3 rounded mb-4 border border-red-300">
              {error}
            </div>
          )}
          
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
            <p className="mt-1 text-sm text-gray-600">{waveExplanation}</p>
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
              onChange={(e) => handleHarmonicsChange(Number(e.target.value))}
              className="w-full"
            />
          </div>
          
          <div className="mb-4">
            <label className="flex items-center space-x-2 cursor-pointer">
              <input 
                type="checkbox" 
                checked={useLogScale} 
                onChange={() => setUseLogScale(!useLogScale)}
                className="form-checkbox h-4 w-4 text-blue-600"
              />
              <span>Логарифмическая шкала для спектра</span>
            </label>
          </div>
          
          <div className="flex space-x-2 mt-6">
            <button 
              className="bg-[var(--primary)] hover:bg-[var(--primary-light)] text-white py-2 px-4 rounded transition-colors disabled:bg-gray-400"
              onClick={() => playSound(true)}
              disabled={isPlaying}
            >
              Проиграть оригинал
            </button>
            <button 
              className="bg-[var(--secondary)] hover:opacity-90 text-white py-2 px-4 rounded transition-colors disabled:bg-gray-400"
              onClick={() => playSound(false)}
              disabled={isPlaying}
            >
              Проиграть реконструкцию
            </button>
            <button 
              className="bg-[var(--error)] hover:opacity-90 text-white py-2 px-4 rounded transition-colors disabled:bg-gray-400"
              onClick={stopSound}
              disabled={!isPlaying}
            >
              Стоп
            </button>
          </div>
        </div>
        
        {/* Spectral Analysis */}
        <div className="bg-[var(--card-bg)] p-4 rounded-lg shadow border border-[var(--card-border)]">
          <SpectrumChart 
            data={spectralData} 
            useLogScale={useLogScale}
            highlightedHarmonics={getHighlightedHarmonics()}
            maxDisplayPoints={50}
          />
          
          <div className="mt-4 text-sm">
            <p><strong>Постоянная составляющая (DC):</strong> {fourierCoefficients.a0.toFixed(2)}</p>
            <p><strong>Основная гармоника:</strong> {spectralData[1]?.amplitude.toFixed(2) || 0}</p>
            <p><strong>Точность реконструкции:</strong> {accuracyPercentage}%</p>
          </div>
        </div>
        
        {/* Combined Wave Visualization - Updated design */}
        <div className="bg-[var(--card-bg)] p-4 rounded-lg shadow border border-[var(--card-border)] lg:col-span-2">
          <h2 className="text-xl font-semibold mb-4">Аппроксимация сигнала с помощью рядов Фурье</h2>
          
          <div className="h-96">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={combinedWaveData}
                margin={{ top: 10, right: 30, left: 10, bottom: 20 }}
              >
                <CartesianGrid strokeDasharray="3 3" opacity={0.5} />
                <XAxis 
                  dataKey="t" 
                  label={{ value: 'Время (с)', position: 'insideBottomRight', offset: -5 }} 
                  tickFormatter={(value) => value.toFixed(3)}
                  domain={[0, 'dataMax']}
                />
                <YAxis 
                  domain={[-amplitude * 1, amplitude * 1]}
                  tickFormatter={(value) => `${Math.abs(value) >= 1000 ? (value/1000).toFixed(0) + 'K' : value}`}
                  ticks={[-10000, -5000, 0, 5000, 10000]}
                />
                <Tooltip 
                  formatter={(value: any) => [value?.toFixed(0), '']}
                  labelFormatter={(label: any) => `Время: ${Number(label).toFixed(4)} с`}
                  contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.9)', border: '1px solid #ddd' }}
                />
                <Legend 
                  verticalAlign="bottom"
                  iconType="line"
                  wrapperStyle={{ paddingTop: '10px' }}
                />
                
                {/* Zero reference line */}
                <ReferenceLine y={0} stroke="#666" strokeWidth={0.5} />
                
                {/* Ideal wave */}
                {idealWaveData.length > 0 && (
                  <Line 
                    type="linear"
                    dataKey="ideal"
                    stroke="#000000"
                    strokeDasharray="5 5"
                    strokeWidth={1.5}
                    dot={false}
                    name="Идеальная форма волны"
                    isAnimationActive={false}
                  />
                )}
                
                {/* Reconstructed wave */}
                <Line 
                  type="linear"
                  dataKey="reconstructed"
                  stroke="#4CAF50"
                  strokeWidth={2}
                  dot={false}
                  name={`Реконструкция (${numHarmonics} гармоник)`}
                  isAnimationActive={false}
                />
                
                {/* Original wave */}
                <Line 
                  type="linear"
                  dataKey="original"
                  stroke="#3F51B5"
                  strokeWidth={1.5}
                  dot={false}
                  name="Исходный сигнал"
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          
          <div className="mt-4 text-sm text-gray-600">
            <p>Наблюдайте, как при изменении числа гармоник в блоке параметров сигнала меняется форма реконструированной волны.</p>
            <p>Чем больше гармоник, тем точнее аппроксимация приближается к идеальной форме волны.</p>
          </div>
        </div>
        
        {/* Accuracy Trend Chart */}
        <div className="bg-[var(--card-bg)] p-4 rounded-lg shadow border border-[var(--card-border)] lg:col-span-2">
          <h2 className="text-xl font-semibold mb-4">Зависимость точности реконструкции от числа гармоник</h2>
          
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={accuracyData}
                margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="harmonics" 
                  label={{ value: 'Количество гармоник', position: 'insideBottomRight', offset: -10 }} 
                />
                <YAxis 
                  label={{ value: 'Точность (%)', angle: -90, position: 'insideLeft' }}
                  domain={[0, 100]}
                />
                <Tooltip 
                  formatter={(value: number) => [`${value.toFixed(2)}%`, 'Точность']}
                  labelFormatter={(label: number) => `Гармоник: ${label}`}
                />
                <Legend />
                
                {/* Mark current harmonic count */}
                <Line 
                  type="monotone" 
                  dataKey="accuracy" 
                  stroke="#8884d8" 
                  activeDot={{ r: 8, fill: "#ff7300" }}
                  name="Точность реконструкции"
                />
                <ReferenceLine 
                  x={numHarmonics} 
                  stroke="red" 
                  strokeDasharray="3 3"
                  label={{ value: 'Текущее', position: 'top', fill: 'red' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          
          <div className="mt-2 text-sm text-gray-600">
            <p>График показывает, как изменяется точность реконструкции сигнала при увеличении числа используемых гармоник.</p>
            <p>Для разных типов волн характерна разная скорость сходимости ряда Фурье:</p>
            <ul className="list-disc pl-5 mt-1">
              <li>Синусоида идеально воспроизводится одной гармоникой</li>
              <li>Прямоугольная волна требует большого количества нечетных гармоник</li>
              <li>Пилообразная волна сходится медленнее всего и требует как четных, так и нечетных гармоник</li>
            </ul>
          </div>
        </div>
        
        {/* Explanation Section */}
        <div className="bg-[var(--card-bg)] p-4 rounded-lg shadow border border-[var(--card-border)] lg:col-span-2">
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
            <li>Изменяйте число гармоник с помощью ползунка и наблюдайте, как меняется форма восстановленного сигнала</li>
            <li>Обратите внимание, как при увеличении числа гармоник аппроксимация приближается к идеальной форме волны</li>
            <li>Изучите спектральный состав сигнала на диаграмме</li>
            <li>Прослушайте как оригинальный, так и восстановленный сигналы</li>
          </ol>
          <p className="mb-2">
            <strong>Термины и метрики:</strong>
          </p>
          <ul className="list-disc pl-5 mb-4">
            <li><strong>Гармоника</strong> - синусоидальная составляющая сигнала с частотой, кратной основной частоте</li>
            <li><strong>Спектр</strong> - набор амплитуд всех гармонических составляющих сигнала</li>
            <li><strong>Ряд Фурье</strong> - представление периодической функции в виде суммы синусов и косинусов разных частот</li>
            <li><strong>Точность реконструкции</strong> - мера соответствия восстановленного сигнала оригинальному</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default WaveAnalyzer;