'use client';

import dynamic from 'next/dynamic';

// Dynamically import WaveAnalyzer with ssr disabled
const WaveAnalyzer = dynamic(() => import('@/components/WaveAnalyzer'), {
    ssr: false,
    loading: () => <p className="text-center p-10">Загрузка анализатора волн...</p>
});

export default function ClientWaveAnalyzerWrapper() {
    // Просто рендерим динамически загруженный компонент
    return <WaveAnalyzer />;
} 