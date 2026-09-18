'use client';

import dayjs from 'dayjs';
import { useParams, useSearchParams } from 'next/navigation';
import { PositionDetail } from '../../../../components/trading/position-detail';

/** One round trip, drilled into from the positions table. */
export default function PositionPage() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const asOf = search.get('asOf') ?? dayjs().format('YYYY-MM-DD');
  return <PositionDetail id={params.id} asOf={asOf} />;
}
