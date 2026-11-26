import { createFileRoute } from "@tanstack/react-router";
import { ResetPassword } from "@/components/app/ResetPassword";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Nova senha | zaphot" },
      {
        name: "description",
        content: "Recupere sua conta ZapHot e defina uma nova senha com segurança.",
      },
      { property: "og:title", content: "Nova senha | ZapHot" },
      { property: "og:description", content: "Recuperação segura de acesso ao painel ZapHot." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ResetPassword,
});
