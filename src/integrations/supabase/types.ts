export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      absences: {
        Row: {
          absence_type: string
          company_id: string
          created_at: string
          employee_id: string | null
          end_date: string
          id: string
          reason: string | null
          start_date: string
        }
        Insert: {
          absence_type: string
          company_id: string
          created_at?: string
          employee_id?: string | null
          end_date: string
          id?: string
          reason?: string | null
          start_date: string
        }
        Update: {
          absence_type?: string
          company_id?: string
          created_at?: string
          employee_id?: string | null
          end_date?: string
          id?: string
          reason?: string | null
          start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "absences_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "absences_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      blocked_slots: {
        Row: {
          company_id: string
          created_at: string
          employee_id: string | null
          end_datetime: string
          id: string
          reason: string | null
          start_datetime: string
        }
        Insert: {
          company_id: string
          created_at?: string
          employee_id?: string | null
          end_datetime: string
          id?: string
          reason?: string | null
          start_datetime: string
        }
        Update: {
          company_id?: string
          created_at?: string
          employee_id?: string | null
          end_datetime?: string
          id?: string
          reason?: string | null
          start_datetime?: string
        }
        Relationships: [
          {
            foreignKeyName: "blocked_slots_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocked_slots_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_payments: {
        Row: {
          amount: number
          asaas_charge_id: string | null
          bank_slip_url: string | null
          booking_id: string
          company_id: string
          created_at: string
          id: string
          invoice_url: string | null
          metadata: Json | null
          method: string | null
          paid_at: string | null
          pix_payload: string | null
          pix_qr_code: string | null
          platform_fee_amount: number | null
          status: string
          updated_at: string
        }
        Insert: {
          amount?: number
          asaas_charge_id?: string | null
          bank_slip_url?: string | null
          booking_id: string
          company_id: string
          created_at?: string
          id?: string
          invoice_url?: string | null
          metadata?: Json | null
          method?: string | null
          paid_at?: string | null
          pix_payload?: string | null
          pix_qr_code?: string | null
          platform_fee_amount?: number | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          asaas_charge_id?: string | null
          bank_slip_url?: string | null
          booking_id?: string
          company_id?: string
          created_at?: string
          id?: string
          invoice_url?: string | null
          metadata?: Json | null
          method?: string | null
          paid_at?: string | null
          pix_payload?: string | null
          pix_qr_code?: string | null
          platform_fee_amount?: number | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      bookings: {
        Row: {
          booking_date: string
          client_id: string | null
          company_id: string
          created_at: string
          employee_id: string | null
          end_time: string
          id: string
          notes: string | null
          payment_status: string
          service_id: string | null
          start_time: string
          status: string | null
          updated_at: string
        }
        Insert: {
          booking_date: string
          client_id?: string | null
          company_id: string
          created_at?: string
          employee_id?: string | null
          end_time: string
          id?: string
          notes?: string | null
          payment_status?: string
          service_id?: string | null
          start_time: string
          status?: string | null
          updated_at?: string
        }
        Update: {
          booking_date?: string
          client_id?: string | null
          company_id?: string
          created_at?: string
          employee_id?: string | null
          end_time?: string
          id?: string
          notes?: string | null
          payment_status?: string
          service_id?: string | null
          start_time?: string
          status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      business_hours: {
        Row: {
          break_end: string | null
          break_start: string | null
          close_time: string | null
          company_id: string
          created_at: string
          day_of_week: number
          id: string
          is_open: boolean | null
          open_time: string | null
          updated_at: string
        }
        Insert: {
          break_end?: string | null
          break_start?: string | null
          close_time?: string | null
          company_id: string
          created_at?: string
          day_of_week: number
          id?: string
          is_open?: boolean | null
          open_time?: string | null
          updated_at?: string
        }
        Update: {
          break_end?: string | null
          break_start?: string | null
          close_time?: string | null
          company_id?: string
          created_at?: string
          day_of_week?: number
          id?: string
          is_open?: boolean | null
          open_time?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_hours_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      chatbot_flows: {
        Row: {
          company_id: string
          containers: Json | null
          created_at: string
          description: string | null
          edges: Json | null
          id: string
          is_active: boolean | null
          is_published: boolean | null
          name: string
          public_id: string | null
          published_at: string | null
          published_containers: Json | null
          published_edges: Json | null
          settings: Json | null
          updated_at: string
          variables: Json | null
        }
        Insert: {
          company_id: string
          containers?: Json | null
          created_at?: string
          description?: string | null
          edges?: Json | null
          id?: string
          is_active?: boolean | null
          is_published?: boolean | null
          name: string
          public_id?: string | null
          published_at?: string | null
          published_containers?: Json | null
          published_edges?: Json | null
          settings?: Json | null
          updated_at?: string
          variables?: Json | null
        }
        Update: {
          company_id?: string
          containers?: Json | null
          created_at?: string
          description?: string | null
          edges?: Json | null
          id?: string
          is_active?: boolean | null
          is_published?: boolean | null
          name?: string
          public_id?: string | null
          published_at?: string | null
          published_containers?: Json | null
          published_edges?: Json | null
          settings?: Json | null
          updated_at?: string
          variables?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "chatbot_flows_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      chatbot_integration: {
        Row: {
          api_key_encrypted: string | null
          api_key_prefix: string | null
          builder_base_url: string | null
          builder_user_id: string | null
          builder_workspace_slug: string | null
          company_id: string
          connected_at: string
          created_at: string
          id: string
          is_active: boolean
          last_validated_at: string | null
          talkmap_provisioned: boolean
          talkmap_provisioned_at: string | null
          updated_at: string
        }
        Insert: {
          api_key_encrypted?: string | null
          api_key_prefix?: string | null
          builder_base_url?: string | null
          builder_user_id?: string | null
          builder_workspace_slug?: string | null
          company_id: string
          connected_at?: string
          created_at?: string
          id?: string
          is_active?: boolean
          last_validated_at?: string | null
          talkmap_provisioned?: boolean
          talkmap_provisioned_at?: string | null
          updated_at?: string
        }
        Update: {
          api_key_encrypted?: string | null
          api_key_prefix?: string | null
          builder_base_url?: string | null
          builder_user_id?: string | null
          builder_workspace_slug?: string | null
          company_id?: string
          connected_at?: string
          created_at?: string
          id?: string
          is_active?: boolean
          last_validated_at?: string | null
          talkmap_provisioned?: boolean
          talkmap_provisioned_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      chatbot_sessions: {
        Row: {
          client_id: string | null
          company_id: string | null
          created_at: string
          flow_id: string
          id: string
          state: Json
          status: string | null
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          company_id?: string | null
          created_at?: string
          flow_id: string
          id?: string
          state?: Json
          status?: string | null
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          company_id?: string | null
          created_at?: string
          flow_id?: string
          id?: string
          state?: Json
          status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chatbot_sessions_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "chatbot_flows"
            referencedColumns: ["id"]
          },
        ]
      }
      client_rewards: {
        Row: {
          client_id: string | null
          company_id: string
          count_specific_service: boolean | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          required_procedures: number
          reward_service_id: string | null
          specific_service_id: string | null
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          company_id: string
          count_specific_service?: boolean | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          required_procedures?: number
          reward_service_id?: string | null
          specific_service_id?: string | null
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          company_id?: string
          count_specific_service?: boolean | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          required_procedures?: number
          reward_service_id?: string | null
          specific_service_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_rewards_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_rewards_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_rewards_reward_service_id_fkey"
            columns: ["reward_service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_rewards_specific_service_id_fkey"
            columns: ["specific_service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          company_id: string
          cpf: string | null
          created_at: string
          email: string | null
          id: string
          is_active: boolean | null
          name: string
          phone: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          company_id: string
          cpf?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          phone?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          company_id?: string
          cpf?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          phone?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          address: string | null
          builder_synced_at: string | null
          created_at: string
          id: string
          name: string
          owner_email: string | null
          owner_name: string | null
          owner_phone: string | null
          slug: string
          status: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          builder_synced_at?: string | null
          created_at?: string
          id?: string
          name: string
          owner_email?: string | null
          owner_name?: string | null
          owner_phone?: string | null
          slug: string
          status?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          builder_synced_at?: string | null
          created_at?: string
          id?: string
          name?: string
          owner_email?: string | null
          owner_name?: string | null
          owner_phone?: string | null
          slug?: string
          status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      company_credits: {
        Row: {
          amount: number
          company_id: string
          created_at: string
          created_by_user_id: string | null
          expires_at: string
          id: string
          metadata: Json | null
          original_amount: number
          reason: string
          source: string
          source_subscription_id: string | null
          status: string
          updated_at: string
          used_at: string | null
        }
        Insert: {
          amount?: number
          company_id: string
          created_at?: string
          created_by_user_id?: string | null
          expires_at: string
          id?: string
          metadata?: Json | null
          original_amount?: number
          reason: string
          source?: string
          source_subscription_id?: string | null
          status?: string
          updated_at?: string
          used_at?: string | null
        }
        Update: {
          amount?: number
          company_id?: string
          created_at?: string
          created_by_user_id?: string | null
          expires_at?: string
          id?: string
          metadata?: Json | null
          original_amount?: number
          reason?: string
          source?: string
          source_subscription_id?: string | null
          status?: string
          updated_at?: string
          used_at?: string | null
        }
        Relationships: []
      }
      company_customizations: {
        Row: {
          button_color: string | null
          button_color_type: string | null
          button_gradient: Json | null
          cards_color: string | null
          cards_color_type: string | null
          cards_font_family: string | null
          cards_gradient: Json | null
          cards_layout: string | null
          cards_show_images: boolean | null
          company_id: string
          created_at: string
          extra_section_code: string | null
          extra_section_enabled: boolean | null
          font_color: string | null
          font_color_type: string | null
          font_family: string | null
          font_gradient: Json | null
          font_size_base: number | null
          footer_background_color: string | null
          footer_background_gradient: Json | null
          footer_background_type: string | null
          footer_font_family: string | null
          header_background_color: string | null
          header_background_gradient: Json | null
          header_background_type: string | null
          header_position: string | null
          hero_background_color: string | null
          hero_background_gradient: Json | null
          hero_background_type: string | null
          hero_banner_type: string | null
          hero_banner_urls: string[] | null
          hero_content_position: string | null
          hero_description: string | null
          hero_title: string | null
          id: string
          logo_type: string | null
          logo_upload_path: string | null
          logo_url: string | null
          primary_color: string | null
          secondary_color: string | null
          theme: Json | null
          updated_at: string
        }
        Insert: {
          button_color?: string | null
          button_color_type?: string | null
          button_gradient?: Json | null
          cards_color?: string | null
          cards_color_type?: string | null
          cards_font_family?: string | null
          cards_gradient?: Json | null
          cards_layout?: string | null
          cards_show_images?: boolean | null
          company_id: string
          created_at?: string
          extra_section_code?: string | null
          extra_section_enabled?: boolean | null
          font_color?: string | null
          font_color_type?: string | null
          font_family?: string | null
          font_gradient?: Json | null
          font_size_base?: number | null
          footer_background_color?: string | null
          footer_background_gradient?: Json | null
          footer_background_type?: string | null
          footer_font_family?: string | null
          header_background_color?: string | null
          header_background_gradient?: Json | null
          header_background_type?: string | null
          header_position?: string | null
          hero_background_color?: string | null
          hero_background_gradient?: Json | null
          hero_background_type?: string | null
          hero_banner_type?: string | null
          hero_banner_urls?: string[] | null
          hero_content_position?: string | null
          hero_description?: string | null
          hero_title?: string | null
          id?: string
          logo_type?: string | null
          logo_upload_path?: string | null
          logo_url?: string | null
          primary_color?: string | null
          secondary_color?: string | null
          theme?: Json | null
          updated_at?: string
        }
        Update: {
          button_color?: string | null
          button_color_type?: string | null
          button_gradient?: Json | null
          cards_color?: string | null
          cards_color_type?: string | null
          cards_font_family?: string | null
          cards_gradient?: Json | null
          cards_layout?: string | null
          cards_show_images?: boolean | null
          company_id?: string
          created_at?: string
          extra_section_code?: string | null
          extra_section_enabled?: boolean | null
          font_color?: string | null
          font_color_type?: string | null
          font_family?: string | null
          font_gradient?: Json | null
          font_size_base?: number | null
          footer_background_color?: string | null
          footer_background_gradient?: Json | null
          footer_background_type?: string | null
          footer_font_family?: string | null
          header_background_color?: string | null
          header_background_gradient?: Json | null
          header_background_type?: string | null
          header_position?: string | null
          hero_background_color?: string | null
          hero_background_gradient?: Json | null
          hero_background_type?: string | null
          hero_banner_type?: string | null
          hero_banner_urls?: string[] | null
          hero_content_position?: string | null
          hero_description?: string | null
          hero_title?: string | null
          id?: string
          logo_type?: string | null
          logo_upload_path?: string | null
          logo_url?: string | null
          primary_color?: string | null
          secondary_color?: string | null
          theme?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_customizations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_invoices: {
        Row: {
          amount: number
          asaas_charge_id: string | null
          bank_slip_url: string | null
          billing_type: string | null
          company_id: string
          created_at: string
          description: string | null
          due_date: string
          id: string
          invoice_url: string | null
          metadata: Json | null
          paid_at: string | null
          payment_method_id: string | null
          pix_payload: string | null
          pix_qr_code: string | null
          status: string
          subscription_id: string | null
          updated_at: string
        }
        Insert: {
          amount?: number
          asaas_charge_id?: string | null
          bank_slip_url?: string | null
          billing_type?: string | null
          company_id: string
          created_at?: string
          description?: string | null
          due_date: string
          id?: string
          invoice_url?: string | null
          metadata?: Json | null
          paid_at?: string | null
          payment_method_id?: string | null
          pix_payload?: string | null
          pix_qr_code?: string | null
          status?: string
          subscription_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          asaas_charge_id?: string | null
          bank_slip_url?: string | null
          billing_type?: string | null
          company_id?: string
          created_at?: string
          description?: string | null
          due_date?: string
          id?: string
          invoice_url?: string | null
          metadata?: Json | null
          paid_at?: string | null
          payment_method_id?: string | null
          pix_payload?: string | null
          pix_qr_code?: string | null
          status?: string
          subscription_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      company_payment_methods: {
        Row: {
          asaas_customer_id: string | null
          asaas_token: string | null
          bank_name: string | null
          brand: string | null
          company_id: string
          created_at: string
          display_label: string | null
          id: string
          is_active: boolean
          is_default: boolean
          last_digits: string | null
          type: string
          updated_at: string
        }
        Insert: {
          asaas_customer_id?: string | null
          asaas_token?: string | null
          bank_name?: string | null
          brand?: string | null
          company_id: string
          created_at?: string
          display_label?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          last_digits?: string | null
          type: string
          updated_at?: string
        }
        Update: {
          asaas_customer_id?: string | null
          asaas_token?: string | null
          bank_name?: string | null
          brand?: string | null
          company_id?: string
          created_at?: string
          display_label?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          last_digits?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      company_payment_settings: {
        Row: {
          accepted_methods: Json
          company_id: string
          created_at: string
          own_gateway_api_key_encrypted: string | null
          own_gateway_provider: string | null
          payment_mode: string
          updated_at: string
        }
        Insert: {
          accepted_methods?: Json
          company_id: string
          created_at?: string
          own_gateway_api_key_encrypted?: string | null
          own_gateway_provider?: string | null
          payment_mode?: string
          updated_at?: string
        }
        Update: {
          accepted_methods?: Json
          company_id?: string
          created_at?: string
          own_gateway_api_key_encrypted?: string | null
          own_gateway_provider?: string | null
          payment_mode?: string
          updated_at?: string
        }
        Relationships: []
      }
      company_schedule_settings: {
        Row: {
          allow_simultaneous_breaks: boolean | null
          company_id: string
          created_at: string
          id: string
          max_advance_days: number | null
          max_simultaneous_breaks: number | null
          min_advance_hours: number | null
          slot_duration_minutes: number | null
          updated_at: string
        }
        Insert: {
          allow_simultaneous_breaks?: boolean | null
          company_id: string
          created_at?: string
          id?: string
          max_advance_days?: number | null
          max_simultaneous_breaks?: number | null
          min_advance_hours?: number | null
          slot_duration_minutes?: number | null
          updated_at?: string
        }
        Update: {
          allow_simultaneous_breaks?: boolean | null
          company_id?: string
          created_at?: string
          id?: string
          max_advance_days?: number | null
          max_simultaneous_breaks?: number | null
          min_advance_hours?: number | null
          slot_duration_minutes?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_schedule_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_subscriptions: {
        Row: {
          asaas_subscription_id: string | null
          billing_period: string
          company_id: string
          created_at: string
          current_payment_method_id: string | null
          discount_cycles_remaining: number | null
          discount_percentage: number | null
          discount_reason: string | null
          ends_at: string | null
          id: string
          next_billing_date: string | null
          original_price: number
          pending_plan_change: Json | null
          plan_id: string
          starts_at: string | null
          status: string | null
          updated_at: string
        }
        Insert: {
          asaas_subscription_id?: string | null
          billing_period?: string
          company_id: string
          created_at?: string
          current_payment_method_id?: string | null
          discount_cycles_remaining?: number | null
          discount_percentage?: number | null
          discount_reason?: string | null
          ends_at?: string | null
          id?: string
          next_billing_date?: string | null
          original_price?: number
          pending_plan_change?: Json | null
          plan_id: string
          starts_at?: string | null
          status?: string | null
          updated_at?: string
        }
        Update: {
          asaas_subscription_id?: string | null
          billing_period?: string
          company_id?: string
          created_at?: string
          current_payment_method_id?: string | null
          discount_cycles_remaining?: number | null
          discount_percentage?: number | null
          discount_reason?: string | null
          ends_at?: string | null
          id?: string
          next_billing_date?: string | null
          original_price?: number
          pending_plan_change?: Json | null
          plan_id?: string
          starts_at?: string | null
          status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_subscriptions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_absences: {
        Row: {
          absence_type: string
          company_id: string
          created_at: string
          employee_id: string | null
          end_date: string
          id: string
          reason: string | null
          start_date: string
        }
        Insert: {
          absence_type: string
          company_id: string
          created_at?: string
          employee_id?: string | null
          end_date: string
          id?: string
          reason?: string | null
          start_date: string
        }
        Update: {
          absence_type?: string
          company_id?: string
          created_at?: string
          employee_id?: string | null
          end_date?: string
          id?: string
          reason?: string | null
          start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_absences_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_absences_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_availability: {
        Row: {
          available_date: string
          break_end: string | null
          break_start: string | null
          company_id: string
          created_at: string
          employee_id: string | null
          end_time: string
          id: string
          start_time: string
        }
        Insert: {
          available_date: string
          break_end?: string | null
          break_start?: string | null
          company_id: string
          created_at?: string
          employee_id?: string | null
          end_time: string
          id?: string
          start_time: string
        }
        Update: {
          available_date?: string
          break_end?: string | null
          break_start?: string | null
          company_id?: string
          created_at?: string
          employee_id?: string | null
          end_time?: string
          id?: string
          start_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_availability_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_availability_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_schedules: {
        Row: {
          break_end: string | null
          break_start: string | null
          company_id: string
          created_at: string
          day_of_week: number
          employee_id: string | null
          end_time: string | null
          id: string
          is_working: boolean | null
          start_time: string | null
          updated_at: string
        }
        Insert: {
          break_end?: string | null
          break_start?: string | null
          company_id: string
          created_at?: string
          day_of_week: number
          employee_id?: string | null
          end_time?: string | null
          id?: string
          is_working?: boolean | null
          start_time?: string | null
          updated_at?: string
        }
        Update: {
          break_end?: string | null
          break_start?: string | null
          company_id?: string
          created_at?: string
          day_of_week?: number
          employee_id?: string | null
          end_time?: string | null
          id?: string
          is_working?: boolean | null
          start_time?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_schedules_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_schedules_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_services: {
        Row: {
          created_at: string
          employee_id: string
          id: string
          service_id: string
        }
        Insert: {
          created_at?: string
          employee_id: string
          id?: string
          service_id: string
        }
        Update: {
          created_at?: string
          employee_id?: string
          id?: string
          service_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_services_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_services_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          company_id: string
          created_at: string
          email: string | null
          id: string
          is_active: boolean | null
          name: string
          phone: string | null
          role: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          phone?: string | null
          role?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          phone?: string | null
          role?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employees_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_limits: {
        Row: {
          created_at: string
          features: Json
          max_bookings_month: number | null
          max_chatbot_messages: number | null
          max_chatbots: number | null
          max_employees: number | null
          max_integrations: number | null
          max_services: number | null
          plan_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          features?: Json
          max_bookings_month?: number | null
          max_chatbot_messages?: number | null
          max_chatbots?: number | null
          max_employees?: number | null
          max_integrations?: number | null
          max_services?: number | null
          plan_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          features?: Json
          max_bookings_month?: number | null
          max_chatbot_messages?: number | null
          max_chatbots?: number | null
          max_employees?: number | null
          max_integrations?: number | null
          max_services?: number | null
          plan_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      rewards: {
        Row: {
          company_id: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          points_required: number
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          points_required?: number
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          points_required?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rewards_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      service_combo_items: {
        Row: {
          combo_id: string
          created_at: string
          id: string
          service_id: string
        }
        Insert: {
          combo_id: string
          created_at?: string
          id?: string
          service_id: string
        }
        Update: {
          combo_id?: string
          created_at?: string
          id?: string
          service_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_combo_items_combo_id_fkey"
            columns: ["combo_id"]
            isOneToOne: false
            referencedRelation: "service_combos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_combo_items_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      service_combos: {
        Row: {
          company_id: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          price: number
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          price?: number
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_combos_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          company_id: string
          created_at: string
          description: string | null
          duration: number
          duration_minutes: number | null
          id: string
          is_active: boolean | null
          name: string
          payment_required: string
          price: number
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          description?: string | null
          duration?: number
          duration_minutes?: number | null
          id?: string
          is_active?: boolean | null
          name: string
          payment_required?: string
          price?: number
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          description?: string | null
          duration?: number
          duration_minutes?: number | null
          id?: string
          is_active?: boolean | null
          name?: string
          payment_required?: string
          price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "services_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_plans: {
        Row: {
          annual_price: number
          builder_tier: string
          created_at: string
          features: Json | null
          id: string
          is_active: boolean | null
          monthly_price: number
          name: string
          quarterly_price: number
          updated_at: string
        }
        Insert: {
          annual_price?: number
          builder_tier?: string
          created_at?: string
          features?: Json | null
          id?: string
          is_active?: boolean | null
          monthly_price?: number
          name: string
          quarterly_price?: number
          updated_at?: string
        }
        Update: {
          annual_price?: number
          builder_tier?: string
          created_at?: string
          features?: Json | null
          id?: string
          is_active?: boolean | null
          monthly_price?: number
          name?: string
          quarterly_price?: number
          updated_at?: string
        }
        Relationships: []
      }
      super_admins: {
        Row: {
          created_at: string
          note: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          note?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          note?: string | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      decrypt_chatbot_key: {
        Args: { p_cipher: string; p_secret: string }
        Returns: string
      }
      encrypt_chatbot_key: {
        Args: { p_plain: string; p_secret: string }
        Returns: string
      }
      is_super_admin: { Args: { _uid: string }; Returns: boolean }
      user_company_id: { Args: { _uid: string }; Returns: string }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
