"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function TestSupabase() {
  const [status, setStatus] = useState<string>("Testing connection...");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function test() {
      try {
        // Try to fetch something simple, or just check the health
        const { data, error } = await supabase.from('buyers').select('id').limit(1);
        
        if (error) {
          // If the table doesn't exist yet, it's still a "success" in terms of connection
          if (error.code === 'PGRST116' || error.message.includes('does not exist')) {
            setStatus("Connected to Supabase successfully! (Note: 'buyers' table doesn't exist yet, which is expected before migration)");
          } else {
            setError(error.message);
            setStatus("Connection failed");
          }
        } else {
          setStatus("Connected to Supabase successfully!");
        }
      } catch (err: any) {
        setError(err.message);
        setStatus("Connection failed");
      }
    }
    test();
  }, []);

  return (
    <div className="p-10 font-sans">
      <h1 className="text-2xl font-bold mb-4">Supabase Connection Test</h1>
      <div className={`p-4 rounded-lg border ${error ? 'bg-red-50 border-red-200 text-red-700' : 'bg-emerald-50 border-emerald-200 text-emerald-700'}`}>
        <p className="font-bold">{status}</p>
        {error && <p className="mt-2 text-sm font-mono">{error}</p>}
      </div>
      <p className="mt-4 text-sm text-zinc-500">
        URL: {process.env.NEXT_PUBLIC_SUPABASE_URL}
      </p>
    </div>
  );
}
