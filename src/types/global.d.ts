// Глобальные типы для аудио API
declare global {
    interface Window {
      webkitAudioContext: typeof AudioContext;
    }
  }
  
  export {};