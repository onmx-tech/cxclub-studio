/**
 * CX: CxClub Studio feature flags
 *
 * Internal customization for our fork — lets the CxClub team hide builder
 * sections we don't use (Collections/CMS, Forms, Localization, Devtools)
 * while keeping the rest of the upstream ycode builder untouched.
 *
 * Storage: a single JSON object under the `cx_features` key in the generic
 * `settings` table (see lib/repositories/settingsRepository.ts). This is the
 * same table the MCP `get_settings` / `set_setting` tools read and write, so
 * flags stay fully compatible with that surface — e.g. an MCP client can do
 * `set_setting({ key: 'cx_features', value: { collections: true } })`.
 */

export type CxFeatureKey =
  | 'collections'
  | 'forms'
  | 'localization'
  | 'devtools'
  | 'components'
  | 'animations'
  | 'integrations';

export type CxFeatureFlags = Record<CxFeatureKey, boolean>;

/** Setting key under which the flags JSON blob is stored. */
export const CX_FEATURES_SETTING_KEY = 'cx_features';

/**
 * Default state for a fresh install / when the setting is absent.
 * Matches what CxClub actually uses day-to-day: CMS, forms, localization and
 * devtools are off; components, animations/interactions and integrations
 * (static export lives there) stay on.
 */
export const CX_FEATURE_DEFAULTS: CxFeatureFlags = {
  collections: false,
  forms: false,
  localization: false,
  devtools: false,
  components: true,
  animations: true,
  integrations: true,
};

/** Order + copy (pt-BR) used by the CxClub settings panel. */
export const CX_FEATURE_ITEMS: Array<{
  key: CxFeatureKey;
  label: string;
  description: string;
}> = [
  {
    key: 'collections',
    label: 'Coleções (CMS)',
    description: 'Coleções de conteúdo dinâmico, itens do CMS e o botão CMS na barra superior.',
  },
  {
    key: 'forms',
    label: 'Formulários',
    description: 'Aba de formulários e envios recebidos pelo site.',
  },
  {
    key: 'localization',
    label: 'Localização',
    description: 'Idiomas, traduções e o seletor de idioma na barra superior.',
  },
  {
    key: 'devtools',
    label: 'Devtools',
    description: 'Ferramentas internas de desenvolvimento (reset de banco, migrações). Fica acessível só por URL direta.',
  },
  {
    key: 'components',
    label: 'Componentes',
    description: 'Aba "Components" na biblioteca de elementos do editor.',
  },
  {
    key: 'animations',
    label: 'Animações & Interações',
    description: 'Aba "Interactions" no painel direito de propriedades de camada.',
  },
  {
    key: 'integrations',
    label: 'Integrações',
    description: 'Apps, API, webhooks e exportação estática (o export do site vive aqui).',
  },
];

/**
 * Merge a raw `cx_features` setting value (possibly null/partial/malformed)
 * with the defaults, so callers always get a fully-populated, well-typed
 * object regardless of what's in storage.
 */
export function resolveCxFeatures(raw: unknown): CxFeatureFlags {
  if (!raw || typeof raw !== 'object') {
    return { ...CX_FEATURE_DEFAULTS };
  }

  const value = raw as Partial<Record<CxFeatureKey, unknown>>;
  const resolved = { ...CX_FEATURE_DEFAULTS };

  for (const key of Object.keys(CX_FEATURE_DEFAULTS) as CxFeatureKey[]) {
    if (typeof value[key] === 'boolean') {
      resolved[key] = value[key] as boolean;
    }
  }

  return resolved;
}
