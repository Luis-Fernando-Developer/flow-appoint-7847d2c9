-- 1. Tabela de super admins
CREATE TABLE IF NOT EXISTS public.super_admins (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.super_admins ENABLE ROW LEVEL SECURITY;

-- 2. Função: é super admin?
CREATE OR REPLACE FUNCTION public.is_super_admin(_uid UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = _uid);
$$;

-- 3. Função: company_id do usuário (funcionário ativo)
CREATE OR REPLACE FUNCTION public.user_company_id(_uid UUID)
RETURNS UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id
  FROM public.employees
  WHERE user_id = _uid AND COALESCE(is_active, true) = true
  ORDER BY created_at ASC
  LIMIT 1;
$$;

-- 4. Policies da tabela super_admins (somente super admins gerenciam)
CREATE POLICY "Super admins can view super_admins"
ON public.super_admins FOR SELECT
USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins can manage super_admins"
ON public.super_admins FOR ALL
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

-- 5. Substitui policies permissivas de company_credits
DROP POLICY IF EXISTS "Anyone can view company_credits" ON public.company_credits;
DROP POLICY IF EXISTS "Authenticated can insert company_credits" ON public.company_credits;
DROP POLICY IF EXISTS "Authenticated can update company_credits" ON public.company_credits;
DROP POLICY IF EXISTS "Authenticated can delete company_credits" ON public.company_credits;

CREATE POLICY "View own company credits or super admin"
ON public.company_credits FOR SELECT
USING (
  public.is_super_admin(auth.uid())
  OR company_id = public.user_company_id(auth.uid())
);

CREATE POLICY "Super admins insert company credits"
ON public.company_credits FOR INSERT
WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins update company credits"
ON public.company_credits FOR UPDATE
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins delete company credits"
ON public.company_credits FOR DELETE
USING (public.is_super_admin(auth.uid()));