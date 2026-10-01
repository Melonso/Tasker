"use client";

import Link from "next/link";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="page-stack narrow-page">
      <section className="panel empty-state">
        <span aria-hidden="true">!</span>
        <h1>Coś poszło nie tak</h1>
        <p>Nie udało się wykonać tej operacji. Spróbuj ponownie za chwilę.</p>
        <div className="detail-actions">
          <button className="primary-button" onClick={reset} type="button">Spróbuj ponownie</button>
          <Link className="secondary-button" href="/">Wróć do zadań</Link>
        </div>
      </section>
    </div>
  );
}
