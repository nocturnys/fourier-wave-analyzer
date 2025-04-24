// // Эффект для запуска и остановки анализа при изменении состояния isListening
// useEffect(() => {
//   console.log("Изменение статуса прослушивания на:", isListening);
  
//   if (isListening) {
//     console.log("Запуск analyzeAudio из useEffect");
//     window.setTimeout(() => {
//       analyzeAudio();
//     }, 100);
//   } else {
//     console.log("Остановка анализа");
//     if (rafIdRef.current) {
//       cancelAnimationFrame(rafIdRef.current);
//       rafIdRef.current = null;
//     }
//   }
// }, [isListening]);
// 
"use client";

import React, { useState, useEffect, useRef } from 'react';
import { 
identifyNote, 
calculateRMS
} from '@/utils/audioUtils';
import { NOTE_FREQUENCIES, NOTE_NAMES_RU } from '@/constants/noteFrequencies';
import { yinPitchTracking } from '@/utils/pitchTracking';

/**
* MicrophoneTuner component - A real-time musical instrument tuner using microphone input
*/
const MicrophoneTuner: React.FC = () => {
// State for microphone and analysis
const [isListening, setIsListening] = useState<boolean>(false);
const [hasMicrophonePermission, setHasMicrophonePermission] = useState<boolean | null>(null);
const [error, setError] = useState<string>('');
const [volume, setVolume] = useState<number>(0);
const [detectedNote, setDetectedNote] = useState<{
  note: string;
  nameRu: string;
  frequency: number;
  cents: number;
} | null>(null);
const [referenceFrequency, setReferenceFrequency] = useState<number>(440); // A4 = 440Hz standard

// Refs for Web Audio API objects
const audioContextRef = useRef<AudioContext | null>(null);
const analyserNodeRef = useRef<AnalyserNode | null>(null);
const microphoneStreamRef = useRef<MediaStream | null>(null);
const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
const rafIdRef = useRef<number | null>(null);

// Ref for audio buffer for pitch analysis
const audioBufferRef = useRef<AudioBuffer | null>(null);

// Refs for timing and note stability
const lastNoteRef = useRef<string | null>(null);
const noteStabilityCounterRef = useRef<number>(0);
const lastAnalysisTimeRef = useRef<number>(0);

// Constants
const ANALYSIS_INTERVAL = 100; // ms between analyses
const NOTE_STABILITY_THRESHOLD = 3; // how many consecutive same notes to consider it stable
const VOLUME_THRESHOLD = 0.01; // minimum volume to consider for analysis

/**
 * Initializes the audio context and analyzer node
 */
const initializeAudio = async (): Promise<boolean> => {
  try {
    console.log("Инициализация аудио...");
    
    // Закрываем старый аудио контекст, если он есть
    if (audioContextRef.current) {
      try {
        // Проверяем, не закрыт ли уже контекст
        if (audioContextRef.current.state !== 'closed') {
          audioContextRef.current.close();
        }
        audioContextRef.current = null;
      } catch (closeErr) {
        console.warn("Ошибка при закрытии старого AudioContext:", closeErr);
        // Продолжаем работу даже при ошибке закрытия
      }
    }
    
    // Check if browser supports Web Audio API
    if (typeof window === 'undefined') {
      throw new Error('Браузерное окружение недоступно');
    }
    
    if (!window.AudioContext && !window.webkitAudioContext) {
      throw new Error('Web Audio API не поддерживается в вашем браузере');
    }
    
    // Check if MediaDevices API is available
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('API доступа к медиа-устройствам не поддерживается в вашем браузере');
    }
    
    // Создаем новый аудио контекст
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const audioContext = new AudioContextClass();
    audioContextRef.current = audioContext;
    
    console.log("AudioContext создан:", audioContext.state);
    
    // Create analyzer node
    const analyserNode = audioContext.createAnalyser();
    analyserNode.fftSize = 2048; // Large FFT for better frequency resolution
    analyserNode.smoothingTimeConstant = 0.8; // Smoothing to reduce jitter
    analyserNodeRef.current = analyserNode;
    
    console.log("Запрашиваем доступ к микрофону...");
    setError("Пожалуйста, разрешите доступ к микрофону...");
    
    // Request microphone access
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });
      
      if (!stream) {
        throw new Error('Не удалось получить аудиопоток с микрофона');
      }
      
      console.log("Доступ к микрофону получен. Трэки:", stream.getAudioTracks().length);
      
      // Закрываем предыдущий поток микрофона, если он есть
      if (microphoneStreamRef.current) {
        microphoneStreamRef.current.getTracks().forEach(track => track.stop());
      }
      
      microphoneStreamRef.current = stream;
      
      // Отключаем предыдущий source node, если он есть
      if (sourceNodeRef.current) {
        sourceNodeRef.current.disconnect();
      }
      
      // Create source node from microphone input
      const sourceNode = audioContext.createMediaStreamSource(stream);
      sourceNodeRef.current = sourceNode;
      
      // Connect the source to the analyzer
      sourceNode.connect(analyserNode);
      
      // Create an offline buffer for pitch analysis
      const bufferSize = audioContext.sampleRate * 0.5; // 500ms buffer
      audioBufferRef.current = audioContext.createBuffer(
        1, bufferSize, audioContext.sampleRate
      );
      
      setHasMicrophonePermission(true);
      setError('');
      
      return true;
    } catch (micError) {
      console.error('Ошибка доступа к микрофону:', micError);
      setHasMicrophonePermission(false);
      setError(`Ошибка доступа к микрофону: ${micError instanceof Error ? micError.message : 'Отказ в доступе'}`);
      
      // Закрываем созданный аудио контекст при ошибке
      if (audioContextRef.current) {
        try {
          audioContextRef.current.close();
          audioContextRef.current = null;
        } catch (e) {
          console.warn("Ошибка при закрытии AudioContext после ошибки доступа:", e);
        }
      }
      
      return false;
    }
  } catch (err) {
    console.error('Ошибка инициализации аудио:', err);
    setHasMicrophonePermission(false);
    setError(`Ошибка инициализации: ${err instanceof Error ? err.message : 'Неизвестная ошибка'}`);
    return false;
  }
};

