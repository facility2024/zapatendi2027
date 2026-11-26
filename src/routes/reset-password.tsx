import { createFileRoute } from "@tanstack/react-router";
import { ResetPassword } from "@/components/app/ResetPassword";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Nova senha | zapcomia" },
      {
        name: "description",
        content: "Recupere sua conta zapcomia e defina uma nova senha com segurança.",
      },
      { property: "og:title", content: "Nova senha | zapcomia" },
      { property: "og:description", content: "Recuperação segura de acesso ao painel zapcomia." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ResetPassword,
});
