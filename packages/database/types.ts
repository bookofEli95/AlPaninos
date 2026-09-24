export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
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
      challenge_completions: {
        Row: {
          challenge_id: string
          completed_at: string
          id: string
          order_id: string | null
          period_start: string
          points_awarded: number
          user_id: string
        }
        Insert: {
          challenge_id: string
          completed_at?: string
          id?: string
          order_id?: string | null
          period_start: string
          points_awarded: number
          user_id: string
        }
        Update: {
          challenge_id?: string
          completed_at?: string
          id?: string
          order_id?: string | null
          period_start?: string
          points_awarded?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "challenge_completions_challenge_id_fkey"
            columns: ["challenge_id"]
            isOneToOne: false
            referencedRelation: "challenges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "challenge_completions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "challenge_completions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      challenges: {
        Row: {
          bonus_points: number
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          kind: string
          min_subtotal: number
          period: string
          sort_order: number
          target_count: number | null
          title: string
          weekdays: number[] | null
        }
        Insert: {
          bonus_points: number
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          kind: string
          min_subtotal?: number
          period: string
          sort_order?: number
          target_count?: number | null
          title: string
          weekdays?: number[] | null
        }
        Update: {
          bonus_points?: number
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          kind?: string
          min_subtotal?: number
          period?: string
          sort_order?: number
          target_count?: number | null
          title?: string
          weekdays?: number[] | null
        }
        Relationships: []
      }
      customer_feedback: {
        Row: {
          created_at: string
          id: string
          message: string
          topic: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          topic?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          topic?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_feedback_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          address: string | null
          created_at: string
          hours: Json | null
          hst_number: string | null
          id: string
          latitude: number | null
          longitude: number | null
          name: string
          tax_rate: number
        }
        Insert: {
          address?: string | null
          created_at?: string
          hours?: Json | null
          hst_number?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          name: string
          tax_rate?: number
        }
        Update: {
          address?: string | null
          created_at?: string
          hours?: Json | null
          hst_number?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          name?: string
          tax_rate?: number
        }
        Relationships: []
      }
      menu_categories: {
        Row: {
          created_at: string
          id: string
          image_url: string | null
          is_catering: boolean
          is_secret: boolean
          location_id: string
          name: string
          sort_order: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          image_url?: string | null
          is_catering?: boolean
          is_secret?: boolean
          location_id: string
          name: string
          sort_order?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          image_url?: string | null
          is_catering?: boolean
          is_secret?: boolean
          location_id?: string
          name?: string
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "menu_categories_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_items: {
        Row: {
          base_price: number
          category_id: string
          catering_role: string | null
          created_at: string
          daypart_tags: string[]
          description: string | null
          dietary_tags: string[]
          drop_ends_at: string | null
          drop_starts_at: string | null
          id: string
          image_url: string | null
          is_available: boolean | null
          is_catering: boolean
          location_id: string
          name: string
          serves_max: number | null
          serves_min: number | null
          upsell_group: string | null
        }
        Insert: {
          base_price: number
          category_id: string
          catering_role?: string | null
          created_at?: string
          daypart_tags?: string[]
          description?: string | null
          dietary_tags?: string[]
          drop_ends_at?: string | null
          drop_starts_at?: string | null
          id?: string
          image_url?: string | null
          is_available?: boolean | null
          is_catering?: boolean
          location_id: string
          name: string
          serves_max?: number | null
          serves_min?: number | null
          upsell_group?: string | null
        }
        Update: {
          base_price?: number
          category_id?: string
          catering_role?: string | null
          created_at?: string
          daypart_tags?: string[]
          description?: string | null
          dietary_tags?: string[]
          drop_ends_at?: string | null
          drop_starts_at?: string | null
          id?: string
          image_url?: string | null
          is_available?: boolean | null
          is_catering?: boolean
          location_id?: string
          name?: string
          serves_max?: number | null
          serves_min?: number | null
          upsell_group?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "menu_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "menu_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_items_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      modifier_groups: {
        Row: {
          allow_quantity: boolean
          id: string
          is_required: boolean | null
          max_selections: number | null
          menu_item_id: string | null
          min_selections: number | null
          name: string
          parent_option_id: string | null
          sort_order: number | null
        }
        Insert: {
          allow_quantity?: boolean
          id?: string
          is_required?: boolean | null
          max_selections?: number | null
          menu_item_id?: string | null
          min_selections?: number | null
          name: string
          parent_option_id?: string | null
          sort_order?: number | null
        }
        Update: {
          allow_quantity?: boolean
          id?: string
          is_required?: boolean | null
          max_selections?: number | null
          menu_item_id?: string | null
          min_selections?: number | null
          name?: string
          parent_option_id?: string | null
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_parent_option"
            columns: ["parent_option_id"]
            isOneToOne: false
            referencedRelation: "modifier_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "modifier_groups_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
        ]
      }
      modifier_options: {
        Row: {
          group_id: string
          id: string
          is_default: boolean
          menu_item_id: string | null
          name: string
          price_adjustment: number | null
          sort_order: number | null
        }
        Insert: {
          group_id: string
          id?: string
          is_default?: boolean
          menu_item_id?: string | null
          name: string
          price_adjustment?: number | null
          sort_order?: number | null
        }
        Update: {
          group_id?: string
          id?: string
          is_default?: boolean
          menu_item_id?: string | null
          name?: string
          price_adjustment?: number | null
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "modifier_options_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "modifier_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "modifier_options_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
        ]
      }
      order_item_modifiers: {
        Row: {
          id: string
          modifier_option_id: string
          order_item_id: string
          price_adjustment: number | null
        }
        Insert: {
          id?: string
          modifier_option_id: string
          order_item_id: string
          price_adjustment?: number | null
        }
        Update: {
          id?: string
          modifier_option_id?: string
          order_item_id?: string
          price_adjustment?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "order_item_modifiers_modifier_option_id_fkey"
            columns: ["modifier_option_id"]
            isOneToOne: false
            referencedRelation: "modifier_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_item_modifiers_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          id: string
          menu_item_id: string
          order_id: string
          quantity: number
          special_instructions: string | null
          total_price: number
          unit_price: number
        }
        Insert: {
          id?: string
          menu_item_id: string
          order_id: string
          quantity: number
          special_instructions?: string | null
          total_price?: number
          unit_price: number
        }
        Update: {
          id?: string
          menu_item_id?: string
          order_id?: string
          quantity?: number
          special_instructions?: string | null
          total_price?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_ratings: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          order_id: string
          rating: number
          user_id: string | null
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          order_id: string
          rating: number
          user_id?: string | null
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          order_id?: string
          rating?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_ratings_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_ratings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          catering_company: string | null
          catering_confirmed_at: string | null
          catering_notes: string | null
          created_at: string
          customer_email: string | null
          customer_name: string | null
          customer_phone: string | null
          delivery_address: string | null
          delivery_fee: number | null
          discount_amount: number | null
          estimated_ready_at: string | null
          id: string
          invoice_email: string | null
          is_catering: boolean
          location_id: string
          notify_email: boolean
          notify_sms: boolean
          order_type: Database["public"]["Enums"]["order_type"]
          po_number: string | null
          points_awarded_at: string | null
          points_earned: number | null
          points_redeemed: number | null
          promo_code: string | null
          requested_ready_at: string | null
          status: Database["public"]["Enums"]["order_status"]
          subtotal_amount: number | null
          tax_amount: number | null
          total_amount: number
          user_id: string | null
        }
        Insert: {
          catering_company?: string | null
          catering_confirmed_at?: string | null
          catering_notes?: string | null
          created_at?: string
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          delivery_address?: string | null
          delivery_fee?: number | null
          discount_amount?: number | null
          estimated_ready_at?: string | null
          id?: string
          invoice_email?: string | null
          is_catering?: boolean
          location_id: string
          notify_email?: boolean
          notify_sms?: boolean
          order_type?: Database["public"]["Enums"]["order_type"]
          po_number?: string | null
          points_awarded_at?: string | null
          points_earned?: number | null
          points_redeemed?: number | null
          promo_code?: string | null
          requested_ready_at?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          subtotal_amount?: number | null
          tax_amount?: number | null
          total_amount: number
          user_id?: string | null
        }
        Update: {
          catering_company?: string | null
          catering_confirmed_at?: string | null
          catering_notes?: string | null
          created_at?: string
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          delivery_address?: string | null
          delivery_fee?: number | null
          discount_amount?: number | null
          estimated_ready_at?: string | null
          id?: string
          invoice_email?: string | null
          is_catering?: boolean
          location_id?: string
          notify_email?: boolean
          notify_sms?: boolean
          order_type?: Database["public"]["Enums"]["order_type"]
          po_number?: string | null
          points_awarded_at?: string | null
          points_earned?: number | null
          points_redeemed?: number | null
          promo_code?: string | null
          requested_ready_at?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          subtotal_amount?: number | null
          tax_amount?: number | null
          total_amount?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          address: string | null
          created_at: string
          first_name: string | null
          has_spun_wheel: boolean
          id: string
          last_name: string | null
          notify_email: boolean
          notify_sms: boolean
          panino_points: number
          phone: string | null
          push_enabled: boolean
          wheel_prize_code: string | null
          wheel_prize_title: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string
          first_name?: string | null
          has_spun_wheel?: boolean
          id: string
          last_name?: string | null
          notify_email?: boolean
          notify_sms?: boolean
          panino_points?: number
          phone?: string | null
          push_enabled?: boolean
          wheel_prize_code?: string | null
          wheel_prize_title?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string
          first_name?: string | null
          has_spun_wheel?: boolean
          id?: string
          last_name?: string | null
          notify_email?: boolean
          notify_sms?: boolean
          panino_points?: number
          phone?: string | null
          push_enabled?: boolean
          wheel_prize_code?: string | null
          wheel_prize_title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      promotions: {
        Row: {
          amount_off: number | null
          category_id: string | null
          category_name: string | null
          category_names: string[] | null
          code: string | null
          created_at: string
          description: string | null
          discount_percent: number | null
          id: string
          is_active: boolean
          item_name_patterns: string[] | null
          location_id: string | null
          max_discount_amount: number | null
          min_item_count: number | null
          min_order_amount: number | null
          order_type: Database["public"]["Enums"]["order_type"] | null
          single_use: boolean
          title: string
          user_id: string | null
        }
        Insert: {
          amount_off?: number | null
          category_id?: string | null
          category_name?: string | null
          category_names?: string[] | null
          code?: string | null
          created_at?: string
          description?: string | null
          discount_percent?: number | null
          id?: string
          is_active?: boolean
          item_name_patterns?: string[] | null
          location_id?: string | null
          max_discount_amount?: number | null
          min_item_count?: number | null
          min_order_amount?: number | null
          order_type?: Database["public"]["Enums"]["order_type"] | null
          single_use?: boolean
          title: string
          user_id?: string | null
        }
        Update: {
          amount_off?: number | null
          category_id?: string | null
          category_name?: string | null
          category_names?: string[] | null
          code?: string | null
          created_at?: string
          description?: string | null
          discount_percent?: number | null
          id?: string
          is_active?: boolean
          item_name_patterns?: string[] | null
          location_id?: string | null
          max_discount_amount?: number | null
          min_item_count?: number | null
          min_order_amount?: number | null
          order_type?: Database["public"]["Enums"]["order_type"] | null
          single_use?: boolean
          title?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "promotions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "menu_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotions_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      push_tokens: {
        Row: {
          created_at: string
          id: string
          token: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          token: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          token?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_tokens_user_id_fkey"
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
          email: string
          id: string
          loyalty_balance: number
          role: Database["public"]["Enums"]["user_role"]
        }
        Insert: {
          created_at?: string
          email: string
          id: string
          loyalty_balance?: number
          role?: Database["public"]["Enums"]["user_role"]
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          loyalty_balance?: number
          role?: Database["public"]["Enums"]["user_role"]
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      challenge_period_start: {
        Args: { p_local: string; p_period: string }
        Returns: string
      }
      challenge_progress: {
        Args: {
          p_challenge: Database["public"]["Tables"]["challenges"]["Row"]
          p_period_start: string
          p_user: string
        }
        Returns: {
          done_days: number[]
          progress: number
          target: number
        }[]
      }
      claim_wheel_prize: { Args: never; Returns: Json }
      get_daypart_picks: {
        Args: { p_daypart: string; p_limit?: number; p_location_id: string }
        Returns: {
          base_price: number
          category_id: string
          id: string
          image_url: string
          location_id: string
          name: string
          sold: number
        }[]
      }
      get_my_challenges: {
        Args: never
        Returns: {
          bonus_points: number
          completed: boolean
          description: string
          done_days: number[]
          id: string
          kind: string
          min_subtotal: number
          period: string
          period_end: string
          progress: number
          target: number
          title: string
          weekdays: number[]
        }[]
      }
      get_usual_item: {
        Args: never
        Returns: {
          base_price: number
          image_url: string
          location_id: string
          menu_item_id: string
          name: string
          times_ordered: number
        }[]
      }
      is_staff: { Args: never; Returns: boolean }
      mark_promo_used: { Args: { p_code: string }; Returns: undefined }
      order_local_time: {
        Args: { o: Database["public"]["Tables"]["orders"]["Row"] }
        Returns: string
      }
      redeem_points_reward: { Args: { p_tier: string }; Returns: Json }
      register_push_token: { Args: { p_token: string }; Returns: undefined }
    }
    Enums: {
      order_status:
        | "received"
        | "preparing"
        | "out_for_delivery"
        | "ready"
        | "completed"
        | "cancelled"
      order_type: "pickup" | "delivery"
      user_role: "customer" | "staff" | "admin"
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
      order_status: [
        "received",
        "preparing",
        "out_for_delivery",
        "ready",
        "completed",
        "cancelled",
      ],
      order_type: ["pickup", "delivery"],
      user_role: ["customer", "staff", "admin"],
    },
  },
} as const

