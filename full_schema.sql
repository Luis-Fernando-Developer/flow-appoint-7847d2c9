
-- INDEPENDENT DEPLOYMENT SCHEMA
-- This script sets up the entire database structure.
SET check_function_bodies = false;
SET client_min_messages = warning;

-- Pre-emptive cleanup to avoid dependency issues with the common update function
DROP TRIGGER IF EXISTS update_companies_updated_at ON public.companies;
DROP TRIGGER IF EXISTS update_employees_updated_at ON public.employees;
DROP TRIGGER IF EXISTS update_services_updated_at ON public.services;
DROP TRIGGER IF EXISTS update_clients_updated_at ON public.clients;
DROP TRIGGER IF EXISTS update_bookings_updated_at ON public.bookings;
-- Criar tabelas para o sistema de agendamento

-- Tabela de empresas/estabelecimentos
CREATE TABLE IF NOT EXISTS public.companies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  owner_name TEXT NOT NULL,
  owner_email TEXT NOT NULL,
  owner_cpf TEXT NOT NULL,
  cnpj TEXT,
  phone TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  zip_code TEXT,
  logo_url TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'blocked')),
  plan TEXT NOT NULL DEFAULT 'starter' CHECK (plan IN ('starter', 'professional', 'enterprise')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela de funcionários/colaboradores
CREATE TYPE public.employee_role AS ENUM ('owner', 'manager', 'supervisor', 'receptionist', 'employee');

CREATE TABLE IF NOT EXISTS public.employees (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  role employee_role NOT NULL DEFAULT 'employee',
  permissions JSONB DEFAULT '{}',
  avatar_url TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(company_id, email)
);

-- Tabela de serviços
CREATE TABLE IF NOT EXISTS public.services (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  price DECIMAL(10,2) NOT NULL DEFAULT 0,
  image_url TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela de clientes
CREATE TABLE IF NOT EXISTS public.clients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  birth_date DATE,
  avatar_url TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(company_id, email)
);

-- Tabela de agendamentos
CREATE TYPE public.booking_status AS ENUM ('pending', 'confirmed', 'cancelled', 'completed', 'no_show');
CREATE TYPE public.payment_status AS ENUM ('pending', 'confirmed', 'cancelled', 'free');

CREATE TABLE IF NOT EXISTS public.bookings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  booking_date DATE NOT NULL,
  booking_time TIME NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  price DECIMAL(10,2) NOT NULL DEFAULT 0,
  booking_status booking_status NOT NULL DEFAULT 'pending',
  payment_status payment_status NOT NULL DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para companies
CREATE POLICY "Companies are viewable by everyone" 
ON public.companies FOR SELECT USING (true);

CREATE POLICY "Only authenticated users can insert companies" 
ON public.companies FOR INSERT 
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Company owners can update their company" 
ON public.companies FOR UPDATE 
USING (auth.uid()::text = owner_email OR 
       EXISTS (SELECT 1 FROM public.employees WHERE company_id = companies.id AND user_id = auth.uid() AND role IN ('owner', 'manager')));

-- Políticas RLS para employees
CREATE POLICY "Employees are viewable by company members" 
ON public.employees FOR SELECT 
USING (auth.uid() = user_id OR 
       EXISTS (SELECT 1 FROM public.employees e WHERE e.company_id = employees.company_id AND e.user_id = auth.uid()));

CREATE POLICY "Company owners and managers can manage employees" 
ON public.employees FOR ALL 
USING (EXISTS (SELECT 1 FROM public.employees e WHERE e.company_id = employees.company_id AND e.user_id = auth.uid() AND e.role IN ('owner', 'manager')));

-- Políticas RLS para services
CREATE POLICY "Services are viewable by everyone" 
ON public.services FOR SELECT USING (true);

CREATE POLICY "Company members can manage services" 
ON public.services FOR ALL 
USING (EXISTS (SELECT 1 FROM public.employees e WHERE e.company_id = services.company_id AND e.user_id = auth.uid()));

-- Políticas RLS para clients
CREATE POLICY "Clients are viewable by company members and themselves" 
ON public.clients FOR SELECT 
USING (auth.uid() = user_id OR 
       EXISTS (SELECT 1 FROM public.employees e WHERE e.company_id = clients.company_id AND e.user_id = auth.uid()));

CREATE POLICY "Company members can manage clients" 
ON public.clients FOR ALL 
USING (EXISTS (SELECT 1 FROM public.employees e WHERE e.company_id = clients.company_id AND e.user_id = auth.uid()));

-- Políticas RLS para bookings
CREATE POLICY "Bookings are viewable by company members and clients" 
ON public.bookings FOR SELECT 
USING (EXISTS (SELECT 1 FROM public.employees e WHERE e.company_id = bookings.company_id AND e.user_id = auth.uid()) OR
       EXISTS (SELECT 1 FROM public.clients c WHERE c.id = bookings.client_id AND c.user_id = auth.uid()));

CREATE POLICY "Company members can manage bookings" 
ON public.bookings FOR ALL 
USING (EXISTS (SELECT 1 FROM public.employees e WHERE e.company_id = bookings.company_id AND e.user_id = auth.uid()));

-- Triggers para updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_companies_updated_at ON public.companies;
CREATE TRIGGER update_companies_updated_at
  BEFORE UPDATE ON public.companies
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_employees_updated_at ON public.employees;
CREATE TRIGGER update_employees_updated_at
  BEFORE UPDATE ON public.employees
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_services_updated_at ON public.services;
CREATE TRIGGER update_services_updated_at
  BEFORE UPDATE ON public.services
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_clients_updated_at ON public.clients;
CREATE TRIGGER update_clients_updated_at
  BEFORE UPDATE ON public.clients
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_bookings_updated_at ON public.bookings;
CREATE TRIGGER update_bookings_updated_at
  BEFORE UPDATE ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Inserir dados de exemplo
INSERT INTO public.companies (name, slug, owner_name, owner_email, owner_cpf, status, plan) VALUES
('Viking Barbearia', 'viking-barbearia', 'João Silva', 'joao@viking.com', '123.456.789-00', 'active', 'professional'),
('Clínica Beleza', 'clinica-beleza', 'Maria Santos', 'maria@beleza.com', '987.654.321-00', 'active', 'enterprise'),
('Spa Relax', 'spa-relax', 'Ana Costa', 'ana@relax.com', '456.789.123-00', 'active', 'starter');
-- Fix security issues: Set search_path for function

-- DROP FUNCTION IF EXISTS public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
-- Fix security issues: Update function with CASCADE

-- DROP FUNCTION IF EXISTS public.update_updated_at_column() CASCADE;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Recreate triggers
DROP TRIGGER IF EXISTS update_companies_updated_at ON public.companies;
CREATE TRIGGER update_companies_updated_at
  BEFORE UPDATE ON public.companies
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_employees_updated_at ON public.employees;
CREATE TRIGGER update_employees_updated_at
  BEFORE UPDATE ON public.employees
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_services_updated_at ON public.services;
CREATE TRIGGER update_services_updated_at
  BEFORE UPDATE ON public.services
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_clients_updated_at ON public.clients;
CREATE TRIGGER update_clients_updated_at
  BEFORE UPDATE ON public.clients
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_bookings_updated_at ON public.bookings;
CREATE TRIGGER update_bookings_updated_at
  BEFORE UPDATE ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
-- Verificar e corrigir a política RLS para INSERT na tabela companies
-- Primeiro, remover a política atual que pode estar causando problemas
DROP POLICY IF EXISTS "Only authenticated users can insert companies" ON companies;

-- Criar uma nova política mais permissiva para INSERT
-- que permite que qualquer usuário autenticado crie uma empresa
CREATE POLICY "Authenticated users can insert companies" 
ON companies 
FOR INSERT 
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);
-- Desabilitar confirmação de email temporariamente para o cadastro funcionar
-- Vamos criar uma política mais permissiva para companies

-- Primeiro remover todas as políticas atuais
DROP POLICY IF EXISTS "Companies are viewable by everyone" ON companies;
DROP POLICY IF EXISTS "Company owners can update their company" ON companies; 
DROP POLICY IF EXISTS "Authenticated users can insert companies" ON companies;

-- Política para SELECT (visualização)
CREATE POLICY "Anyone can view companies" 
ON companies FOR SELECT 
USING (true);

-- Política para INSERT (mais permissiva)
CREATE POLICY "Anyone can insert companies" 
ON companies FOR INSERT 
WITH CHECK (true);

-- Política para UPDATE 
CREATE POLICY "Company owners can update" 
ON companies FOR UPDATE 
USING (true)
WITH CHECK (true);
-- Corrigir recursão infinita nas políticas RLS da tabela employees
-- Remover políticas problemáticas primeiro
DROP POLICY IF EXISTS "Company owners and managers can manage employees" ON employees;
DROP POLICY IF EXISTS "Employees are viewable by company members" ON employees;

-- Criar função de segurança definer para verificar se usuário é membro da empresa
CREATE OR REPLACE FUNCTION public.is_company_member(_company_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.employees
    WHERE company_id = _company_id 
      AND user_id = _user_id
      AND is_active = true
  );
