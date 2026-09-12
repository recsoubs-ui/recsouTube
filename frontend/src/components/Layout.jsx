import { Link, NavLink, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { Search, Sun, Moon, Menu, User, LogOut, Home, TrendingUp, ListVideo, History, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTheme } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";

const navItems = [
  { to: "/", label: "Accueil", icon: Home, testid: "nav-link-home" },
  { to: "/trending", label: "Tendances", icon: TrendingUp, testid: "nav-link-trending" },
  { to: "/subscriptions", label: "Abonnements", icon: Users, testid: "nav-link-subs" },
  { to: "/history", label: "Historique", icon: History, testid: "nav-link-history" },
  { to: "/playlists", label: "Playlists", icon: ListVideo, testid: "nav-link-playlists" },
];

function SidebarNav({ onNavigate }) {
  return (
    <nav className="flex flex-col gap-1 p-3">
      {navItems.map(({ to, label, icon: Icon, testid }) => (
        <NavLink
          key={to}
          to={to}
          end={to === "/"}
          data-testid={testid}
          onClick={onNavigate}
          className={({ isActive }) =>
            `flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors ${
              isActive
                ? "bg-primary/10 text-primary border border-primary/25"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary"
            }`
          }
        >
          <Icon className="w-4 h-4" />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

export default function Layout({ children }) {
  const [q, setQ] = useState("");
  const [openSheet, setOpenSheet] = useState(false);
  const navigate = useNavigate();
  const { theme, toggle } = useTheme();
  const { user, logout } = useAuth();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (window.location.pathname === "/search") setQ(params.get("q") || "");
  }, []);

  const onSubmit = (e) => {
    e.preventDefault();
    if (!q.trim()) return;
    navigate(`/search?q=${encodeURIComponent(q.trim())}`);
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header
        data-testid="app-header"
        className="sticky top-0 z-40 h-16 border-b glass flex items-center gap-3 px-3 sm:px-5"
      >
        <div className="flex items-center gap-2">
          <Sheet open={openSheet} onOpenChange={setOpenSheet}>
            <SheetTrigger asChild>
              <Button
                data-testid="sidebar-toggle"
                variant="ghost"
                size="icon"
                className="md:hidden"
              >
                <Menu className="w-5 h-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              <div className="pt-4 px-5">
                <Link to="/" className="font-display font-extrabold text-2xl tracking-tight">
                  <span className="text-primary">Recsou</span>Tube
                </Link>
              </div>
              <SidebarNav onNavigate={() => setOpenSheet(false)} />
            </SheetContent>
          </Sheet>
          <Link
            to="/"
            data-testid="header-logo"
            className="font-display font-extrabold text-xl sm:text-2xl tracking-tight"
          >
            <span className="text-primary">Recsou</span>Tube
          </Link>
        </div>

        <form onSubmit={onSubmit} className="flex-1 min-w-0 max-w-xl mx-auto relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            data-testid="header-search-input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher une vidéo, un artiste, un thème..."
            className="pl-10 pr-3 sm:pr-24 rounded-full h-10 surface-elevated border-border/70 focus-visible:ring-primary"
          />
          <Button
            data-testid="header-search-submit"
            type="submit"
            size="sm"
            className="hidden sm:inline-flex absolute right-1 top-1 h-8 rounded-full"
          >
            Rechercher
          </Button>
        </form>

        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          <Button
            data-testid="theme-toggle-button"
            variant="ghost"
            size="icon"
            onClick={toggle}
            title="Basculer le thème"
          >
            {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </Button>
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  data-testid="user-menu-trigger"
                  variant="ghost"
                  className="h-9 rounded-full px-2 gap-2"
                >
                  <div className="w-7 h-7 rounded-full bg-primary/15 text-primary text-xs font-semibold flex items-center justify-center">
                    {user.username?.[0]?.toUpperCase() || "U"}
                  </div>
                  <span className="hidden sm:inline text-sm font-medium max-w-24 truncate">
                    {user.username}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel>{user.email}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate("/settings")} data-testid="menu-settings">
                  <User className="w-4 h-4 mr-2" />
                  Paramètres
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  data-testid="menu-logout"
                  className="text-destructive"
                  onClick={() => {
                    logout();
                    navigate("/");
                  }}
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  Se déconnecter
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <>
              <Button
                data-testid="header-login"
                variant="ghost"
                onClick={() => navigate("/login")}
                className="hidden sm:inline-flex"
              >
                Connexion
              </Button>
              <Button
                data-testid="header-register"
                onClick={() => navigate("/register")}
                className="rounded-full"
              >
                Créer un compte
              </Button>
            </>
          )}
        </div>
      </header>

      <div className="flex flex-1">
        <aside className="hidden md:flex md:flex-col w-60 lg:w-64 border-r shrink-0 sticky top-16 h-[calc(100vh-4rem)] overflow-y-auto scrollbar-thin">
          <SidebarNav />
          <div className="mt-auto p-4 text-[11px] font-mono uppercase tracking-wider text-muted-foreground/70">
            Powered by Invidious / Piped
          </div>
        </aside>
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}