/**
 * Starts listening to the microphone
 */
const startListening = async (): Promise<void> => {
  setError('Инициализация...');
  console.log('Запуск прослушивания микрофона');
  
  // Полностью пересоздаем аудио контекст при каждом запуске,
  // чтобы избежать проблем с закрытым контекстом
  const success = await initializeAudio();
  
  if (success) {
    console.log('Инициализация успешна, начинаем анализ');
    setIsListening(true);
    // Немедленно запустить анализ
    window.setTimeout(() => {
      analyzeAudio();
    }, 100);
  } else {
    console.log('Инициализация не удалась');
    setError('Не удалось запустить микрофон. Проверьте разрешения браузера.');
  }
};

/**
 * Stops listening to the microphone
 */
const stopListening = (): void => {
  console.log('Остановка прослушивания микрофона');
  setIsListening(false);
  
  // Cancel any pending animation frame
  if (rafIdRef.current) {
    console.log('Отмена анимационного фрейма:', rafIdRef.current);
    cancelAnimationFrame(rafIdRef.current);
    rafIdRef.current = null;
  }
  
  // Останавливаем поток микрофона
  if (microphoneStreamRef.current) {
    console.log('Остановка потока микрофона');
    microphoneStreamRef.current.getTracks().forEach(track => track.stop());
    microphoneStreamRef.current = null;
  }
  
  // НЕ закрываем AudioContext, а только отключаем узлы
  if (sourceNodeRef.current) {
    console.log('Отключение источника звука');
    try {
      sourceNodeRef.current.disconnect();
    } catch (e) {
      console.warn('Ошибка при отключении источника звука:', e);
    }
    sourceNodeRef.current = null;
  }
};

/**
 * Gets the Russian name of a note
 */
const getNoteNameRu = (noteCode: string): string => {
  // Extract the note letter and octave (e.g., "C4" -> "C", "4")
  const noteLetter = noteCode.replace(/\d/g, '');
  const octave = noteCode.match(/\d+/)?.[0] || '';
  
  return `${NOTE_NAMES_RU[noteLetter]}${octave}`;
};

/**
 * Analyzes the current audio input to detect the pitch and note
 */
