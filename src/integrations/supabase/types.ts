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
      aban_coin_logs: {
        Row: {
          id: string
          price: number
          recorded_at: string
          volume: number
        }
        Insert: {
          id?: string
          price: number
          recorded_at?: string
          volume?: number
        }
        Update: {
          id?: string
          price?: number
          recorded_at?: string
          volume?: number
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          entity: string | null
          entity_id: string | null
          id: string
          ip: string | null
          metadata: Json
          user_agent: string | null
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          entity?: string | null
          entity_id?: string | null
          id?: string
          ip?: string | null
          metadata?: Json
          user_agent?: string | null
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          entity?: string | null
          entity_id?: string | null
          id?: string
          ip?: string | null
          metadata?: Json
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      deposits: {
        Row: {
          amount: number
          created_at: string
          currency: Database["public"]["Enums"]["wallet_currency"]
          id: string
          metadata: Json | null
          method: string
          provider_reference: string | null
          status: Database["public"]["Enums"]["tx_status"]
          user_id: string
          wallet_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          currency: Database["public"]["Enums"]["wallet_currency"]
          id?: string
          metadata?: Json | null
          method: string
          provider_reference?: string | null
          status?: Database["public"]["Enums"]["tx_status"]
          user_id: string
          wallet_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: Database["public"]["Enums"]["wallet_currency"]
          id?: string
          metadata?: Json | null
          method?: string
          provider_reference?: string | null
          status?: Database["public"]["Enums"]["tx_status"]
          user_id?: string
          wallet_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deposits_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      exchange_rates: {
        Row: {
          from_currency: Database["public"]["Enums"]["wallet_currency"]
          rate: number
          spread: number
          to_currency: Database["public"]["Enums"]["wallet_currency"]
          updated_at: string
        }
        Insert: {
          from_currency: Database["public"]["Enums"]["wallet_currency"]
          rate: number
          spread?: number
          to_currency: Database["public"]["Enums"]["wallet_currency"]
          updated_at?: string
        }
        Update: {
          from_currency?: Database["public"]["Enums"]["wallet_currency"]
          rate?: number
          spread?: number
          to_currency?: Database["public"]["Enums"]["wallet_currency"]
          updated_at?: string
        }
        Relationships: []
      }
      idempotency_keys: {
        Row: {
          created_at: string
          key: string
          scope: string
        }
        Insert: {
          created_at?: string
          key: string
          scope: string
        }
        Update: {
          created_at?: string
          key?: string
          scope?: string
        }
        Relationships: []
      }
      kyc_documents: {
        Row: {
          back_path: string | null
          created_at: string
          doc_type: Database["public"]["Enums"]["kyc_doc_type"]
          front_path: string | null
          id: string
          rejection_reason: string | null
          status: Database["public"]["Enums"]["kyc_status"]
          user_id: string
        }
        Insert: {
          back_path?: string | null
          created_at?: string
          doc_type: Database["public"]["Enums"]["kyc_doc_type"]
          front_path?: string | null
          id?: string
          rejection_reason?: string | null
          status?: Database["public"]["Enums"]["kyc_status"]
          user_id: string
        }
        Update: {
          back_path?: string | null
          created_at?: string
          doc_type?: Database["public"]["Enums"]["kyc_doc_type"]
          front_path?: string | null
          id?: string
          rejection_reason?: string | null
          status?: Database["public"]["Enums"]["kyc_status"]
          user_id?: string
        }
        Relationships: []
      }
      linked_banks: {
        Row: {
          account_name: string
          account_number: string
          bank_code: string | null
          bank_name: string
          country: string | null
          created_at: string
          currency: Database["public"]["Enums"]["wallet_currency"] | null
          id: string
          is_default: boolean
          recipient_code: string | null
          user_id: string
          verified_at: string | null
        }
        Insert: {
          account_name: string
          account_number: string
          bank_code?: string | null
          bank_name: string
          country?: string | null
          created_at?: string
          currency?: Database["public"]["Enums"]["wallet_currency"] | null
          id?: string
          is_default?: boolean
          recipient_code?: string | null
          user_id: string
          verified_at?: string | null
        }
        Update: {
          account_name?: string
          account_number?: string
          bank_code?: string | null
          bank_name?: string
          country?: string | null
          created_at?: string
          currency?: Database["public"]["Enums"]["wallet_currency"] | null
          id?: string
          is_default?: boolean
          recipient_code?: string | null
          user_id?: string
          verified_at?: string | null
        }
        Relationships: []
      }
      linked_cards: {
        Row: {
          brand: string
          created_at: string
          exp_month: number
          exp_year: number
          id: string
          last4: string
          provider_token: string | null
          user_id: string
        }
        Insert: {
          brand: string
          created_at?: string
          exp_month: number
          exp_year: number
          id?: string
          last4: string
          provider_token?: string | null
          user_id: string
        }
        Update: {
          brand?: string
          created_at?: string
          exp_month?: number
          exp_year?: number
          id?: string
          last4?: string
          provider_token?: string | null
          user_id?: string
        }
        Relationships: []
      }
      market_orders: {
        Row: {
          amount: number
          created_at: string
          id: string
          order_type: string
          price: number | null
          side: string
          status: Database["public"]["Enums"]["tx_status"]
          symbol: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          order_type?: string
          price?: number | null
          side: string
          status?: Database["public"]["Enums"]["tx_status"]
          symbol: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          order_type?: string
          price?: number | null
          side?: string
          status?: Database["public"]["Enums"]["tx_status"]
          symbol?: string
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          read: boolean
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          read?: boolean
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          read?: boolean
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      payment_transactions: {
        Row: {
          amount: number
          authorization_code: string | null
          brand: string | null
          channel: string | null
          created_at: string
          currency: Database["public"]["Enums"]["wallet_currency"]
          customer_code: string | null
          failure_reason: string | null
          gateway: string
          gateway_reference: string | null
          id: string
          ip_address: string | null
          last4: string | null
          metadata: Json
          paid_at: string | null
          reference: string
          status: Database["public"]["Enums"]["tx_status"]
          updated_at: string
          user_id: string
          wallet_id: string | null
        }
        Insert: {
          amount: number
          authorization_code?: string | null
          brand?: string | null
          channel?: string | null
          created_at?: string
          currency: Database["public"]["Enums"]["wallet_currency"]
          customer_code?: string | null
          failure_reason?: string | null
          gateway?: string
          gateway_reference?: string | null
          id?: string
          ip_address?: string | null
          last4?: string | null
          metadata?: Json
          paid_at?: string | null
          reference: string
          status?: Database["public"]["Enums"]["tx_status"]
          updated_at?: string
          user_id: string
          wallet_id?: string | null
        }
        Update: {
          amount?: number
          authorization_code?: string | null
          brand?: string | null
          channel?: string | null
          created_at?: string
          currency?: Database["public"]["Enums"]["wallet_currency"]
          customer_code?: string | null
          failure_reason?: string | null
          gateway?: string
          gateway_reference?: string | null
          id?: string
          ip_address?: string | null
          last4?: string | null
          metadata?: Json
          paid_at?: string | null
          reference?: string
          status?: Database["public"]["Enums"]["tx_status"]
          updated_at?: string
          user_id?: string
          wallet_id?: string | null
        }
        Relationships: []
      }
      pin_attempts: {
        Row: {
          failed_count: number
          last_failed_at: string | null
          locked_until: string | null
          user_id: string
        }
        Insert: {
          failed_count?: number
          last_failed_at?: string | null
          locked_until?: string | null
          user_id: string
        }
        Update: {
          failed_count?: number
          last_failed_at?: string | null
          locked_until?: string | null
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          address: string | null
          avatar_url: string | null
          city: string | null
          country: string | null
          created_at: string
          daily_withdrawal_reset_at: string
          daily_withdrawal_total: number
          email: string | null
          full_name: string | null
          id: string
          kyc_status: Database["public"]["Enums"]["kyc_status"]
          kyc_tier: number
          occupation: string | null
          phone: string | null
          pin_locked_until: string | null
          transaction_pin_hash: string | null
          two_factor_enabled: boolean
          updated_at: string
          username: string | null
        }
        Insert: {
          address?: string | null
          avatar_url?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          daily_withdrawal_reset_at?: string
          daily_withdrawal_total?: number
          email?: string | null
          full_name?: string | null
          id: string
          kyc_status?: Database["public"]["Enums"]["kyc_status"]
          kyc_tier?: number
          occupation?: string | null
          phone?: string | null
          pin_locked_until?: string | null
          transaction_pin_hash?: string | null
          two_factor_enabled?: boolean
          updated_at?: string
          username?: string | null
        }
        Update: {
          address?: string | null
          avatar_url?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          daily_withdrawal_reset_at?: string
          daily_withdrawal_total?: number
          email?: string | null
          full_name?: string | null
          id?: string
          kyc_status?: Database["public"]["Enums"]["kyc_status"]
          kyc_tier?: number
          occupation?: string | null
          phone?: string | null
          pin_locked_until?: string | null
          transaction_pin_hash?: string | null
          two_factor_enabled?: boolean
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
      saved_cards: {
        Row: {
          authorization_code: string
          bank: string | null
          brand: string
          country_code: string | null
          created_at: string
          customer_code: string | null
          exp_month: string | null
          exp_year: string | null
          id: string
          is_default: boolean
          last4: string
          reusable: boolean
          signature: string | null
          user_id: string
        }
        Insert: {
          authorization_code: string
          bank?: string | null
          brand: string
          country_code?: string | null
          created_at?: string
          customer_code?: string | null
          exp_month?: string | null
          exp_year?: string | null
          id?: string
          is_default?: boolean
          last4: string
          reusable?: boolean
          signature?: string | null
          user_id: string
        }
        Update: {
          authorization_code?: string
          bank?: string | null
          brand?: string
          country_code?: string | null
          created_at?: string
          customer_code?: string | null
          exp_month?: string | null
          exp_year?: string | null
          id?: string
          is_default?: boolean
          last4?: string
          reusable?: boolean
          signature?: string | null
          user_id?: string
        }
        Relationships: []
      }
      security_logs: {
        Row: {
          created_at: string
          event: string
          id: string
          ip: string | null
          metadata: Json | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          event: string
          id?: string
          ip?: string | null
          metadata?: Json | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          event?: string
          id?: string
          ip?: string | null
          metadata?: Json | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      transaction_status_history: {
        Row: {
          actor: string | null
          created_at: string
          from_status: Database["public"]["Enums"]["tx_status"] | null
          id: string
          reason: string | null
          to_status: Database["public"]["Enums"]["tx_status"]
          transaction_id: string
        }
        Insert: {
          actor?: string | null
          created_at?: string
          from_status?: Database["public"]["Enums"]["tx_status"] | null
          id?: string
          reason?: string | null
          to_status: Database["public"]["Enums"]["tx_status"]
          transaction_id: string
        }
        Update: {
          actor?: string | null
          created_at?: string
          from_status?: Database["public"]["Enums"]["tx_status"] | null
          id?: string
          reason?: string | null
          to_status?: Database["public"]["Enums"]["tx_status"]
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transaction_status_history_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          amount: number
          counterparty_user_id: string | null
          created_at: string
          destination_amount: number | null
          destination_currency:
            | Database["public"]["Enums"]["wallet_currency"]
            | null
          exchange_rate: number | null
          failure_reason: string | null
          fee: number
          gateway: string | null
          gateway_reference: string | null
          id: string
          idempotency_key: string | null
          ip_address: string | null
          metadata: Json
          narration: string | null
          processed_at: string | null
          receiver_wallet_id: string | null
          reference: string
          sender_wallet_id: string | null
          source_currency: Database["public"]["Enums"]["wallet_currency"] | null
          status: Database["public"]["Enums"]["tx_status"]
          type: Database["public"]["Enums"]["tx_master_type"]
          updated_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          amount: number
          counterparty_user_id?: string | null
          created_at?: string
          destination_amount?: number | null
          destination_currency?:
            | Database["public"]["Enums"]["wallet_currency"]
            | null
          exchange_rate?: number | null
          failure_reason?: string | null
          fee?: number
          gateway?: string | null
          gateway_reference?: string | null
          id?: string
          idempotency_key?: string | null
          ip_address?: string | null
          metadata?: Json
          narration?: string | null
          processed_at?: string | null
          receiver_wallet_id?: string | null
          reference: string
          sender_wallet_id?: string | null
          source_currency?:
            | Database["public"]["Enums"]["wallet_currency"]
            | null
          status?: Database["public"]["Enums"]["tx_status"]
          type: Database["public"]["Enums"]["tx_master_type"]
          updated_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          counterparty_user_id?: string | null
          created_at?: string
          destination_amount?: number | null
          destination_currency?:
            | Database["public"]["Enums"]["wallet_currency"]
            | null
          exchange_rate?: number | null
          failure_reason?: string | null
          fee?: number
          gateway?: string | null
          gateway_reference?: string | null
          id?: string
          idempotency_key?: string | null
          ip_address?: string | null
          metadata?: Json
          narration?: string | null
          processed_at?: string | null
          receiver_wallet_id?: string | null
          reference?: string
          sender_wallet_id?: string | null
          source_currency?:
            | Database["public"]["Enums"]["wallet_currency"]
            | null
          status?: Database["public"]["Enums"]["tx_status"]
          type?: Database["public"]["Enums"]["tx_master_type"]
          updated_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      wallet_ledger: {
        Row: {
          amount: number
          balance_after: number
          balance_before: number
          created_at: string
          currency: Database["public"]["Enums"]["wallet_currency"]
          description: string | null
          direction: string
          id: string
          metadata: Json
          payment_transaction_id: string | null
          reference: string | null
          transaction_id: string | null
          type: string
          user_id: string
          wallet_id: string
        }
        Insert: {
          amount: number
          balance_after: number
          balance_before: number
          created_at?: string
          currency: Database["public"]["Enums"]["wallet_currency"]
          description?: string | null
          direction: string
          id?: string
          metadata?: Json
          payment_transaction_id?: string | null
          reference?: string | null
          transaction_id?: string | null
          type: string
          user_id: string
          wallet_id: string
        }
        Update: {
          amount?: number
          balance_after?: number
          balance_before?: number
          created_at?: string
          currency?: Database["public"]["Enums"]["wallet_currency"]
          description?: string | null
          direction?: string
          id?: string
          metadata?: Json
          payment_transaction_id?: string | null
          reference?: string | null
          transaction_id?: string | null
          type?: string
          user_id?: string
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_ledger_payment_transaction_id_fkey"
            columns: ["payment_transaction_id"]
            isOneToOne: false
            referencedRelation: "payment_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_transactions: {
        Row: {
          amount: number
          counterparty_wallet_id: string | null
          created_at: string
          currency: Database["public"]["Enums"]["wallet_currency"]
          description: string | null
          fee: number
          id: string
          metadata: Json | null
          reference: string | null
          status: Database["public"]["Enums"]["tx_status"]
          type: Database["public"]["Enums"]["tx_type"]
          user_id: string
          wallet_id: string | null
        }
        Insert: {
          amount: number
          counterparty_wallet_id?: string | null
          created_at?: string
          currency: Database["public"]["Enums"]["wallet_currency"]
          description?: string | null
          fee?: number
          id?: string
          metadata?: Json | null
          reference?: string | null
          status?: Database["public"]["Enums"]["tx_status"]
          type: Database["public"]["Enums"]["tx_type"]
          user_id: string
          wallet_id?: string | null
        }
        Update: {
          amount?: number
          counterparty_wallet_id?: string | null
          created_at?: string
          currency?: Database["public"]["Enums"]["wallet_currency"]
          description?: string | null
          fee?: number
          id?: string
          metadata?: Json | null
          reference?: string | null
          status?: Database["public"]["Enums"]["tx_status"]
          type?: Database["public"]["Enums"]["tx_type"]
          user_id?: string
          wallet_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wallet_transactions_counterparty_wallet_id_fkey"
            columns: ["counterparty_wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_transactions_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      wallets: {
        Row: {
          available_balance: number | null
          balance: number
          created_at: string
          currency: Database["public"]["Enums"]["wallet_currency"]
          id: string
          is_primary: boolean
          locked_balance: number
          status: Database["public"]["Enums"]["wallet_status"]
          user_id: string
          wallet_number: string
        }
        Insert: {
          available_balance?: number | null
          balance?: number
          created_at?: string
          currency: Database["public"]["Enums"]["wallet_currency"]
          id?: string
          is_primary?: boolean
          locked_balance?: number
          status?: Database["public"]["Enums"]["wallet_status"]
          user_id: string
          wallet_number: string
        }
        Update: {
          available_balance?: number | null
          balance?: number
          created_at?: string
          currency?: Database["public"]["Enums"]["wallet_currency"]
          id?: string
          is_primary?: boolean
          locked_balance?: number
          status?: Database["public"]["Enums"]["wallet_status"]
          user_id?: string
          wallet_number?: string
        }
        Relationships: []
      }
      withdrawal_webhooks: {
        Row: {
          created_at: string
          error: string | null
          event: string
          id: string
          payload: Json
          processed: boolean
          processed_at: string | null
          signature: string | null
        }
        Insert: {
          created_at?: string
          error?: string | null
          event: string
          id?: string
          payload: Json
          processed?: boolean
          processed_at?: string | null
          signature?: string | null
        }
        Update: {
          created_at?: string
          error?: string | null
          event?: string
          id?: string
          payload?: Json
          processed?: boolean
          processed_at?: string | null
          signature?: string | null
        }
        Relationships: []
      }
      withdrawals: {
        Row: {
          amount: number
          bank_id: string | null
          created_at: string
          currency: Database["public"]["Enums"]["wallet_currency"]
          destination: Json
          failure_reason: string | null
          fee: number
          gateway_reference: string | null
          id: string
          idempotency_key: string | null
          ip_address: string | null
          method: string
          narration: string | null
          processed_at: string | null
          recipient_code: string | null
          reference: string | null
          status: Database["public"]["Enums"]["tx_status"]
          updated_at: string
          user_agent: string | null
          user_id: string
          wallet_id: string | null
        }
        Insert: {
          amount: number
          bank_id?: string | null
          created_at?: string
          currency: Database["public"]["Enums"]["wallet_currency"]
          destination?: Json
          failure_reason?: string | null
          fee?: number
          gateway_reference?: string | null
          id?: string
          idempotency_key?: string | null
          ip_address?: string | null
          method: string
          narration?: string | null
          processed_at?: string | null
          recipient_code?: string | null
          reference?: string | null
          status?: Database["public"]["Enums"]["tx_status"]
          updated_at?: string
          user_agent?: string | null
          user_id: string
          wallet_id?: string | null
        }
        Update: {
          amount?: number
          bank_id?: string | null
          created_at?: string
          currency?: Database["public"]["Enums"]["wallet_currency"]
          destination?: Json
          failure_reason?: string | null
          fee?: number
          gateway_reference?: string | null
          id?: string
          idempotency_key?: string | null
          ip_address?: string | null
          method?: string
          narration?: string | null
          processed_at?: string | null
          recipient_code?: string | null
          reference?: string | null
          status?: Database["public"]["Enums"]["tx_status"]
          updated_at?: string
          user_agent?: string | null
          user_id?: string
          wallet_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "withdrawals_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      credit_wallet_from_payment: {
        Args: {
          _authorization: Json
          _gateway_reference: string
          _payment_id: string
        }
        Returns: number
      }
      finalize_withdrawal: {
        Args: { _gateway_reference: string; _withdrawal_id: string }
        Returns: undefined
      }
      gen_wallet_number: {
        Args: { _currency: Database["public"]["Enums"]["wallet_currency"] }
        Returns: string
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      lock_funds_for_withdrawal: {
        Args: {
          _amount: number
          _fee: number
          _wallet_id: string
          _withdrawal_id: string
        }
        Returns: number
      }
      lookup_wallet_by_number: {
        Args: { _wallet_number: string }
        Returns: {
          currency: Database["public"]["Enums"]["wallet_currency"]
          full_name: string
          status: Database["public"]["Enums"]["wallet_status"]
          wallet_id: string
          wallet_user_id: string
        }[]
      }
      reverse_withdrawal: {
        Args: { _reason: string; _withdrawal_id: string }
        Returns: undefined
      }
      set_transaction_pin: { Args: { _pin: string }; Returns: undefined }
      tx_convert_currency: {
        Args: {
          _amount: number
          _from_wallet_id: string
          _idempotency_key: string
          _ip: string
          _pin: string
          _to_wallet_id: string
          _user_agent: string
        }
        Returns: Json
      }
      tx_execute_transfer: {
        Args: {
          _amount: number
          _from_wallet_id: string
          _idempotency_key: string
          _ip: string
          _narration: string
          _pin: string
          _to_wallet_number: string
          _user_agent: string
        }
        Returns: Json
      }
      verify_transaction_pin: { Args: { _pin: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "user"
      kyc_doc_type: "national_id" | "passport" | "drivers_license"
      kyc_status: "not_submitted" | "pending" | "approved" | "rejected"
      ledger_entry_type:
        | "debit_lock"
        | "lock_release"
        | "debit_settle"
        | "credit"
        | "fee"
        | "fx_in"
        | "fx_out"
        | "reversal"
      tx_master_type:
        | "wallet_to_wallet"
        | "wallet_to_bank"
        | "bank_to_wallet"
        | "card_funding"
        | "mpesa_funding"
        | "currency_conversion"
        | "withdrawal"
        | "deposit"
        | "internal_transfer"
        | "aban_coin_trade"
        | "refund"
        | "reversal"
      tx_status:
        | "pending"
        | "completed"
        | "failed"
        | "reversed"
        | "queued"
        | "processing"
        | "cancelled"
        | "locked"
        | "successful"
      tx_type:
        | "deposit"
        | "withdrawal"
        | "send"
        | "receive"
        | "swap"
        | "fee"
        | "aban_buy"
        | "aban_sell"
      wallet_currency: "KES" | "USD" | "EUR" | "GBP" | "BTC" | "ABAN"
      wallet_status: "active" | "frozen" | "closed"
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
      app_role: ["admin", "user"],
      kyc_doc_type: ["national_id", "passport", "drivers_license"],
      kyc_status: ["not_submitted", "pending", "approved", "rejected"],
      ledger_entry_type: [
        "debit_lock",
        "lock_release",
        "debit_settle",
        "credit",
        "fee",
        "fx_in",
        "fx_out",
        "reversal",
      ],
      tx_master_type: [
        "wallet_to_wallet",
        "wallet_to_bank",
        "bank_to_wallet",
        "card_funding",
        "mpesa_funding",
        "currency_conversion",
        "withdrawal",
        "deposit",
        "internal_transfer",
        "aban_coin_trade",
        "refund",
        "reversal",
      ],
      tx_status: [
        "pending",
        "completed",
        "failed",
        "reversed",
        "queued",
        "processing",
        "cancelled",
        "locked",
        "successful",
      ],
      tx_type: [
        "deposit",
        "withdrawal",
        "send",
        "receive",
        "swap",
        "fee",
        "aban_buy",
        "aban_sell",
      ],
      wallet_currency: ["KES", "USD", "EUR", "GBP", "BTC", "ABAN"],
      wallet_status: ["active", "frozen", "closed"],
    },
  },
} as const
