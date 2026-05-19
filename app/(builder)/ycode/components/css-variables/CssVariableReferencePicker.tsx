'use client';

/**
 * CssVariableReferencePicker
 *
 * Popover that lists every CSS variable of a given type and emits a
 * `var(--<id>)` reference when picked. Used by the value editors and by the
 * inspector pickers (`CssVariablePickerButton`).
 */

import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import Icon from '@/components/ui/icon';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useCssVariablesStore } from '@/stores/useCssVariablesStore';
import type { CssVariableType } from '@/types';

interface CssVariableReferencePickerProps {
  type: CssVariableType;
  /** Variable IDs to exclude from the list (e.g. the variable currently being edited). */
  excludeIds?: string[];
  onSelect: (cssVariableRef: string) => void;
  triggerLabel?: string;
}

export default function CssVariableReferencePicker({
  type,
  excludeIds,
  onSelect,
  triggerLabel,
}: CssVariableReferencePickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const graph = useCssVariablesStore((s) => s.graph);

  const items = useMemo(() => {
    const exclude = new Set(excludeIds ?? []);
    return graph.variables
      .filter((v) => v.type === type && !exclude.has(v.id))
      .map((v) => {
        const variableSet = graph.sets.find((s) => s.id === v.set_id);
        return { variable: v, setName: variableSet?.name ?? 'Unknown' };
      })
      .filter(({ variable, setName }) => {
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return variable.name.toLowerCase().includes(q) || setName.toLowerCase().includes(q);
      });
  }, [graph, type, excludeIds, search]);

  const handleSelect = (id: string) => {
    onSelect(`var(--${id})`);
    setOpen(false);
    setSearch('');
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          size="icon-xs" variant="ghost"
          title={triggerLabel ?? 'Use a variable'}
        >
          <Icon name="link" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-2">
        <Input
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search variables..."
          className="mb-2"
        />
        {items.length === 0 ? (
          <div className="text-xs text-muted-foreground p-2">No matching variables</div>
        ) : (
          <div className="max-h-64 overflow-auto flex flex-col gap-0.5">
            {items.map(({ variable, setName }) => (
              <button
                key={variable.id}
                type="button"
                onClick={() => handleSelect(variable.id)}
                className="text-left text-xs px-2 py-1.5 rounded hover:bg-accent flex items-center justify-between gap-2"
              >
                <span className="truncate">{variable.name}</span>
                <span className="text-muted-foreground truncate">{setName}</span>
              </button>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
