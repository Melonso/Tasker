import Link from "next/link";

export default function NotFoundPage() {
  return (
    <div className="page-stack narrow-page">
      <section className="panel empty-state">
        <span aria-hidden="true">?</span>
        <h1>Nie znaleziono strony</h1>
        <p>To zadanie lub strona nie istnieje albo nie masz do niej dostępu.</p>
        <Link className="secondary-button" href="/">Wróć do zadań</Link>
      </section>
    </div>
  );
}