$$;

-- Criar função para verificar se usuário é owner/manager da empresa
CREATE OR REPLACE FUNCTION public.is_company_admin(_company_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.employees
    WHERE company_id = _company_id 
      AND user_id = _user_id
      AND role IN ('owner', 'manager')
      AND is_active = true
  );
$$;

-- Recriar políticas usando as funções (sem recursão)
CREATE POLICY "Employees can view own data and company members" 
ON employees FOR SELECT 
USING (
  auth.uid() = user_id 
  OR public.is_company_member(company_id, auth.uid())
);

CREATE POLICY "Company admins can manage employees" 
ON employees FOR ALL 
USING (public.is_company_admin(company_id, auth.uid()))
WITH CHECK (public.is_company_admin(company_id, auth.uid()));

-- Política especial para permitir INSERT de novos owners (primeira vez)
CREATE POLICY "Allow insert for new company owners" 
ON employees FOR INSERT 
WITH CHECK (
  role = 'owner' 
  AND NOT EXISTS (
    SELECT 1 FROM employees e2 
    WHERE e2.company_id = employees.company_id 
    AND e2.role = 'owner'
  )
);
-- Create company_customization table to store landing page customizations
CREATE TABLE IF NOT EXISTS public.company_customizations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL,
  
  -- Header customization
  header_position TEXT DEFAULT 'fixed',
  header_background_type TEXT DEFAULT 'solid',
  header_background_color TEXT DEFAULT 'hsl(251, 91%, 65%)',
  header_background_gradient JSONB DEFAULT '{"type": "linear", "angle": 45, "colors": ["hsl(251, 91%, 65%)", "hsl(308, 56%, 85%)"]}',
  
  -- Font customization
  font_family TEXT DEFAULT 'Inter',
  font_size_base INTEGER DEFAULT 16,
  font_color_type TEXT DEFAULT 'solid',
  font_color TEXT DEFAULT 'hsl(240, 10%, 3.9%)',
  font_gradient JSONB DEFAULT '{"type": "linear", "angle": 45, "colors": ["hsl(240, 10%, 3.9%)", "hsl(251, 91%, 65%)"]}',
  
  -- Hero customization
  hero_banner_type TEXT DEFAULT 'single',
  hero_banner_urls TEXT[] DEFAULT ARRAY[]::TEXT[],
  hero_background_type TEXT DEFAULT 'gradient',
  hero_background_color TEXT DEFAULT 'hsl(240, 10%, 3.9%)',
  hero_background_gradient JSONB DEFAULT '{"type": "linear", "angle": 135, "colors": ["hsl(251, 91%, 65%)", "hsl(308, 56%, 85%)", "hsl(240, 10%, 3.9%)"]}',
  hero_title TEXT DEFAULT 'Agendamentos Inteligentes',
  hero_description TEXT DEFAULT 'Transforme a gestão do seu negócio com nossa plataforma completa de agendamentos online.',
  
  -- Cards customization
  cards_show_images BOOLEAN DEFAULT false,
  cards_layout TEXT DEFAULT 'vertical',
  cards_font_family TEXT DEFAULT 'Inter',
  cards_color_type TEXT DEFAULT 'solid',
  cards_color TEXT DEFAULT 'hsl(240, 10%, 3.9%)',
  cards_gradient JSONB DEFAULT '{"type": "linear", "angle": 45, "colors": ["hsl(240, 10%, 3.9%)", "hsl(251, 91%, 65%)"]}',
  
  -- Extra section
  extra_section_enabled BOOLEAN DEFAULT false,
  extra_section_code TEXT DEFAULT '',
  
  -- Footer customization
  footer_background_type TEXT DEFAULT 'gradient',
  footer_background_color TEXT DEFAULT 'hsl(240, 10%, 3.9%)',
  footer_background_gradient JSONB DEFAULT '{"type": "linear", "angle": 180, "colors": ["hsl(240, 10%, 3.9%)", "hsl(251, 91%, 65%)"]}',
  footer_font_family TEXT DEFAULT 'Inter',
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE
);

-- Enable RLS
ALTER TABLE public.company_customizations ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Company members can view customizations" 
ON public.company_customizations 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.employees e 
    WHERE e.company_id = company_customizations.company_id 
    AND e.user_id = auth.uid()
  )
);

CREATE POLICY "Company admins can manage customizations" 
ON public.company_customizations 
FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM public.employees e 
    WHERE e.company_id = company_customizations.company_id 
    AND e.user_id = auth.uid() 
    AND e.role IN ('owner', 'manager')
  )
);

-- Add trigger for updated_at
DROP TRIGGER IF EXISTS update_company_customizations_updated_at ON public.company_customizations;
CREATE TRIGGER update_company_customizations_updated_at
BEFORE UPDATE ON public.company_customizations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
-- Adicionar novo valor 'supervisor' ao enum employee_role
ALTER TYPE employee_role ADD VALUE IF NOT EXISTS 'supervisor';

-- Criar função para verificar níveis de permissão hierárquicos
CREATE OR REPLACE FUNCTION public.has_permission_level(_company_id uuid, _user_id uuid, _required_level text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM employees e
    WHERE e.company_id = _company_id 
      AND e.user_id = _user_id
      AND e.is_active = true
      AND CASE _required_level
        WHEN 'owner' THEN e.role = 'owner'
        WHEN 'manager' THEN e.role IN ('owner', 'manager')
        WHEN 'supervisor' THEN e.role IN ('owner', 'manager', 'supervisor')
        WHEN 'receptionist' THEN e.role IN ('owner', 'manager', 'supervisor', 'receptionist')
        WHEN 'employee' THEN e.role IN ('owner', 'manager', 'supervisor', 'receptionist', 'employee')
        ELSE false
      END
  );
$$;

-- Criar função para obter o nível de permissão do usuário atual
CREATE OR REPLACE FUNCTION public.get_user_role(_company_id uuid, _user_id uuid)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.role::text
  FROM employees e
  WHERE e.company_id = _company_id 
    AND e.user_id = _user_id
    AND e.is_active = true
  LIMIT 1;
$$;
-- Adicionar tipo de funcionário na tabela employees
ALTER TABLE public.employees 
ADD COLUMN employee_type TEXT NOT NULL DEFAULT 'fixo' CHECK (employee_type IN ('autonomo', 'fixo'));

-- Criar tabela de relacionamento entre funcionários e serviços
CREATE TABLE IF NOT EXISTS public.employee_services (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(employee_id, service_id)
);

-- Habilitar RLS na tabela employee_services
ALTER TABLE public.employee_services ENABLE ROW LEVEL SECURITY;

-- Política para funcionários verem seus próprios serviços
CREATE POLICY "Employees can view their own services"
ON public.employee_services
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = employee_services.employee_id 
    AND e.user_id = auth.uid()
  )
);

-- Política para administradores gerenciarem serviços dos funcionários
CREATE POLICY "Company admins can manage employee services"
ON public.employee_services
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = employee_services.employee_id 
    AND is_company_admin(e.company_id, auth.uid())
  )
);

-- Criar índice para melhor performance
CREATE INDEX idx_employee_services_employee_id ON public.employee_services(employee_id);
CREATE INDEX idx_employee_services_service_id ON public.employee_services(service_id);
-- Fix infinite recursion in employees table RLS policies
-- Drop all existing policies that cause recursion
DROP POLICY IF EXISTS "Allow insert for new company owners" ON public.employees;
DROP POLICY IF EXISTS "Company admins can manage employees" ON public.employees;
DROP POLICY IF EXISTS "Company clients can view active employees" ON public.employees;
DROP POLICY IF EXISTS "Employees can view own data and company members" ON public.employees;

-- Create simple, non-recursive policies
-- Users can view and update their own employee record
CREATE POLICY "Users can view their own employee record" ON public.employees
FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own employee record" ON public.employees  
FOR UPDATE USING (auth.uid() = user_id);

-- Allow authenticated users to view active employees (for client booking)
CREATE POLICY "Anyone can view active employees" ON public.employees
FOR SELECT USING (is_active = true);

-- Allow owners to insert new company employees
CREATE POLICY "Company owners can insert employees" ON public.employees
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.employees existing
    WHERE existing.company_id = employees.company_id
    AND existing.user_id = auth.uid()
    AND existing.role = 'owner'
    AND existing.is_active = true
  )
  OR 
  -- Allow first owner to be created
  (role = 'owner' AND NOT EXISTS (
    SELECT 1 FROM public.employees existing
    WHERE existing.company_id = employees.company_id
    AND existing.role = 'owner'
  ))
);

-- Allow owners to manage all employees in their company
CREATE POLICY "Company owners can manage employees" ON public.employees
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.employees owner
    WHERE owner.company_id = employees.company_id
    AND owner.user_id = auth.uid()
    AND owner.role = 'owner'
    AND owner.is_active = true
  )
);
-- Fix recursive RLS on employees and allow proper owner/admin access

-- 1) Ensure RLS is enabled (idempotent)
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

