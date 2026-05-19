/**
 * Color Variable Repository (legacy façade)
 *
 * Maintained for backwards compatibility with callers (MCP tools, animation
 * resolver, color picker) that still reason about a flat list of color
 * variables. All operations are forwarded to the typed CSS variables system.
 *
 * Color variables live in a single "Colors" set with a single "Default" mode
 * (per tenant). When the legacy create endpoint is called without an existing
 * Colors set, one is provisioned on demand.
 *
 * Prefer {@link ./cssVariableRepository} for new code.
 */

import { getSupabaseAdmin } from '@/lib/supabase-server';
import { generateContentHash } from '@/lib/hash-utils';
import { generateCssVariablesStylesheet } from '@/lib/repositories/cssVariableStylesheetGenerator';
import type { ColorVariable, CssVariableSet, CssVariableSetMode } from '@/types';

export interface CreateColorVariableData {
  name: string;
  value: string;
}

export interface UpdateColorVariableData {
  name?: string;
  value?: string;
}

async function getClient(tenantId?: string) {
  const client = await getSupabaseAdmin(tenantId);
  if (!client) throw new Error('Supabase not configured');
  return client;
}

/**
 * Generate a stylesheet covering every CSS variable (not just colors).
 * Kept for callers like `fetchGlobalPageSettings` that still use this name.
 */
export async function generateColorVariablesCss(tenantId?: string): Promise<string | null> {
  return generateCssVariablesStylesheet(tenantId);
}

/**
 * Resolve the (tenant-scoped) "Colors" set + Default mode used to back the
 * legacy flat API. Returns null when no set exists yet.
 */
async function getDefaultColorsLocation(
  client: Awaited<ReturnType<typeof getClient>>
): Promise<{ set: CssVariableSet; mode: CssVariableSetMode } | null> {
  const { data: setRow, error: setError } = await client
    .from('css_variable_sets')
    .select('*')
    .eq('activation_kind', 'default')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (setError && setError.code !== 'PGRST116') {
    throw new Error(`Failed to read colors set: ${setError.message}`);
  }
  if (!setRow) return null;

  const { data: modeRow, error: modeError } = await client
    .from('css_variable_set_modes')
    .select('*')
    .eq('set_id', setRow.id)
    .order('is_default', { ascending: false })
    .order('sort_order', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (modeError && modeError.code !== 'PGRST116') {
    throw new Error(`Failed to read colors default mode: ${modeError.message}`);
  }
  if (!modeRow) return null;

  return { set: setRow as CssVariableSet, mode: modeRow as CssVariableSetMode };
}

async function ensureDefaultColorsLocation(
  client: Awaited<ReturnType<typeof getClient>>
): Promise<{ set: CssVariableSet; mode: CssVariableSetMode }> {
  const existing = await getDefaultColorsLocation(client);
  if (existing) return existing;

  const { data: setRow, error: setError } = await client
    .from('css_variable_sets')
    .insert({ name: 'Colors', activation_kind: 'default', sort_order: 0 })
    .select()
    .single();
  if (setError) throw new Error(`Failed to create Colors set: ${setError.message}`);

  const { data: modeRow, error: modeError } = await client
    .from('css_variable_set_modes')
    .insert({ set_id: setRow.id, name: 'Default', is_default: true, sort_order: 0 })
    .select()
    .single();
  if (modeError) throw new Error(`Failed to create Default mode: ${modeError.message}`);

  return { set: setRow as CssVariableSet, mode: modeRow as CssVariableSetMode };
}

/** Get all color-typed CSS variables in legacy shape. */
export async function getAllColorVariables(tenantId?: string): Promise<ColorVariable[]> {
  const client = await getClient(tenantId);

  const { data: variables, error } = await client
    .from('css_variables')
    .select('id, name, sort_order, created_at, updated_at, set_id, css_variable_values(value, mode_id)')
    .eq('type', 'color')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) throw new Error(`Failed to fetch color variables: ${error.message}`);

  // Map to legacy shape, picking the first value per variable (Default mode)
  return ((variables || []) as Array<{
    id: string;
    name: string;
    sort_order: number;
    created_at: string;
    updated_at: string;
    css_variable_values: Array<{ value: string; mode_id: string }>;
  }>).map((v) => ({
    id: v.id,
    name: v.name,
    value: v.css_variable_values?.[0]?.value ?? '',
    sort_order: v.sort_order,
    created_at: v.created_at,
    updated_at: v.updated_at,
  }));
}

