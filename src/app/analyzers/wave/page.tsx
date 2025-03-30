// import dynamic from 'next/dynamic';
import Link from 'next/link';
import ClientWaveAnalyzerWrapper from '@/components/ClientWaveAnalyzerWrapper'; // Import the new client component

// Remove the old dynamic import definition
// const WaveAnalyzer = dynamic(/* ... */);

export default function WaveAnalyzerPage() {
  return (
    <div className="container mx-auto p-4">
      <div className="bg-[var(--card-bg)] p-4 rounded-lg shadow border border-[var(--card-border)] mb-4">
        <Link href="/" className="text-blue-500 hover:text-blue-700">
          ← Вернуться на главную
        </Link>
      </div>
      {/* Render the client component wrapper */}
      <ClientWaveAnalyzerWrapper />
    </div>
  );
}

