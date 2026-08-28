import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/auth/session";
import { ActivationForm } from "@/components/activation-form";

export const metadata = { title: "Aktywacja konta" };

export default async function ActivatePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  if (await getCurrentUser()) redirect("/");
  const { token = "" } = await searchParams;

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="login-brand"><span className="brand-mark">T</span><strong>Tasker</strong></div>
        <p className="eyebrow">Pierwsze logowanie</p>
        <h1>Aktywuj swoje konto.</h1>
        <p className="login-intro">Ustaw prywatne hasło. Link aktywacyjny zostanie unieważniony po użyciu.</p>
        {token ? <ActivationForm token={token} /> : (
          <div className="activation-missing">
            <p className="form-error">Brakuje tokenu aktywacyjnego.</p>
            <Link className="secondary-button" href="/login">Wróć do logowania</Link>
          </div>
        )}
      </section>
    </main>
  );
}
