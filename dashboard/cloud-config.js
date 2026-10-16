// Online dashboard (Supabase) settings, built into the app for every customer.
// Fill these in from Supabase → Project Settings → API (or Data API / API Keys):
//   url     = Project URL, e.g. https://abcdefghijklmnop.supabase.co
//   anonKey = the "anon" / "publishable" public key (NOT the service_role / secret key)
// The anon key is meant to be public: the database only lets it call the functions in
// supabase/schema.sql, which check who is asking.
// Leave both empty to build the app without the online dashboard.
const CLOUD = {
  url: 'https://esbpfejsnrzmmibtaika.supabase.co',
  anonKey: 'sb_publishable_5iNoTQrpQEUixoAK1tBF2g_oCBKLpvc',
  // Where dist-web is hosted (Netlify, from the davetech-website GitHub project). Schools' websites are at <siteUrl>/s/<web-address>.
  siteUrl: 'https://erp.davetech.co.ke',
};

// For tests and local development the settings can come from the environment.
if (typeof process !== 'undefined' && process.env && process.env.POS_CLOUD_URL) {
  CLOUD.url = process.env.POS_CLOUD_URL;
  CLOUD.anonKey = process.env.POS_CLOUD_KEY || '';
}

if (typeof module !== 'undefined') module.exports = CLOUD;
if (typeof window !== 'undefined') window.POS_CLOUD = CLOUD;