export async function getColorVariableById(id: string, tenantId?: string): Promise<ColorVariable | null> {
  const all = await getAllColorVariables(tenantId);
  return all.find((v) => v.id === id) ?? null;
}

export async function createColorVariable(
  data: CreateColorVariableData,
  tenantId?: string
): Promise<ColorVariable> {
  const client = await getClient(tenantId);
  const { set, mode } = await ensureDefaultColorsLocation(client);

  const { data: maxRow } = await client
    .from('css_variables')
    .select('sort_order')
    .eq('set_id', set.id)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = (maxRow?.sort_order ?? -1) + 1;

  const { data: variableRow, error: variableError } = await client
    .from('css_variables')
    .insert({ set_id: set.id, type: 'color', name: data.name, sort_order: nextOrder })
    .select()
    .single();
  if (variableError) throw new Error(`Failed to create color variable: ${variableError.message}`);

  const { error: valueError } = await client
    .from('css_variable_values')
    .insert({ css_variable_id: variableRow.id, mode_id: mode.id, value: data.value });
  if (valueError) throw new Error(`Failed to set color variable value: ${valueError.message}`);

  return {
    id: variableRow.id,
    name: variableRow.name,
    value: data.value,
    sort_order: variableRow.sort_order,
    created_at: variableRow.created_at,
    updated_at: variableRow.updated_at,
  };
}

export async function updateColorVariable(
  id: string,
  updates: UpdateColorVariableData,
  tenantId?: string
): Promise<ColorVariable> {
  const client = await getClient(tenantId);

  if (updates.name !== undefined) {
    const { error } = await client
      .from('css_variables')
      .update({ name: updates.name, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw new Error(`Failed to update color variable: ${error.message}`);
  }

  if (updates.value !== undefined) {
    // Find the variable's set + default mode and upsert the value there
    const { data: variableRow, error: varError } = await client
      .from('css_variables')
      .select('set_id')
      .eq('id', id)
      .single();
    if (varError) throw new Error(`Failed to read color variable: ${varError.message}`);

    const { data: modeRow, error: modeError } = await client
      .from('css_variable_set_modes')
      .select('id')
      .eq('set_id', variableRow.set_id)
      .order('is_default', { ascending: false })
      .order('sort_order', { ascending: true })
      .limit(1)
      .single();
    if (modeError) throw new Error(`Failed to read default mode: ${modeError.message}`);

    const { error } = await client
      .from('css_variable_values')
      .upsert(
        {
          css_variable_id: id,
          mode_id: modeRow.id,
          value: updates.value,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'css_variable_id,mode_id' }
      );
    if (error) throw new Error(`Failed to update color variable value: ${error.message}`);
  }

  const refreshed = await getColorVariableById(id, tenantId);
  if (!refreshed) throw new Error('Color variable disappeared after update');
  return refreshed;
}

export async function deleteColorVariable(id: string, tenantId?: string): Promise<void> {
  const client = await getClient(tenantId);
  const { error } = await client.from('css_variables').delete().eq('id', id);
  if (error) throw new Error(`Failed to delete color variable: ${error.message}`);
}

export async function reorderColorVariables(orderedIds: string[], tenantId?: string): Promise<void> {
  if (orderedIds.length === 0) return;
  const client = await getClient(tenantId);

  const { data: existing, error: fetchError } = await client
    .from('css_variables')
    .select('*')
    .in('id', orderedIds);

  if (fetchError) throw new Error(`Failed to fetch color variables for reorder: ${fetchError.message}`);

  const existingMap = new Map(((existing || []) as Array<{ id: string }>).map((r) => [r.id, r]));
  const now = new Date().toISOString();
  const updates = orderedIds
    .map((id, index) => {
      const row = existingMap.get(id);
      if (!row) return null;
      return { ...row, sort_order: index, updated_at: now };
    })
    .filter(Boolean);

  if (updates.length === 0) return;
  const { error } = await client.from('css_variables').upsert(updates, { onConflict: 'id' });
  if (error) throw new Error(`Failed to reorder color variables: ${error.message}`);
}

/**
 * Hash of just the color-typed variables. Use {@link import('./cssVariableRepository').getCssVariablesGraphHash}
 * when you want change detection across the full typed graph (publish flow).
 */
export async function getColorVariablesHash(tenantId?: string): Promise<string> {
  const variables = await getAllColorVariables(tenantId);
  return generateContentHash(
    variables.map((v) => ({ id: v.id, name: v.name, value: v.value, sort_order: v.sort_order }))
  );
}
