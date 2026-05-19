import type { Knex } from 'knex';

/**
 * Migration: CSS Variables System
 *
 * Extends the color-only variable system into a typed CSS variable system
 * supporting multiple types (color, size, percentage, number, font_family),
 * variable sets with multiple modes (theme via data-theme, breakpoint via
 * @media), and optional groups.
 *
 * Existing color_variables rows are migrated into a default "Colors" set with
 * a single default mode. IDs are preserved so existing `var(--<uuid>)`
 * references in layer classes/design continue to resolve.
 */

export async function up(knex: Knex): Promise<void> {
  // css_variable_sets
  if (!(await knex.schema.hasTable('css_variable_sets'))) {
    await knex.schema.createTable('css_variable_sets', (table) => {
      table.uuid('id').defaultTo(knex.raw('gen_random_uuid()')).primary();
      table.string('name', 255).notNullable();
      table.string('activation_kind', 32).notNullable().defaultTo('default');
      table.integer('sort_order').defaultTo(0);
      table.uuid('tenant_id').nullable();
      table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
      table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
    });

    await knex.raw(`
      ALTER TABLE css_variable_sets
      ADD CONSTRAINT css_variable_sets_activation_kind_check
      CHECK (activation_kind IN ('default','theme','breakpoint'))
    `);

    await knex.raw(`
      CREATE INDEX IF NOT EXISTS idx_css_variable_sets_tenant_sort
      ON css_variable_sets(tenant_id, sort_order, created_at)
    `);

    await knex.raw('ALTER TABLE css_variable_sets ENABLE ROW LEVEL SECURITY');
    await knex.raw(`
      CREATE POLICY "CSS variable sets are viewable"
        ON css_variable_sets FOR SELECT USING (true)
    `);
    await knex.raw(`
      CREATE POLICY "Authenticated users can insert CSS variable sets"
        ON css_variable_sets FOR INSERT WITH CHECK ((SELECT auth.uid()) IS NOT NULL)
    `);
    await knex.raw(`
      CREATE POLICY "Authenticated users can update CSS variable sets"
        ON css_variable_sets FOR UPDATE USING ((SELECT auth.uid()) IS NOT NULL)
    `);
    await knex.raw(`
      CREATE POLICY "Authenticated users can delete CSS variable sets"
        ON css_variable_sets FOR DELETE USING ((SELECT auth.uid()) IS NOT NULL)
    `);
  }

  // css_variable_set_modes
  if (!(await knex.schema.hasTable('css_variable_set_modes'))) {
    await knex.schema.createTable('css_variable_set_modes', (table) => {
      table.uuid('id').defaultTo(knex.raw('gen_random_uuid()')).primary();
      table
        .uuid('set_id')
        .notNullable()
        .references('id')
        .inTable('css_variable_sets')
        .onDelete('CASCADE');
      table.string('name', 255).notNullable();
      table.boolean('is_default').notNullable().defaultTo(false);
      table.string('data_theme', 255).nullable();
      table.integer('min_width').nullable();
      table.integer('sort_order').defaultTo(0);
      table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
      table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
    });

    await knex.raw(`
      CREATE INDEX IF NOT EXISTS idx_css_variable_set_modes_set_sort
      ON css_variable_set_modes(set_id, sort_order, created_at)
    `);

    await knex.raw('ALTER TABLE css_variable_set_modes ENABLE ROW LEVEL SECURITY');
    await knex.raw(`
      CREATE POLICY "CSS variable set modes are viewable"
        ON css_variable_set_modes FOR SELECT USING (true)
    `);
    await knex.raw(`
      CREATE POLICY "Authenticated users can insert CSS variable set modes"
        ON css_variable_set_modes FOR INSERT WITH CHECK ((SELECT auth.uid()) IS NOT NULL)
    `);
    await knex.raw(`
      CREATE POLICY "Authenticated users can update CSS variable set modes"
        ON css_variable_set_modes FOR UPDATE USING ((SELECT auth.uid()) IS NOT NULL)
    `);
    await knex.raw(`
      CREATE POLICY "Authenticated users can delete CSS variable set modes"
        ON css_variable_set_modes FOR DELETE USING ((SELECT auth.uid()) IS NOT NULL)
    `);
  }

  // css_variable_groups
  if (!(await knex.schema.hasTable('css_variable_groups'))) {
    await knex.schema.createTable('css_variable_groups', (table) => {
      table.uuid('id').defaultTo(knex.raw('gen_random_uuid()')).primary();
      table
        .uuid('set_id')
        .notNullable()
        .references('id')
        .inTable('css_variable_sets')
        .onDelete('CASCADE');
      table.string('name', 255).notNullable();
      table.integer('sort_order').defaultTo(0);
      table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
      table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
    });

    await knex.raw(`
      CREATE INDEX IF NOT EXISTS idx_css_variable_groups_set_sort
      ON css_variable_groups(set_id, sort_order, created_at)
    `);

    await knex.raw('ALTER TABLE css_variable_groups ENABLE ROW LEVEL SECURITY');
    await knex.raw(`
      CREATE POLICY "CSS variable groups are viewable"
        ON css_variable_groups FOR SELECT USING (true)
    `);
    await knex.raw(`
      CREATE POLICY "Authenticated users can insert CSS variable groups"
        ON css_variable_groups FOR INSERT WITH CHECK ((SELECT auth.uid()) IS NOT NULL)
    `);
    await knex.raw(`
      CREATE POLICY "Authenticated users can update CSS variable groups"
        ON css_variable_groups FOR UPDATE USING ((SELECT auth.uid()) IS NOT NULL)
    `);
    await knex.raw(`
      CREATE POLICY "Authenticated users can delete CSS variable groups"
        ON css_variable_groups FOR DELETE USING ((SELECT auth.uid()) IS NOT NULL)
    `);
  }

  // css_variables
  if (!(await knex.schema.hasTable('css_variables'))) {
    await knex.schema.createTable('css_variables', (table) => {
      table.uuid('id').defaultTo(knex.raw('gen_random_uuid()')).primary();
      table
        .uuid('set_id')
        .notNullable()
        .references('id')
        .inTable('css_variable_sets')
        .onDelete('CASCADE');
      table
        .uuid('group_id')
        .nullable()
        .references('id')
        .inTable('css_variable_groups')
        .onDelete('SET NULL');
      table.string('type', 32).notNullable();
      table.string('name', 255).notNullable();
      table.integer('sort_order').defaultTo(0);
      table.uuid('tenant_id').nullable();
      table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
      table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
    });

    await knex.raw(`
      ALTER TABLE css_variables
      ADD CONSTRAINT css_variables_type_check
      CHECK (type IN ('color','size','percentage','number','font_family'))
    `);

    await knex.raw(`
      CREATE INDEX IF NOT EXISTS idx_css_variables_set_sort
      ON css_variables(set_id, sort_order, created_at)
    `);
    await knex.raw(`
      CREATE INDEX IF NOT EXISTS idx_css_variables_tenant
      ON css_variables(tenant_id)
    `);

    await knex.raw('ALTER TABLE css_variables ENABLE ROW LEVEL SECURITY');
    await knex.raw(`
      CREATE POLICY "CSS variables are viewable"
        ON css_variables FOR SELECT USING (true)
    `);
    await knex.raw(`
      CREATE POLICY "Authenticated users can insert CSS variables"
        ON css_variables FOR INSERT WITH CHECK ((SELECT auth.uid()) IS NOT NULL)
    `);
    await knex.raw(`
      CREATE POLICY "Authenticated users can update CSS variables"
        ON css_variables FOR UPDATE USING ((SELECT auth.uid()) IS NOT NULL)
    `);
    await knex.raw(`
      CREATE POLICY "Authenticated users can delete CSS variables"
        ON css_variables FOR DELETE USING ((SELECT auth.uid()) IS NOT NULL)
    `);
  }

  // css_variable_values
  if (!(await knex.schema.hasTable('css_variable_values'))) {
    await knex.schema.createTable('css_variable_values', (table) => {
      table
        .uuid('css_variable_id')
        .notNullable()
        .references('id')
        .inTable('css_variables')
        .onDelete('CASCADE');
      table
        .uuid('mode_id')
        .notNullable()
        .references('id')
        .inTable('css_variable_set_modes')
        .onDelete('CASCADE');
      table.text('value').notNullable().defaultTo('');
      table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
      table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
      table.primary(['css_variable_id', 'mode_id']);
    });

    await knex.raw(`
      CREATE INDEX IF NOT EXISTS idx_css_variable_values_mode
      ON css_variable_values(mode_id)
    `);

    await knex.raw('ALTER TABLE css_variable_values ENABLE ROW LEVEL SECURITY');
    await knex.raw(`
      CREATE POLICY "CSS variable values are viewable"
        ON css_variable_values FOR SELECT USING (true)
    `);
    await knex.raw(`
      CREATE POLICY "Authenticated users can insert CSS variable values"
        ON css_variable_values FOR INSERT WITH CHECK ((SELECT auth.uid()) IS NOT NULL)
    `);
    await knex.raw(`
      CREATE POLICY "Authenticated users can update CSS variable values"
        ON css_variable_values FOR UPDATE USING ((SELECT auth.uid()) IS NOT NULL)
    `);
    await knex.raw(`
      CREATE POLICY "Authenticated users can delete CSS variable values"
        ON css_variable_values FOR DELETE USING ((SELECT auth.uid()) IS NOT NULL)
    `);
  }

  // Data migration: move existing color_variables rows into the new schema.
  // Skip if there are no color variables, or if migration already ran (a Colors
  // set already exists with all the variable IDs).
  const hasColorVariablesTable = await knex.schema.hasTable('color_variables');
  if (hasColorVariablesTable) {
    const legacyRows = await knex('color_variables')
      .select('id', 'name', 'value', 'sort_order', 'tenant_id')
      .orderBy('sort_order', 'asc')
      .orderBy('created_at', 'asc');

    if (legacyRows.length > 0) {
      const legacyIds = legacyRows.map((r) => r.id);
      const alreadyMigrated = await knex('css_variables')
        .whereIn('id', legacyIds)
        .count<{ count: string }>('id as count')
        .first();

      if (Number(alreadyMigrated?.count ?? 0) === 0) {
        // Group by tenant so each tenant gets its own Colors set + Default mode
        const byTenant = new Map<string | null, typeof legacyRows>();
        for (const row of legacyRows) {
          const key = row.tenant_id ?? null;
          if (!byTenant.has(key)) byTenant.set(key, []);
          byTenant.get(key)!.push(row);
        }

        for (const [tenantId, rows] of byTenant.entries()) {
          const [createdSet] = await knex('css_variable_sets')
            .insert({
              name: 'Colors',
              activation_kind: 'default',
              sort_order: 0,
              tenant_id: tenantId,
            })
            .returning('id');

          const setId = createdSet.id;

          const [createdMode] = await knex('css_variable_set_modes')
            .insert({
              set_id: setId,
              name: 'Default',
              is_default: true,
              sort_order: 0,
            })
            .returning('id');

          const modeId = createdMode.id;

          const [createdGroup] = await knex('css_variable_groups')
            .insert({
              set_id: setId,
              name: 'Default group',
              sort_order: 0,
            })
            .returning('id');

          const groupId = createdGroup.id;

          // Insert variables preserving IDs so existing var(--<uuid>) refs work
          await knex('css_variables').insert(
            rows.map((row, index) => ({
              id: row.id,
              set_id: setId,
              group_id: groupId,
              type: 'color',
              name: row.name,
              sort_order: row.sort_order ?? index,
              tenant_id: tenantId,
            }))
          );

          await knex('css_variable_values').insert(
            rows.map((row) => ({
              css_variable_id: row.id,
              mode_id: modeId,
              value: row.value,
            }))
          );
        }
      }
    }
  }

  // Backfill: every set must have at least one group, and no variable may be
  // ungrouped. Create a "Default group" for sets that lack one (idempotent —
  // skipped when any group already exists), then reassign orphan variables.
  await knex.raw(`
    INSERT INTO css_variable_groups (set_id, name, sort_order)
    SELECT s.id, 'Default group', 0
    FROM css_variable_sets s
    WHERE NOT EXISTS (
      SELECT 1 FROM css_variable_groups g WHERE g.set_id = s.id
    )
  `);

  await knex.raw(`
    UPDATE css_variables v
    SET group_id = (
      SELECT g.id FROM css_variable_groups g
      WHERE g.set_id = v.set_id
      ORDER BY g.sort_order ASC, g.created_at ASC
      LIMIT 1
    )
    WHERE v.group_id IS NULL
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('css_variable_values');
  await knex.schema.dropTableIfExists('css_variables');
  await knex.schema.dropTableIfExists('css_variable_groups');
  await knex.schema.dropTableIfExists('css_variable_set_modes');
  await knex.schema.dropTableIfExists('css_variable_sets');
}
