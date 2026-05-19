/**
 * Color Variables Store (legacy façade)
 *
 * Thin compatibility wrapper around {@link useCssVariablesStore} that keeps
 * the legacy flat-list color-variable API working for consumers (ColorPicker,
 * animation resolver, map marker resolver, MCP tools).
 *
 * New code should use `useCssVariablesStore` directly.
 */

import { create } from 'zustand';
import { useCssVariablesStore } from '@/stores/useCssVariablesStore';
import { toCssColorValue } from '@/lib/color-utils';
import type { ColorVariable, Layer } from '@/types';

interface ColorVariablesState {
  colorVariables: ColorVariable[];
  isLoading: boolean;
  error: string | null;
  previewOverride: { id: string; value: string } | null;
}

interface ColorVariablesActions {
  loadColorVariables: () => Promise<void>;
  createColorVariable: (name: string, value: string) => Promise<ColorVariable | null>;
  updateColorVariable: (id: string, data: { name?: string; value?: string }) => Promise<ColorVariable | null>;
  deleteColorVariable: (id: string) => Promise<boolean>;
  reorderColorVariables: (orderedIds: string[]) => Promise<void>;
  getVariableById: (id: string) => ColorVariable | undefined;
  setPreviewOverride: (override: { id: string; value: string } | null) => void;
  generateCssDeclarations: () => string;
}

type ColorVariablesStore = ColorVariablesState & ColorVariablesActions;

/** Derive the flat color-variables list from the typed graph. */
function deriveColorVariables(): ColorVariable[] {
  const { graph } = useCssVariablesStore.getState();
  return graph.variables
    .filter((v) => v.type === 'color')
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((v) => {
      const variableSet = graph.sets.find((s) => s.id === v.set_id);
      const defaultMode =
        graph.modes.find((m) => m.set_id === v.set_id && m.is_default) ??
        graph.modes
          .filter((m) => m.set_id === v.set_id)
          .slice()
          .sort((a, b) => a.sort_order - b.sort_order)[0];
      const value = defaultMode
        ? graph.values.find((val) => val.css_variable_id === v.id && val.mode_id === defaultMode.id)?.value ?? ''
        : '';
      return {
        id: v.id,
        name: v.name,
        value,
        sort_order: v.sort_order,
        created_at: v.created_at,
        updated_at: v.updated_at,
        // The set is kept implicit (legacy callers don't use it).
        _set_id: variableSet?.id,
      } as ColorVariable & { _set_id?: string };
    });
}