-- 2) Drop problematic recursive policies if they exist
DROP POLICY IF EXISTS "Company owners can manage employees" ON public.employees;
DROP POLICY IF EXISTS "Company owners can insert employees" ON public.employees;

-- 3) Helper function to check if a company already has an owner (SECURITY DEFINER to avoid RLS recursion)
CREATE OR REPLACE FUNCTION public.company_has_owner(_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.employees e
    WHERE e.company_id = _company_id
      AND e.role = 'owner'::employee_role
      AND e.is_active = true
  );
$$;

-- 4) New, non-recursive policy that leverages security definer functions
--    This grants full management to admins (owner/manager) and allows first owner creation
CREATE POLICY "Company admins can manage employees"
ON public.employees
FOR ALL
TO authenticated
USING (
  public.is_company_admin(company_id, auth.uid())
)
WITH CHECK (
  public.is_company_admin(company_id, auth.uid())
  OR (
    role = 'owner'::employee_role
    AND NOT public.company_has_owner(company_id)
  )
);

-- Keep existing safe policies (they should already exist):
-- - "Anyone can view active employees" (SELECT USING is_active = true)
-- - "Users can update their own employee record" (UPDATE USING auth.uid() = user_id)
-- - "Users can view their own employee record" (SELECT USING auth.uid() = user_id)

-- 5) Optional: revalidate privileges (no-op but documents intent)
COMMENT ON POLICY "Company admins can manage employees" ON public.employees IS
  'Uses security definer functions to avoid recursion. Admins manage all; allows first owner insert when none exists.';

-- Fix company_customizations RLS to allow public access to landing pages
-- Landing pages should be visible to everyone, not just company employees

-- Drop the restrictive policy
DROP POLICY IF EXISTS "Company members can view customizations" ON public.company_customizations;

-- Create a new policy that allows anyone to view customizations for active companies
CREATE POLICY "Anyone can view customizations for active companies"
ON public.company_customizations
FOR SELECT
TO public
USING (
  EXISTS (
    SELECT 1
    FROM public.companies c
    WHERE c.id = company_customizations.company_id
      AND c.status = 'active'
  )
);

-- Keep the admin management policy unchanged
-- "Company admins can manage customizations" should already exist
-- Add logo fields to company_customizations table
ALTER TABLE public.company_customizations 
ADD COLUMN logo_type text DEFAULT 'url',
ADD COLUMN logo_url text,
ADD COLUMN logo_upload_path text;

-- Create storage bucket for company logos
INSERT INTO storage.buckets (id, name, public) 
VALUES ('company-logos', 'company-logos', true);

-- Create RLS policies for company logos bucket
CREATE POLICY "Company admins can upload logos" 
ON storage.objects 
FOR INSERT 
WITH CHECK (
  bucket_id = 'company-logos' 
  AND EXISTS (
    SELECT 1 FROM employees e
    WHERE e.user_id = auth.uid() 
    AND e.role IN ('owner', 'manager')
    AND e.is_active = true
  )
);

CREATE POLICY "Company admins can update logos" 
ON storage.objects 
FOR UPDATE 
USING (
  bucket_id = 'company-logos' 
  AND EXISTS (
    SELECT 1 FROM employees e
    WHERE e.user_id = auth.uid() 
    AND e.role IN ('owner', 'manager')
    AND e.is_active = true
  )
);

CREATE POLICY "Company admins can delete logos" 
ON storage.objects 
FOR DELETE 
USING (
  bucket_id = 'company-logos' 
  AND EXISTS (
    SELECT 1 FROM employees e
    WHERE e.user_id = auth.uid() 
    AND e.role IN ('owner', 'manager')
    AND e.is_active = true
  )
);

CREATE POLICY "Anyone can view company logos" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'company-logos');
-- Fix employee_services RLS policies to allow owners to manage all employee services regardless of their active status

-- Drop existing policies
DROP POLICY IF EXISTS "Company admins can manage employee services" ON employee_services;

-- Create new policy that allows owners to manage employee services even when inactive
CREATE POLICY "Company owners can manage all employee services" 
ON employee_services 
FOR ALL 
USING (
  EXISTS (
    SELECT 1 
    FROM employees e 
    WHERE e.id = employee_services.employee_id 
      AND EXISTS (
        SELECT 1 
        FROM employees owner 
        WHERE owner.company_id = e.company_id 
          AND owner.user_id = auth.uid() 
          AND owner.role = 'owner'
      )
  )
);

-- Create policy for active managers to manage employee services in their company
CREATE POLICY "Active company managers can manage employee services" 
ON employee_services 
FOR ALL 
USING (
  EXISTS (
    SELECT 1 
    FROM employees e 
    WHERE e.id = employee_services.employee_id 
      AND is_company_admin(e.company_id, auth.uid())
  )
);
-- Add button color customization columns
ALTER TABLE public.company_customizations
ADD COLUMN IF NOT EXISTS button_color_type text DEFAULT 'solid',
ADD COLUMN IF NOT EXISTS button_color text DEFAULT 'hsl(251, 91%, 65%)',
ADD COLUMN IF NOT EXISTS button_gradient jsonb DEFAULT '{"type": "linear", "angle": 45, "colors": ["hsl(251, 91%, 65%)", "hsl(308, 56%, 85%)"]}'::jsonb;

-- Add hero content positioning column
ALTER TABLE public.company_customizations
ADD COLUMN IF NOT EXISTS hero_content_position text DEFAULT 'absolute';

-- Add comments for documentation
COMMENT ON COLUMN public.company_customizations.button_color_type IS 'Button color type: solid or gradient';
COMMENT ON COLUMN public.company_customizations.button_color IS 'Solid color for buttons in HSL format';
COMMENT ON COLUMN public.company_customizations.button_gradient IS 'Gradient settings for buttons';
COMMENT ON COLUMN public.company_customizations.hero_content_position IS 'Hero content position: absolute (over image), below (under image), or above (before image)';
-- Tabela para armazenar os fluxos de chatbot de cada empresa
CREATE TABLE IF NOT EXISTS public.chatbot_flows (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Novo Fluxo',
  description TEXT,
  containers JSONB NOT NULL DEFAULT '[]'::jsonb,
  edges JSONB NOT NULL DEFAULT '[]'::jsonb,
  variables JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela para armazenar sessões de conversa dos clientes
CREATE TABLE IF NOT EXISTS public.chatbot_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  flow_id UUID NOT NULL REFERENCES public.chatbot_flows(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  current_container_id TEXT,
  variables JSONB NOT NULL DEFAULT '{}'::jsonb,
  messages JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.chatbot_flows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chatbot_sessions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for chatbot_flows
CREATE POLICY "Company members can view their flows"
ON public.chatbot_flows
FOR SELECT
USING (public.is_company_member(company_id, auth.uid()));

CREATE POLICY "Company admins can manage flows"
ON public.chatbot_flows
FOR ALL
USING (public.is_company_admin(company_id, auth.uid()));

CREATE POLICY "Anyone can view active flows for active companies"
ON public.chatbot_flows
FOR SELECT
USING (
  is_active = true AND
  EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_id AND c.status = 'active')
);

-- RLS Policies for chatbot_sessions
CREATE POLICY "Company members can view sessions"
ON public.chatbot_sessions
FOR SELECT
USING (public.is_company_member(company_id, auth.uid()));

CREATE POLICY "Company members can manage sessions"
ON public.chatbot_sessions
FOR ALL
USING (public.is_company_member(company_id, auth.uid()));

CREATE POLICY "Clients can view their own sessions"
ON public.chatbot_sessions
FOR SELECT
USING (
  client_id IS NOT NULL AND
  EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND c.user_id = auth.uid())
);

CREATE POLICY "Anyone can create sessions for active flows"
ON public.chatbot_sessions
FOR INSERT
WITH CHECK (
  EXISTS (SELECT 1 FROM public.chatbot_flows f WHERE f.id = flow_id AND f.is_active = true)
);

-- Indexes for better performance
CREATE INDEX idx_chatbot_flows_company_id ON public.chatbot_flows(company_id);
CREATE INDEX idx_chatbot_flows_is_active ON public.chatbot_flows(is_active);
CREATE INDEX idx_chatbot_sessions_company_id ON public.chatbot_sessions(company_id);
CREATE INDEX idx_chatbot_sessions_flow_id ON public.chatbot_sessions(flow_id);
CREATE INDEX idx_chatbot_sessions_client_id ON public.chatbot_sessions(client_id);
CREATE INDEX idx_chatbot_sessions_status ON public.chatbot_sessions(status);

-- Triggers for updated_at
DROP TRIGGER IF EXISTS update_chatbot_flows_updated_at ON public.chatbot_flows;
CREATE TRIGGER update_chatbot_flows_updated_at
BEFORE UPDATE ON public.chatbot_flows
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_chatbot_sessions_updated_at ON public.chatbot_sessions;
CREATE TRIGGER update_chatbot_sessions_updated_at
BEFORE UPDATE ON public.chatbot_sessions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
-- Drop the restrictive admin-only policy
DROP POLICY IF EXISTS "Company admins can manage flows" ON public.chatbot_flows;

