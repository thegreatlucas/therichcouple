import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ixmobonzrnsjfkshlnbv.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml4bW9ib256cm5zamZrc2hsbmJ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE0MTQ0OTgsImV4cCI6MjA4Njk5MDQ5OH0.-8P77P0nk-kuNJWrSpLGwRdxQ5oaKmU4kzk6gaJ_SCA';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
