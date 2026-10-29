'use client';

import * as React from 'react';

import { StatusIndicator } from '@/components/status-indicator';
import { usePermissions } from '@/hooks/use-permissions';
import {
  Button,
  DataTableFilters,
  DataTableHeader,
  DataTableSearch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Text,
} from '@trycompai/design-system';
import { ArrowDown, ArrowUp } from '@trycompai/design-system/icons';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ControlWithRelations } from '../data/queries';
import { parseControlQuery } from '../lib/control-query';
import { getControlStatus } from '../lib/utils';

const PAGE_SIZE_OPTIONS = [20, 50, 100];

interface ControlsTableProps {
  promises: Promise<[{ data: ControlWithRelations[]; pageCount: number }]>;
}

type SortDirection = 'asc' | 'desc';

function SortIcon({ direction }: { direction: SortDirection }) {
  return direction === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />;
}

export function ControlsTable({ promises }: ControlsTableProps) {
  const [{ data, pageCount }] = React.use(promises);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { hasPermission } = usePermissions();
  const {
    name: search,
    page,
    perPage: pageSize,
    sortDesc,
  } = parseControlQuery({
    name: searchParams.get('name'),
    page: searchParams.get('page'),
    perPage: searchParams.get('perPage'),
    sortDesc: searchParams.get('sortDesc'),
  });
  const sortDirection: SortDirection = sortDesc === 'true' ? 'desc' : 'asc';
  const handleQueryChange = (updates: Record<string, string>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    router.replace(`${pathname}?${params.toString()}`);
  };
  const handleSortByName = () =>
    handleQueryChange({ sortDesc: sortDesc === 'true' ? 'false' : 'true', page: '1' });

  const handleOpenCreateControl = React.useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('create-control', 'true');
    router.push(`${pathname}?${params.toString()}`);
  }, [pathname, router, searchParams]);

  const handleViewControl = React.useCallback(
    (controlId: string) => {
      const params = new URLSearchParams(searchParams.toString());
      router.push(`${pathname}/${controlId}${params.toString() ? `?${params.toString()}` : ''}`);
    },
    [pathname, router, searchParams],
  );

  const handleRowKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLTableRowElement>, controlId: string) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        handleViewControl(controlId);
      }
    },
    [handleViewControl],
  );

  const handlePageSizeChange = (nextPageSize: number) =>
    handleQueryChange({ perPage: String(nextPageSize), page: '1' });

  return (
    <div className="flex flex-col gap-4">
      <DataTableHeader>
        <DataTableSearch
          placeholder="Search controls..."
          value={search}
          onChange={(name) => handleQueryChange({ name, page: '1' })}
        />
        <DataTableFilters>
          {hasPermission('control', 'create') && (
            <Button onClick={handleOpenCreateControl}>Create Control</Button>
          )}
        </DataTableFilters>
      </DataTableHeader>
      <Table
        variant="bordered"
        pagination={{
          page,
          pageCount: Math.max(pageCount, 1),
          onPageChange: (nextPage) => handleQueryChange({ page: String(nextPage) }),
          pageSize,
          pageSizeOptions: PAGE_SIZE_OPTIONS,
          onPageSizeChange: handlePageSizeChange,
        }}
      >
        <TableHeader>
          <TableRow>
            <TableHead>
              <Button
                variant="ghost"
                onClick={handleSortByName}
                iconRight={<SortIcon direction={sortDirection} />}
              >
                Control Name
              </Button>
            </TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.length === 0 ? (
            <TableRow>
              <TableCell colSpan={2}>
                <Text size="sm" variant="muted">
                  No controls found.
                </Text>
              </TableCell>
            </TableRow>
          ) : (
            data.map((control) => (
              <TableRow
                key={control.id}
                role="button"
                tabIndex={0}
                onClick={() => handleViewControl(control.id)}
                onKeyDown={(event) => handleRowKeyDown(event, control.id)}
              >
                <TableCell>
                  <Text size="sm" weight="medium">
                    {control.name}
                  </Text>
                </TableCell>
                <TableCell>
                  <StatusIndicator status={getControlStatus(control)} />
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
