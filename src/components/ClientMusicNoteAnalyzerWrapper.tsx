'use client';

import dynamic from 'next/dynamic';

// Dynamically import the ACTUAL component here, inside the client component
const MusicNoteAnalyzer = dynamic(() => import('@/components/MusicNoteAnalyzer'), {
    ssr: false,
    loading: () => <p className="text-center p-10">Загрузка анализатора нот...</p>
});

export default function ClientMusicNoteAnalyzerWrapper() {
    // Render the dynamically imported component
    return <MusicNoteAnalyzer />;
} 