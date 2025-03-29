import WaveAnalyzer from '@/components/WaveAnalyzer';
import Link from 'next/link';

export default function WaveAnalyzerPage() {
  return (
    <div className="container mx-auto p-4">
      <div className="bg-[var(--card-bg)] p-4 rounded-lg shadow border border-[var(--card-border)]">
        <Link href="/" className="text-blue-500">
          ← Вернуться на главную
        </Link>
      </div>
      <WaveAnalyzer />
    </div>
  );
}