const analyzeAudio = async (): Promise<void> => {
  console.log('Запуск analyzeAudio, isListening=', isListening);
  
  if (!isListening) {
    console.log('Прослушивание остановлено, выход из analyzeAudio');
    return;
  }
  
  if (!analyserNodeRef.current) {
    console.error('Анализатор не инициализирован');
    setError('Ошибка: анализатор не инициализирован');
    return;
  }
  
  if (!audioContextRef.current) {
    console.error('Аудио контекст не инициализирован');
    setError('Ошибка: аудио контекст не инициализирован');
    return;
  }
  
  // Check audio context state
  if (audioContextRef.current.state !== 'running') {
    console.log(`Аудио контекст не активен, текущее состояние: ${audioContextRef.current.state}`);
    try {
      await audioContextRef.current.resume();
      console.log('Аудио контекст возобновлен');
    } catch (e) {
      console.error('Не удалось возобновить аудио контекст:', e);
      setError(`Ошибка аудио: ${e instanceof Error ? e.message : 'Не удалось запустить аудио'}`);
      setIsListening(false);
      return;
    }
  }
  
  // Check if enough time has passed since last analysis
  const now = Date.now();
  if (now - lastAnalysisTimeRef.current < ANALYSIS_INTERVAL) {
    // Schedule next analysis
    rafIdRef.current = requestAnimationFrame(analyzeAudio);
    return;
  }
  lastAnalysisTimeRef.current = now;
  
  try {
    // Get time-domain data for volume calculation
    const timeDataArray = new Float32Array(analyserNodeRef.current.fftSize);
    analyserNodeRef.current.getFloatTimeDomainData(timeDataArray);
    
    // Calculate signal volume (RMS)
    const currentVolume = calculateRMS(timeDataArray);
    setVolume(currentVolume);
    
    // Only analyze pitch if volume is above threshold
    if (currentVolume > VOLUME_THRESHOLD) {
      console.log('Громкость выше порога:', currentVolume);
      
      // Copy time-domain data to buffer for analysis
      const buffer = audioBufferRef.current;
      if (!buffer) {
        console.error('Аудио буфер не инициализирован');
        // Пытаемся пересоздать буфер
        const bufferSize = audioContextRef.current.sampleRate * 0.5;
        audioBufferRef.current = audioContextRef.current.createBuffer(
          1, bufferSize, audioContextRef.current.sampleRate
        );
        
        // Schedule next frame and return from this one
        rafIdRef.current = requestAnimationFrame(analyzeAudio);
        return;
      }
      
      const channelData = buffer.getChannelData(0);
      channelData.set(timeDataArray.slice(0, Math.min(timeDataArray.length, channelData.length)));
      
      try {
        // Use YIN algorithm for pitch detection
        const pitchResults = await yinPitchTracking(audioContextRef.current, buffer);
        
        if (pitchResults.length > 0 && pitchResults[0].probability > 0.7) {
          const { frequency, probability } = pitchResults[0];
          console.log(`Обнаружена частота: ${frequency.toFixed(2)} Гц, вероятность: ${probability.toFixed(2)}`);
          
          // Use frequency to identify the note
          const noteInfo = identifyNote(frequency);
          
          // Check note stability (to reduce flickering)
          if (noteInfo.note === lastNoteRef.current) {
            noteStabilityCounterRef.current++;
          } else {
            noteStabilityCounterRef.current = 0;
            lastNoteRef.current = noteInfo.note;
          }
          
          // Only update display if note is stable
          if (noteStabilityCounterRef.current >= NOTE_STABILITY_THRESHOLD) {
            console.log(`Стабильно определена нота: ${noteInfo.note}, ${noteInfo.cents} центов`);
            setDetectedNote({
              note: noteInfo.note,
              nameRu: getNoteNameRu(noteInfo.note),
              frequency,
              cents: noteInfo.cents,
            });
          }
        } else {
          console.log('Частота не обнаружена или низкая вероятность');
        }
      } catch (pitchErr) {
        console.error('Ошибка в алгоритме определения высоты тона:', pitchErr);
        // Продолжаем анализ несмотря на ошибку
      }
    } else {
      // Reset when volume is too low
      if (detectedNote) {
        console.log('Громкость слишком низкая, сброс определенной ноты');
        setDetectedNote(null);
      }
    }
  } catch (analysisErr) {
    console.error('Ошибка в процессе анализа аудио:', analysisErr);
    // Не прерываем цикл анализа из-за ошибки
  }
  
  // Schedule next analysis only if still listening
  if (isListening) {
    rafIdRef.current = requestAnimationFrame(analyzeAudio);
  } else {
    console.log('Прослушивание остановлено в процессе анализа');
  }
};

/**
 * Gets the tuning status based on cents deviation
 */
const getTuningStatus = (): { status: 'perfect' | 'close' | 'out-of-tune', color: string } => {
  if (!detectedNote) return { status: 'out-of-tune', color: '#ccc' };
  
  const cents = Math.abs(detectedNote.cents);
  if (cents < 5) {
    return { status: 'perfect', color: '#4caf50' }; // Green
  } else if (cents < 15) {
    return { status: 'close', color: '#ff9800' }; // Orange
  } else {
    return { status: 'out-of-tune', color: '#f44336' }; // Red
  }
};

