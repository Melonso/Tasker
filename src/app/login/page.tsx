import { redirect } from "next/navigation";

import { getCurrentUser } from "@/auth/session";
import { LoginForm } from "@/components/login-form";

export const metadata = { title: "Logowanie" };

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="login-brand"><span className="brand-mark">T</span><strong>Tasker</strong></div>
        <p className="eyebrow">Bezpieczny dostęp</p>
        <h1>Wszystko pod kontrolą.</h1>
        <p className="login-intro">Zaloguj się, aby sprawdzić terminy, delegowane zadania i oczekujące odpowiedzi.</p>
        <LoginForm />
        <small className="login-help">Pierwsze hasło ustawisz przez jednorazowy link od administratora aplikacji.</small>
      </section>
    </main>
  );
}
