
ALTER TABLE public.company_customizations
  ADD COLUMN IF NOT EXISTS header_position text DEFAULT 'fixed',
  ADD COLUMN IF NOT EXISTS header_background_type text DEFAULT 'solid',
  ADD COLUMN IF NOT EXISTS header_background_color text,
  ADD COLUMN IF NOT EXISTS header_background_gradient jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS font_family text DEFAULT 'Inter',
  ADD COLUMN IF NOT EXISTS font_size_base integer DEFAULT 16,
  ADD COLUMN IF NOT EXISTS font_color_type text DEFAULT 'solid',
  ADD COLUMN IF NOT EXISTS font_color text,
  ADD COLUMN IF NOT EXISTS font_gradient jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS hero_banner_type text DEFAULT 'single',
  ADD COLUMN IF NOT EXISTS hero_banner_urls text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS hero_background_type text DEFAULT 'gradient',
  ADD COLUMN IF NOT EXISTS hero_background_color text,
  ADD COLUMN IF NOT EXISTS hero_background_gradient jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS hero_title text,
  ADD COLUMN IF NOT EXISTS hero_description text,
  ADD COLUMN IF NOT EXISTS hero_content_position text DEFAULT 'absolute',
  ADD COLUMN IF NOT EXISTS button_color_type text DEFAULT 'solid',
  ADD COLUMN IF NOT EXISTS button_color text,
  ADD COLUMN IF NOT EXISTS button_gradient jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS cards_show_images boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS cards_layout text DEFAULT 'vertical',
  ADD COLUMN IF NOT EXISTS cards_font_family text DEFAULT 'Inter',
  ADD COLUMN IF NOT EXISTS cards_color_type text DEFAULT 'solid',
  ADD COLUMN IF NOT EXISTS cards_color text,
  ADD COLUMN IF NOT EXISTS cards_gradient jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS extra_section_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS extra_section_code text DEFAULT '',
  ADD COLUMN IF NOT EXISTS footer_background_type text DEFAULT 'gradient',
  ADD COLUMN IF NOT EXISTS footer_background_color text,
  ADD COLUMN IF NOT EXISTS footer_background_gradient jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS footer_font_family text DEFAULT 'Inter';

ALTER TABLE public.company_customizations
  ADD CONSTRAINT company_customizations_company_id_unique UNIQUE (company_id);

INSERT INTO storage.buckets (id, name, public)
VALUES ('company-logos', 'company-logos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

CREATE POLICY "Public read company-logos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'company-logos');

CREATE POLICY "Authenticated upload company-logos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'company-logos');

CREATE POLICY "Authenticated update company-logos"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'company-logos');

CREATE POLICY "Authenticated delete company-logos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'company-logos');
