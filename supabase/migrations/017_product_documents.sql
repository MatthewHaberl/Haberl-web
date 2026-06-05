-- Migration 017: Product Documents
-- Stores manuals, datasheets, drawings and 3D models for shop products.
-- Admin reviews documents via /portal/employee/shop/product-docs and marks them published.

CREATE TABLE product_documents (
  id             UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id     UUID        REFERENCES products(id) ON DELETE SET NULL,
  brand          TEXT        NOT NULL,
  product_family TEXT        NOT NULL,
  doc_type       TEXT        NOT NULL CHECK (doc_type IN (
                               'datasheet', 'manual', 'installation_guide',
                               'drawing', '3d_model', 'wiring_diagram',
                               'warranty', 'certification', 'other'
                             )),
  title          TEXT        NOT NULL,
  url            TEXT,
  file_path      TEXT,
  file_size_kb   INTEGER,
  language       TEXT        DEFAULT 'en',
  version        TEXT,
  status         TEXT        NOT NULL DEFAULT 'pending_review' CHECK (status IN (
                               'pending_review', 'published', 'rejected'
                             )),
  notes          TEXT,
  source         TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Index for quick look-ups by product and brand
CREATE INDEX idx_product_documents_product_id ON product_documents(product_id);
CREATE INDEX idx_product_documents_brand      ON product_documents(brand);
CREATE INDEX idx_product_documents_status     ON product_documents(status);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_product_documents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_product_documents_updated_at
BEFORE UPDATE ON product_documents
FOR EACH ROW EXECUTE FUNCTION update_product_documents_updated_at();

-- RLS
ALTER TABLE product_documents ENABLE ROW LEVEL SECURITY;

-- Public can view published documents
CREATE POLICY "Published docs are public"
  ON product_documents FOR SELECT
  USING (status = 'published');

-- Admins can do everything
CREATE POLICY "Admins manage all docs"
  ON product_documents FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );
