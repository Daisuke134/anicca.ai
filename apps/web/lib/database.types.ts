// Supabaseデータベースの型定義
// 注: 実際の型はSupabase CLIで自動生成できます
// npx supabase gen types typescript --project-id YOUR_PROJECT_ID > lib/database.types.ts

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string
          full_name: string | null
          avatar_url: string | null
          stripe_customer_id: string | null
          subscription_status: string
          subscription_tier: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          full_name?: string | null
          avatar_url?: string | null
          stripe_customer_id?: string | null
          subscription_status?: string
          subscription_tier?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          full_name?: string | null
          avatar_url?: string | null
          stripe_customer_id?: string | null
          subscription_status?: string
          subscription_tier?: string
          created_at?: string
          updated_at?: string
        }
      }
      connections: {
        Row: {
          id: string
          user_id: string
          service: string
          encrypted_tokens: Json
          session_id: string | null
          metadata: Json | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          service: string
          encrypted_tokens: Json
          session_id?: string | null
          metadata?: Json | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          service?: string
          encrypted_tokens?: Json
          session_id?: string | null
          metadata?: Json | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      sdk_tasks: {
        Row: {
          id: string
          user_id: string
          task_type: string
          status: string
          title: string
          description: string | null
          input_data: Json | null
          output_data: Json | null
          error_message: string | null
          execution_time_ms: number | null
          created_at: string
          started_at: string | null
          completed_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          task_type: string
          status?: string
          title: string
          description?: string | null
          input_data?: Json | null
          output_data?: Json | null
          error_message?: string | null
          execution_time_ms?: number | null
          created_at?: string
          started_at?: string | null
          completed_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          task_type?: string
          status?: string
          title?: string
          description?: string | null
          input_data?: Json | null
          output_data?: Json | null
          error_message?: string | null
          execution_time_ms?: number | null
          created_at?: string
          started_at?: string | null
          completed_at?: string | null
        }
      }
      task_results: {
        Row: {
          id: string
          task_id: string
          result_type: string
          title: string
          description: string | null
          url: string | null
          metadata: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          task_id: string
          result_type: string
          title: string
          description?: string | null
          url?: string | null
          metadata?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          task_id?: string
          result_type?: string
          title?: string
          description?: string | null
          url?: string | null
          metadata?: Json | null
          created_at?: string
        }
      }
      user_settings: {
        Row: {
          id: string
          user_id: string
          language: string
          timezone: string
          notifications_enabled: boolean
          sdk_auto_execute: boolean
          max_monthly_sdk_tasks: number
          preferences: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          language?: string
          timezone?: string
          notifications_enabled?: boolean
          sdk_auto_execute?: boolean
          max_monthly_sdk_tasks?: number
          preferences?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          language?: string
          timezone?: string
          notifications_enabled?: boolean
          sdk_auto_execute?: boolean
          max_monthly_sdk_tasks?: number
          preferences?: Json
          created_at?: string
          updated_at?: string
        }
      }
      usage_tracking: {
        Row: {
          id: string
          user_id: string
          usage_type: string
          quantity: number
          metadata: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          usage_type: string
          quantity?: number
          metadata?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          usage_type?: string
          quantity?: number
          metadata?: Json | null
          created_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
  }
}