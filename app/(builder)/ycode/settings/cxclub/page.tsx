'use client';

// CX: "CxClub" settings section — the reactivation panel for our builder
// feature flags. Mirrors the layout used by the other settings pages
// (see ../redirects/page.tsx and ../general/page.tsx) but writes a single
// JSON blob under the `cx_features` setting key instead of its own API route.

import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldLegend,
} from '@/components/ui/field';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/stores/useSettingsStore';
import {
  CX_FEATURE_ITEMS,
  CX_FEATURES_SETTING_KEY,
  resolveCxFeatures,
  type CxFeatureKey,
} from '@/lib/cx-features';

export default function CxClubSettingsPage() {
  const getSettingByKey = useSettingsStore((s) => s.getSettingByKey);
  const saveSettings = useSettingsStore((s) => s.saveSettings);
  // Subscribing to settingsByKey (not just reading via getSettingByKey) keeps
  // this page in sync if the flag is changed elsewhere (e.g. via MCP).
  const rawFeatures = useSettingsStore((s) => s.settingsByKey[CX_FEATURES_SETTING_KEY]);
  const features = resolveCxFeatures(rawFeatures ?? getSettingByKey(CX_FEATURES_SETTING_KEY));

  const [savingKey, setSavingKey] = useState<CxFeatureKey | null>(null);

  const handleToggle = useCallback(async (key: CxFeatureKey, value: boolean) => {
    setSavingKey(key);
    const next = { ...features, [key]: value };

    try {
      const success = await saveSettings({ [CX_FEATURES_SETTING_KEY]: next });
      if (!success) {
        toast.error(useSettingsStore.getState().error || 'Não foi possível salvar. Tente novamente.');
        return;
      }
      toast.success('Preferência salva');
    } finally {
      setSavingKey(null);
    }
  }, [features, saveSettings]);

  return (
    <div className="p-8">
      <div className="max-w-3xl mx-auto">
        <header className="pt-8 pb-3">
          <span className="text-base font-medium">CxClub</span>
        </header>

        <div className="flex flex-col gap-6 bg-secondary/20 p-8 rounded-lg">
          <div>
            <FieldLegend>Recursos do editor</FieldLegend>
            <FieldDescription>
              Ative ou desative seções do editor que a equipe CxClub usa (ou não). Ao
              desativar, o item some da barra superior e dos painéis — nenhum dado é
              apagado, então é seguro reativar a qualquer momento. As mudanças aparecem
              na hora; se algo ficar preso no meio de uma edição, um recarregar resolve.
            </FieldDescription>
          </div>

          <div className="flex flex-col divide-y">
            {CX_FEATURE_ITEMS.map((item, index) => (
              <Field
                key={item.key}
                orientation="horizontal"
                className={cn('flex-row-reverse', index > 0 && 'pt-6')}
              >
                <FieldContent>
                  <FieldLabel htmlFor={`cx-feature-${item.key}`}>{item.label}</FieldLabel>
                  <FieldDescription>{item.description}</FieldDescription>
                </FieldContent>
                <Switch
                  id={`cx-feature-${item.key}`}
                  checked={features[item.key]}
                  disabled={savingKey === item.key}
                  onCheckedChange={(checked) => handleToggle(item.key, checked)}
                />
              </Field>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
