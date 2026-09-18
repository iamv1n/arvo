'use client';

import { Select } from 'antd';
import { useMemo, useState } from 'react';
import { useMerchantSearch, useMerchants } from '../lib/queries';

/** Server-searched merchant picker, so it scales past the first page of merchants. */
export function MerchantSelect({
  value,
  onChange,
  placeholder = 'Merchant',
  style,
}: {
  value?: string;
  onChange?: (merchantId: string | undefined) => void;
  placeholder?: string;
  style?: React.CSSProperties;
}) {
  const [search, setSearch] = useState('');
  const results = useMerchantSearch(search);
  const known = useMerchants();
  const options = useMemo(() => {
    const items = new Map((results.data ?? []).map((m) => [m.id, m.name]));
    // Keep the selected merchant's label visible even when it's not in the current results.
    const selected = value ? known.data?.find((m) => m.id === value) : undefined;
    if (selected) items.set(selected.id, selected.name);
    return [...items].map(([id, name]) => ({ value: id, label: name }));
  }, [results.data, known.data, value]);

  return (
    <Select
      showSearch={{ filterOption: false, onSearch: setSearch }}
      allowClear
      value={value}
      placeholder={placeholder}
      loading={results.isFetching}
      options={options}
      onChange={(id) => onChange?.(id)}
      style={{ minWidth: 180, ...style }}
      popupMatchSelectWidth={false}
      notFoundContent={results.isFetching ? 'Searching…' : 'No merchants'}
    />
  );
}
