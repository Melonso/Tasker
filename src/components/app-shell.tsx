"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState, type ReactNode } from "react";

import { logoutAction } from "@/auth/actions";
import type { AuthenticatedUser } from "@/auth/session";
import { UserAvatar } from "@/components/user-avatar";

const navigation = [
  { href: "/", label: "Dzisiaj", icon: "⌂" },
  { href: "/?view=current", label: "Bieżące", icon: "●" },
  { href: "/?view=waiting", label: "Oczekujące", icon: "◷" },
  { href: "/?view=delegated", label: "Delegowane", icon: "↗" },
  { href: "/?view=recurring", label: "Cykliczne", icon: "↻" },
  { href: "/?view=done", label: "Zrobione", icon: "✓" },
];

export function AppShell({
  children,
  user,
  unreadNotifications,
}: {
  children: ReactNode;
  user: AuthenticatedUser;
  unreadNotifications: number;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeView = searchParams.get("view");
  const mobileRouteKey = `${pathname}?view=${activeView ?? ""}`;
  const [mobileMenuRoute, setMobileMenuRoute] = useState<string | null>(null);
  const mobileMenuOpen = mobileMenuRoute === mobileRouteKey;
  const moreSectionActive =
    pathname === "/notifications" ||
    pathname === "/settings" ||
    pathname === "/admin" ||
    (pathname === "/" && ["recurring", "done"].includes(activeView ?? ""));

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" href="/" aria-label="Tasker — strona główna">
          <span className="brand-mark">T</span>
          <span>
            <strong>Tasker</strong>
            <small>Nic nie umyka</small>
          </span>
        </Link>

        <nav className="primary-navigation" aria-label="Główna nawigacja">
          {navigation.map((item) => (
            <Link
              className={
                pathname === "/" &&
                ((item.href === "/" && !activeView) || item.href.endsWith(`view=${activeView}`))
                  ? "nav-link active"
                  : "nav-link"
              }
              href={item.href}
              key={item.label}
            >
              <span aria-hidden="true">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <Link className={pathname === "/notifications" ? "nav-link active" : "nav-link"} href="/notifications">
            <span aria-hidden="true">♢</span>
            Powiadomienia
            {unreadNotifications ? <strong className="nav-counter">{Math.min(unreadNotifications, 99)}</strong> : null}
          </Link>
          <Link className={pathname === "/settings" ? "nav-link active" : "nav-link"} href="/settings">
            <span aria-hidden="true">⚙</span>
            Moje ustawienia
          </Link>
          {user.roles.includes("APP_ADMIN") ? (
            <Link className={pathname === "/admin" ? "nav-link active" : "nav-link"} href="/admin">
              <span aria-hidden="true">◇</span>
              Administracja
            </Link>
          ) : null}
          <div className="user-chip">
            <UserAvatar avatarDataUrl={user.avatarDataUrl} firstName={user.firstName} lastName={user.lastName} />
            <span>
              <strong>{user.firstName} {user.lastName}</strong>
              <small>{user.roles.includes("APP_ADMIN") ? "Administrator aplikacji" : "Użytkownik Taskera"}</small>
            </span>
          </div>
          <form action={logoutAction}>
            <button className="logout-button" type="submit">Wyloguj się</button>
          </form>
        </div>

        {mobileMenuOpen ? (
          <button
            aria-label="Zamknij menu"
            className="mobile-menu-backdrop"
            onClick={() => setMobileMenuRoute(null)}
            type="button"
          />
        ) : null}
        <nav aria-label="Nawigacja mobilna" className="mobile-navigation">
          {navigation.slice(0, 4).map((item) => (
            <Link
              className={
                pathname === "/" &&
                ((item.href === "/" && !activeView) || item.href.endsWith(`view=${activeView}`))
                  ? "mobile-nav-link active"
                  : "mobile-nav-link"
              }
              href={item.href}
              key={item.label}
            >
              <span aria-hidden="true">{item.icon}</span>
              {item.label}
            </Link>
          ))}
          <div className="mobile-more">
            <button
              aria-expanded={mobileMenuOpen}
              className={`mobile-nav-link ${moreSectionActive || mobileMenuOpen ? "active" : ""}`}
              onClick={() => setMobileMenuRoute((route) => route === mobileRouteKey ? null : mobileRouteKey)}
              type="button"
            >
              <span aria-hidden="true">•••</span>
              Więcej
              {unreadNotifications ? <strong className="mobile-notification-dot" /> : null}
            </button>
            {mobileMenuOpen ? (
              <div className="mobile-menu-panel">
                <div className="mobile-menu-user">
                  <UserAvatar avatarDataUrl={user.avatarDataUrl} firstName={user.firstName} lastName={user.lastName} />
                  <span>
                    <strong>{user.firstName} {user.lastName}</strong>
                    <small>{user.roles.includes("APP_ADMIN") ? "Administrator aplikacji" : "Użytkownik Taskera"}</small>
                  </span>
                </div>
                <Link className={activeView === "recurring" ? "mobile-menu-link active" : "mobile-menu-link"} href="/?view=recurring">
                  <span aria-hidden="true">↻</span>Cykliczne
                </Link>
                <Link className={activeView === "done" ? "mobile-menu-link active" : "mobile-menu-link"} href="/?view=done">
                  <span aria-hidden="true">✓</span>Zrobione
                </Link>
                <Link className={pathname === "/notifications" ? "mobile-menu-link active" : "mobile-menu-link"} href="/notifications">
                  <span aria-hidden="true">♢</span>Powiadomienia
                  {unreadNotifications ? <strong className="nav-counter">{Math.min(unreadNotifications, 99)}</strong> : null}
                </Link>
                <Link className={pathname === "/settings" ? "mobile-menu-link active" : "mobile-menu-link"} href="/settings">
                  <span aria-hidden="true">⚙</span>Moje ustawienia
                </Link>
                {user.roles.includes("APP_ADMIN") ? (
                  <Link className={pathname === "/admin" ? "mobile-menu-link active" : "mobile-menu-link"} href="/admin">
                    <span aria-hidden="true">◇</span>Administracja
                  </Link>
                ) : null}
                <form action={logoutAction}>
                  <button className="mobile-logout-button" type="submit">Wyloguj się</button>
                </form>
              </div>
            ) : null}
          </div>
        </nav>
      </aside>

      <main className="main-content">{children}</main>
    </div>
  );
}
