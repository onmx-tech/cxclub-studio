// CX: Reactive access to the `cx_features` builder setting.
//
// The settings store is populated once at builder load (editorApi.init() ->
// setSettings(...) in YCodeBuilderMain.tsx), and updated locally the moment
// the CxClub settings panel saves — see updateSetting() in useSettingsStore.
// Subscribing here means nav items react immediately, no reload needed.
import { useMemo } from 'react';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { CX_FEATURES_SETTING_KEY, resolveCxFeatures, type CxFeatureFlags } from '@/lib/cx-features';

export function useCxFeatures(): CxFeatureFlags {
  const raw = useSettingsStore((state) => state.settingsByKey[CX_FEATURES_SETTING_KEY]);
  return useMemo(() => resolveCxFeatures(raw), [raw]);
}
