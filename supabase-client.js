(function () {
  const config = window.PRICE_CHECKER_SUPABASE;
  if (!config?.url || !config?.publishableKey || !window.supabase?.createClient) return;
  const client = window.supabase.createClient(config.url, config.publishableKey);
  window.priceCheckerBackend = {
    client,
    async session() { return (await client.auth.getSession()).data.session; },
    async signIn(email, password) { const { error } = await client.auth.signInWithPassword({ email, password }); if (error) throw error; },
    async signOut() { const { error } = await client.auth.signOut(); if (error) throw error; },
    async getOverrides() { const { data, error } = await client.from('price_overrides').select('*').or('expires_at.is.null,expires_at.gt.' + new Date().toISOString()); if (error) throw error; return data || []; },
    async saveOverride(row) { const { error } = await client.from('price_overrides').upsert(row, { onConflict: 'product_key' }); if (error) throw error; },
    async deleteOverride(productKey) { const { error } = await client.from('price_overrides').delete().eq('product_key', productKey); if (error) throw error; },
    subscribe(onChange) { return client.channel('price-overrides-live').on('postgres_changes', { event: '*', schema: 'public', table: 'price_overrides' }, onChange).subscribe(); }
  };
}());
