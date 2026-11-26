import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Auth } from "@/components/app/Auth";
import { ResetPassword } from "@/components/app/ResetPassword";

const auth = vi.hoisted(() => ({
  getUser: vi.fn(),
  updateUser: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  onAuthStateChange: vi.fn(),
  unsubscribe: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth } }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a href="/">{children}</a>,
}));

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState(null, "", "/reset-password");
  auth.getUser.mockResolvedValue({ data: { user: { id: "test-user" } }, error: null });
  auth.updateUser.mockResolvedValue({ error: null });
  auth.resetPasswordForEmail.mockResolvedValue({ error: null });
  auth.onAuthStateChange.mockReturnValue({
    data: { subscription: { unsubscribe: auth.unsubscribe } },
  });
});
afterEach(cleanup);

describe("Password recovery", () => {
  it("requests an email with a same-origin reset destination", async () => {
    render(<Auth />);
    fireEvent.click(screen.getByRole("button", { name: "Esqueci minha senha" }));
    fireEvent.change(screen.getByLabelText("E-mail"), { target: { value: "person@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar link de recuperação" }));
    await waitFor(() =>
      expect(auth.resetPasswordForEmail).toHaveBeenCalledWith("person@example.com", {
        redirectTo: `${window.location.origin}/reset-password`,
      }),
    );
  });

  it("does not accept an ordinary signed-in session as a recovery link", async () => {
    render(<ResetPassword />);
    await waitFor(() => expect(auth.getUser).toHaveBeenCalled());
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it("rejects a recovery link when the auth server does not validate the user", async () => {
    window.history.replaceState(null, "", "/reset-password#type=recovery");
    auth.getUser.mockResolvedValue({ data: { user: null }, error: new Error("Expired") });
    render(<ResetPassword />);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it("requires matching passwords before updating credentials", async () => {
    window.history.replaceState(null, "", "/reset-password#type=recovery");
    render(<ResetPassword />);
    fireEvent.change(await screen.findByLabelText("Nova senha"), {
      target: { value: "new-password-123" },
    });
    fireEvent.change(screen.getByLabelText("Confirmar nova senha"), {
      target: { value: "different-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar nova senha" }));
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it("updates only the password without requiring the forgotten current password", async () => {
    window.history.replaceState(null, "", "/reset-password#type=recovery");
    render(<ResetPassword />);
    fireEvent.change(await screen.findByLabelText("Nova senha"), {
      target: { value: "new-password-123" },
    });
    fireEvent.change(screen.getByLabelText("Confirmar nova senha"), {
      target: { value: "new-password-123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar nova senha" }));
    await waitFor(() =>
      expect(auth.updateUser).toHaveBeenCalledExactlyOnceWith({ password: "new-password-123" }),
    );
  });
});
