import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn('⚠️ SUPABASE_URL yoki SUPABASE_KEY topilmadi. .env faylini tekshiring.');
}

const supabase = createClient(supabaseUrl || '', supabaseKey || '');

function createRepository(collection) {
  return {
    findById: async (id) => {
      const { data, error } = await supabase
        .from(collection)
        .select('*')
        .eq('id', String(id))
        .single();
      
      if (error && error.code !== 'PGRST116') { // PGRST116 is "not found"
        console.error(`Error finding ${collection} by id ${id}:`, error);
      }
      return data || null;
    },
    findMany: async (filter = {}) => {
      let query = supabase.from(collection).select('*');
      
      if (typeof filter === 'function') {
        const { data, error } = await query;
        if (error) {
          console.error(`Error finding many in ${collection}:`, error);
          return [];
        }
        return (data || []).filter(filter);
      }

      // Basic filter support (equality)
      for (const [key, value] of Object.entries(filter)) {
        query = query.eq(key, value);
      }
      
      const { data, error } = await query;
      if (error) {
        console.error(`Error finding many in ${collection}:`, error);
        return [];
      }
      return data || [];
    },
    save: async (id, record) => {
      const { data, error } = await supabase
        .from(collection)
        .upsert({ ...record, id: String(id), updatedAt: new Date().toISOString() })
        .select()
        .single();
      
      if (error) {
        console.error(`Error saving to ${collection}:`, error);
        throw error;
      }
      return data;
    },
    remove: async (id) => {
      const { error } = await supabase
        .from(collection)
        .delete()
        .eq('id', String(id));
      
      if (error) {
        console.error(`Error removing from ${collection}:`, error);
        throw error;
      }
    },
    findAll: async () => {
      const { data, error } = await supabase
        .from(collection)
        .select('*');
      
      if (error) {
        console.error(`Error fetching all from ${collection}:`, error);
        return [];
      }
      return data || [];
    },
    values: async () => {
      const { data, error } = await supabase
        .from(collection)
        .select('*');
      
      if (error) {
        console.error(`Error fetching values from ${collection}:`, error);
        return [];
      }
      return data || [];
    },
    count: async () => {
      const { count, error } = await supabase
        .from(collection)
        .select('*', { count: 'exact', head: true });
      
      if (error) {
        console.error(`Error counting ${collection}:`, error);
        return 0;
      }
      return count || 0;
    },
    all: async () => {
      const { data, error } = await supabase
        .from(collection)
        .select('*');
      
      if (error) {
        console.error(`Error fetching all (obj) from ${collection}:`, error);
        return {};
      }
      // Convert to object {id: record} for backward compatibility where needed
      return (data || []).reduce((acc, curr) => ({ ...acc, [curr.id]: curr }), {});
    }
  };
}

export { createRepository };
