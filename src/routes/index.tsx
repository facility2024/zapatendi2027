import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Auth } from "@/components/app/Auth";
import { Panel } from "@/components/app/Panel";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "zaphot" },
      {
        name: "description",
        content: "Painel para configurar atendimento com IA, áudio e mídia no WhatsApp.",
      },
      { property: "og:title", content: "ZapHot" },
      { property: "og:description", content: "Atendimento com IA no WhatsApp." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null | undefined>(undefined);
  useEffect(() => {
    if (new URLSearchParams(window.location.hash.slice(1)).get("type") === "recovery") {
      void navigate({ to: "/reset-password", hash: window.location.hash.slice(1), replace: true });
      return;
    }
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setUser(s?.user ?? null));
    supabase.auth.getUser().then(({ data }) => setUser(data.user ?? null));
    return () => sub.subscription.unsubscribe();
  }, [navigate]);
  if (user === undefined) return <div className="min-h-screen" />;
  if (!user) return <Auth />;
  return <Panel key={user.id} userId={user.id} email={user.email ?? ""} />;
}
