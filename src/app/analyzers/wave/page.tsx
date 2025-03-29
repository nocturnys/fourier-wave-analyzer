import WaveAnalyzer from '@/components/WaveAnalyzer';
import Link from 'next/link';

export default function WaveAnalyzerPage() {
  return (
    <div className="container mx-auto p-4">
      <div className="mb-4">
        <Link href="/" className="text-blue-500 hover:underline">
          ← Вернуться на главную
        </Link>
      </div>
      <WaveAnalyzer />
    </div>
  );
}