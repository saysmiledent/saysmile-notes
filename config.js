// Shared cloud mode (Supabase). The anon/publishable key is PUBLIC by design; all protection comes from the row-level-security rules in supabase/schema.sql.
// To go back to local demo mode, set both values to ''.
export default {
  supabaseUrl: 'https://mcoqubmqargcplvadiap.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1jb3F1Ym1xYXJnY3BsdmFkaWFwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM5NjE1MjksImV4cCI6MjEwOTUzNzUyOX0.DVVqAl6rk--HoJdz_DJ1U_bws558s6GAU4R1qll6NRw',
};
