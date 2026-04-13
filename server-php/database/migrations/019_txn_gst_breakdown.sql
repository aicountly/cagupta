-- GST breakdown JSON for invoices (accounting / ERP sync — CGST, SGST, IGST, UTGST separately).
ALTER TABLE txn ADD COLUMN IF NOT EXISTS gst_breakdown JSONB;

INSERT INTO schema_migrations (version) VALUES ('019_txn_gst_breakdown')
ON CONFLICT (version) DO NOTHING;
