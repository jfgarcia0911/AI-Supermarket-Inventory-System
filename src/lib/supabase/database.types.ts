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
      adjustment_reasons: {
        Row: {
          active: boolean
          created_at: string
          direction: string
          id: string
          name: string
          note_required: boolean
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          direction: string
          id?: string
          name: string
          note_required?: boolean
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          direction?: string
          id?: string
          name?: string
          note_required?: boolean
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
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
          {
            foreignKeyName: "product_barcodes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "stock_overview"
            referencedColumns: ["product_id"]
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
      sales_code_rules: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          product_id: string | null
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          product_id?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          product_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_code_rules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_code_rules_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_code_rules_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_code_rules_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "stock_overview"
            referencedColumns: ["product_id"]
          },
        ]
      }
      sales_import_lines: {
        Row: {
          code: string
          created_at: string
          description: string | null
          gross_value: number | null
          id: string
          import_id: string
          matched_at: string | null
          matched_by: string | null
          movement_id: string | null
          net_value: number | null
          note: string | null
          product_id: string | null
          quantity: number
          row_number: number
          sale_date: string
          status: Database["public"]["Enums"]["sales_line_status"]
          stock_quantity: number | null
          store_id: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          gross_value?: number | null
          id?: string
          import_id: string
          matched_at?: string | null
          matched_by?: string | null
          movement_id?: string | null
          net_value?: number | null
          note?: string | null
          product_id?: string | null
          quantity: number
          row_number: number
          sale_date: string
          status: Database["public"]["Enums"]["sales_line_status"]
          stock_quantity?: number | null
          store_id: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          gross_value?: number | null
          id?: string
          import_id?: string
          matched_at?: string | null
          matched_by?: string | null
          movement_id?: string | null
          net_value?: number | null
          note?: string | null
          product_id?: string | null
          quantity?: number
          row_number?: number
          sale_date?: string
          status?: Database["public"]["Enums"]["sales_line_status"]
          stock_quantity?: number | null
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_import_lines_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "imports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_import_lines_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "sales_import_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_import_lines_matched_by_fkey"
            columns: ["matched_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_import_lines_movement_id_fkey"
            columns: ["movement_id"]
            isOneToOne: false
            referencedRelation: "stock_movements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_import_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_import_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_import_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "stock_overview"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "sales_import_lines_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
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
          {
            foreignKeyName: "sell_price_history_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "stock_overview"
            referencedColumns: ["product_id"]
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
      stock_adjustments: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          id: string
          movement_id: string | null
          note: string | null
          product_id: string
          quantity: number
          reason_id: string
          requested_at: string
          requested_by: string | null
          status: Database["public"]["Enums"]["adjustment_status"]
          store_id: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          id?: string
          movement_id?: string | null
          note?: string | null
          product_id: string
          quantity: number
          reason_id: string
          requested_at?: string
          requested_by?: string | null
          status: Database["public"]["Enums"]["adjustment_status"]
          store_id: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          id?: string
          movement_id?: string | null
          note?: string | null
          product_id?: string
          quantity?: number
          reason_id?: string
          requested_at?: string
          requested_by?: string | null
          status?: Database["public"]["Enums"]["adjustment_status"]
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_adjustments_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_adjustments_movement_id_fkey"
            columns: ["movement_id"]
            isOneToOne: false
            referencedRelation: "stock_movements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_adjustments_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_adjustments_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_adjustments_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "stock_overview"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "stock_adjustments_reason_id_fkey"
            columns: ["reason_id"]
            isOneToOne: false
            referencedRelation: "adjustment_reasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_adjustments_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_adjustments_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_costs: {
        Row: {
          average_unit_cost: number | null
          last_unit_cost: number | null
          product_id: string
          store_id: string
        }
        Insert: {
          average_unit_cost?: number | null
          last_unit_cost?: number | null
          product_id: string
          store_id: string
        }
        Update: {
          average_unit_cost?: number | null
          last_unit_cost?: number | null
          product_id?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_costs_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_costs_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_costs_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "stock_overview"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "stock_costs_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_levels: {
        Row: {
          last_counted_at: string | null
          last_movement_at: string | null
          product_id: string
          quantity_on_hand: number
          store_id: string
        }
        Insert: {
          last_counted_at?: string | null
          last_movement_at?: string | null
          product_id: string
          quantity_on_hand?: number
          store_id: string
        }
        Update: {
          last_counted_at?: string | null
          last_movement_at?: string | null
          product_id?: string
          quantity_on_hand?: number
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_levels_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_levels_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_levels_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "stock_overview"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "stock_levels_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movement_costs: {
        Row: {
          movement_id: string
          unit_cost: number
        }
        Insert: {
          movement_id: string
          unit_cost: number
        }
        Update: {
          movement_id?: string
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "stock_movement_costs_movement_id_fkey"
            columns: ["movement_id"]
            isOneToOne: true
            referencedRelation: "stock_movements"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          movement_type: Database["public"]["Enums"]["movement_type"]
          note: string | null
          occurred_at: string
          product_id: string
          quantity: number
          reason_id: string | null
          reverses_id: string | null
          source_id: string | null
          source_type: Database["public"]["Enums"]["movement_source"] | null
          store_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          movement_type: Database["public"]["Enums"]["movement_type"]
          note?: string | null
          occurred_at: string
          product_id: string
          quantity: number
          reason_id?: string | null
          reverses_id?: string | null
          source_id?: string | null
          source_type?: Database["public"]["Enums"]["movement_source"] | null
          store_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          movement_type?: Database["public"]["Enums"]["movement_type"]
          note?: string | null
          occurred_at?: string
          product_id?: string
          quantity?: number
          reason_id?: string | null
          reverses_id?: string | null
          source_id?: string | null
          source_type?: Database["public"]["Enums"]["movement_source"] | null
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "stock_overview"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "stock_movements_reason_id_fkey"
            columns: ["reason_id"]
            isOneToOne: false
            referencedRelation: "adjustment_reasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_reverses_id_fkey"
            columns: ["reverses_id"]
            isOneToOne: true
            referencedRelation: "stock_movements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
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
            foreignKeyName: "supplier_cost_history_invoice_line_fkey"
            columns: ["invoice_line_id"]
            isOneToOne: false
            referencedRelation: "supplier_invoice_lines"
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
      supplier_invoice_files: {
        Row: {
          content_type: string
          created_at: string
          created_by: string | null
          file_name: string
          id: string
          invoice_id: string
          size_bytes: number
          storage_path: string
        }
        Insert: {
          content_type: string
          created_at?: string
          created_by?: string | null
          file_name: string
          id?: string
          invoice_id: string
          size_bytes: number
          storage_path: string
        }
        Update: {
          content_type?: string
          created_at?: string
          created_by?: string | null
          file_name?: string
          id?: string
          invoice_id?: string
          size_bytes?: number
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_invoice_files_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_invoice_files_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "delivery_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_invoice_files_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "supplier_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_invoice_line_costs: {
        Row: {
          case_cost: number | null
          line_id: string
          net_amount: number | null
          updated_at: string
          vat_rate_pct: number
        }
        Insert: {
          case_cost?: number | null
          line_id: string
          net_amount?: number | null
          updated_at?: string
          vat_rate_pct?: number
        }
        Update: {
          case_cost?: number | null
          line_id?: string
          net_amount?: number | null
          updated_at?: string
          vat_rate_pct?: number
        }
        Relationships: [
          {
            foreignKeyName: "supplier_invoice_line_costs_line_id_fkey"
            columns: ["line_id"]
            isOneToOne: true
            referencedRelation: "supplier_invoice_lines"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_invoice_lines: {
        Row: {
          cases_invoiced: number
          cases_received: number
          created_at: string
          created_by: string | null
          discrepancy: Database["public"]["Enums"]["discrepancy"]
          id: string
          invoice_id: string
          line_kind: Database["public"]["Enums"]["line_kind"]
          line_number: number
          note: string | null
          printed_code: string | null
          printed_description: string | null
          product_id: string | null
          supplier_product_id: string | null
          units_per_case: number
          units_received: number | null
          updated_at: string
        }
        Insert: {
          cases_invoiced?: number
          cases_received?: number
          created_at?: string
          created_by?: string | null
          discrepancy?: Database["public"]["Enums"]["discrepancy"]
          id?: string
          invoice_id: string
          line_kind?: Database["public"]["Enums"]["line_kind"]
          line_number: number
          note?: string | null
          printed_code?: string | null
          printed_description?: string | null
          product_id?: string | null
          supplier_product_id?: string | null
          units_per_case?: number
          units_received?: number | null
          updated_at?: string
        }
        Update: {
          cases_invoiced?: number
          cases_received?: number
          created_at?: string
          created_by?: string | null
          discrepancy?: Database["public"]["Enums"]["discrepancy"]
          id?: string
          invoice_id?: string
          line_kind?: Database["public"]["Enums"]["line_kind"]
          line_number?: number
          note?: string | null
          printed_code?: string | null
          printed_description?: string | null
          product_id?: string | null
          supplier_product_id?: string | null
          units_per_case?: number
          units_received?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_invoice_lines_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_invoice_lines_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "delivery_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_invoice_lines_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "supplier_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_invoice_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_invoice_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_invoice_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "stock_overview"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "supplier_invoice_lines_supplier_product_id_fkey"
            columns: ["supplier_product_id"]
            isOneToOne: false
            referencedRelation: "supplier_products"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_invoice_totals: {
        Row: {
          gross_total: number | null
          invoice_id: string
          net_total: number | null
          updated_at: string
          vat_total: number | null
        }
        Insert: {
          gross_total?: number | null
          invoice_id: string
          net_total?: number | null
          updated_at?: string
          vat_total?: number | null
        }
        Update: {
          gross_total?: number | null
          invoice_id?: string
          net_total?: number | null
          updated_at?: string
          vat_total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_invoice_totals_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: true
            referencedRelation: "delivery_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_invoice_totals_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: true
            referencedRelation: "supplier_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_invoices: {
        Row: {
          checked_in_at: string | null
          checked_in_by: string | null
          created_at: string
          created_by: string | null
          delivered_at: string
          document_type: Database["public"]["Enums"]["document_type"]
          id: string
          invoice_date: string | null
          invoice_number: string | null
          notes: string | null
          posted_at: string | null
          posted_by: string | null
          source: Database["public"]["Enums"]["delivery_source"]
          status: Database["public"]["Enums"]["delivery_status"]
          store_id: string
          supplier_id: string
          updated_at: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          checked_in_at?: string | null
          checked_in_by?: string | null
          created_at?: string
          created_by?: string | null
          delivered_at: string
          document_type?: Database["public"]["Enums"]["document_type"]
          id?: string
          invoice_date?: string | null
          invoice_number?: string | null
          notes?: string | null
          posted_at?: string | null
          posted_by?: string | null
          source?: Database["public"]["Enums"]["delivery_source"]
          status?: Database["public"]["Enums"]["delivery_status"]
          store_id: string
          supplier_id: string
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          checked_in_at?: string | null
          checked_in_by?: string | null
          created_at?: string
          created_by?: string | null
          delivered_at?: string
          document_type?: Database["public"]["Enums"]["document_type"]
          id?: string
          invoice_date?: string | null
          invoice_number?: string | null
          notes?: string | null
          posted_at?: string | null
          posted_by?: string | null
          source?: Database["public"]["Enums"]["delivery_source"]
          status?: Database["public"]["Enums"]["delivery_status"]
          store_id?: string
          supplier_id?: string
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_invoices_checked_in_by_fkey"
            columns: ["checked_in_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_invoices_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_invoices_posted_by_fkey"
            columns: ["posted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_invoices_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_invoices_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "supplier_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_invoices_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_invoices_voided_by_fkey"
            columns: ["voided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
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
            foreignKeyName: "supplier_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "stock_overview"
            referencedColumns: ["product_id"]
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
      delivery_overview: {
        Row: {
          checked_in_at: string | null
          created_at: string | null
          created_by: string | null
          delivered_at: string | null
          document_type: Database["public"]["Enums"]["document_type"] | null
          gross_total: number | null
          id: string | null
          invoice_date: string | null
          invoice_number: string | null
          line_count: number | null
          notes: string | null
          posted_at: string | null
          status: Database["public"]["Enums"]["delivery_status"] | null
          store_id: string | null
          supplier_id: string | null
          supplier_name: string | null
          units_received: number | null
          void_reason: string | null
          voided_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_invoices_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_invoices_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_invoices_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "supplier_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_invoices_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
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
      sales_import_overview: {
        Row: {
          committed_at: string | null
          committed_by: string | null
          file_name: string | null
          gross_sales: number | null
          id: string | null
          ignored_count: number | null
          line_count: number | null
          matched_count: number | null
          period_end: string | null
          period_start: string | null
          rows_error: number | null
          status: Database["public"]["Enums"]["import_status"] | null
          store_id: string | null
          summary: Json | null
          units_sold: number | null
          unmatched_count: number | null
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
        ]
      }
      sales_unmatched_codes: {
        Row: {
          code: string | null
          description: string | null
          first_sale_date: string | null
          gross_value: number | null
          last_sale_date: string | null
          line_count: number | null
          quantity: number | null
        }
        Relationships: []
      }
      stock_overview: {
        Row: {
          active: boolean | null
          brand: string | null
          category_id: string | null
          category_path: string | null
          is_low: boolean | null
          last_counted_at: string | null
          last_movement_at: string | null
          name: string | null
          primary_barcode: string | null
          product_id: string | null
          quantity_on_hand: number | null
          reorder_point: number | null
          reorder_qty: number | null
          size: string | null
          sold_by: Database["public"]["Enums"]["sold_by"] | null
          store_id: string | null
          till_code: string | null
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
            foreignKeyName: "stock_levels_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
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
      add_delivery_charge: {
        Args: {
          p_description: string
          p_invoice_id: string
          p_net_amount: number
          p_vat_rate_pct: number
        }
        Returns: string
      }
      add_delivery_file: {
        Args: {
          p_content_type: string
          p_file_name: string
          p_invoice_id: string
          p_size_bytes: number
          p_storage_path: string
        }
        Returns: string
      }
      add_delivery_line: {
        Args: {
          p_cases?: number
          p_invoice_id: string
          p_product_id: string
          p_units_per_case?: number
        }
        Returns: string
      }
      check_in_delivery: { Args: { p_invoice_id: string }; Returns: undefined }
      create_delivery: {
        Args: {
          p_delivered_at: string
          p_document_type?: Database["public"]["Enums"]["document_type"]
          p_notes?: string
          p_supplier_id: string
        }
        Returns: string
      }
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
      decide_adjustment: {
        Args: { p_adjustment_id: string; p_approve: boolean; p_note?: string }
        Returns: undefined
      }
      delivery_problems: { Args: { p_invoice_id: string }; Returns: string[] }
      forget_sales_code_rule: { Args: { p_code: string }; Returns: undefined }
      ignore_sales_code: {
        Args: { p_always?: boolean; p_code: string }
        Returns: number
      }
      import_opening_stock: {
        Args: {
          p_as_of: string
          p_dry_run?: boolean
          p_file_name?: string
          p_fingerprint?: string
          p_mapping?: Json
          p_rows: Json
          p_rows_skipped?: number
        }
        Returns: Json
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
      import_sales: {
        Args: {
          p_column_headers?: Json
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
      match_sales_code: {
        Args: { p_code: string; p_product_id: string; p_remember?: boolean }
        Returns: Json
      }
      post_delivery: { Args: { p_invoice_id: string }; Returns: Json }
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
      remove_delivery_line: { Args: { p_line_id: string }; Returns: undefined }
      request_adjustment: {
        Args: {
          p_note?: string
          p_product_id: string
          p_quantity: number
          p_reason_id: string
        }
        Returns: Json
      }
      reverse_sales_import: {
        Args: { p_import_id: string; p_reason: string }
        Returns: number
      }
      sales_coverage: { Args: never; Returns: Json }
      save_delivery_costs: {
        Args: {
          p_gross_total?: number
          p_invoice_date?: string
          p_invoice_id: string
          p_invoice_number?: string
          p_lines?: Json
          p_net_total?: number
          p_vat_total?: number
        }
        Returns: undefined
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
      stock_ledger_mismatches: {
        Args: never
        Returns: {
          ledger_quantity: number
          level_quantity: number
          product_id: string
          store_id: string
        }[]
      }
      stock_summary: { Args: never; Returns: Json }
      update_delivery_details: {
        Args: { p_delivered_at: string; p_invoice_id: string; p_notes: string }
        Returns: undefined
      }
      update_delivery_line: {
        Args: {
          p_cases_invoiced: number
          p_cases_received: number
          p_discrepancy?: Database["public"]["Enums"]["discrepancy"]
          p_line_id: string
          p_note?: string
          p_units_per_case: number
        }
        Returns: undefined
      }
      update_my_name: { Args: { p_full_name: string }; Returns: undefined }
      void_delivery: {
        Args: { p_invoice_id: string; p_reason: string }
        Returns: undefined
      }
    }
    Enums: {
      adjustment_status: "auto_approved" | "pending" | "approved" | "rejected"
      app_role: "owner" | "manager" | "staff" | "viewer"
      cost_source: "invoice" | "import" | "manual"
      delivery_source: "manual" | "upload" | "email"
      delivery_status: "draft" | "checked_in" | "posted" | "void"
      discrepancy: "none" | "short" | "damaged" | "substituted" | "extra"
      document_type: "invoice" | "credit_note"
      import_status: "committed" | "failed" | "reversed"
      import_type: "products" | "supplier_products" | "sales" | "opening_stock"
      line_kind: "stock" | "non_stock"
      movement_source:
        | "opening_stock"
        | "delivery_line"
        | "adjustment"
        | "count_result"
        | "sales_line"
      movement_type:
        | "opening_balance"
        | "receipt"
        | "supplier_return"
        | "sale"
        | "refund"
        | "adjustment"
        | "count_correction"
        | "reversal"
      pack_type: "unit" | "case" | "outer"
      price_source: "manual" | "spreadsheet"
      sales_line_status: "matched" | "unmatched" | "ignored"
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
      adjustment_status: ["auto_approved", "pending", "approved", "rejected"],
      app_role: ["owner", "manager", "staff", "viewer"],
      cost_source: ["invoice", "import", "manual"],
      delivery_source: ["manual", "upload", "email"],
      delivery_status: ["draft", "checked_in", "posted", "void"],
      discrepancy: ["none", "short", "damaged", "substituted", "extra"],
      document_type: ["invoice", "credit_note"],
      import_status: ["committed", "failed", "reversed"],
      import_type: ["products", "supplier_products", "sales", "opening_stock"],
      line_kind: ["stock", "non_stock"],
      movement_source: [
        "opening_stock",
        "delivery_line",
        "adjustment",
        "count_result",
        "sales_line",
      ],
      movement_type: [
        "opening_balance",
        "receipt",
        "supplier_return",
        "sale",
        "refund",
        "adjustment",
        "count_correction",
        "reversal",
      ],
      pack_type: ["unit", "case", "outer"],
      price_source: ["manual", "spreadsheet"],
      sales_line_status: ["matched", "unmatched", "ignored"],
      sold_by: ["each", "kg"],
    },
  },
} as const
