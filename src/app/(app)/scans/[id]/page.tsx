import { Suspense } from 'react';
import { ScanDetailView } from '@/features/scans/ScanDetailView';
import { Skeleton } from '@/components/ui/States';

export default function ScanDetailPage({ params }: { params: { id: string } }) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <ScanDetailView id={decodeURIComponent(params.id)} />
    </Suspense>
  );
}
