export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: '14.5'
  }
  public: {
    Tables: {
      buses: {
        Row: {
          created_at: string
          id: number
          number: number
          position: number | null
          route: string
          updated_at: string
          zone: string | null
        }
        Insert: {
          created_at?: string
          id?: never
          number: number
          position?: number | null
          route: string
          updated_at?: string
          zone?: string | null
        }
        Update: {
          created_at?: string
          id?: never
          number?: number
          position?: number | null
          route?: string
          updated_at?: string
          zone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'buses_zone_fkey'
            columns: ['zone']
            isOneToOne: false
            referencedRelation: 'zones'
            referencedColumns: ['name']
          },
        ]
      }
      zones: {
        Row: {
          created_at: string
          id: number
          name: string
          positions: number
        }
        Insert: {
          created_at?: string
          id?: never
          name: string
          positions: number
        }
        Update: {
          created_at?: string
          id?: never
          name?: string
          positions?: number
        }
        Relationships: []
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
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