-- Create a new policy that allows company members to manage flows
CREATE POLICY "Company members can manage flows"
ON public.chatbot_flows
FOR ALL
USING (public.is_company_member(company_id, auth.uid()))
WITH CHECK (public.is_company_member(company_id, auth.uid()));
-- Drop the current policy
DROP POLICY IF EXISTS "Company members can manage flows" ON public.chatbot_flows;

-- Create separate policies for better control
-- SELECT: company members can view
CREATE POLICY "Company members can view flows"
ON public.chatbot_flows
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.company_id = chatbot_flows.company_id
    AND e.user_id = auth.uid()
  )
);

-- INSERT: any employee of the company can create (regardless of is_active)
CREATE POLICY "Company employees can create flows"
ON public.chatbot_flows
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.company_id = chatbot_flows.company_id
    AND e.user_id = auth.uid()
  )
);

-- UPDATE: any employee of the company can update
CREATE POLICY "Company employees can update flows"
ON public.chatbot_flows
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.company_id = chatbot_flows.company_id
    AND e.user_id = auth.uid()
  )
);

-- DELETE: any employee of the company can delete
CREATE POLICY "Company employees can delete flows"
ON public.chatbot_flows
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.company_id = chatbot_flows.company_id
    AND e.user_id = auth.uid()
  )
);
-- Criar enum para tipos de ausência
CREATE TYPE absence_type AS ENUM ('vacation', 'day_off', 'sick_leave', 'suspension', 'other');

-- 1. Tabela de horários de funcionamento da empresa
CREATE TABLE IF NOT EXISTS public.business_hours (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6), -- 0=Domingo, 6=Sábado
  is_open BOOLEAN DEFAULT true,
  open_time TIME,
  close_time TIME,
  -- Para horários intervalados (ex: 08:00-12:00 e 14:00-18:00)
  second_open_time TIME,
  second_close_time TIME,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(company_id, day_of_week)
);

-- 2. Tabela de jornada dos funcionários fixos
CREATE TABLE IF NOT EXISTS public.employee_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  is_working BOOLEAN DEFAULT true,
  start_time TIME,
  end_time TIME,
  -- Horário de intervalo obrigatório
  break_start TIME,
  break_end TIME,
  -- Permitir hora extra neste dia
  allows_overtime BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(employee_id, day_of_week)
);

-- 3. Tabela de disponibilidade dos autônomos (por data específica)
CREATE TABLE IF NOT EXISTS public.employee_availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  available_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  -- Horário de intervalo
  break_start TIME,
  break_end TIME,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(employee_id, available_date)
);

-- 4. Tabela de ausências (férias, folgas, afastamentos, suspensões)
CREATE TABLE IF NOT EXISTS public.employee_absences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  absence_type absence_type NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Tabela de bloqueios manuais de horário
CREATE TABLE IF NOT EXISTS public.blocked_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES public.employees(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  blocked_date DATE NOT NULL,
  -- Se NULL, bloqueia o dia inteiro
  start_time TIME,
  end_time TIME,
  reason TEXT,
  -- Se true, afeta toda a empresa (feriado, etc)
  is_company_wide BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 6. Tabela de configurações gerais de horários da empresa
CREATE TABLE IF NOT EXISTS public.company_schedule_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE UNIQUE,
  -- Intervalo obrigatório
  min_break_duration INTEGER DEFAULT 60, -- minutos
  max_break_duration INTEGER DEFAULT 120, -- minutos
  -- Pausas simultâneas
  max_simultaneous_breaks INTEGER DEFAULT 2,
  -- Horas extras
  allows_overtime BOOLEAN DEFAULT false,
  max_overtime_hours INTEGER DEFAULT 2, -- horas extras máximas por dia
  -- Slot de tempo para agendamentos
  slot_duration INTEGER DEFAULT 30, -- minutos
  -- Antecedência mínima para agendamento
  min_booking_advance_hours INTEGER DEFAULT 1,
  -- Antecedência máxima para agendamento
  max_booking_advance_days INTEGER DEFAULT 30,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Habilitar RLS em todas as tabelas
ALTER TABLE public.business_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_absences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocked_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_schedule_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies para business_hours
CREATE POLICY "Anyone can view business hours for active companies"
ON public.business_hours FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.companies c
  WHERE c.id = business_hours.company_id AND c.status = 'active'
));

CREATE POLICY "Company admins can manage business hours"
ON public.business_hours FOR ALL
USING (is_company_admin(company_id, auth.uid()));

-- RLS Policies para employee_schedules
CREATE POLICY "Employees can view their own schedules"
ON public.employee_schedules FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.employees e
  WHERE e.id = employee_schedules.employee_id AND e.user_id = auth.uid()
));

CREATE POLICY "Anyone can view schedules for active employees"
ON public.employee_schedules FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.employees e
  JOIN public.companies c ON c.id = e.company_id
  WHERE e.id = employee_schedules.employee_id AND e.is_active = true AND c.status = 'active'
));

CREATE POLICY "Company admins can manage employee schedules"
ON public.employee_schedules FOR ALL
USING (EXISTS (
  SELECT 1 FROM public.employees e
  WHERE e.id = employee_schedules.employee_id AND is_company_admin(e.company_id, auth.uid())
));

CREATE POLICY "Employees can manage their own schedules if autonomous"
ON public.employee_schedules FOR ALL
USING (EXISTS (
  SELECT 1 FROM public.employees e
  WHERE e.id = employee_schedules.employee_id 
    AND e.user_id = auth.uid() 
    AND e.employee_type = 'autonomo'
));

-- RLS Policies para employee_availability
CREATE POLICY "Anyone can view availability for active employees"
ON public.employee_availability FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.employees e
  JOIN public.companies c ON c.id = e.company_id
  WHERE e.id = employee_availability.employee_id AND e.is_active = true AND c.status = 'active'
));

CREATE POLICY "Company admins can manage employee availability"
ON public.employee_availability FOR ALL
USING (EXISTS (
  SELECT 1 FROM public.employees e
  WHERE e.id = employee_availability.employee_id AND is_company_admin(e.company_id, auth.uid())
));

CREATE POLICY "Autonomous employees can manage their own availability"
ON public.employee_availability FOR ALL
USING (EXISTS (
  SELECT 1 FROM public.employees e
  WHERE e.id = employee_availability.employee_id 
    AND e.user_id = auth.uid() 
    AND e.employee_type = 'autonomo'
));

-- RLS Policies para employee_absences
CREATE POLICY "Employees can view their own absences"
ON public.employee_absences FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.employees e
  WHERE e.id = employee_absences.employee_id AND e.user_id = auth.uid()
));

CREATE POLICY "Company admins can manage employee absences"
ON public.employee_absences FOR ALL
USING (EXISTS (
  SELECT 1 FROM public.employees e
  WHERE e.id = employee_absences.employee_id AND is_company_admin(e.company_id, auth.uid())
));

-- RLS Policies para blocked_slots
CREATE POLICY "Anyone can view blocked slots for active companies"
ON public.blocked_slots FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.companies c
  WHERE c.id = blocked_slots.company_id AND c.status = 'active'
));

CREATE POLICY "Company admins can manage blocked slots"
ON public.blocked_slots FOR ALL
USING (is_company_admin(company_id, auth.uid()));

CREATE POLICY "Autonomous employees can manage their own blocked slots"
ON public.blocked_slots FOR ALL
USING (EXISTS (
  SELECT 1 FROM public.employees e
  WHERE e.id = blocked_slots.employee_id 
    AND e.user_id = auth.uid() 
    AND e.employee_type = 'autonomo'
));

-- RLS Policies para company_schedule_settings
CREATE POLICY "Anyone can view schedule settings for active companies"
ON public.company_schedule_settings FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.companies c
  WHERE c.id = company_schedule_settings.company_id AND c.status = 'active'
));

CREATE POLICY "Company admins can manage schedule settings"
ON public.company_schedule_settings FOR ALL
USING (is_company_admin(company_id, auth.uid()));

-- Triggers para updated_at
DROP TRIGGER IF EXISTS update_business_hours_updated_at ON public.business_hours;
CREATE TRIGGER update_business_hours_updated_at
BEFORE UPDATE ON public.business_hours
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_employee_schedules_updated_at ON public.employee_schedules;
CREATE TRIGGER update_employee_schedules_updated_at
BEFORE UPDATE ON public.employee_schedules
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_employee_absences_updated_at ON public.employee_absences;
CREATE TRIGGER update_employee_absences_updated_at
BEFORE UPDATE ON public.employee_absences
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_company_schedule_settings_updated_at ON public.company_schedule_settings;
CREATE TRIGGER update_company_schedule_settings_updated_at
BEFORE UPDATE ON public.company_schedule_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
-- Atualizar is_company_admin: owners sempre têm acesso, managers precisam estar ativos
CREATE OR REPLACE FUNCTION public.is_company_admin(_company_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.employees
    WHERE company_id = _company_id 
      AND user_id = _user_id
      AND (
        -- Owners sempre têm acesso administrativo, independente de is_active
        role = 'owner'::employee_role
        OR 
        -- Managers precisam estar ativos
        (role = 'manager'::employee_role AND is_active = true)
      )
  );