export const useColorVariablesStore = create<ColorVariablesStore>((set, get) => {
  // Keep the local cache in sync with the underlying store
  let lastVersion = -1;
  const syncFromCssStore = () => {
    const { version } = useCssVariablesStore.getState();
    if (version === lastVersion) return;
    lastVersion = version;
    set({ colorVariables: deriveColorVariables() });
  };

  useCssVariablesStore.subscribe(syncFromCssStore);

  return {
    colorVariables: [],
    isLoading: false,
    error: null,
    previewOverride: null,

    loadColorVariables: async () => {
      set({ isLoading: true, error: null });
      try {
        await useCssVariablesStore.getState().loadGraph();
        const cssError = useCssVariablesStore.getState().error;
        if (cssError) throw new Error(cssError);
        syncFromCssStore();
        set({ isLoading: false });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to load color variables';
        set({ error: message, isLoading: false });
      }
    },

    createColorVariable: async (name, value) => {
      const cssStore = useCssVariablesStore.getState();
      // Find or create a default set to attach the color variable to
      let targetSet = cssStore.graph.sets.find((s) => s.activation_kind === 'default');
      if (!targetSet) {
        targetSet = (await cssStore.createSet({ name: 'Colors', activation_kind: 'default' })) ?? undefined;
      }
      if (!targetSet) return null;

      const refreshed = useCssVariablesStore.getState();
      const variable = await refreshed.createItem({ set_id: targetSet.id, type: 'color', name });
      if (!variable) return null;

      const defaultMode = useCssVariablesStore.getState().getDefaultModeForSet(targetSet.id);
      if (!defaultMode) return null;
      await useCssVariablesStore.getState().setValue({ css_variable_id: variable.id, mode_id: defaultMode.id, value });

      syncFromCssStore();
      return get().getVariableById(variable.id) ?? null;
    },

    updateColorVariable: async (id, data) => {
      const cssStore = useCssVariablesStore.getState();
      const variable = cssStore.getCssVariableById(id);
      if (!variable) {
        set({ error: 'Color variable not found' });
        return null;
      }

      if (data.name !== undefined) {
        await cssStore.updateItem(id, { name: data.name });
      }
      if (data.value !== undefined) {
        const defaultMode = useCssVariablesStore.getState().getDefaultModeForSet(variable.set_id);
        if (defaultMode) {
          await useCssVariablesStore.getState().setValue({
            css_variable_id: id,
            mode_id: defaultMode.id,
            value: data.value,
          });
        }
      }

      syncFromCssStore();
      return get().getVariableById(id) ?? null;
    },

    deleteColorVariable: async (id) => {
      const variable = useCssVariablesStore.getState().getCssVariableById(id);
      const rawValue = get().colorVariables.find((v) => v.id === id)?.value ?? '#000000';
      const cssValue = toCssColorValue(rawValue);

      const ok = await useCssVariablesStore.getState().deleteItem(id);
      if (!ok) {
        set({ error: useCssVariablesStore.getState().error });
        return false;
      }

      // Detach references from layer classes (preserves visual fidelity)
      try {
        const { usePagesStore } = await import('./usePagesStore');
        const { useComponentsStore } = await import('./useComponentsStore');
        const pagesStore = usePagesStore.getState();
        const componentsStore = useComponentsStore.getState();

        const replaceInClasses = (classes: string | string[]): string | string[] => {
          const replace = (s: string) =>
            s.replaceAll(`color:var(--${id})`, rawValue).replaceAll(`var(--${id})`, cssValue);
          if (Array.isArray(classes)) return classes.map(replace);
          return replace(classes);
        };

        const replaceInLayers = (layers: Layer[]): Layer[] =>
          layers.map((layer) => ({
            ...layer,
            classes: replaceInClasses(layer.classes),
            children: layer.children ? replaceInLayers(layer.children) : undefined,
          }));

        for (const [pageId, draft] of Object.entries(pagesStore.draftsByPageId)) {
          if (!draft) continue;
          const updated = replaceInLayers(draft.layers);
          pagesStore.setDraftLayers(pageId, updated);
        }

        for (const comp of componentsStore.components) {
          if (!comp.layers) continue;
          const updated = replaceInLayers(comp.layers as Layer[]);
          useComponentsStore.setState((state) => ({
            components: state.components.map((c) =>
              c.id === comp.id ? { ...c, layers: updated } : c
            ),
          }));
        }
      } catch (detachError) {
        console.error('Failed to detach color variable from layers:', detachError);
      }

      syncFromCssStore();
      void variable; // silence unused
      return true;
    },

    reorderColorVariables: async (orderedIds) => {
      await useCssVariablesStore.getState().reorderItems(orderedIds);
      syncFromCssStore();
    },

    getVariableById: (id) => {
      return get().colorVariables.find((v) => v.id === id);
    },

    setPreviewOverride: (override) => {
      set({ previewOverride: override });
      if (!override) {
        useCssVariablesStore.getState().setPreviewOverride(null);
        return;
      }
      const variable = useCssVariablesStore.getState().getCssVariableById(override.id);
      if (!variable) return;
      const defaultMode = useCssVariablesStore.getState().getDefaultModeForSet(variable.set_id);
      if (!defaultMode) return;
      useCssVariablesStore.getState().setPreviewOverride({
        cssVariableId: override.id,
        modeId: defaultMode.id,
        value: override.value,
      });
    },

    generateCssDeclarations: () => {
      return useCssVariablesStore.getState().generateStylesheet();
    },
  };
});
