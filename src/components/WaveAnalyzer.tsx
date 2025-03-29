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
  calculateFourierCoefficients, 
  reconstructWaveFromFourier, 
  prepareSpectralData,
  FourierCoefficients,
  SpectralPoint,
  calculateReconstructionAccuracy
} from '@/utils/fourierTransform';
import { createAudioBufferFromWave, playAudioBuffer } from '@/utils/audioUtils';
import { WAVE_TYPES, SAMPLE_RATE, MAX_AMPLITUDE, DEFAULT_DURATION } from '@/constants/audioConstants';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, 
  ResponsiveContainer, ReferenceLine, BarChart, Bar, Cell 
} from 'recharts';

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
  
  // State for showing enhanced spectral visualization
  const [useLogScale, setUseLogScale] = useState<boolean>(false);
  
  // Refs for Web Audio API objects
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  
  // Combined data for dynamic visualization with precise time alignment
  const combinedWaveData = useMemo(() => {
    // Create a combined dataset with original and reconstructed waves
    if (!waveData.length || !reconstructedWave.length) return [];
    
    // Create a unified time grid to ensure perfect alignment
    const startTime = 0;
    const endTime = duration;
    const maxPoints = 1000; // Higher resolution for smoother curves
    const timeStep = (endTime - startTime) / maxPoints;
    
    const result = [];
    
    // Use interpolation to sample both waves at exactly the same time points
    for (let i = 0; i <= maxPoints; i++) {
      const t = startTime + i * timeStep;
      
      // Find nearest points in original data
      const origIndex = waveData.findIndex(p => p.t >= t);
      let originalValue = null;
      
      if (origIndex > 0) {
        // Linear interpolation between points for smoother rendering
        const p1 = waveData[origIndex - 1];
        const p2 = waveData[origIndex];
        const factor = (t - p1.t) / (p2.t - p1.t);
        originalValue = p1.value + factor * (p2.value - p1.value);
      } else if (origIndex === 0) {
        originalValue = waveData[0].value;
      } else if (origIndex === -1 && waveData.length > 0) {
        originalValue = waveData[waveData.length - 1].value;
      }
      
      // Find nearest points in reconstructed data
      const reconIndex = reconstructedWave.findIndex(p => p.t >= t);
      let reconstructedValue = null;
      
      if (reconIndex > 0) {
        // Linear interpolation between points
        const p1 = reconstructedWave[reconIndex - 1];
        const p2 = reconstructedWave[reconIndex];
        const factor = (t - p1.t) / (p2.t - p1.t);
        reconstructedValue = p1.value + factor * (p2.value - p1.value);
      } else if (reconIndex === 0) {
        reconstructedValue = reconstructedWave[0].value;
      } else if (reconIndex === -1 && reconstructedWave.length > 0) {
        reconstructedValue = reconstructedWave[reconstructedWave.length - 1].value;
      }
      
      result.push({
        t,
        original: originalValue,
        reconstructed: reconstructedValue
      });
    }
    
    return result;
  }, [waveData, reconstructedWave, duration]);
  
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
    
    // Calculate Fourier coefficients
    const coefficients = calculateFourierCoefficients(data, 50);
    setFourierCoefficients(coefficients);
    
    // Reconstruct wave with current harmonic count
    updateReconstructedWave(coefficients, numHarmonics);
    
    // Prepare spectral data
    const spectral = prepareSpectralData(coefficients, frequency);
    setSpectralData(spectral);
    
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
    // Calculate accuracy if not available in trend data
    const accuracy = calculateReconstructionAccuracy(waveData, reconstructedWave);
    return accuracy.accuracyPercent.toFixed(2);
  }, [waveData, reconstructedWave]);
  
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
              <option value={WAVE_TYPES.SINE}>{WAVE_TYPES.SINE}</option>
              <option value={WAVE_TYPES.SQUARE}>{WAVE_TYPES.SQUARE}</option>
              <option value={WAVE_TYPES.SAWTOOTH}>{WAVE_TYPES.SAWTOOTH}</option>
              <option value={WAVE_TYPES.TRIANGLE}>{WAVE_TYPES.TRIANGLE}</option>
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
        
        {/* Spectral Analysis - Optimized */}
        <div className="bg-[var(--card-bg)] p-4 rounded-lg shadow border border-[var(--card-border)]">
          <h2 className="text-xl font-semibold mb-4">Спектральный анализ</h2>
          
          <div className="h-72"> {/* Increased height for better visualization */}
            <ResponsiveContainer width="100%" height="100%">
              <BarChart 
                data={spectralData.filter(d => d.harmonic <= 50)} 
                margin={{ top: 15, right: 30, left: 70, bottom: 60 }} /* Adjusted margins for label positioning */
                barGap={1}
                barCategoryGap={1}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.7} />
                <XAxis 
                  dataKey="harmonic" 
                  label={{ 
                    value: 'Номер гармоники', 
                    position: 'insideBottom', 
                    offset: -10,
                    dy: 35 /* Move label down */
                  }}
                  tick={{ dy: 5 }} /* Move tick values down */
                  tickLine={{ stroke: '#666', strokeWidth: 1 }}
                  axisLine={{ stroke: '#666', strokeWidth: 1 }}
                />
                <YAxis 
                  label={{ 
                    value: 'Амплитуда', 
                    angle: -90, 
                    position: 'insideLeft',
                    dx: -50, /* Move label left */
                    style: { textAnchor: 'middle' }
                  }}
                  scale={useLogScale ? 'log' : 'linear'}
                  domain={useLogScale ? ['auto', 'auto'] : [0, 'auto']}
                  tickFormatter={value => 
                    value >= 1000 ? `${(value / 1000).toFixed(0)}K` : value
                  }
                  tick={{ dx: -5 }} /* Move tick values left */
                  tickLine={{ stroke: '#666', strokeWidth: 1 }}
                  axisLine={{ stroke: '#666', strokeWidth: 1 }}
                  width={60} /* Ensure enough width for labels */
                />
                <Tooltip 
                  formatter={(value: number) => [value.toFixed(2), 'Амплитуда']}
                  labelFormatter={(label: number) => `Гармоника: ${label}`}
                  contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.95)', borderRadius: '4px', padding: '8px', boxShadow: '0 2px 10px rgba(0,0,0,0.1)' }}
                />
                <Legend 
                  verticalAlign="top"
                  align="right"
                  wrapperStyle={{ paddingBottom: '10px', right: '30px' }}
                  iconSize={10}
                />
                <Bar 
                  dataKey="amplitude" 
                  name="Амплитуда"
                  fill="#3563E9"
                  radius={[1, 1, 0, 0]} /* Slightly rounded top corners */
                  maxBarSize={25}
                >
                  {/* Highlight important harmonics */}
                  {spectralData.map((entry, index) => {
                    const isHighlighted = getHighlightedHarmonics().includes(entry.harmonic);
                    return (
                      <Cell 
                        key={`cell-${index}`}
                        fill={isHighlighted ? '#FF7300' : '#3563E9'} 
                        stroke={isHighlighted ? '#FF4500' : '#3563E9'}
                        strokeWidth={isHighlighted ? 2 : 1}
                      />
                    );
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          
          <div className="mt-4 text-sm bg-gray-50 p-3 rounded-md border border-gray-200">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="font-medium">Постоянная составляющая (DC):</p>
                <p className="text-lg font-semibold">{fourierCoefficients.a0.toFixed(2)}</p>
              </div>
              <div>
                <p className="font-medium">Основная гармоника:</p>
                <p className="text-lg font-semibold">{spectralData[1]?.amplitude.toFixed(2) || 0}</p>
              </div>
              <div>
                <p className="font-medium">Точность реконструкции:</p>
                <p className="text-lg font-semibold">{accuracyPercentage}%</p>
              </div>
            </div>
          </div>
        </div>
        
        {/* Combined Wave Visualization - Updated design */}
        <div className="bg-[var(--card-bg)] p-4 rounded-lg shadow border border-[var(--card-border)] lg:col-span-2">
          <h2 className="text-xl font-semibold mb-4">Аппроксимация сигнала с помощью рядов Фурье</h2>
          
          <div className="h-96">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={combinedWaveData}
                margin={{ top: 20, right: 30, left: 40, bottom: 40 }}
                syncId="waveforms"
              >
                <CartesianGrid strokeDasharray="3 3" opacity={0.5} />
                <XAxis 
                  dataKey="t" 
                  label={{ 
                    value: 'Время (с)', 
                    position: 'insideBottom', 
                    offset: -10,
                    style: { textAnchor: 'middle' }
                  }} 
                  tickFormatter={(value) => value.toFixed(3)}
                  domain={[0, 'dataMax']}
                  padding={{ left: 5, right: 5 }}
                />
                <YAxis 
                  domain={[-amplitude * 1.1, amplitude * 1.1]}
                  tickFormatter={(value) => `${Math.abs(value) >= 1000 ? (value/1000).toFixed(0) + 'K' : value}`}
                  ticks={[-amplitude, -amplitude/2, 0, amplitude/2, amplitude]}
                  label={{
                    value: 'Амплитуда', 
                    angle: -90, 
                    position: 'insideLeft',
                    offset: -25,
                    style: { textAnchor: 'middle' }
                  }}
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
                  align="center"
                />
                
                {/* Zero reference line */}
                <ReferenceLine y={0} stroke="#666" strokeWidth={0.5} />
                
                {/* Original wave first for proper layering */}
                <Line 
                  type="linear"
                  dataKey="original"
                  stroke="#4169E1" // Royal blue
                  strokeWidth={2}
                  dot={false}
                  name="Исходный сигнал"
                  isAnimationActive={false}
                  connectNulls={true}
                />
                
                {/* Reconstructed wave */}
                <Line 
                  type="linear"
                  dataKey="reconstructed"
                  stroke="#2E8B57" // Sea green
                  strokeWidth={2}
                  dot={false}
                  name={`Реконструкция (${numHarmonics} гармоник)`}
                  isAnimationActive={false}
                  connectNulls={true}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          
          <div className="mt-4 text-sm text-gray-600">
            <p>Наблюдайте, как при изменении числа гармоник в блоке параметров сигнала меняется форма реконструированной волны.</p>
            <p>Чем больше гармоник, тем точнее аппроксимация приближается к оригинальному сигналу.</p>
          </div>
        </div>
        
        {/* Explanation Section */}
        <div className="bg-[var(--card-bg)] p-4 rounded-lg shadow border border-[var(--card-border)] lg:col-span-2">
          <h2 className="text-xl font-semibold mb-4">О проекте</h2>
          <p className="mb-2">
            Данный интерактивный комплекс демонстрирует принципы разложения периодических звуковых волн в ряд Фурье и обратного синтеза сигнала.
          </p>
          <p className="mb-4">
            <strong>Важное замечание о разнице звучания:</strong> Различие между оригинальным и реконструированным звуком — ожидаемое поведение. Реконструкция использует лишь ограниченное число гармоник, тогда как идеальные формы волн (особенно прямоугольная и пилообразная) теоретически требуют бесконечного числа гармоник для точного воспроизведения резких переходов. При увеличении числа гармоник звучание реконструкции приближается к оригиналу.
          </p>
          <p className="mb-2">
            <strong>Как использовать:</strong>
          </p>
          <ol className="list-decimal pl-5 mb-4">
            <li>Выберите тип волны (синусоида, прямоугольная, пилообразная или треугольная)</li>
            <li>Настройте частоту и амплитуду сигнала</li>
            <li>Изменяйте число гармоник с помощью ползунка и наблюдайте, как меняется форма восстановленного сигнала</li>
            <li>Обратите внимание на спектральный состав сигнала на диаграмме</li>
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