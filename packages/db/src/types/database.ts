// Generado con `mcp__supabase__generate_typescript_types` contra el proyecto `agency-os`
// (hicbkpwywwhnhiawulmu). Regenerar tras cada migración nueva — no editar a mano.

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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      clients: {
        Row: {
          code: string | null
          company: string | null
          created_at: string
          deleted_at: string | null
          email: string
          id: string
          logo_path: string | null
          name: string
          nit: string | null
          organization_id: string
          phone: string | null
          responsible: string | null
          updated_at: string
        }
        Insert: {
          code?: string | null
          company?: string | null
          created_at?: string
          deleted_at?: string | null
          email: string
          id?: string
          logo_path?: string | null
          name: string
          nit?: string | null
          organization_id: string
          phone?: string | null
          responsible?: string | null
          updated_at?: string
        }
        Update: {
          code?: string | null
          company?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string
          id?: string
          logo_path?: string | null
          name?: string
          nit?: string | null
          organization_id?: string
          phone?: string | null
          responsible?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      kams: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          is_active: boolean
          name: string
          organization_id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          name: string
          organization_id: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kams_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kams_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      modules: {
        Row: {
          code: string
          created_at: string
          description: string | null
          icon: string | null
          id: string
          is_active: boolean
          name: string
          sort_order: number
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          organization_id: string
          quote_id: string | null
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          organization_id: string
          quote_id?: string | null
          read_at?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          organization_id?: string
          quote_id?: string | null
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          code: string | null
          created_at: string
          deleted_at: string | null
          description: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          code?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          code?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      people: {
        Row: {
          active: boolean
          avatar_url: string | null
          code: string | null
          created_at: string
          deleted_at: string | null
          email: string | null
          full_name: string
          id: string
          organization_id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          avatar_url?: string | null
          code?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          full_name: string
          id?: string
          organization_id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          avatar_url?: string | null
          code?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          full_name?: string
          id?: string
          organization_id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "people_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          code: string
          created_at: string
          description: string | null
          id: string
          name: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      quote_code_counters: {
        Row: {
          client_id: string
          day: string
          last_seq: number
        }
        Insert: {
          client_id: string
          day: string
          last_seq?: number
        }
        Update: {
          client_id?: string
          day?: string
          last_seq?: number
        }
        Relationships: [
          {
            foreignKeyName: "quote_code_counters_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_items: {
        Row: {
          client_comment: string | null
          client_price: number
          cost_price: number
          created_at: string
          deleted_at: string | null
          description: string
          id: string
          is_group: boolean
          quantity: number
          quote_id: string
          sort_order: number
          status: Database["public"]["Enums"]["quote_item_status"]
          supplier: string | null
          updated_at: string
        }
        Insert: {
          client_comment?: string | null
          client_price?: number
          cost_price?: number
          created_at?: string
          deleted_at?: string | null
          description: string
          id?: string
          is_group?: boolean
          quantity?: number
          quote_id: string
          sort_order?: number
          status?: Database["public"]["Enums"]["quote_item_status"]
          supplier?: string | null
          updated_at?: string
        }
        Update: {
          client_comment?: string | null
          client_price?: number
          cost_price?: number
          created_at?: string
          deleted_at?: string | null
          description?: string
          id?: string
          is_group?: boolean
          quantity?: number
          quote_id?: string
          sort_order?: number
          status?: Database["public"]["Enums"]["quote_item_status"]
          supplier?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quote_items_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_recipients: {
        Row: {
          client_comment: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          name: string
          quote_id: string
          token: string
          viewed_at: string | null
        }
        Insert: {
          client_comment?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          name: string
          quote_id: string
          token?: string
          viewed_at?: string | null
        }
        Update: {
          client_comment?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          name?: string
          quote_id?: string
          token?: string
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quote_recipients_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_statuses: {
        Row: {
          code: string
          color: string
          created_at: string
          id: string
          is_active: boolean
          is_solid: boolean
          is_system: boolean
          kind: string
          label: string
          on_color: string | null
          organization_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          code: string
          color: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_solid?: boolean
          is_system?: boolean
          kind?: string
          label: string
          on_color?: string | null
          organization_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          code?: string
          color?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_solid?: boolean
          is_system?: boolean
          kind?: string
          label?: string
          on_color?: string | null
          organization_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quote_statuses_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_versions: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          quote_id: string
          snapshot: Json
          version_number: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          quote_id: string
          snapshot: Json
          version_number: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          quote_id?: string
          snapshot?: Json
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "quote_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_versions_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          accepted_at: string | null
          assigned_to: string | null
          brief_url: string | null
          clickup_task_id: string | null
          client_id: string
          closed_at: string | null
          code: string | null
          created_at: string
          created_by: string | null
          currency: string
          deleted_at: string | null
          event_date: string | null
          has_iva: boolean
          id: string
          internal_notes: string | null
          invoice_number: string | null
          iva_percentage: number
          kam_id: string | null
          message: string | null
          organization_id: string
          purchase_order: string | null
          quote_name: string | null
          quote_type: Database["public"]["Enums"]["quote_type"] | null
          rejected_at: string | null
          rejection_reason: string | null
          sent_at: string | null
          sent_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          assigned_to?: string | null
          brief_url?: string | null
          clickup_task_id?: string | null
          client_id: string
          closed_at?: string | null
          code?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          deleted_at?: string | null
          event_date?: string | null
          has_iva?: boolean
          id?: string
          internal_notes?: string | null
          invoice_number?: string | null
          iva_percentage?: number
          kam_id?: string | null
          message?: string | null
          organization_id: string
          purchase_order?: string | null
          quote_name?: string | null
          quote_type?: Database["public"]["Enums"]["quote_type"] | null
          rejected_at?: string | null
          rejection_reason?: string | null
          sent_at?: string | null
          sent_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          assigned_to?: string | null
          brief_url?: string | null
          clickup_task_id?: string | null
          client_id?: string
          closed_at?: string | null
          code?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          deleted_at?: string | null
          event_date?: string | null
          has_iva?: boolean
          id?: string
          internal_notes?: string | null
          invoice_number?: string | null
          iva_percentage?: number
          kam_id?: string | null
          message?: string | null
          organization_id?: string
          purchase_order?: string | null
          quote_name?: string | null
          quote_type?: Database["public"]["Enums"]["quote_type"] | null
          rejected_at?: string | null
          rejection_reason?: string | null
          sent_at?: string | null
          sent_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quotes_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_kam_id_fkey"
            columns: ["kam_id"]
            isOneToOne: false
            referencedRelation: "kams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_sent_by_fkey"
            columns: ["sent_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_status_fk"
            columns: ["organization_id", "status"]
            isOneToOne: false
            referencedRelation: "quote_statuses"
            referencedColumns: ["organization_id", "code"]
          },
        ]
      }
      role_permissions: {
        Row: {
          permission_id: string
          role_id: string
        }
        Insert: {
          permission_id: string
          role_id: string
        }
        Update: {
          permission_id?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          code: string
          created_at: string
          description: string | null
          id: string
          is_super: boolean
          module_code: string | null
          name: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          id?: string
          is_super?: boolean
          module_code?: string | null
          name: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          is_super?: boolean
          module_code?: string | null
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "roles_module_code_fkey"
            columns: ["module_code"]
            isOneToOne: false
            referencedRelation: "modules"
            referencedColumns: ["code"]
          },
        ]
      }
      supplier_orders: {
        Row: {
          confirmed_at: string | null
          created_at: string
          expires_at: string
          id: string
          items: Json
          message: string | null
          quote_id: string
          sent_at: string | null
          status: Database["public"]["Enums"]["supplier_order_status"]
          supplier_comment: string | null
          supplier_email: string
          supplier_name: string
          token: string
          updated_at: string
        }
        Insert: {
          confirmed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          items?: Json
          message?: string | null
          quote_id: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["supplier_order_status"]
          supplier_comment?: string | null
          supplier_email: string
          supplier_name: string
          token?: string
          updated_at?: string
        }
        Update: {
          confirmed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          items?: Json
          message?: string | null
          quote_id?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["supplier_order_status"]
          supplier_comment?: string | null
          supplier_email?: string
          supplier_name?: string
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_orders_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          role_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          role_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          role_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          person_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id: string
          person_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          person_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "users_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      work_item_assignees: {
        Row: {
          organization_id: string
          user_id: string
          work_item_id: string
        }
        Insert: {
          organization_id: string
          user_id: string
          work_item_id: string
        }
        Update: {
          organization_id?: string
          user_id?: string
          work_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_item_assignees_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_item_assignees_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_item_assignees_work_item_id_fkey"
            columns: ["work_item_id"]
            isOneToOne: false
            referencedRelation: "work_items"
            referencedColumns: ["id"]
          },
        ]
      }
      work_item_attachments: {
        Row: {
          created_at: string
          created_by: string | null
          filename: string
          id: string
          mime_type: string | null
          organization_id: string
          path: string
          size_bytes: number | null
          work_item_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          filename: string
          id?: string
          mime_type?: string | null
          organization_id: string
          path: string
          size_bytes?: number | null
          work_item_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          filename?: string
          id?: string
          mime_type?: string | null
          organization_id?: string
          path?: string
          size_bytes?: number | null
          work_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_item_attachments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_item_attachments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_item_attachments_work_item_id_fkey"
            columns: ["work_item_id"]
            isOneToOne: false
            referencedRelation: "work_items"
            referencedColumns: ["id"]
          },
        ]
      }
      work_item_statuses: {
        Row: {
          color: string
          created_at: string
          id: string
          is_done: boolean
          label: string
          organization_id: string
          project_id: string
          sort_order: number
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          is_done?: boolean
          label: string
          organization_id: string
          project_id: string
          sort_order?: number
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          is_done?: boolean
          label?: string
          organization_id?: string
          project_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "work_item_statuses_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_item_statuses_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "work_items"
            referencedColumns: ["id"]
          },
        ]
      }
      work_items: {
        Row: {
          client_id: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          due_date: string | null
          estimated_minutes: number | null
          id: string
          organization_id: string
          parent_id: string | null
          priority: Database["public"]["Enums"]["work_item_priority"]
          project_id: string
          project_state: Database["public"]["Enums"]["project_state"] | null
          quote_id: string | null
          sort_order: number
          start_date: string | null
          status_id: string | null
          title: string
          type: Database["public"]["Enums"]["work_item_type"]
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          due_date?: string | null
          estimated_minutes?: number | null
          id?: string
          organization_id: string
          parent_id?: string | null
          priority?: Database["public"]["Enums"]["work_item_priority"]
          project_id: string
          project_state?: Database["public"]["Enums"]["project_state"] | null
          quote_id?: string | null
          sort_order?: number
          start_date?: string | null
          status_id?: string | null
          title: string
          type: Database["public"]["Enums"]["work_item_type"]
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          due_date?: string | null
          estimated_minutes?: number | null
          id?: string
          organization_id?: string
          parent_id?: string | null
          priority?: Database["public"]["Enums"]["work_item_priority"]
          project_id?: string
          project_state?: Database["public"]["Enums"]["project_state"] | null
          quote_id?: string | null
          sort_order?: number
          start_date?: string | null
          status_id?: string | null
          title?: string
          type?: Database["public"]["Enums"]["work_item_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_items_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_items_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "work_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_items_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_items_status_fk"
            columns: ["status_id"]
            isOneToOne: false
            referencedRelation: "work_item_statuses"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_user_has_permission: {
        Args: { perm_code: string }
        Returns: boolean
      }
      current_user_is_super: { Args: never; Returns: boolean }
      current_user_module_codes: { Args: never; Returns: string[] }
      current_user_organization_ids: { Args: never; Returns: string[] }
      next_quote_seq: {
        Args: { p_client_id: string; p_day: string }
        Returns: number
      }
      reorder_quote_statuses: { Args: { p_ids: string[] }; Returns: undefined }
      seed_default_quote_statuses: {
        Args: { p_org: string }
        Returns: undefined
      }
      seed_default_work_item_statuses: {
        Args: { p_org: string; p_project_id: string }
        Returns: undefined
      }
    }
    Enums: {
      project_state: "active" | "completed" | "archived"
      quote_item_status: "pending" | "accepted" | "rejected" | "changes"
      quote_type: "proyecto" | "evolutivo"
      supplier_order_status: "pending" | "sent" | "confirmed"
      work_item_priority: "low" | "normal" | "high" | "urgent"
      work_item_type: "project" | "task" | "subtask"
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
    Enums: {
      project_state: ["active", "completed", "archived"],
      quote_item_status: ["pending", "accepted", "rejected", "changes"],
      quote_type: ["proyecto", "evolutivo"],
      supplier_order_status: ["pending", "sent", "confirmed"],
      work_item_priority: ["low", "normal", "high", "urgent"],
      work_item_type: ["project", "task", "subtask"],
    },
  },
} as const
