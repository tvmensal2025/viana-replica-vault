import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useUserRole(userId: string | null) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [checkedUserId, setCheckedUserId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (!userId) {
      setIsAdmin(false);
      setCheckedUserId(null);
      setLoading(false);
      return;
    }

    setLoading(true);

    const checkRole = async () => {
      try {
        const { data, error } = await supabase.rpc("has_role", {
          _user_id: userId,
          _role: "admin",
        });

        if (error) throw error;
        if (!cancelled) {
          setIsAdmin(Boolean(data));
          setCheckedUserId(userId);
        }
      } catch {
        if (!cancelled) {
          setIsAdmin(false);
          setCheckedUserId(userId);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    checkRole();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const isCheckingCurrentUser = Boolean(userId) && (loading || checkedUserId !== userId);

  return { isAdmin, loading: isCheckingCurrentUser };
}
