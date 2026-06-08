-- ================================================================
-- Migration 020: product_images table + DB helper functions
-- Images reviewed by admin; publishing writes to products.images[]
-- ================================================================

CREATE TABLE product_images (
  id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id    uuid        REFERENCES products(id) ON DELETE SET NULL,
  brand         text        NOT NULL,
  product_family text       NOT NULL,
  url           text        NOT NULL,
  alt_text      text,
  source        text,
  notes         text,
  status        text        NOT NULL DEFAULT 'pending_review'
                            CHECK (status IN ('pending_review', 'published', 'rejected')),
  sort_order    integer     NOT NULL DEFAULT 0,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

CREATE INDEX product_images_brand_idx    ON product_images(brand);
CREATE INDEX product_images_status_idx   ON product_images(status);
CREATE INDEX product_images_product_idx  ON product_images(product_id);

ALTER TABLE product_images ENABLE ROW LEVEL SECURITY;

-- Admin: full CRUD
CREATE POLICY "admin_manage_product_images"
  ON product_images FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ----------------------------------------------------------------
-- Helper: append image URL to a specific product (no-op if dup)
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION append_product_image(p_product_id uuid, p_url text)
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE products
  SET images = array_append(images, p_url)
  WHERE id = p_product_id
    AND NOT (p_url = ANY(images));
$$;

-- ----------------------------------------------------------------
-- Helper: append image to all products of a brand (+ optional
-- family name filter using ILIKE).  Returns affected row count.
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION append_brand_image(
  p_brand  text,
  p_family text,
  p_url    text
) RETURNS integer LANGUAGE sql SECURITY DEFINER AS $$
  WITH updated AS (
    UPDATE products
    SET images = array_append(images, p_url)
    WHERE brand = p_brand
      AND (p_family = '' OR name ILIKE '%' || p_family || '%')
      AND NOT (p_url = ANY(images))
    RETURNING id
  )
  SELECT count(*)::integer FROM updated;
$$;

-- ----------------------------------------------------------------
-- Helper: remove an image URL from every product that holds it
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION remove_product_image(p_url text)
RETURNS integer LANGUAGE sql SECURITY DEFINER AS $$
  WITH updated AS (
    UPDATE products
    SET images = array_remove(images, p_url)
    WHERE p_url = ANY(images)
    RETURNING id
  )
  SELECT count(*)::integer FROM updated;
$$;

-- ----------------------------------------------------------------
-- Helper: count products that would receive a brand/family image
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION count_matching_products(p_brand text, p_family text)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT count(*)::integer
  FROM products
  WHERE brand = p_brand
    AND (p_family = '' OR name ILIKE '%' || p_family || '%');
$$;
