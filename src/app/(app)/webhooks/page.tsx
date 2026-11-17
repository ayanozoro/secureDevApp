import { Suspense } from 'react';
import { WebhooksView } from '@/features/webhooks/WebhooksView';
import { Skeleton } from '@/components/ui/States';

export default function WebhooksPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <WebhooksView />
    </Suspense>
  );
}
