import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Auth } from "@/components/app/Auth";
import { Panel } from "@/components/app/Panel";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "zapcomia" },
      {
        name: "description",
        content:
          "Tenha o melhor sistema de gerar seus agentes persuasivos de vendas com resposta de áudio e interação humanizada.",
      },
      { property: "og:title", content: "zapcomia" },
      {
        property: "og:description",
        content:
          "Tenha o melhor sistema de gerar seus agentes persuasivos de vendas com resposta de áudio e interação humanizada.",
      },
      { property: "og:type", content: "website" },
      {
        property: "og:image",
        content:
          "https://COCONUDIMUDIAL.b-cdn.net/AGENCIA%20FACILITY/Rob%C3%B4%20IA%20ZapcomIA%20Neon.png",
      },
      { name: "twitter:card", content: "summary_large_image" },
      {
        name: "twitter:image",
        content:
          "https://COCONUDIMUDIAL.b-cdn.net/AGENCIA%20FACILITY/Rob%C3%B4%20IA%20ZapcomIA%20Neon.png",
      },
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
