/**
 * SimpleMicrophoneTuner - Компонент тюнера для определения высоты звука в реальном времени
 * Использует Web Audio API и AudioContext для анализа звука с микрофона
 */

'use client';

import React, { useState, useEffect, useRef } from 'react';
import { NOTE_NAMES_RU } from '@/constants/noteFrequencies';

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

const SimpleMicrophoneTuner: React.FC = () => {
  // Состояния компонента
  const [isActive, setIsActive] = useState(false);
  const [error, setError] = useState('');
  const [volume, setVolume] = useState(0);
  const [detectedNote, setDetectedNote] = useState<DetectedNote | null>(null);
  const [referenceFrequency] = useState(440); // A4 = 440Hz

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
      setError('');
      setDetectedNote(null); // Сбрасываем предыдущую ноту
      
      // Устанавливаем флаг активности - ИСПОЛЬЗУЕМ REF
      isActiveRef.current = true;
      console.log("Устанавливаем флаг активности в true (через ref)");
      
      // Также обновляем состояние React для UI
      setIsActive(true);
      
      // Остановка предыдущей сессии, если была
      stopTuner();
      
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
      
      // Создаем анализатор
      const analyser = context.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.5;
      analyserRef.current = analyser;
      
      console.log("Analyser создан, fftSize:", analyser.fftSize);
      
      // Запускаем аудио контекст
      if (context.state !== 'running') {
        await context.resume();
      }
      
      // Подключаем микрофон напрямую к анализатору
      const microphone = context.createMediaStreamSource(stream);
      microphone.connect(analyser);
      
      console.log("Микрофон подключен к анализатору напрямую");
      
      // Тестирование записи
      try {
        console.log("Тестирование записи с микрофона...");
        const testRecorder = new MediaRecorder(stream);
        testRecorder.start();
        setTimeout(() => {
          testRecorder.stop();
          console.log("Тест записи выполнен успешно");
        }, 500);
      } catch (e) {
        console.warn("Тест записи не удался:", e);
      }
      
      // Проверяем флаг активности
      console.log("Запуск анализа звука... isActiveRef=", isActiveRef.current);
      
      // Немедленный запуск анализа, используя ref вместо состояния
      if (isActiveRef.current) {
        // Запускаем функцию анализа синхронно
        window.requestAnimationFrame(() => {
          analyzeSound();
        });
      }
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
    setIsActive(false);
    
    // Остановка анализа
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    
    // Остановка микрофона
    if (microphoneStreamRef.current) {
      microphoneStreamRef.current.getTracks().forEach(track => track.stop());
      microphoneStreamRef.current = null;
    }
    
    // Обнуление данных
    setDetectedNote(null);
    setVolume(0);
  };

  // НОВАЯ функция для анализа звука, использующая ref вместо состояния
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
      const dataArray = new Float32Array(analyser.fftSize);
      analyser.getFloatTimeDomainData(dataArray);
      
      // Анализируем данные для отладки
      let maxVal = 0;
      let minVal = 0;
      for (let i = 0; i < dataArray.length; i++) {
        maxVal = Math.max(maxVal, dataArray[i]);
        minVal = Math.min(minVal, dataArray[i]);
      }
      
      // Логируем только значимые изменения, чтобы не засорять консоль
      const peakToPeak = maxVal - minVal;
      if (peakToPeak > 0.01) {
        console.log(`Значимый сигнал: min=${minVal.toFixed(4)}, max=${maxVal.toFixed(4)}, размах=${peakToPeak.toFixed(4)}`);
      }
      
      // Расчет RMS (громкости)
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i] * dataArray[i];
      }
      const rms = Math.sqrt(sum / dataArray.length);
      
      // Обновляем отображение громкости с усилением
      setVolume(rms * 10); // Увеличиваем чувствительность в 10 раз
      
      // Анализируем только если достаточная громкость
      if (rms > 0.001) {
        // Проверяем размах сигнала
        if (peakToPeak > 0.01) {
          // Определяем частоту
          const frequency = detectPitchAutocorrelation(dataArray, audioContextRef.current.sampleRate);
          
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
          }
        }
      } else if (detectedNote) {
        // Сбрасываем ноту при слабом сигнале
        setDetectedNote(null);
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

  // Функция определения высоты тона через автокорреляцию
  const detectPitchAutocorrelation = (buffer: Float32Array, sampleRate: number): number => {
    // Более точная автокорреляция для определения частоты
    
    // Ищем сигнал с достаточной громкостью
    let signalMax = 0;
    for (let i = 0; i < buffer.length; i++) {
      signalMax = Math.max(signalMax, Math.abs(buffer[i]));
    }
    
    // Если сигнал слишком слабый, не анализируем
    if (signalMax < 0.01) {
      console.log("Сигнал слишком слабый для анализа");
      return -1;
    }
    
    // Определяем интервал поиска (частоты от 50Гц до 1500Гц)
    const minPeriod = Math.floor(sampleRate / 1500);
    const maxPeriod = Math.floor(sampleRate / 50);
    
    // Предварительная обработка для удаления DC компонента
    let sum = 0;
    for (let i = 0; i < buffer.length; i++) {
      sum += buffer[i];
    }
    const average = sum / buffer.length;
    
    const filteredBuffer = new Float32Array(buffer.length);
    for (let i = 0; i < buffer.length; i++) {
      filteredBuffer[i] = buffer[i] - average;
    }
    
    // Используем метод AMDF (Average Magnitude Difference Function)
    // Часто работает лучше, чем стандартная автокорреляция для определения тона
    const diffValues = new Float32Array(maxPeriod + 1);
    
    for (let period = minPeriod; period <= maxPeriod; period++) {
      let sumDiff = 0;
      let count = 0;
      
      for (let i = 0; i < buffer.length - period; i++) {
        // Абсолютная разница между сэмплами на расстоянии period
        sumDiff += Math.abs(filteredBuffer[i] - filteredBuffer[i + period]);
        count++;
      }
      
      // Среднее значение разницы
      diffValues[period] = count > 0 ? sumDiff / count : 1.0;
    }
    
    // Найдем минимальное значение AMDF - это будет наиболее вероятный период
    let minValue = diffValues[minPeriod];
    let bestPeriod = minPeriod;
    
    for (let period = minPeriod + 1; period <= maxPeriod; period++) {
      if (diffValues[period] < minValue) {
        minValue = diffValues[period];
        bestPeriod = period;
      }
    }
    
    // Проверяем наличие "подозрительно" низкого значения AMDF
    // и проверяем правильность определения периода с помощью пиков
    let isPeakValid = false;
    
    // Проверка наличия периодичности - ищем локальные минимумы AMDF на кратных расстояниях
    if (bestPeriod * 2 <= maxPeriod) {
      const secondMinIndex = findLocalMinimum(diffValues, bestPeriod * 2 - 5, bestPeriod * 2 + 5);
      
      if (secondMinIndex > 0 && Math.abs(secondMinIndex - bestPeriod * 2) < 5) {
        isPeakValid = true;
      }
    }
    
    // Даже если мы не смогли подтвердить периодичность, все равно возвращаем результат,
    // но можем добавить отладочную информацию
    console.log(`Наилучший период: ${bestPeriod}, подтвержден: ${isPeakValid}, AMDF: ${minValue.toFixed(6)}`);
    
    // Если AMDF слишком высок, значит корреляция слабая
    const threshold = 0.2; // Меньше - более строгая проверка
    if (minValue > threshold) {
      console.log("Слабая корреляция, сигнал не детектирован как периодический");
      return -1;
    }
    
    // Повышаем точность с помощью параболической интерполяции
    let refinedPeriod = bestPeriod;
    
    if (bestPeriod > minPeriod && bestPeriod < maxPeriod) {
      const prev = diffValues[bestPeriod - 1];
      const curr = diffValues[bestPeriod];
      const next = diffValues[bestPeriod + 1];
      
      // Вычисляем уточненную позицию минимума
      const delta = (next - prev) / (2 * (2 * curr - prev - next));
      
      if (Math.abs(delta) < 1) {
        refinedPeriod = bestPeriod + delta;
      }
    }
    
    // Возвращаем частоту
    return sampleRate / refinedPeriod;
  };
  
  // Вспомогательная функция для поиска локального минимума в массиве
  const findLocalMinimum = (array: Float32Array, start: number, end: number): number => {
    start = Math.max(0, start);
    end = Math.min(array.length - 1, end);
    
    let minIndex = start;
    let minValue = array[start];
    
    for (let i = start + 1; i <= end; i++) {
      if (array[i] < minValue) {
        minValue = array[i];
        minIndex = i;
      }
    }
    
    return minIndex;
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

  // Функция для получения направления настройки
  const getTuningDirection = (): string => {
    if (!detectedNote) return '–';
    
    if (detectedNote.cents < -5) {
      return '↓'; // Слишком низко, нужно подтянуть
    } else if (detectedNote.cents > 5) {
      return '↑'; // Слишком высоко, нужно опустить
    } else {
      return '✓'; // В настройке
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
  const tuningDirection = getTuningDirection();

  return (
    <div className="p-4 bg-gray-50 rounded-lg">
      <h1 className="text-2xl font-bold mb-6 text-center">Тюнер в реальном времени</h1>
      
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
            onClick={isActive ? stopTuner : startTuner}
          >
            {isActive ? 'Остановить' : 'Начать настройку'}
          </button>
        </div>
        
        {/* Status indicator */}
        <div className="text-center text-sm mb-4">
          <div className="flex items-center justify-center">
            <div className={`w-3 h-3 rounded-full mr-2 ${
              isActive ? 'bg-green-500 animate-pulse' : 'bg-gray-400'
            }`}></div>
            <span>
              Статус: {isActive ? 'Прослушивание активно' : 'Ожидание запуска'}
            </span>
          </div>
        </div>
        
        {/* <div className="mb-4">
          <label className="block mb-2">Эталонная частота (A4):</label>
          <div className="flex items-center">
            <button
              className="bg-gray-200 px-3 py-1 rounded-l"
              onClick={() => setReferenceFrequency(prev => Math.max(430, prev - 1))}
            >
              -
            </button>
            <input 
              type="number" 
              min="430" 
              max="450"
              value={referenceFrequency}
              onChange={(e) => setReferenceFrequency(Number(e.target.value))}
              className="w-20 text-center border-t border-b border-gray-300 py-1"
            />
            <button
              className="bg-gray-200 px-3 py-1 rounded-r"
              onClick={() => setReferenceFrequency(prev => Math.min(450, prev + 1))}
            >
              +
            </button>
            <span className="ml-2">Гц</span>
          </div>
        </div> */}
        
        {/* Улучшенный индикатор громкости */}
        <div className="mb-4">
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>Тихо</span>
            <span>Громко</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-4 relative">
            <div 
              className="bg-blue-600 h-4 rounded-full transition-all duration-100"
              style={{ width: `${Math.min(100, volume * 100)}%` }}
            ></div>
            {/* Порог определения высоты */}
            <div className="absolute h-full w-0.5 bg-red-500" style={{ left: '1%', top: 0 }}></div>
          </div>
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>Уровень сигнала: {(volume * 100).toFixed(1)}%</span>
            <span>{isActive ? (volume > 0.01 ? "Сигнал обнаружен" : "Слишком тихо") : "Неактивно"}</span>
          </div>
        </div>
        
        {/* Отладочная информация */}
        {isActive && (
          <div className="mb-4 p-2 bg-gray-100 rounded text-xs overflow-auto max-h-20 text-left">
            <p>Статус: {detectedNote ? 
              `Нота ${detectedNote.note} (${detectedNote.frequency.toFixed(1)} Гц, ${detectedNote.cents > 0 ? '+' : ''}${detectedNote.cents} центов)` : 
              "Ожидание звука..."}
            </p>
            <p>Если вы не видите движения шкалы громкости, проверьте микрофон в системе</p>
          </div>
        )}
      </div>
      
      {/* Tuning Display */}
      <div className="bg-white p-6 rounded-lg shadow mb-6 text-center">
        {detectedNote ? (
          <>
            <div className="flex justify-between items-center mb-6">
              <div className="text-4xl font-bold text-gray-500">
                {detectedNote.note.replace(/\d/g, '')}
              </div>
              <div className="text-6xl font-bold" style={{ color: tuningStatus.color }}>
                {detectedNote.nameRu.replace(/\d/g, '')}
                <span className="text-3xl ml-1">{detectedNote.note.match(/\d+/)?.[0] || ''}</span>
              </div>
              <div className="text-4xl font-bold text-gray-500">
                {detectedNote.frequency.toFixed(1)} Гц
              </div>
            </div>
            
            {/* Tuning Meter */}
            <div className="relative h-24 mb-4">
              <div className="absolute top-0 left-0 w-full h-4 bg-gray-200 rounded-full overflow-hidden">
                {/* Center line */}
                <div className="absolute top-0 left-1/2 w-1 h-full bg-green-500 transform -translate-x-1/2"></div>
                
                {/* Tuning indicator */}
                <div 
                  className="absolute top-0 h-full bg-blue-500 transition-all duration-300 w-4 rounded-full"
                  style={{ 
                    left: `calc(50% + ${detectedNote.cents * 2}px)`,
                    transform: 'translateX(-50%)'
                  }}
                ></div>
                
                {/* Scale markers */}
                <div className="absolute top-full mt-2 w-full flex justify-between px-4 text-xs text-gray-500">
                  <span>-50</span>
                  <span>-30</span>
                  <span>-10</span>
                  <span>0</span>
                  <span>+10</span>
                  <span>+30</span>
                  <span>+50</span>
                </div>
              </div>
              
              <div className="mt-12 text-center">
                <div className="text-5xl font-bold" style={{ color: tuningStatus.color }}>
                  {tuningDirection}
                </div>
                <div className="mt-2 text-xl">
                  {detectedNote.cents > 0 ? '+' : ''}{detectedNote.cents.toFixed(0)} центов
                </div>
              </div>
            </div>
            
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
                <svg className="mx-auto w-16 h-16 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"></path>
                </svg>
                <p className="mt-4 text-xl">Извлеките звук на инструменте...</p>
              </>
            ) : (
              <>
                <svg className="mx-auto w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15.536a5 5 0 01-.707-7.07m-2.122 9.9a9 9 0 010-12.728"></path>
                </svg>
                <p className="mt-4 text-xl">Нажмите Начать настройку для активации микрофона</p>
              </>
            )}
          </div>
        )}
      </div>
      
      {/* Instructions */}
      <div className="bg-white p-4 rounded-lg shadow">
        <h2 className="text-xl font-semibold mb-4">Как пользоваться тюнером</h2>
        
        <ol className="list-decimal pl-5 space-y-2">
          <li>Нажмите кнопку Начать настройку и разрешите доступ к микрофону</li>
          <li>Извлеките звук на вашем инструменте</li>
          <li>Тюнер определит ближайшую ноту и покажет насколько точно она настроена</li>
          <li>Следуйте указаниям стрелок для корректировки настройки</li>
          
        </ol>
        
        <div className="mt-4 text-sm text-gray-600">
          <p><strong>Примечание:</strong> Для наилучших результатов используйте тюнер в тихом помещении и держите инструмент близко к микрофону.</p>
        </div>
      </div>
    </div>
  );
};

export default SimpleMicrophoneTuner;