/**
 * Gets the arrow direction for tuning guidance
 */
const getTuningDirection = (): string => {
  if (!detectedNote) return '–';
  
  if (detectedNote.cents < -5) {
    return '↓'; // Too flat, need to tune up
  } else if (detectedNote.cents > 5) {
    return '↑'; // Too sharp, need to tune down
  } else {
    return '✓'; // In tune
  }
};

/**
 * Effect to cleanup audio resources when component unmounts
 */
useEffect(() => {
  // Start analysis when listening state changes
  if (isListening) {
    analyzeAudio();
  }
  
  // Cleanup function
  return () => {
    // Cancel any pending animation frame
    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
    }
    
    // Stop microphone stream
    if (microphoneStreamRef.current) {
      microphoneStreamRef.current.getTracks().forEach(track => track.stop());
    }
    
    // Disconnect audio nodes
    if (sourceNodeRef.current) {
      sourceNodeRef.current.disconnect();
    }
    
    // Close audio context
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
    }
  };
}, [isListening]);

// Calculate tuning status
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
      
      {hasMicrophonePermission === false && (
        <div className="bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded mb-4">
          <p className="font-bold">Доступ к микрофону отсутствует</p>
          <p>Для работы тюнера необходим доступ к микрофону. Пожалуйста, разрешите доступ в настройках браузера.</p>
          <div className="mt-2">
            <ol className="list-decimal pl-6 text-sm">
              <li>Проверьте, что у вас подключен и работает микрофон</li>
              <li>В адресной строке браузера нажмите на иконку 🔒 или ℹ️</li>
              <li>Убедитесь, что для микрофона установлено разрешение "Разрешить"</li>
              <li>Обновите страницу после изменения разрешений</li>
            </ol>
          </div>
        </div>
      )}
      
      <div className="flex justify-center mb-6">
        <button 
          className={`py-2 px-6 rounded-full text-white font-medium focus:outline-none transition-colors ${
            isListening 
              ? 'bg-red-500 hover:bg-red-600' 
              : 'bg-[var(--primary)] hover:bg-[var(--primary-light)]'
          }`}
          onClick={isListening ? stopListening : startListening}
          disabled={hasMicrophonePermission === false}
        >
          {isListening ? 'Остановить' : 'Начать настройку'}
        </button>
      </div>
      
      {/* Status indicator */}
      <div className="text-center text-sm mb-4">
        <div className="flex items-center justify-center">
          <div className={`w-3 h-3 rounded-full mr-2 ${
            isListening ? 'bg-green-500 animate-pulse' : 'bg-gray-400'
          }`}></div>
          <span>
            Статус: {isListening ? 'Прослушивание активно' : 'Ожидание запуска'}
          </span>
        </div>
      </div>
      
      <div className="mb-4">
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
      </div>
      
      <div className="mb-4">
        <div className="w-full bg-gray-200 rounded-full h-2.5">
          <div 
            className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
            style={{ width: `${Math.min(100, volume * 100 * 5)}%` }}
          ></div>
        </div>
        <div className="text-center text-xs text-gray-500 mt-1">
          Уровень громкости
        </div>
      </div>
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
          {isListening ? (
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
              <p className="mt-4 text-xl">Нажмите "Начать настройку" для активации микрофона</p>
            </>
          )}
        </div>
      )}
    </div>
    
    {/* Instructions */}
    <div className="bg-white p-4 rounded-lg shadow">
      <h2 className="text-xl font-semibold mb-4">Как пользоваться тюнером</h2>
      
      <ol className="list-decimal pl-5 space-y-2">
        <li>Нажмите кнопку "Начать настройку" и разрешите доступ к микрофону</li>
        <li>Извлеките звук на вашем инструменте (сыграйте ноту)</li>
        <li>Тюнер определит ближайшую ноту и покажет, насколько точно она настроена</li>
        <li>Следуйте указаниям стрелок для корректировки настройки</li>
        <li>При необходимости, настройте эталонную частоту A4 (по умолчанию 440 Гц)</li>
      </ol>
      
      <div className="mt-4 text-sm text-gray-600">
        <p><strong>Примечание:</strong> Для наилучших результатов используйте тюнер в тихом помещении и держите инструмент близко к микрофону.</p>
      </div>
    </div>
  </div>
);
};

export default MicrophoneTuner;