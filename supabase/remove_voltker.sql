-- DESTRUCTIVE: removes the Voltker schema objects and their database data.
-- Before running this script:
-- 1. Confirm this is the Arisan Supabase project.
-- 2. In Dashboard > Storage, delete all files in product-images and store-backups.
-- 3. Delete those two buckets in the Storage dashboard.
-- This script deliberately does not delete storage.objects directly.

begin;

drop policy if exists "Users can upload their own product images" on storage.objects;
drop policy if exists "Users can update their own product images" on storage.objects;
drop policy if exists "Users can delete their own product images" on storage.objects;
drop policy if exists "Users can upload their own store backups" on storage.objects;
drop policy if exists "Users can read their own store backups" on storage.objects;

do $$
declare
  trigger_record record;
begin
  for trigger_record in
    select * from (values
      ('transactions', 'transactions_insert_gross_profit'),
      ('transactions', 'transactions_items_gross_profit'),
      ('products', 'store_backup_revision_changed'),
      ('product_categories', 'store_backup_revision_changed'),
      ('product_units', 'store_backup_revision_changed'),
      ('customer_names', 'store_backup_revision_changed'),
      ('vendor_names', 'store_backup_revision_changed'),
      ('expedition_names', 'store_backup_revision_changed'),
      ('transactions', 'store_backup_revision_changed'),
      ('transaction_payments', 'store_backup_revision_changed'),
      ('finance_entries', 'store_backup_revision_changed'),
      ('manual_customer_credits', 'store_backup_revision_changed'),
      ('manual_customer_credit_payments', 'store_backup_revision_changed'),
      ('product_stock_adjustments', 'store_backup_revision_changed')
    ) as triggers(table_name, trigger_name)
  loop
    if to_regclass(format('public.%I', trigger_record.table_name)) is not null then
      execute format(
        'drop trigger if exists %I on public.%I',
        trigger_record.trigger_name,
        trigger_record.table_name
      );
    end if;
  end loop;
end;
$$;

drop function if exists public.abort_store_backup_restore(uuid);
drop function if exists public.add_manual_customer_credit(text, double precision, uuid);
drop function if exists public.add_product_stock(bigint, integer, uuid);
drop function if exists public.add_product_stock(bigint, integer, double precision, uuid);
drop function if exists public.add_product_stock(bigint, integer, double precision, uuid, text, double precision, double precision, double precision);
drop function if exists public.begin_store_backup_restore(jsonb);
drop function if exists public.bump_store_backup_revision();
drop function if exists public.calculate_transaction_gross_profit(jsonb);
drop function if exists public.commit_store_backup_restore(uuid);
drop function if exists public.complete_sale(text, text, double precision, jsonb, uuid);
drop function if exists public.complete_sale(text, text, double precision, jsonb, text, uuid);
drop function if exists public.delete_manual_finance_entry(bigint);
drop function if exists public.delete_product_category(bigint);
drop function if exists public.delete_product_unit(bigint);
drop function if exists public.delete_purchase_entry(bigint);
drop function if exists public.get_dashboard_data(timestamptz, timestamptz, timestamptz, timestamptz, integer, integer, boolean);
drop function if exists public.get_dashboard_data(timestamptz, timestamptz, timestamptz, timestamptz, integer, integer, boolean, text);
drop function if exists public.get_finance_data(timestamptz, timestamptz, integer, integer);
drop function if exists public.get_store_backup_revision();
drop function if exists public.get_transaction_summary(timestamptz, timestamptz);
drop function if exists public.product_unit_factor(text);
drop function if exists public.record_customer_credit_payment(text, double precision, uuid);
drop function if exists public.record_expedition_cost(bigint, double precision);
drop function if exists public.record_transaction_payment(bigint, double precision, uuid);
drop function if exists public.reset_store_data();
drop function if exists public.restore_store_backup(jsonb);
drop function if exists public.return_transaction_items(bigint, jsonb, uuid);
drop function if exists public.set_product_stock(bigint, integer);
drop function if exists public.set_transaction_gross_profit();
drop function if exists public.stage_store_backup_restore_chunk(uuid, text, integer, jsonb);

do $$
declare
  policy_record record;
begin
  for policy_record in
    select * from (values
      ('product_categories', 'Users can access their own product categories'),
      ('product_units', 'Users can access their own product units')
    ) as policies(table_name, policy_name)
  loop
    if to_regclass(format('public.%I', policy_record.table_name)) is not null then
      execute format(
        'drop policy if exists %I on public.%I',
        policy_record.policy_name,
        policy_record.table_name
      );
    end if;
  end loop;
end;
$$;

drop table if exists public.product_stock_adjustments;
drop table if exists public.manual_customer_credit_payments;
drop table if exists public.manual_customer_credits;
drop table if exists public.store_restore_chunks;
drop table if exists public.store_restore_sessions;
drop table if exists public.store_backup_revisions;
drop table if exists public.transaction_payments;
drop table if exists public.finance_entries;
drop table if exists public.transactions;
drop table if exists public.vendor_names;
drop table if exists public.expedition_names;
drop table if exists public.customer_names;
drop table if exists public.product_units;
drop table if exists public.product_categories;
drop table if exists public.products;

commit;
