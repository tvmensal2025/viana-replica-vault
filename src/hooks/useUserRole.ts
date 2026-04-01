import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useUserRole(userId: string | null) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    const checkRole = async () => {
      try {
        const { data, error } = await (supabase as any).rpc("has_role", {
          _user_id: userId,
          _role: "admin",
        });
        if (error) throw error;
        setIsAdmin(data === true);
      } catch {
        setIsAdmin(false);
      } finally {
        setLoading(false);
      }
    };

    checkRole();
  }, [userId]);

  return { isAdmin, loading };
}
