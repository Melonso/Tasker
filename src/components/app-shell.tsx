"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState, type ReactNode } from "react";

import { logoutAction } from "@/auth/actions";
import type { AuthenticatedUser } from "@/auth/session";
import { UserAvatar } from "@/components/user-avatar";
import { NavIcon, type NavIconName } from "@/components/nav-icon";

const navigation: Array<{ href: string; label: string; icon: NavIconName }> = [
  { href: "/", label: "Dzisiaj", icon: "home" },
  { href: "/?view=current", label: "Bieżące", icon: "tasks" },
  { href: "/?view=waiting", label: "Oczekujące", icon: "waiting" },
  { href: "/?view=delegated", label: "Delegowane", icon: "delegated" },
  { href: "/?view=recurring", label: "Cykliczne", icon: "repeat" },
  { href: "/?view=done", label: "Zrobione", icon: "done" },
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
    pathname === "/teams" ||
    (pathname === "/" && ["waiting", "delegated", "recurring", "done"].includes(activeView ?? ""));

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
              <span><NavIcon name={item.icon} /></span>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <Link className={pathname === "/notifications" ? "nav-link active" : "nav-link"} href="/notifications">
            <span><NavIcon name="notifications" /></span>
            Powiadomienia
            {unreadNotifications ? <strong className="nav-counter">{Math.min(unreadNotifications, 99)}</strong> : null}
          </Link>
          <Link className={pathname === "/settings" ? "nav-link active" : "nav-link"} href="/settings">
            <span><NavIcon name="settings" /></span>
            Moje ustawienia
          </Link>
          {user.roles.includes("APP_ADMIN") ? (
            <Link className={pathname === "/admin" ? "nav-link active" : "nav-link"} href="/admin">
              <span><NavIcon name="admin" /></span>
              Administracja
            </Link>
          ) : null}
          {user.roles.includes("BUSINESS_OWNER") ? (
            <Link className={pathname === "/teams" ? "nav-link active" : "nav-link"} href="/teams">
              <span><NavIcon name="teams" /></span>
              Zespoły
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
          {navigation.slice(0, 2).map((item) => (
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
              <span><NavIcon name={item.icon} /></span>
              {item.href.includes("current") ? "Zadania" : item.label}
            </Link>
          ))}
          <Link className="mobile-add-link" href="/tasks/new" aria-label="Dodaj nowe zadanie">
            <span><NavIcon name="add" size={24} /></span>
            Dodaj
          </Link>
          <Link className={pathname === "/notifications" ? "mobile-nav-link active" : "mobile-nav-link"} href="/notifications">
            <span><NavIcon name="notifications" /></span>
            Powiadomienia
            {unreadNotifications ? <strong className="mobile-notification-dot" /> : null}
          </Link>
          <div className="mobile-more">
            <button
              aria-expanded={mobileMenuOpen}
              className={`mobile-nav-link ${moreSectionActive || mobileMenuOpen ? "active" : ""}`}
              onClick={() => setMobileMenuRoute((route) => route === mobileRouteKey ? null : mobileRouteKey)}
              type="button"
            >
              <span><NavIcon name="more" /></span>
              Więcej
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
                <Link className={activeView === "waiting" ? "mobile-menu-link active" : "mobile-menu-link"} href="/?view=waiting">
                  <span><NavIcon name="waiting" /></span>Oczekujące
                </Link>
                <Link className={activeView === "delegated" ? "mobile-menu-link active" : "mobile-menu-link"} href="/?view=delegated">
                  <span><NavIcon name="delegated" /></span>Delegowane
                </Link>
                <Link className={activeView === "recurring" ? "mobile-menu-link active" : "mobile-menu-link"} href="/?view=recurring">
                  <span><NavIcon name="repeat" /></span>Cykliczne
                </Link>
                <Link className={activeView === "done" ? "mobile-menu-link active" : "mobile-menu-link"} href="/?view=done">
                  <span><NavIcon name="done" /></span>Zrobione
                </Link>
                <Link className={pathname === "/settings" ? "mobile-menu-link active" : "mobile-menu-link"} href="/settings">
                  <span><NavIcon name="settings" /></span>Moje ustawienia
                </Link>
                {user.roles.includes("APP_ADMIN") ? (
                  <Link className={pathname === "/admin" ? "mobile-menu-link active" : "mobile-menu-link"} href="/admin">
                    <span><NavIcon name="admin" /></span>Administracja
                  </Link>
                ) : null}
                {user.roles.includes("BUSINESS_OWNER") ? (
                  <Link className={pathname === "/teams" ? "mobile-menu-link active" : "mobile-menu-link"} href="/teams">
                    <span><NavIcon name="teams" /></span>Zespoły
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