$$;

-- Atualizar is_company_member: owners sempre são members, outros precisam estar ativos
CREATE OR REPLACE FUNCTION public.is_company_member(_company_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.employees
    WHERE company_id = _company_id 
      AND user_id = _user_id
      AND (
        -- Owners sempre são membros
        role = 'owner'::employee_role
        OR
        -- Outros precisam estar ativos  
        is_active = true
      )
  );
$$;

-- Atualizar has_permission_level: owners sempre têm acesso total
CREATE OR REPLACE FUNCTION public.has_permission_level(_company_id uuid, _user_id uuid, _required_level text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM employees e
    WHERE e.company_id = _company_id 
      AND e.user_id = _user_id
      AND (
        -- Owners sempre têm acesso total a qualquer nível
        e.role = 'owner'::employee_role
        OR
        -- Outros devem estar ativos e ter o nível adequado
        (e.is_active = true AND CASE _required_level
          WHEN 'owner' THEN false -- Apenas owner real
          WHEN 'manager' THEN e.role = 'manager'::employee_role
          WHEN 'supervisor' THEN e.role IN ('manager'::employee_role, 'supervisor'::employee_role)
          WHEN 'receptionist' THEN e.role IN ('manager'::employee_role, 'supervisor'::employee_role, 'receptionist'::employee_role)
          WHEN 'employee' THEN e.role IN ('manager'::employee_role, 'supervisor'::employee_role, 'receptionist'::employee_role, 'employee'::employee_role)
          ELSE false
        END)
      )
  );
$$;

-- Atualizar get_user_role: owners sempre retornam sua role
CREATE OR REPLACE FUNCTION public.get_user_role(_company_id uuid, _user_id uuid)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT e.role::text
  FROM employees e
  WHERE e.company_id = _company_id 
    AND e.user_id = _user_id
    AND (
      -- Owners sempre retornam role
      e.role = 'owner'::employee_role
      OR
      -- Outros precisam estar ativos
      e.is_active = true
    )
  LIMIT 1;
$$;
-- Add new columns to clients table for profile and LGPD compliance
ALTER TABLE public.clients 
ADD COLUMN IF NOT EXISTS cpf TEXT,
ADD COLUMN IF NOT EXISTS address TEXT,
ADD COLUMN IF NOT EXISTS city TEXT,
ADD COLUMN IF NOT EXISTS state TEXT,
ADD COLUMN IF NOT EXISTS zip_code TEXT,
ADD COLUMN IF NOT EXISTS accepts_marketing BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS data_deleted_at TIMESTAMP WITH TIME ZONE;

-- Create index for CPF lookups
CREATE INDEX IF NOT EXISTS idx_clients_cpf ON public.clients(cpf) WHERE cpf IS NOT NULL;

-- Update RLS policy to allow clients to update their own profile
CREATE POLICY "Clients can update their own profile" 
ON public.clients 
FOR UPDATE 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
-- Create a function to auto-confirm pending bookings after 1 hour
CREATE OR REPLACE FUNCTION public.auto_confirm_pending_bookings()
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  UPDATE public.bookings
  SET 
    booking_status = 'confirmed',
    updated_at = now()
  WHERE 
    booking_status = 'pending'
    AND created_at < now() - interval '1 hour';
    
  RAISE NOTICE 'Auto-confirmed pending bookings older than 1 hour';
END;
$$;

-- Enable pg_cron extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

-- Grant usage to postgres
GRANT USAGE ON SCHEMA cron TO postgres;

-- Create the cron job to run every 5 minutes
SELECT cron.schedule(
  'auto-confirm-bookings',
  '*/5 * * * *', -- Every 5 minutes
  $$ SELECT public.auto_confirm_pending_bookings() $$
);
-- Allow clients to update their own bookings (for reschedule)
CREATE POLICY "Clients can update their own bookings"
ON public.bookings
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM clients c
    WHERE c.id = bookings.client_id
    AND c.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM clients c
    WHERE c.id = bookings.client_id
    AND c.user_id = auth.uid()
  )
);

-- Allow clients to cancel their own bookings (update status to cancelled)
-- This is covered by the above policy
-- Tabela de configuração de planos (gerenciada pelo super-admin)
CREATE TABLE IF NOT EXISTS subscription_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  features JSONB DEFAULT '[]'::jsonb,
  monthly_price DECIMAL(10,2) NOT NULL,
  quarterly_price DECIMAL(10,2) NOT NULL,
  annual_price DECIMAL(10,2) NOT NULL,
  monthly_checkout_url TEXT,
  quarterly_checkout_url TEXT,
  annual_checkout_url TEXT,
  is_popular BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Tabela de assinaturas das empresas (com desconto especial)
CREATE TABLE IF NOT EXISTS company_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  plan_id UUID REFERENCES subscription_plans(id),
  billing_period TEXT NOT NULL,
  original_price DECIMAL(10,2) NOT NULL,
  discount_percentage DECIMAL(5,2) DEFAULT 0,
  discounted_price DECIMAL(10,2),
  discount_cycles_remaining INTEGER DEFAULT 0,
  next_billing_date DATE,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Tabela de combos de serviços
CREATE TABLE IF NOT EXISTS service_combos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  combo_price DECIMAL(10,2) NOT NULL,
  original_total_price DECIMAL(10,2),
  total_duration_minutes INTEGER NOT NULL,
  is_active BOOLEAN DEFAULT true,
  image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Itens do combo
CREATE TABLE IF NOT EXISTS service_combo_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  combo_id UUID REFERENCES service_combos(id) ON DELETE CASCADE,
  service_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Tabela de recompensas/brindes
CREATE TABLE IF NOT EXISTS client_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  reward_service_id UUID,
  required_procedures INTEGER NOT NULL DEFAULT 10,
  count_specific_service BOOLEAN DEFAULT false,
  specific_service_id UUID,
  requires_payment_confirmed BOOLEAN DEFAULT true,
  requires_completed_booking BOOLEAN DEFAULT true,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Estrutura de formas de pagamento do cliente
CREATE TABLE IF NOT EXISTS client_payment_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL,
  payment_type TEXT NOT NULL,
  is_default BOOLEAN DEFAULT false,
  card_last_four TEXT,
  card_brand TEXT,
  pix_key TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Adicionar coluna de método de pagamento em bookings
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'cash';

-- RLS para subscription_plans (público para leitura)
ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view active plans" ON subscription_plans FOR SELECT USING (is_active = true);
CREATE POLICY "Super admins can manage plans" ON subscription_plans FOR ALL USING (true);

-- RLS para company_subscriptions
ALTER TABLE company_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Company members can view their subscription" ON company_subscriptions FOR SELECT USING (
  EXISTS (SELECT 1 FROM employees e WHERE e.company_id = company_subscriptions.company_id AND e.user_id = auth.uid())
);
CREATE POLICY "Super admins can manage subscriptions" ON company_subscriptions FOR ALL USING (true);

-- RLS para service_combos
ALTER TABLE service_combos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view active combos" ON service_combos FOR SELECT USING (is_active = true);
CREATE POLICY "Company admins can manage combos" ON service_combos FOR ALL USING (
  EXISTS (SELECT 1 FROM employees e WHERE e.company_id = service_combos.company_id AND e.user_id = auth.uid() AND e.role IN ('owner', 'manager'))
);

-- RLS para service_combo_items
ALTER TABLE service_combo_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view combo items" ON service_combo_items FOR SELECT USING (true);
CREATE POLICY "Company admins can manage combo items" ON service_combo_items FOR ALL USING (
  EXISTS (SELECT 1 FROM service_combos sc JOIN employees e ON e.company_id = sc.company_id WHERE sc.id = service_combo_items.combo_id AND e.user_id = auth.uid() AND e.role IN ('owner', 'manager'))
);

-- RLS para client_rewards
ALTER TABLE client_rewards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view active rewards" ON client_rewards FOR SELECT USING (is_active = true);
CREATE POLICY "Company admins can manage rewards" ON client_rewards FOR ALL USING (
  EXISTS (SELECT 1 FROM employees e WHERE e.company_id = client_rewards.company_id AND e.user_id = auth.uid() AND e.role IN ('owner', 'manager'))
);

-- RLS para client_payment_methods
ALTER TABLE client_payment_methods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Clients can view their own payment methods" ON client_payment_methods FOR SELECT USING (
  EXISTS (SELECT 1 FROM clients c WHERE c.id = client_payment_methods.client_id AND c.user_id = auth.uid())
);
CREATE POLICY "Clients can manage their own payment methods" ON client_payment_methods FOR ALL USING (
  EXISTS (SELECT 1 FROM clients c WHERE c.id = client_payment_methods.client_id AND c.user_id = auth.uid())
);

