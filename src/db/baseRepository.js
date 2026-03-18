import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn('⚠️ SUPABASE_URL yoki SUPABASE_KEY topilmadi. .env faylini tekshiring.');
}

const supabase = createClient(supabaseUrl || '', supabaseKey || '');

async function withRetry(fn, retries = 3, delayMs = 500) {
  let lastErr;
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      // Retry only on fetch failures or socket errors
      const isNetworkErr = 
        err.message?.includes('fetch failed') || 
        err.message?.includes('socket') || 
        err.message?.includes('ECONNRESET') ||
        err.code === 'UND_ERR_SOCKET' ||
        err.code === 'ECONNRESET';
        
      if (!isNetworkErr) throw err;
      if (i < retries - 1) await new Promise(r => setTimeout(r, delayMs * (i + 1)));
    }
  }
  throw lastErr;
}

function createRepository(collection) {
  return {
    findById: async (id) => {
      const { data, error } = await withRetry(() => supabase
        .from(collection)
        .select('*')
        .eq('id', String(id))
        .single());
      
      if (error && error.code !== 'PGRST116') {
        console.error(`Error finding ${collection} by id ${id}:`, error);
      }
      return data || null;
    },
    findMany: async (filter = {}) => {
      const fetch = () => {
        let query = supabase.from(collection).select('*');
        if (typeof filter !== 'function') {
          for (const [key, value] of Object.entries(filter)) query = query.eq(key, value);
        }
        return query;
      };

      const { data, error } = await withRetry(fetch);
      if (error) {
        console.error(`Error finding many in ${collection}:`, error);
        return [];
      }
      return typeof filter === 'function' ? (data || []).filter(filter) : (data || []);
    },
    save: async (id, record) => {
      const { data, error } = await withRetry(() => supabase
        .from(collection)
        .upsert({ ...record, id: String(id), updatedAt: new Date().toISOString() })
        .select()
        .single());
      
      if (error) {
        console.error(`Error saving to ${collection}:`, error);
        throw error;
      }
      return data;
    },
    remove: async (id) => {
      const { error } = await withRetry(() => supabase
        .from(collection)
        .delete()
        .eq('id', String(id)));
      
      if (error) {
        console.error(`Error removing from ${collection}:`, error);
        throw error;
      }
    },
    findAll: async () => {
      const { data, error } = await withRetry(() => supabase.from(collection).select('*'));
      if (error) {
        console.error(`Error fetching all from ${collection}:`, error);
        return [];
      }
      return data || [];
    },
    values: async () => {
      const { data, error } = await withRetry(() => supabase.from(collection).select('*'));
      if (error) {
        console.error(`Error fetching values from ${collection}:`, error);
        return [];
      }
      return data || [];
    },
    count: async () => {
      const { count, error } = await withRetry(() => supabase.from(collection).select('*', { count: 'exact', head: true }));
      if (error) {
        console.error(`Error counting ${collection}:`, error);
        return 0;
      }
      return count || 0;
    },
    all: async () => {
      const { data, error } = await withRetry(() => supabase.from(collection).select('*'));
      if (error) {
        console.error(`Error fetching all (obj) from ${collection}:`, error);
        return {};
      }
      return (data || []).reduce((acc, curr) => ({ ...acc, [curr.id]: curr }), {});
    }
  };
}

export { createRepository };
