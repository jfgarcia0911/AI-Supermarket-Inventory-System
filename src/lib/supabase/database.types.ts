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
    PostgrestVersion: "14.18"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string
          changed_at: string
          changed_by: string | null
          id: number
          new_values: Json | null
          old_values: Json | null
          record_id: string
          table_name: string
        }
        Insert: {
          action: string
          changed_at?: string
          changed_by?: string | null
          id?: never
          new_values?: Json | null
          old_values?: Json | null
          record_id: string
          table_name: string
        }
        Update: {
          action?: string
          changed_at?: string
          changed_by?: string | null
          id?: never
          new_values?: Json | null
          old_values?: Json | null
          record_id?: string
          table_name?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          expiry_warning_days: number | null
          id: string
          name: string
          parent_id: string | null
          target_margin_pct: number | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          expiry_warning_days?: number | null
          id?: string
          name: string
          parent_id?: string | null
          target_margin_pct?: number | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          expiry_warning_days?: number | null
          id?: string
          name?: string
          parent_id?: string | null
          target_margin_pct?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      imports: {
        Row: {
          column_mapping: Json
          committed_at: string
          committed_by: string | null
          file_fingerprint: string
          file_name: string
          id: string
          import_type: Database["public"]["Enums"]["import_type"]
          period_end: string | null
          period_start: string | null
          rows_error: number
          rows_ok: number
          rows_total: number
          rows_unmatched: number
          status: Database["public"]["Enums"]["import_status"]
          store_id: string | null
          summary: Json
          supplier_id: string | null
        }
        Insert: {
          column_mapping?: Json
          committed_at?: string
          committed_by?: string | null
          file_fingerprint: string
          file_name: string
          id?: string
          import_type: Database["public"]["Enums"]["import_type"]
          period_end?: string | null
          period_start?: string | null
          rows_error?: number
          rows_ok?: number
          rows_total?: number
          rows_unmatched?: number
          status?: Database["public"]["Enums"]["import_status"]
          store_id?: string | null
          summary?: Json
          supplier_id?: string | null
        }
        Update: {
          column_mapping?: Json
          committed_at?: string
          committed_by?: string | null
          file_fingerprint?: string
          file_name?: string
          id?: string
          import_type?: Database["public"]["Enums"]["import_type"]
          period_end?: string | null
          period_start?: string | null
          rows_error?: number
          rows_ok?: number
          rows_total?: number
          rows_unmatched?: number
          status?: Database["public"]["Enums"]["import_status"]
          store_id?: string | null
          summary?: Json
          supplier_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "imports_committed_by_fkey"
            columns: ["committed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imports_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imports_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "supplier_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imports_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      product_barcodes: {
        Row: {
          active: boolean
          barcode: string
          created_at: string
          created_by: string | null
          id: string
          is_primary: boolean
          pack_type: Database["public"]["Enums"]["pack_type"]
          product_id: string
          units_per_pack: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          barcode: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_primary?: boolean
          pack_type?: Database["public"]["Enums"]["pack_type"]
          product_id: string
          units_per_pack?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          barcode?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_primary?: boolean
          pack_type?: Database["public"]["Enums"]["pack_type"]
          product_id?: string
          units_per_pack?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_barcodes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_barcodes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_barcodes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          active: boolean
          brand: string | null
          category_id: string
          created_at: string
          created_by: string | null
          id: string
          name: string
          reorder_point: number | null
          reorder_qty: number | null
          sell_price: number | null
          size: string | null
          sold_by: Database["public"]["Enums"]["sold_by"]
          till_code: string | null
          updated_at: string
          vat_code: string
        }
        Insert: {
          active?: boolean
          brand?: string | null
          category_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          reorder_point?: number | null
          reorder_qty?: number | null
          sell_price?: number | null
          size?: string | null
          sold_by?: Database["public"]["Enums"]["sold_by"]
          till_code?: string | null
          updated_at?: string
          vat_code: string
        }
        Update: {
          active?: boolean
          brand?: string | null
          category_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          reorder_point?: number | null
          reorder_qty?: number | null
          sell_price?: number | null
          size?: string | null
          sold_by?: Database["public"]["Enums"]["sold_by"]
          till_code?: string | null
          updated_at?: string
          vat_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_vat_code_fkey"
            columns: ["vat_code"]
            isOneToOne: false
            referencedRelation: "vat_rates"
            referencedColumns: ["code"]
          },
        ]
      }
      profiles: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          email: string
          full_name: string
          id: string
          must_change_password: boolean
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          email: string
          full_name: string
          id: string
          must_change_password?: boolean
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          email?: string
          full_name?: string
          id?: string
          must_change_password?: boolean
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sell_price_history: {
        Row: {
          created_by: string | null
          effective_from: string
          id: string
          product_id: string
          sell_price: number | null
          source: Database["public"]["Enums"]["price_source"]
        }
        Insert: {
          created_by?: string | null
          effective_from?: string
          id?: string
          product_id: string
          sell_price?: number | null
          source: Database["public"]["Enums"]["price_source"]
        }
        Update: {
          created_by?: string | null
          effective_from?: string
          id?: string
          product_id?: string
          sell_price?: number | null
          source?: Database["public"]["Enums"]["price_source"]
        }
        Relationships: [
          {
            foreignKeyName: "sell_price_history_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sell_price_history_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sell_price_history_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          description: string
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          description: string
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          description?: string
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      store_members: {
        Row: {
          created_at: string
          profile_id: string
          store_id: string
        }
        Insert: {
          created_at?: string
          profile_id: string
          store_id: string
        }
        Update: {
          created_at?: string
          profile_id?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_members_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      stores: {
        Row: {
          active: boolean
          address: string | null
          created_at: string
          created_by: string | null
          id: string
          name: string
          timezone: string
          trading_day_end: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          address?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          timezone?: string
          trading_day_end?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          address?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          timezone?: string
          trading_day_end?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stores_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_cost_history: {
        Row: {
          case_cost: number
          change_pct: number | null
          created_at: string
          created_by: string | null
          effective_date: string
          id: string
          invoice_line_id: string | null
          source: Database["public"]["Enums"]["cost_source"]
          supplier_product_id: string
          unit_cost: number
        }
        Insert: {
          case_cost: number
          change_pct?: number | null
          created_at?: string
          created_by?: string | null
          effective_date?: string
          id?: string
          invoice_line_id?: string | null
          source: Database["public"]["Enums"]["cost_source"]
          supplier_product_id: string
          unit_cost: number
        }
        Update: {
          case_cost?: number
          change_pct?: number | null
          created_at?: string
          created_by?: string | null
          effective_date?: string
          id?: string
          invoice_line_id?: string | null
          source?: Database["public"]["Enums"]["cost_source"]
          supplier_product_id?: string
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "supplier_cost_history_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_cost_history_supplier_product_id_fkey"
            columns: ["supplier_product_id"]
            isOneToOne: false
            referencedRelation: "supplier_products"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_products: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          id: string
          is_preferred: boolean
          product_id: string
          supplier_code: string | null
          supplier_description: string | null
          supplier_id: string
          units_per_case: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          is_preferred?: boolean
          product_id: string
          supplier_code?: string | null
          supplier_description?: string | null
          supplier_id: string
          units_per_case: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          is_preferred?: boolean
          product_id?: string
          supplier_code?: string | null
          supplier_description?: string | null
          supplier_id?: string
          units_per_case?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_products_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_products_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "supplier_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_products_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          account_number: string | null
          active: boolean
          contact_name: string | null
          created_at: string
          created_by: string | null
          delivery_days: string | null
          email: string | null
          id: string
          lead_time_days: number
          name: string
          notes: string | null
          payment_terms_days: number | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          account_number?: string | null
          active?: boolean
          contact_name?: string | null
          created_at?: string
          created_by?: string | null
          delivery_days?: string | null
          email?: string | null
          id?: string
          lead_time_days?: number
          name: string
          notes?: string | null
          payment_terms_days?: number | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          account_number?: string | null
          active?: boolean
          contact_name?: string | null
          created_at?: string
          created_by?: string | null
          delivery_days?: string | null
          email?: string | null
          id?: string
          lead_time_days?: number
          name?: string
          notes?: string | null
          payment_terms_days?: number | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vat_rates: {
        Row: {
          active: boolean
          code: string
          name: string
          rate_pct: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: string
          name: string
          rate_pct: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          name?: string
          rate_pct?: number
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      category_overview: {
        Row: {
          active: boolean | null
          depth: number | null
          expiry_warning_days: number | null
          id: string | null
          name: string | null
          parent_id: string | null
          path: string | null
          product_count: number | null
          target_margin_pct: number | null
        }
        Relationships: []
      }
      category_paths: {
        Row: {
          active: boolean | null
          depth: number | null
          id: string | null
          name: string | null
          parent_id: string | null
          path: string | null
        }
        Relationships: []
      }
      product_overview: {
        Row: {
          active: boolean | null
          barcodes: string[] | null
          brand: string | null
          category_id: string | null
          category_path: string | null
          created_at: string | null
          id: string | null
          name: string | null
          primary_barcode: string | null
          reorder_point: number | null
          reorder_qty: number | null
          sell_price: number | null
          size: string | null
          sold_by: Database["public"]["Enums"]["sold_by"] | null
          till_code: string | null
          updated_at: string | null
          vat_code: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_vat_code_fkey"
            columns: ["vat_code"]
            isOneToOne: false
            referencedRelation: "vat_rates"
            referencedColumns: ["code"]
          },
        ]
      }
      supplier_overview: {
        Row: {
          account_number: string | null
          active: boolean | null
          contact_name: string | null
          delivery_days: string | null
          email: string | null
          id: string | null
          lead_time_days: number | null
          name: string | null
          notes: string | null
          payment_terms_days: number | null
          phone: string | null
          product_count: number | null
        }
        Insert: {
          account_number?: string | null
          active?: boolean | null
          contact_name?: string | null
          delivery_days?: string | null
          email?: string | null
          id?: string | null
          lead_time_days?: number | null
          name?: string | null
          notes?: string | null
          payment_terms_days?: number | null
          phone?: string | null
          product_count?: never
        }
        Update: {
          account_number?: string | null
          active?: boolean | null
          contact_name?: string | null
          delivery_days?: string | null
          email?: string | null
          id?: string | null
          lead_time_days?: number | null
          name?: string | null
          notes?: string | null
          payment_terms_days?: number | null
          phone?: string | null
          product_count?: never
        }
        Relationships: []
      }
      supplier_product_latest_costs: {
        Row: {
          case_cost: number | null
          change_pct: number | null
          effective_date: string | null
          source: Database["public"]["Enums"]["cost_source"] | null
          supplier_product_id: string | null
          unit_cost: number | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_cost_history_supplier_product_id_fkey"
            columns: ["supplier_product_id"]
            isOneToOne: false
            referencedRelation: "supplier_products"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      create_product: {
        Args: {
          p_barcode?: string
          p_brand?: string
          p_category_id: string
          p_name: string
          p_reorder_point?: number
          p_reorder_qty?: number
          p_sell_price?: number
          p_size?: string
          p_sold_by?: Database["public"]["Enums"]["sold_by"]
          p_till_code?: string
          p_vat_code: string
        }
        Returns: string
      }
      import_products: {
        Args: {
          p_dry_run?: boolean
          p_file_name: string
          p_fingerprint: string
          p_mapping?: Json
          p_rows: Json
          p_rows_skipped?: number
        }
        Returns: Json
      }
      import_supplier_products: {
        Args: {
          p_dry_run?: boolean
          p_file_name: string
          p_fingerprint: string
          p_mapping?: Json
          p_rows: Json
          p_rows_skipped?: number
          p_supplier_id: string
        }
        Returns: Json
      }
      mark_password_changed: { Args: never; Returns: undefined }
      record_supplier_cost: {
        Args: {
          p_case_cost: number
          p_effective_date?: string
          p_supplier_product_id: string
        }
        Returns: {
          case_cost: number
          change_pct: number | null
          created_at: string
          created_by: string | null
          effective_date: string
          id: string
          invoice_line_id: string | null
          source: Database["public"]["Enums"]["cost_source"]
          supplier_product_id: string
          unit_cost: number
        }
        SetofOptions: {
          from: "*"
          to: "supplier_cost_history"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      save_supplier_product: {
        Args: {
          p_description: string
          p_id?: string
          p_preferred: boolean
          p_product_id: string
          p_supplier_code: string
          p_supplier_id: string
          p_units_per_case: number
        }
        Returns: string
      }
      set_primary_barcode: {
        Args: { p_barcode_id: string }
        Returns: undefined
      }
      set_user_active: {
        Args: { p_active: boolean; p_user_id: string }
        Returns: undefined
      }
      set_user_role: {
        Args: {
          p_role: Database["public"]["Enums"]["app_role"]
          p_user_id: string
        }
        Returns: undefined
      }
      update_my_name: { Args: { p_full_name: string }; Returns: undefined }
    }
    Enums: {
      app_role: "owner" | "manager" | "staff" | "viewer"
      cost_source: "invoice" | "import" | "manual"
      import_status: "committed" | "failed" | "reversed"
      import_type: "products" | "supplier_products" | "sales"
      pack_type: "unit" | "case" | "outer"
      price_source: "manual" | "spreadsheet"
      sold_by: "each" | "kg"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      app_role: ["owner", "manager", "staff", "viewer"],
      cost_source: ["invoice", "import", "manual"],
      import_status: ["committed", "failed", "reversed"],
      import_type: ["products", "supplier_products", "sales"],
      pack_type: ["unit", "case", "outer"],
      price_source: ["manual", "spreadsheet"],
      sold_by: ["each", "kg"],
    },
  },
} as const