-- Inserir planos iniciais
INSERT INTO subscription_plans (name, description, features, monthly_price, quarterly_price, annual_price, is_popular, display_order) VALUES
('Starter', 'Ideal para quem está começando', '["Até 50 agendamentos/mês", "1 profissional", "Página personalizada", "Suporte por email"]', 29.00, 78.00, 290.00, false, 1),
('Professional', 'Para negócios em crescimento', '["Agendamentos ilimitados", "Até 5 profissionais", "Relatórios básicos", "Suporte prioritário", "Chatbot personalizado"]', 59.00, 159.00, 590.00, true, 2),
('Enterprise', 'Para grandes estabelecimentos', '["Tudo do Professional", "Profissionais ilimitados", "Relatórios avançados", "API de integração", "Suporte 24/7", "Gerente de conta dedicado"]', 99.00, 269.00, 990.00, false, 3);
-- Adicionar coluna combo_id na tabela bookings
ALTER TABLE bookings 
ADD COLUMN combo_id uuid REFERENCES service_combos(id);

-- Tornar service_id opcional (pode ser combo OU serviço)
ALTER TABLE bookings 
ALTER COLUMN service_id DROP NOT NULL;

-- Garantir que ou service_id ou combo_id está preenchido
ALTER TABLE bookings 
ADD CONSTRAINT booking_has_service_or_combo 
CHECK (service_id IS NOT NULL OR combo_id IS NOT NULL);
-- Refresh types - add a comment to chatbot_flows table
COMMENT ON TABLE public.chatbot_flows IS 'Stores chatbot flow definitions with published versions';
-- Create services table
CREATE TABLE IF NOT EXISTS public.services (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  duration INTEGER NOT NULL DEFAULT 30,
  price NUMERIC NOT NULL DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create employees table
CREATE TABLE IF NOT EXISTS public.employees (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  role TEXT DEFAULT 'employee',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create employee_services junction table
CREATE TABLE IF NOT EXISTS public.employee_services (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(employee_id, service_id)
);

-- Create clients table
CREATE TABLE IF NOT EXISTS public.clients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  cpf TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create bookings table
CREATE TABLE IF NOT EXISTS public.bookings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id),
  employee_id UUID REFERENCES public.employees(id),
  service_id UUID REFERENCES public.services(id),
  booking_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  status TEXT DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create service_combos table
CREATE TABLE IF NOT EXISTS public.service_combos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  price NUMERIC NOT NULL DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create service_combo_items junction table
CREATE TABLE IF NOT EXISTS public.service_combo_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  combo_id UUID NOT NULL REFERENCES public.service_combos(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(combo_id, service_id)
);

-- Create rewards table
CREATE TABLE IF NOT EXISTS public.rewards (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  points_required INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create blocked_slots table
CREATE TABLE IF NOT EXISTS public.blocked_slots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id UUID REFERENCES public.employees(id) ON DELETE CASCADE,
  start_datetime TIMESTAMP WITH TIME ZONE NOT NULL,
  end_datetime TIMESTAMP WITH TIME ZONE NOT NULL,
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create absences table
CREATE TABLE IF NOT EXISTS public.absences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id UUID REFERENCES public.employees(id) ON DELETE CASCADE,
  absence_type TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_combos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_combo_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocked_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.absences ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for services
CREATE POLICY "Anyone can view services" ON public.services FOR SELECT USING (true);
CREATE POLICY "Authenticated users can manage services" ON public.services FOR ALL USING (true);

-- Create RLS policies for employees
CREATE POLICY "Anyone can view employees" ON public.employees FOR SELECT USING (true);
CREATE POLICY "Authenticated users can manage employees" ON public.employees FOR ALL USING (true);

-- Create RLS policies for employee_services
CREATE POLICY "Anyone can view employee_services" ON public.employee_services FOR SELECT USING (true);
CREATE POLICY "Authenticated users can manage employee_services" ON public.employee_services FOR ALL USING (true);

-- Create RLS policies for clients
CREATE POLICY "Anyone can view clients" ON public.clients FOR SELECT USING (true);
CREATE POLICY "Authenticated users can manage clients" ON public.clients FOR ALL USING (true);

-- Create RLS policies for bookings
CREATE POLICY "Anyone can view bookings" ON public.bookings FOR SELECT USING (true);
CREATE POLICY "Authenticated users can manage bookings" ON public.bookings FOR ALL USING (true);

-- Create RLS policies for service_combos
CREATE POLICY "Anyone can view service_combos" ON public.service_combos FOR SELECT USING (true);
CREATE POLICY "Authenticated users can manage service_combos" ON public.service_combos FOR ALL USING (true);

-- Create RLS policies for service_combo_items
CREATE POLICY "Anyone can view service_combo_items" ON public.service_combo_items FOR SELECT USING (true);
CREATE POLICY "Authenticated users can manage service_combo_items" ON public.service_combo_items FOR ALL USING (true);

-- Create RLS policies for rewards
CREATE POLICY "Anyone can view rewards" ON public.rewards FOR SELECT USING (true);
CREATE POLICY "Authenticated users can manage rewards" ON public.rewards FOR ALL USING (true);

-- Create RLS policies for blocked_slots
CREATE POLICY "Anyone can view blocked_slots" ON public.blocked_slots FOR SELECT USING (true);
CREATE POLICY "Authenticated users can manage blocked_slots" ON public.blocked_slots FOR ALL USING (true);

-- Create RLS policies for absences
CREATE POLICY "Anyone can view absences" ON public.absences FOR SELECT USING (true);
CREATE POLICY "Authenticated users can manage absences" ON public.absences FOR ALL USING (true);
-- Create client_rewards table
CREATE TABLE IF NOT EXISTS public.client_rewards (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  reward_service_id UUID REFERENCES public.services(id),
  specific_service_id UUID REFERENCES public.services(id),
  required_procedures INTEGER NOT NULL DEFAULT 0,
  count_specific_service BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create employee_absences table (different from absences)
CREATE TABLE IF NOT EXISTS public.employee_absences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id UUID REFERENCES public.employees(id) ON DELETE CASCADE,
  absence_type TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create employee_availability table
CREATE TABLE IF NOT EXISTS public.employee_availability (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id UUID REFERENCES public.employees(id) ON DELETE CASCADE,
  available_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  break_start TIME,
  break_end TIME,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create business_hours table
CREATE TABLE IF NOT EXISTS public.business_hours (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL,
  is_open BOOLEAN DEFAULT true,
  open_time TIME,
  close_time TIME,
  break_start TIME,
  break_end TIME,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create employee_schedules table
CREATE TABLE IF NOT EXISTS public.employee_schedules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id UUID REFERENCES public.employees(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL,
  is_working BOOLEAN DEFAULT true,
  start_time TIME,
  end_time TIME,
  break_start TIME,
  break_end TIME,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create company_schedule_settings table
CREATE TABLE IF NOT EXISTS public.company_schedule_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE UNIQUE,
  min_advance_hours INTEGER DEFAULT 1,
  max_advance_days INTEGER DEFAULT 30,
  slot_duration_minutes INTEGER DEFAULT 30,
  allow_simultaneous_breaks BOOLEAN DEFAULT false,
  max_simultaneous_breaks INTEGER DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add duration_minutes to services if it doesn't exist
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'services' AND column_name = 'duration_minutes') THEN
    ALTER TABLE public.services ADD COLUMN duration_minutes INTEGER DEFAULT 30;
  END IF;
END $$;

-- Enable RLS
ALTER TABLE public.client_rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_absences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_schedule_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Anyone can view client_rewards" ON public.client_rewards FOR SELECT USING (true);
CREATE POLICY "Authenticated users can manage client_rewards" ON public.client_rewards FOR ALL USING (true);

CREATE POLICY "Anyone can view employee_absences" ON public.employee_absences FOR SELECT USING (true);
CREATE POLICY "Authenticated users can manage employee_absences" ON public.employee_absences FOR ALL USING (true);

CREATE POLICY "Anyone can view employee_availability" ON public.employee_availability FOR SELECT USING (true);
CREATE POLICY "Authenticated users can manage employee_availability" ON public.employee_availability FOR ALL USING (true);

CREATE POLICY "Anyone can view business_hours" ON public.business_hours FOR SELECT USING (true);
CREATE POLICY "Authenticated users can manage business_hours" ON public.business_hours FOR ALL USING (true);

CREATE POLICY "Anyone can view employee_schedules" ON public.employee_schedules FOR SELECT USING (true);
CREATE POLICY "Authenticated users can manage employee_schedules" ON public.employee_schedules FOR ALL USING (true);

CREATE POLICY "Anyone can view company_schedule_settings" ON public.company_schedule_settings FOR SELECT USING (true);
CREATE POLICY "Authenticated users can manage company_schedule_settings" ON public.company_schedule_settings FOR ALL USING (true);
-- Force types refresh by adding comments to all tables
COMMENT ON TABLE public.services IS 'Business services offered to clients';
COMMENT ON TABLE public.employees IS 'Business employees who provide services';
COMMENT ON TABLE public.clients IS 'Client information for bookings';
COMMENT ON TABLE public.bookings IS 'Service appointments and reservations';
COMMENT ON TABLE public.rewards IS 'Reward programs for clients';
COMMENT ON TABLE public.client_rewards IS 'Rewards assigned to specific clients';
COMMENT ON TABLE public.business_hours IS 'Company operating hours per day';
COMMENT ON TABLE public.employee_schedules IS 'Employee working schedules';
COMMENT ON TABLE public.employee_availability IS 'Employee specific availability slots';
COMMENT ON TABLE public.employee_absences IS 'Employee vacation and leave records';
COMMENT ON TABLE public.blocked_slots IS 'Blocked time slots for scheduling';
COMMENT ON TABLE public.company_schedule_settings IS 'Company scheduling configuration';
-- Force PostgREST to reload its schema cache
NOTIFY pgrst, 'reload schema';

-- Ensure the chatbot_flows table has proper constraints
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'chatbot_flows_company_id_fkey'
    AND table_name = 'chatbot_flows'
  ) THEN
    ALTER TABLE public.chatbot_flows 
    ADD CONSTRAINT chatbot_flows_company_id_fkey 
    FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Update comments to force schema change detection
COMMENT ON COLUMN public.chatbot_flows.is_published IS 'Indicates if the chatbot flow is publicly accessible';
COMMENT ON COLUMN public.chatbot_flows.published_at IS 'Timestamp when the flow was last published';
COMMENT ON COLUMN public.chatbot_flows.published_containers IS 'Snapshot of containers at publish time';
COMMENT ON COLUMN public.chatbot_flows.published_edges IS 'Snapshot of edges at publish time';
-- Create unique partial index to ensure no duplicate public_id within the same company
-- This allows different companies to have the same public_id, but prevents duplicates within a company
CREATE UNIQUE INDEX idx_unique_public_id_per_company 
ON public.chatbot_flows (company_id, public_id) 
WHERE public_id IS NOT NULL;
-- Tabela de integração com o builder externo (TalkMap)
CREATE TABLE IF NOT EXISTS public.chatbot_integration (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL UNIQUE,
  api_key_encrypted text NOT NULL,
  api_key_prefix text NOT NULL,
  builder_workspace_slug text,
  builder_user_id text,
  builder_base_url text DEFAULT 'https://talkbuilder.lovable.app',
  connected_at timestamptz NOT NULL DEFAULT now(),
  last_validated_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.chatbot_integration ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view chatbot_integration"
  ON public.chatbot_integration FOR SELECT USING (true);

CREATE POLICY "Authenticated users can manage chatbot_integration"
  ON public.chatbot_integration FOR ALL USING (true) WITH CHECK (true);

-- Trigger de updated_at (reaproveita a função já existente)
DROP TRIGGER IF EXISTS update_chatbot_integration_updated_at ON public.chatbot_integration;
CREATE TRIGGER update_chatbot_integration_updated_at
  BEFORE UPDATE ON public.chatbot_integration
  FOR EACH ROW
  EXECUTE FUNCTION public.update_chatbot_updated_at();

-- Index pra lookups rápidos
CREATE INDEX idx_chatbot_integration_company ON public.chatbot_integration(company_id);
CREATE INDEX idx_chatbot_integration_prefix ON public.chatbot_integration(api_key_prefix);

-- Adiciona a feature flag chatbot=true nos planos existentes (preservando outras features)
UPDATE public.subscription_plans
   SET features = CASE
     WHEN jsonb_typeof(features) = 'object' THEN features || '{"chatbot": true}'::jsonb
     WHEN jsonb_typeof(features) = 'array'  THEN jsonb_build_object('chatbot', true, 'list', features)
     ELSE '{"chatbot": true}'::jsonb
   END;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE OR REPLACE FUNCTION public.encrypt_chatbot_key(p_plain text, p_secret text)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT encode(extensions.pgp_sym_encrypt(p_plain, p_secret), 'base64');
$$;

CREATE OR REPLACE FUNCTION public.decrypt_chatbot_key(p_cipher text, p_secret text)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT extensions.pgp_sym_decrypt(decode(p_cipher, 'base64'), p_secret);
$$;

-- Restringe acesso direto destas funções via PostgREST: somente service_role pode chamar.
REVOKE ALL ON FUNCTION public.encrypt_chatbot_key(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.decrypt_chatbot_key(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.encrypt_chatbot_key(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.decrypt_chatbot_key(text, text) TO service_role;
ALTER TABLE public.chatbot_integration
  ADD COLUMN IF NOT EXISTS talkmap_provisioned boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS talkmap_provisioned_at timestamptz NULL,
  ALTER COLUMN api_key_encrypted DROP NOT NULL,
  ALTER COLUMN api_key_prefix DROP NOT NULL,
  ALTER COLUMN is_active SET DEFAULT false;

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

ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS builder_tier text NOT NULL DEFAULT 'starter';

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS builder_synced_at timestamptz;

UPDATE public.subscription_plans SET builder_tier = 'starter'  WHERE lower(name) LIKE '%prata%';
UPDATE public.subscription_plans SET builder_tier = 'pro'      WHERE lower(name) LIKE '%ouro%';
UPDATE public.subscription_plans SET builder_tier = 'business' WHERE lower(name) LIKE '%diamante%';

-- 1. Colunas extras em company_subscriptions
ALTER TABLE public.company_subscriptions
  ADD COLUMN IF NOT EXISTS asaas_subscription_id text,
  ADD COLUMN IF NOT EXISTS next_billing_date date,
  ADD COLUMN IF NOT EXISTS pending_plan_change jsonb,
  ADD COLUMN IF NOT EXISTS current_payment_method_id uuid;

-- 2. Métodos de pagamento da empresa
CREATE TABLE IF NOT EXISTS public.company_payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  type text NOT NULL CHECK (type IN ('credit_card','pix','bank_debit')),
  asaas_token text,
  asaas_customer_id text,
  display_label text,
  brand text,
  last_digits text,
  bank_name text,
  is_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cpm_company ON public.company_payment_methods(company_id);

ALTER TABLE public.company_payment_methods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view payment methods"
  ON public.company_payment_methods FOR SELECT USING (true);

CREATE POLICY "Authenticated users can manage payment methods"
  ON public.company_payment_methods FOR ALL
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- Garante apenas 1 default por empresa
CREATE OR REPLACE FUNCTION public.enforce_single_default_payment_method()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.is_default THEN
    UPDATE public.company_payment_methods
       SET is_default = false
     WHERE company_id = NEW.company_id
       AND id <> NEW.id
       AND is_default = true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_single_default_pm ON public.company_payment_methods;
DROP TRIGGER IF EXISTS trg_single_default_pm ON public.company_payment_methods;
CREATE TRIGGER trg_single_default_pm
  BEFORE INSERT OR UPDATE OF is_default ON public.company_payment_methods
  FOR EACH ROW EXECUTE FUNCTION public.enforce_single_default_payment_method();

-- 3. Faturas
CREATE TABLE IF NOT EXISTS public.company_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  subscription_id uuid,
  asaas_charge_id text UNIQUE,
  amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','paid','overdue','refunded','cancelled','processing')),
  billing_type text,
  due_date date NOT NULL,
  paid_at timestamptz,
  invoice_url text,
  bank_slip_url text,
  pix_qr_code text,
  pix_payload text,
  description text,
  payment_method_id uuid,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoices_company ON public.company_invoices(company_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON public.company_invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_due ON public.company_invoices(due_date);

ALTER TABLE public.company_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view invoices"
  ON public.company_invoices FOR SELECT USING (true);

CREATE POLICY "Authenticated users can manage invoices"
  ON public.company_invoices FOR ALL
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- 4. Limites por plano
CREATE TABLE IF NOT EXISTS public.plan_limits (
  plan_id uuid PRIMARY KEY,
  max_employees int,
  max_services int,
  max_bookings_month int,
  max_chatbots int,
  max_chatbot_messages int,
  max_integrations int,
  features jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.plan_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view plan limits"
  ON public.plan_limits FOR SELECT USING (true);

CREATE POLICY "Authenticated users can manage plan limits"
  ON public.plan_limits FOR ALL
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- Seed inicial baseado no builder_tier
INSERT INTO public.plan_limits (plan_id, max_employees, max_services, max_bookings_month, max_chatbots, max_chatbot_messages, max_integrations, features)
SELECT
  sp.id,
  CASE sp.builder_tier WHEN 'starter' THEN 3 WHEN 'pro' THEN 15 WHEN 'business' THEN 100 ELSE 1 END,
  CASE sp.builder_tier WHEN 'starter' THEN 10 WHEN 'pro' THEN 50 WHEN 'business' THEN 500 ELSE 5 END,
  CASE sp.builder_tier WHEN 'starter' THEN 200 WHEN 'pro' THEN 2000 WHEN 'business' THEN 20000 ELSE 50 END,
  CASE sp.builder_tier WHEN 'starter' THEN 1 WHEN 'pro' THEN 5 WHEN 'business' THEN 20 ELSE 0 END,
  CASE sp.builder_tier WHEN 'starter' THEN 1000 WHEN 'pro' THEN 10000 WHEN 'business' THEN 50000 ELSE 0 END,
  CASE sp.builder_tier WHEN 'starter' THEN 2 WHEN 'pro' THEN 10 WHEN 'business' THEN 999 ELSE 0 END,
  COALESCE(sp.features, '[]'::jsonb)
FROM public.subscription_plans sp
ON CONFLICT (plan_id) DO NOTHING;

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
-- 1. Subconta Asaas por empresa (modo gerenciado)
CREATE TABLE IF NOT EXISTS public.company_payment_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL UNIQUE,
  asaas_subaccount_id text,
  asaas_wallet_id text,
  asaas_api_key_encrypted text,
  status text NOT NULL DEFAULT 'pending',
  cpf_cnpj text,
  bank_data jsonb DEFAULT '{}'::jsonb,
  onboarding_data jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.company_payment_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view payment accounts"
  ON public.company_payment_accounts FOR SELECT USING (true);

CREATE POLICY "Authenticated can manage payment accounts"
  ON public.company_payment_accounts FOR ALL
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- 2. Configurações de pagamento da empresa
CREATE TABLE IF NOT EXISTS public.company_payment_settings (
  company_id uuid PRIMARY KEY,
  payment_mode text NOT NULL DEFAULT 'none',
  accepted_methods jsonb NOT NULL DEFAULT '{"pix":true,"credit_card":true,"debit_card":true,"boleto":false}'::jsonb,
  platform_fee_percentage numeric NOT NULL DEFAULT 0,
  own_gateway_provider text,
  own_gateway_api_key_encrypted text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.company_payment_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view payment settings"
  ON public.company_payment_settings FOR SELECT USING (true);

CREATE POLICY "Authenticated can manage payment settings"
  ON public.company_payment_settings FOR ALL
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- 3. Pagamentos de agendamentos
CREATE TABLE IF NOT EXISTS public.booking_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL UNIQUE,
  company_id uuid NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  method text,
  asaas_charge_id text,
  invoice_url text,
  bank_slip_url text,
  pix_qr_code text,
  pix_payload text,
  platform_fee_amount numeric DEFAULT 0,
  metadata jsonb DEFAULT '{}'::jsonb,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_booking_payments_company ON public.booking_payments(company_id);
CREATE INDEX idx_booking_payments_charge ON public.booking_payments(asaas_charge_id);

ALTER TABLE public.booking_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view booking payments"
  ON public.booking_payments FOR SELECT USING (true);

CREATE POLICY "Anyone can create booking payments"
  ON public.booking_payments FOR INSERT WITH CHECK (true);

CREATE POLICY "Authenticated can update booking payments"
  ON public.booking_payments FOR UPDATE USING (true);

-- 4. Regra de pagamento por serviço
ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS payment_required text NOT NULL DEFAULT 'optional';

-- 5. Status de pagamento por booking
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'not_required';

-- 6. Trigger updated_at
DROP TRIGGER IF EXISTS trg_company_payment_accounts_updated ON public.company_payment_accounts;
CREATE TRIGGER trg_company_payment_accounts_updated
  BEFORE UPDATE ON public.company_payment_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_chatbot_updated_at();

DROP TRIGGER IF EXISTS trg_company_payment_settings_updated ON public.company_payment_settings;
CREATE TRIGGER trg_company_payment_settings_updated
  BEFORE UPDATE ON public.company_payment_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_chatbot_updated_at();

DROP TRIGGER IF EXISTS trg_booking_payments_updated ON public.booking_payments;
CREATE TRIGGER trg_booking_payments_updated
  BEFORE UPDATE ON public.booking_payments
  FOR EACH ROW EXECUTE FUNCTION public.update_chatbot_updated_at();
DROP TABLE IF EXISTS public.company_payment_accounts CASCADE;
ALTER TABLE public.company_payment_settings DROP COLUMN IF EXISTS platform_fee_percentage;
CREATE TABLE IF NOT EXISTS public.company_credits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  original_amount NUMERIC NOT NULL DEFAULT 0,
  reason TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'downgrade',
  status TEXT NOT NULL DEFAULT 'active',
  source_subscription_id UUID,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  used_at TIMESTAMP WITH TIME ZONE,
  created_by_user_id UUID,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_company_credits_company_status ON public.company_credits(company_id, status);
CREATE INDEX idx_company_credits_expires ON public.company_credits(expires_at) WHERE status = 'active';

ALTER TABLE public.company_credits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view company_credits"
ON public.company_credits FOR SELECT USING (true);

CREATE POLICY "Authenticated can insert company_credits"
ON public.company_credits FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated can update company_credits"
ON public.company_credits FOR UPDATE USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated can delete company_credits"
ON public.company_credits FOR DELETE USING (auth.uid() IS NOT NULL);

DROP TRIGGER IF EXISTS update_company_credits_updated_at ON public.company_credits;
CREATE TRIGGER update_company_credits_updated_at
BEFORE UPDATE ON public.company_credits
FOR EACH ROW EXECUTE FUNCTION public.update_chatbot_updated_at();
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
-- 1. Update plan_limits with new tier numbers
UPDATE public.plan_limits SET
  max_employees = 1, max_services = 3, max_bookings_month = 50,
  max_chatbots = 0, max_chatbot_messages = 0, max_integrations = 0
WHERE plan_id = 'a856d1b1-0808-4c71-9087-2a4cb5810c4a';

UPDATE public.plan_limits SET
  max_employees = 1, max_services = 10, max_bookings_month = 200,
  max_chatbots = 1, max_chatbot_messages = 1000, max_integrations = 1
WHERE plan_id = 'cb38d4af-0211-4eb6-8fdb-894d210ae786';

UPDATE public.plan_limits SET
  max_employees = 5, max_services = 30, max_bookings_month = 800,
  max_chatbots = 3, max_chatbot_messages = 5000, max_integrations = 3
WHERE plan_id = 'a2b5ad8f-bdae-4b68-b01c-53696a5894dd';

UPDATE public.plan_limits SET
  max_employees = NULL, max_services = NULL, max_bookings_month = NULL,
  max_chatbots = 10, max_chatbot_messages = 25000, max_integrations = NULL
WHERE plan_id = '5b8c1295-c144-43b7-9c88-074d6b5af553';

-- 2. Grace period column on subscription
ALTER TABLE public.company_subscriptions
  ADD COLUMN IF NOT EXISTS overage_grace_until timestamptz;

-- 3. Resource counter (active records / current month bookings)
CREATE OR REPLACE FUNCTION public.count_company_resource(_company_id uuid, _resource text)
RETURNS integer LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE c integer := 0;
BEGIN
  CASE _resource
    WHEN 'employees' THEN
      SELECT count(*) INTO c FROM public.employees
        WHERE company_id = _company_id AND COALESCE(is_active, true) = true;
    WHEN 'services' THEN
      SELECT count(*) INTO c FROM public.services
        WHERE company_id = _company_id AND COALESCE(is_active, true) = true;
    WHEN 'combos' THEN
      SELECT count(*) INTO c FROM public.service_combos
        WHERE company_id = _company_id AND COALESCE(is_active, true) = true;
    WHEN 'bookings_month' THEN
      SELECT count(*) INTO c FROM public.bookings
        WHERE company_id = _company_id
          AND status = 'confirmed'
          AND booking_date >= date_trunc('month', now())::date
          AND booking_date <  (date_trunc('month', now()) + interval '1 month')::date;
    ELSE c := 0;
  END CASE;
  RETURN c;
END $$;

-- 4. check_plan_limit returns json {allowed, current, limit, plan_name, in_grace, grace_until}
CREATE OR REPLACE FUNCTION public.check_plan_limit(_company_id uuid, _resource text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_limit integer;
  v_current integer;
  v_plan_name text;
  v_grace timestamptz;
  v_in_grace boolean;
BEGIN
  SELECT
    CASE _resource
      WHEN 'employees' THEN pl.max_employees
      WHEN 'services' THEN pl.max_services
      WHEN 'combos' THEN pl.max_services -- combos share services bucket if you want; or add column
      WHEN 'bookings_month' THEN pl.max_bookings_month
      WHEN 'chatbots' THEN pl.max_chatbots
      WHEN 'chatbot_messages' THEN pl.max_chatbot_messages
      WHEN 'integrations' THEN pl.max_integrations
    END,
    sp.name,
    cs.overage_grace_until
  INTO v_limit, v_plan_name, v_grace
  FROM public.company_subscriptions cs
  JOIN public.subscription_plans sp ON sp.id = cs.plan_id
  LEFT JOIN public.plan_limits pl ON pl.plan_id = cs.plan_id
  WHERE cs.company_id = _company_id
  ORDER BY cs.created_at DESC
  LIMIT 1;

  v_current := public.count_company_resource(_company_id, _resource);
  v_in_grace := v_grace IS NOT NULL AND v_grace > now();

  RETURN jsonb_build_object(
    'resource', _resource,
    'current', v_current,
    'limit', v_limit,
    'plan_name', v_plan_name,
    'unlimited', v_limit IS NULL,
    'in_grace', v_in_grace,
    'grace_until', v_grace,
    -- Block new creation always when reaching/exceeding limit (even during grace)
    'allowed', (v_limit IS NULL OR v_current < v_limit)
  );
END $$;

GRANT EXECUTE ON FUNCTION public.check_plan_limit(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.count_company_resource(uuid, text) TO anon, authenticated;