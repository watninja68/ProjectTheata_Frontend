// src/lib/supabase/client.js
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    console.error("Supabase URL or Anon Key is missing. Make sure .env variables are set correctly.");
    // Optionally throw an error or handle this case as needed
    // throw new Error("Supabase environment variables not set.");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
