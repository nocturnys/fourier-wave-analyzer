/**
 * Улучшенный тюнер, использующий преобразование Фурье для анализа звука
 * Этот компонент расширяет функциональность SimpleMicrophoneTuner
 * и добавляет визуализацию спектра Фурье
 */

"use client";

import React, { useState, useEffect, useRef, useMemo, JSX } from 'react';
import { NOTE_NAMES_RU } from '@/constants/noteFrequencies';
import dynamic from 'next/dynamic';
import { ArrowDown, ArrowUp, Check, Mic, Volume2, Radio } from 'lucide-react';

// Динамический импорт Plotly для предотвращения ошибок SSR
const Plot = dynamic(() => import('react-plotly.js'), {
  ssr: false,
  loading: () => <div className="text-center py-8 text-gray-500">Loading graph...</div>
});

// Определяем типы для использования webkitAudioContext
declare global {
  interface Window {
    webkitAudioContext: typeof AudioContext;
  }
}

interface DetectedNote {
  note: string;
  nameRu: string;
  frequency: number;
  cents: number;
}

interface Harmonic {
  harmonic: number;
  frequency: number;
  amplitude: number;
  relativeAmplitude: number; // в процентах от основной
}

const FourierTuner: React.FC = () => {
  // Состояния компонента
  const [isActive, setIsActive] = useState(false);
  const [error, setError] = useState('');
  const [volume, setVolume] = useState(0);
  const [detectedNote, setDetectedNote] = useState<DetectedNote | null>(null);
  const [referenceFrequency] = useState(440); // A4 = 440Hz
  
  // Новые состояния для анализа Фурье
  const [spectrumData, setSpectrumData] = useState<number[]>([]);
  const [frequencyAxis, setFrequencyAxis] = useState<number[]>([]);
  const [harmonics, setHarmonics] = useState<Harmonic[]>([]);
  
  // Рефы для аудио-объектов
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const microphoneStreamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  
  // ВАЖНО: используем ref для отслеживания активности вместо состояния
  const isActiveRef = useRef<boolean>(false);

  // Функция для запуска тюнера
  const startTuner = async () => {
    try {
      // Если тюнер уже активен, останавливаем его
      if (isActive) {
        console.log("Тюнер уже активен, останавливаем");
        stopTuner();
        return;
      }
      
      setError('');
      setDetectedNote(null); // Сбрасываем предыдущую ноту
      
      // Устанавливаем флаг активности
      isActiveRef.current = true;
      console.log("Устанавливаем флаг активности в true (через ref)");
      
      // Обновляем состояние React для UI
      setIsActive(true);
      
      console.log("Запуск тюнера...");
      
      // Создание нового аудио контекста
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
                               
      if (!AudioContextClass) {
        throw new Error('Ваш браузер не поддерживает Web Audio API');
      }
      
      const context = new AudioContextClass();
      audioContextRef.current = context;
      
      console.log("AudioContext создан, sampleRate:", context.sampleRate);
      
      // Запрос доступа к микрофону
      if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
        throw new Error('Ваш браузер не поддерживает доступ к микрофону');
      }
      
      console.log("Запрашиваем доступ к микрофону...");
      
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        }
      });
      
      console.log("Доступ к микрофону получен, треков:", stream.getAudioTracks().length);
      
      // Проверка работы потока и трека
      if (stream.getAudioTracks().length === 0) {
        throw new Error('Микрофон доступен, но аудио-треки не обнаружены');
      }
      
      // Активизируем трек
      const audioTrack = stream.getAudioTracks()[0];
      console.log("Активный микрофон:", audioTrack.label);
      audioTrack.enabled = true;
      
      // Сохраняем поток в ref
      microphoneStreamRef.current = stream;
      
      // Создаем анализатор с большим размером FFT для лучшего разрешения
      const analyser = context.createAnalyser();
      analyser.fftSize = 4096; // Увеличиваем размер FFT для лучшего разрешения по частоте
      analyser.smoothingTimeConstant = 0.5;
      analyserRef.current = analyser;
      
      console.log("Analyser создан, fftSize:", analyser.fftSize);
      
      // Подготовка данных для спектра
      const frequencyBinCount = analyser.frequencyBinCount;
    //   const freqData = new Float32Array(frequencyBinCount);
      
      // Создаем оси частот для спектра
      const sampleRate = context.sampleRate;
      const frequencies = Array.from(
        { length: frequencyBinCount }, 
        (_, i) => i * sampleRate / analyser.fftSize
      );
      setFrequencyAxis(frequencies);
      
      // Запускаем аудио контекст
      if (context.state !== 'running') {
        await context.resume();
      }
      
      // Подключаем микрофон напрямую к анализатору
      const microphone = context.createMediaStreamSource(stream);
      microphone.connect(analyser);
      
      console.log("Микрофон подключен к анализатору напрямую");
      
      // Запускаем анализ синхронно
      analyzeSound();
      
    } catch (err) {
      console.error("Ошибка запуска тюнера:", err);
      setError(`Ошибка: ${err instanceof Error ? err.message : 'Невозможно получить доступ к микрофону'}`);
      isActiveRef.current = false;
      setIsActive(false);
      stopTuner();
    }
  };

  // Функция для остановки тюнера
  const stopTuner = () => {
    console.log("Остановка тюнера...");
    
    // Обновляем состояния
    setIsActive(false);
    isActiveRef.current = false;
    
    // Остановка анализа
    if (animationFrameRef.current) {
      console.log("Отменяем animationFrame:", animationFrameRef.current);
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    
    // Очищаем данные спектра
    setSpectrumData([]);
    setHarmonics([]);
    
    // Остановка микрофона
    if (microphoneStreamRef.current) {
      console.log("Останавливаем треки микрофона");
      microphoneStreamRef.current.getTracks().forEach(track => {
        console.log("Останавливаем трек:", track.kind, track.label);
        track.stop();
      });
      microphoneStreamRef.current = null;
    }
    
    // Закрытие AudioContext
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      try {
        audioContextRef.current.close().then(() => {
          console.log("AudioContext закрыт");
          audioContextRef.current = null;
        }).catch(err => {
          console.error("Ошибка при закрытии AudioContext:", err);
        });
      } catch (e) {
        console.warn("Ошибка при закрытии AudioContext:", e);
      }
    }
    
    // Обнуление данных
    setDetectedNote(null);
    setVolume(0);
  };

  // Функция для анализа звука
  const analyzeSound = () => {
    // Проверяем флаг активности через ref
    if (!isActiveRef.current) {
      console.log("Анализ прекращен - isActiveRef = false");
      return;
    }
    
    if (!analyserRef.current || !audioContextRef.current) {
      console.log("Анализ невозможен - analyser или audioContext не инициализированы");
      return;
    }
    
    try {
      // Получаем данные из анализатора
      const analyser = analyserRef.current;
      
      // Получаем временные данные
      const timeDataArray = new Float32Array(analyser.fftSize);
      analyser.getFloatTimeDomainData(timeDataArray);
      
      // Получаем частотные данные (спектр)
      const frequencyDataArray = new Float32Array(analyser.frequencyBinCount);
      analyser.getFloatFrequencyData(frequencyDataArray);
      
      // Преобразуем данные спектра из dB в линейные значения и нормализуем
      const linearSpectrum = Array.from(frequencyDataArray).map(db => Math.pow(10, db / 20));
      
      // Обновляем состояние спектра
      setSpectrumData(linearSpectrum);
      
      // Анализируем данные для отладки
      let maxVal = 0;
      let minVal = 0;
      
      // Расчет RMS (громкости)
      let sum = 0;
      for (let i = 0; i < timeDataArray.length; i++) {
        const value = timeDataArray[i];
        maxVal = Math.max(maxVal, value);
        minVal = Math.min(minVal, value);
        sum += value * value;
      }
      
      const rms = Math.sqrt(sum / timeDataArray.length);
      
      // Обновляем отображение громкости с усилением
      setVolume(rms * 10);
      
      // Анализируем только если достаточная громкость
      if (rms > 0.001) {
        // Определяем частоту с помощью FFT
        const frequency = detectPitchFFT(frequencyDataArray, audioContextRef.current.sampleRate);
        
        if (frequency > 0) {
          // Определяем ноту
          const note = identifyNote(frequency);
          console.log(`Нота: ${note.note}, частота: ${frequency.toFixed(1)} Гц, отклонение: ${note.cents} центов`);
          
          setDetectedNote({
            note: note.note,
            nameRu: getNoteNameRu(note.note),
            frequency,
            cents: note.cents
          });
          
          // Анализируем гармоники
          const foundHarmonics = findHarmonics(
            frequencyDataArray, 
            audioContextRef.current.sampleRate, 
            frequency
          );
          setHarmonics(foundHarmonics);
        }
      } else if (detectedNote) {
        // Сбрасываем ноту при слабом сигнале
        setDetectedNote(null);
        setHarmonics([]);
      }
      
      // Планируем следующий анализ только если активно
      if (isActiveRef.current) {
        animationFrameRef.current = requestAnimationFrame(analyzeSound);
      } else {
        console.log("Анализ остановлен, т.к. isActiveRef = false");
      }
    } catch (err) {
      console.error("Ошибка анализа:", err);
      
      // Продолжаем анализ даже при ошибке, если флаг активен
      if (isActiveRef.current) {
        animationFrameRef.current = requestAnimationFrame(analyzeSound);
      }
    }
  };
  
  // Функция для определения частоты с помощью FFT
  const detectPitchFFT = (frequencyData: Float32Array, sampleRate: number): number => {
    const analyser = analyserRef.current;
    if (!analyser) return -1;
    
    // Размер БПФ
    const fftSize = analyser.fftSize;
    // Число точек в частотной области
    const numBins = analyser.frequencyBinCount;
    // Частотный шаг между соседними бинами
    const binWidth = sampleRate / fftSize;
    
    // Преобразуем из dB в линейную шкалу
    const linearData = Array.from(frequencyData).map(db => Math.pow(10, db / 20));
    
    // Ищем бин с максимальной энергией в интересующем нас диапазоне частот (20-2000 Гц)
    const minBin = Math.floor(20 / binWidth);
    const maxBin = Math.min(numBins - 1, Math.floor(2000 / binWidth));
    
    // Найдем индекс максимального значения
    let maxIndex = minBin;
    let maxValue = linearData[minBin];
    
    for (let i = minBin + 1; i <= maxBin; i++) {
      if (linearData[i] > maxValue) {
        maxValue = linearData[i];
        maxIndex = i;
      }
    }
    
    // Если сигнал слишком слабый, не считаем это валидной частотой
    if (maxValue < 0.001) {
      return -1;
    }
    
    // Используем параболическую интерполяцию для уточнения пика
    let peakIndex = maxIndex;
    
    if (maxIndex > 0 && maxIndex < numBins - 1) {
      const y1 = linearData[maxIndex - 1];
      const y2 = linearData[maxIndex];
      const y3 = linearData[maxIndex + 1];
      
      // Используем формулу параболической интерполяции
      const d = (y3 - y1) / (2 * (2 * y2 - y1 - y3));
      
      // Если интерполяция имеет смысл, применяем её
      if (Math.abs(d) < 1) {
        peakIndex = maxIndex + d;
      }
    }
    
    // Вычисляем частоту
    const frequency = peakIndex * binWidth;
    
    return frequency;
  };
  
  // Функция для поиска гармоник к основной частоте
  const findHarmonics = (
    frequencyData: Float32Array, 
    sampleRate: number, 
    fundamentalFreq: number
  ): Harmonic[] => {
    const analyser = analyserRef.current;
    if (!analyser) return [];
    
    const binWidth = sampleRate / analyser.fftSize;
    
    // Преобразуем из dB в линейную шкалу
    const linearData = Array.from(frequencyData).map(db => Math.pow(10, db / 20));
    
    // Найдем бин, соответствующий основной частоте
    const fundamentalBin = Math.round(fundamentalFreq / binWidth);
    // Значение основной гармоники
    const fundamentalAmplitude = linearData[fundamentalBin];
    
    // Массив для хранения найденных гармоник
    const harmonics: Harmonic[] = [
      {
        harmonic: 1,
        frequency: fundamentalFreq,
        amplitude: fundamentalAmplitude,
        relativeAmplitude: 100 // Основная гармоника - 100%
      }
    ];
    
    // Ищем последующие гармоники (до 10-й)
    for (let n = 2; n <= 10; n++) {
      // Ожидаемая частота n-й гармоники
      const expectedFreq = fundamentalFreq * n;
      
      // Если выходит за пределы диапазона анализа, прекращаем поиск
      if (expectedFreq > sampleRate / 2) break;
      
      // Диапазон поиска (учитываем возможное отклонение)
      const tolerance = binWidth * 2;
      const minBin = Math.max(0, Math.floor((expectedFreq - tolerance) / binWidth));
      const maxBin = Math.min(linearData.length - 1, Math.ceil((expectedFreq + tolerance) / binWidth));
      
      // Ищем максимум в этом диапазоне
      let maxHarmonicBin = minBin;
      let maxHarmonicValue = linearData[minBin];
      
      for (let i = minBin + 1; i <= maxBin; i++) {
        if (linearData[i] > maxHarmonicValue) {
          maxHarmonicValue = linearData[i];
          maxHarmonicBin = i;
        }
      }
      
      // Считаем относительную амплитуду
      const relativeAmplitude = (maxHarmonicValue / fundamentalAmplitude) * 100;
      
      // Добавляем в список, если амплитуда значима (больше 1% от основной)
      if (relativeAmplitude > 1) {
        harmonics.push({
          harmonic: n,
          frequency: maxHarmonicBin * binWidth,
          amplitude: maxHarmonicValue,
          relativeAmplitude
        });
      }
    }
    
    return harmonics;
  };

  // Функция для определения ноты по частоте
  const identifyNote = (frequency: number): { note: string; cents: number } => {
    // Находим ближайшую ноту по логарифмической шкале
    const noteNumber = 12 * Math.log2(frequency / referenceFrequency) + 69; // A4 = 69 в MIDI
    const roundedNoteNumber = Math.round(noteNumber);
    
    // Вычисляем отклонение в центах
    const cents = Math.round((noteNumber - roundedNoteNumber) * 100);
    
    // Преобразуем MIDI-номер в название ноты
    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const octave = Math.floor((roundedNoteNumber - 12) / 12);
    const noteName = noteNames[roundedNoteNumber % 12];
    
    return {
      note: `${noteName}${octave}`,
      cents: cents
    };
  };

  // Функция для получения русского названия ноты
  const getNoteNameRu = (noteCode: string): string => {
    const noteLetter = noteCode.replace(/\d/g, '');
    const octave = noteCode.match(/\d+/)?.[0] || '';
    
    return `${NOTE_NAMES_RU[noteLetter]}${octave}`;
  };

  // Функция для получения статуса настройки
  const getTuningStatus = (): { status: 'perfect' | 'close' | 'out-of-tune'; color: string } => {
    if (!detectedNote) return { status: 'out-of-tune', color: '#ccc' };
    
    const cents = Math.abs(detectedNote.cents);
    if (cents < 5) {
      return { status: 'perfect', color: '#4caf50' }; // Зеленый
    } else if (cents < 15) {
      return { status: 'close', color: '#ff9800' }; // Оранжевый
    } else {
      return { status: 'out-of-tune', color: '#f44336' }; // Красный
    }
  };

  // Улучшенная функция для отображения направления настройки с иконками
  const getTuningDirectionIcon = (): JSX.Element => {
    if (!detectedNote) return <span className="text-gray-400">—</span>;
    
    if (detectedNote.cents < -5) {
      return <ArrowDown className="text-red-500 w-12 h-12" />; // Увеличил размер с w-10 h-10 до w-12 h-12
    } else if (detectedNote.cents > 5) {
      return <ArrowUp className="text-red-500 w-12 h-12" />; // Увеличил размер
    } else {
      return <Check className="text-green-500 w-12 h-12" />; // Увеличил размер
    }
  };

  // Эффект для очистки ресурсов при размонтировании
  useEffect(() => {
    return () => {
      stopTuner();
    };
  }, []);

  // Получение данных о настройке
  const tuningStatus = getTuningStatus();
  
  // Данные для графика спектра
  const spectralPlotData = useMemo(() => {
    if (spectrumData.length === 0 || frequencyAxis.length === 0) {
      return [];
    }
    
    // Ограничим диапазон частот до 3000 Гц для лучшей видимости
    const maxFreq = 3000;
    const maxIndex = frequencyAxis.findIndex(f => f > maxFreq);
    const limitedIndex = maxIndex === -1 ? frequencyAxis.length : maxIndex;
    
    return [
      {
        x: frequencyAxis.slice(0, limitedIndex),
        y: spectrumData.slice(0, limitedIndex),
        type: 'scatter',
        mode: 'lines',
        name: 'Спектр',
        line: {
          color: '#4169E1',
          width: 2
        }
      }
    ];
  }, [spectrumData, frequencyAxis]);
  
  // Конфигурация графика спектра с исправленным type
  const spectralPlotLayout = {
    title: 'Спектр сигнала (Преобразование Фурье)',
    xaxis: {
      title: 'Частота (Гц)',
      range: [0, 3000]
    },
    yaxis: {
      title: 'Амплитуда',
      type: 'log' as const // Исправлено: используем 'as const' вместо 'as log'
    },
    height: 300,
    margin: { l: 60, r: 30, t: 50, b: 50 }
  };

  return (
    <div className="p-4 bg-gray-50 rounded-lg">
      <h1 className="text-2xl font-bold mb-6 text-center">Анализатор звуковых волн</h1>
      
      <div className="bg-white p-4 rounded-lg shadow mb-6">
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}
        
        <div className="flex justify-center mb-6">
          <button 
            className={`py-2 px-6 rounded-full text-white font-medium focus:outline-none transition-colors ${
              isActive 
                ? 'bg-red-500 hover:bg-red-600' 
                : 'bg-[var(--primary)] hover:bg-[var(--primary-light)]'
            }`}
            onClick={startTuner}
          >
            {isActive ? 'Остановить' : 'Начать анализ'}
          </button>
        </div>
        
        {/* Status indicator */}
        <div className="text-center text-sm mb-4">
          <div className="flex items-center justify-center">
            <div className={`w-3 h-3 rounded-full mr-2 ${
              isActive ? 'bg-green-500 animate-pulse' : 'bg-gray-400'
            }`}></div>
            <span>
              Статус: {isActive ? 'Анализ активен' : 'Ожидание запуска'}
            </span>
          </div>
        </div>
        
        {/* Улучшенный индикатор громкости */}
        <div className="mb-4">
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span className="flex items-center">
              <Volume2 className="w-4 h-4 mr-1" />
              Тихо
            </span>
            <span>Громко</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-4 relative overflow-hidden">
            <div 
              className="bg-gradient-to-r from-blue-400 to-blue-600 h-4 transition-all duration-100"
              style={{ width: `${Math.min(100, volume * 100)}%` }}
            ></div>
            <div className="absolute h-full w-0.5 bg-red-500" style={{ left: '1%', top: 0 }}></div>
          </div>
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>Уровень сигнала: {(volume * 100).toFixed(1)}%</span>
            <span>{isActive ? (volume > 0.01 ? "Сигнал обнаружен" : "Слишком тихо") : "Неактивно"}</span>
          </div>
        </div>
        
        {/* Спектральный анализ (График Фурье) */}
        {isActive && (
          <div className="mb-6 p-2 bg-gray-50 rounded border">
            <h3 className="text-lg font-semibold mb-2">Спектральный анализ</h3>
            {spectralPlotData.length > 0 ? (
            <Plot
                data={spectralPlotData as Plotly.Data[]}
                layout={spectralPlotLayout}
                config={{ responsive: true }}
                style={{ width: '100%' }}
            />
            ) : (
              <div className="text-center py-8 text-gray-500">
                Ожидание данных спектра...
              </div>
            )}
            
            <div className="text-xs text-gray-600 mt-2">
              График представляет разложение звукового сигнала на частотные компоненты с помощью преобразования Фурье.
              Пики на графике соответствуют обнаруженным частотам (гармоникам) в звуке.
            </div>
          </div>
        )}
        
        {/* Отладочная информация */}
        {isActive && (
          <div className="mb-4 p-2 bg-gray-100 rounded text-xs overflow-auto max-h-20 text-left">
            <p>Статус: {detectedNote ? 
              `Нота ${detectedNote.note} (${detectedNote.frequency.toFixed(1)} Гц, ${detectedNote.cents > 0 ? '+' : ''}${detectedNote.cents} центов)` : 
              "Ожидание звука..."}
            </p>
            <p>Метод анализа: Преобразование Фурье (БПФ)</p>
          </div>
        )}
      </div>
      
      {/* Tuning Display */}
      <div className="bg-white border border-gray-400 p-6 rounded-lg shadow mb-6 text-center">
        {detectedNote ? (
          <>
            <div className="flex justify-between items-center mb-12">
              <div className="text-4xl font-bold text-gray-500">
                {detectedNote.note.replace(/\d/g, '')}
              </div>
              <div className="text-6xl font-bold rounded-lg py-2 px-6" 
                  style={{ 
                    color: tuningStatus.color,
                    backgroundColor: `${tuningStatus.color}10` // Светлый фон того же цвета
                  }}>
                {detectedNote.nameRu.replace(/\d/g, '')}
                <span className="text-3xl ml-1">{detectedNote.note.match(/\d+/)?.[0] || ''}</span>
              </div>
              <div className="text-4xl font-bold text-gray-500">
                {detectedNote.frequency.toFixed(1)} Гц
              </div>
            </div>
            
            {/* Улучшенный индикатор настройки */}
            <div className="relative p-6  rounded-lg h-36 mb-12"> {/* Увеличил высоту контейнера с h-24 до h-32 */}
                <div className="absolute top-0 left-0 w-full h-10 bg-gray-100 rounded-full overflow-hidden border border-gray-300 shadow-inner"> {/* Добавил border и увеличил высоту с h-8 до h-10 */}
                    {/* Отметки шкалы */}
                    {Array.from({ length: 11 }).map((_, i) => (
                    <div 
                        key={i} 
                        className={`absolute top-0 h-full w-px ${i === 5 ? 'bg-green-500' : 'bg-gray-300'}`} 
                        style={{ left: `${i * 10}%` }}
                    />
                    ))}
                    
                    {/* Индикатор настройки - сделал более заметным */}
                    <div 
                    className="absolute top-1 h-8 bg-blue-500 shadow-lg transition-all duration-300 w-8 rounded-full border-2 border-white"
                    style={{ 
                        left: `calc(50% + ${detectedNote.cents * 2}px)`,
                        transform: 'translateX(-50%)'
                    }}
                    />
                </div>
                
                {/* Увеличил отступ сверху, чтобы стрелки были видны хорошо */}
                <div className="mt-16 text-center"> {/* Изменил mt-12 на mt-16 */}
                    <div className="flex justify-center">
                    {getTuningDirectionIcon()}
                    </div>
                    <div className="mt-2 text-xl">
                    {detectedNote.cents > 0 ? '+' : ''}{detectedNote.cents.toFixed(0)} центов
                    </div>
                </div>
                </div>
            
            {/* Гармонический анализ */}
            {harmonics.length > 0 && (
              <div className="mt-6 mb-4">
                <h3 className="text-lg font-semibold mb-3">Гармонический состав</h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">№ гармоники</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Частота (Гц)</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">% от основной</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Визуализация</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {harmonics.map((harmonic, index) => (
                        <tr key={index}>
                          <td className="px-3 py-2 whitespace-nowrap">{harmonic.harmonic}</td>
                          <td className="px-3 py-2 whitespace-nowrap">{harmonic.frequency.toFixed(1)}</td>
                          <td className="px-3 py-2 whitespace-nowrap">{harmonic.relativeAmplitude.toFixed(1)}%</td>
                          <td className="px-3 py-2">
                            <div className="w-full bg-gray-200 rounded h-3">
                              <div 
                                className="bg-blue-500 h-3 rounded" 
                                style={{ width: `${Math.min(100, harmonic.relativeAmplitude)}%` }}
                              ></div>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-gray-600 mt-2">
                  Таблица показывает амплитуды гармоник относительно основного тона, 
                  что отражает тембр звука. Чистые звуки имеют меньше гармоник, сложные - больше.
                </p>
              </div>
            )}
            
            <div className="text-sm text-gray-600 mt-4">
              {detectedNote.cents < -5 ? (
                "Ниже нужной ноты (подтяните струну)"
              ) : detectedNote.cents > 5 ? (
                "Выше нужной ноты (ослабьте струну)"
              ) : (
                "Нота настроена правильно!"
              )}
            </div>
          </>
        ) : (
          <div className="py-12 text-gray-500">
            {isActive ? (
              <>
                <Mic className="mx-auto w-16 h-16 text-blue-500 animate-pulse" />
                <p className="mt-4 text-xl">Извлеките звук на инструменте...</p>
              </>
            ) : (
              <>
                <Radio className="mx-auto w-16 h-16 text-gray-500" />
                <p className="mt-4 text-xl">Нажмите Начать анализ для активации микрофона</p>
              </>
            )}
          </div>
        )}
      </div>
      
      {/* Theory Section */}
      <div className="bg-white p-4 rounded-lg shadow">
        <div className="mt-6">
          <h3 className="font-medium mb-2">Как пользоваться этим инструментом:</h3>
          <ol className="list-decimal pl-5 space-y-2 text-sm text-gray-700">
            <li>Нажмите кнопку Начать анализ и разрешите доступ к микрофону</li>
            <li>Извлеките звук на инструменте</li>
            <li>Изучите спектр звукового сигнала на графике Фурье</li>
          </ol>
        </div>
      </div>
    </div>
  );
};

export default FourierTuner;