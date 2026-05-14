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