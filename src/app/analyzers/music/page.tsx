// import dynamic from 'next/dynamic';
import Link from 'next/link';
// Statically import the client wrapper component
import ClientMusicNoteAnalyzerWrapper from '@/components/ClientMusicNoteAnalyzerWrapper';

// Remove the dynamic import definition
// const ClientMusicNoteAnalyzerWrapper = dynamic(/* ... */);

export default function MusicAnalyzerPage() {
  return (
    <div className="container mx-auto p-4">
      <div className="bg-[var(--card-bg)] p-4 rounded-lg shadow border border-[var(--card-border)] mb-4"> 
        <Link href="/" className="text-blue-500 hover:text-blue-700">
          ← Вернуться на главную
        </Link>
      </div>
      {/* Statically render the client component wrapper */}
      <ClientMusicNoteAnalyzerWrapper />
    </div>
  );
}