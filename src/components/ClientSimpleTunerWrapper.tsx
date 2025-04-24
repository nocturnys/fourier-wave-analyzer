'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';

// Динамически импортируем компонент тюнера с отключенным SSR
const SimpleMicrophoneTuner = dynamic(() => import('@/components/SimpleMicrophoneTuner'), {
    ssr: false,
    loading: () => <div className="text-center p-10">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-500 mx-auto mb-4"></div>
        <p>Загрузка тюнера...</p>
    </div>
});

export default function ClientSimpleTunerWrapper() {
    const [isBrowserCompatible, setIsBrowserCompatible] = useState<boolean | null>(null);
    
    useEffect(() => {
        // Проверяем поддержку необходимых API в браузере
        const checkBrowserCompatibility = () => {
            const hasAudioContext = !!(window.AudioContext || window.webkitAudioContext);
            const hasMediaDevices = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
            
            setIsBrowserCompatible(hasAudioContext && hasMediaDevices);
        };
        
        checkBrowserCompatibility();
    }, []);
    
    // Если совместимость браузера не определена, показываем загрузку
    if (isBrowserCompatible === null) {
        return <div className="text-center p-10">
            <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <p>Проверка совместимости браузера...</p>
        </div>;
    }
    
    // Если браузер не совместим, показываем сообщение об ошибке
    if (isBrowserCompatible === false) {
        return <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-8 rounded-lg m-4 text-center">
            <h2 className="text-xl font-bold mb-4">Ваш браузер не поддерживает необходимые API</h2>
            <p className="mb-4">Для работы тюнера требуется поддержка следующих технологий:</p>
            <ul className="list-disc text-left mx-auto inline-block mb-4">
                <li>Web Audio API</li>
                <li>Media Devices API (доступ к микрофону)</li>
            </ul>
            <p>Рекомендуем использовать последние версии Chrome, Firefox или Safari.</p>
        </div>;
    }
    
    // Если браузер совместим, рендерим компонент тюнера
    return <SimpleMicrophoneTuner />;
}